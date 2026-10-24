from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time, timedelta, timezone
from functools import lru_cache

import httpx
import jwt
from jwt import PyJWKClient
from jwt.exceptions import InvalidTokenError, PyJWKClientError
from pydantic import ValidationError
from sqlalchemy import delete, update
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.models import LearnerSkill, ReviewPhrase, TopicPreset, TrainingSession, User, WordLearningItem
from app.repositories import UserRepository
from app.schemas import AdminUserResponse, CurrentUserResponse, DailyUsageResponse, SupabaseClaimsPayload, SupabaseUserPayload

LEGACY_USER_ID = "00000000-0000-0000-0000-000000000001"


class AuthenticationUnavailableError(RuntimeError):
    pass


@dataclass(frozen=True)
class AuthenticatedIdentity:
    id: str
    email: str
    display_name: str | None
    avatar_url: str | None


@lru_cache(maxsize=8)
def _cached_jwk_client(supabase_url: str, timeout: float) -> PyJWKClient:
    return PyJWKClient(
        f"{supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json",
        cache_jwk_set=True,
        lifespan=300,
        timeout=timeout,
    )


class SupabaseAuthService:
    def __init__(self, settings: Settings, client: httpx.Client | None = None, jwk_client: PyJWKClient | None = None) -> None:
        self.settings = settings
        self._client = client
        self._jwk_client = jwk_client

    def authenticate(self, access_token: str) -> AuthenticatedIdentity:
        if not self.settings.supabase_url or not self.settings.supabase_publishable_key:
            raise AuthenticationUnavailableError("Supabase Auth is not configured")
        if self._client is None or self._jwk_client is not None:
            try:
                algorithm = jwt.get_unverified_header(access_token).get("alg")
            except InvalidTokenError:
                algorithm = None
            if algorithm == "ES256":
                identity = self._authenticate_local(access_token)
                if identity is not None:
                    return identity
        return self._authenticate_remote(access_token)

    def _authenticate_local(self, access_token: str) -> AuthenticatedIdentity | None:
        assert self.settings.supabase_url is not None
        base_url = self.settings.supabase_url.rstrip("/")
        jwk_client = self._jwk_client or _cached_jwk_client(base_url, self.settings.auth_timeout_seconds)
        try:
            signing_key = jwk_client.get_signing_key_from_jwt(access_token)
            claims = jwt.decode(
                access_token,
                signing_key.key,
                algorithms=["ES256"],
                issuer=f"{base_url}/auth/v1",
                audience="authenticated",
                options={"require": ["exp", "iat", "iss", "sub", "aud"]},
            )
            payload = SupabaseClaimsPayload.model_validate(claims)
        except PyJWKClientError:
            return None
        except (InvalidTokenError, ValidationError) as exc:
            raise PermissionError("Invalid access token") from exc
        if payload.is_anonymous or payload.app_metadata.get("provider") != "google":
            return None
        return self._identity(payload.sub, payload.email, payload.user_metadata)

    def _authenticate_remote(self, access_token: str) -> AuthenticatedIdentity:
        assert self.settings.supabase_url is not None
        assert self.settings.supabase_publishable_key is not None
        url = f"{self.settings.supabase_url.rstrip('/')}/auth/v1/user"
        headers = {
            "apikey": self.settings.supabase_publishable_key,
            "Authorization": f"Bearer {access_token}",
        }
        client = self._client or httpx.Client(timeout=self.settings.auth_timeout_seconds)
        close_client = self._client is None
        try:
            response: httpx.Response | None = None
            for attempt in range(self.settings.auth_max_retries + 1):
                try:
                    response = client.get(url, headers=headers)
                    if response.status_code < 500 or attempt >= self.settings.auth_max_retries:
                        break
                except httpx.RequestError:
                    if attempt >= self.settings.auth_max_retries:
                        raise AuthenticationUnavailableError("Authentication provider is unavailable")
            assert response is not None
            if response.status_code in {401, 403}:
                raise PermissionError("Invalid access token")
            if response.status_code != 200:
                raise AuthenticationUnavailableError("Authentication provider is unavailable")
            try:
                payload = SupabaseUserPayload.model_validate(response.json())
            except (ValueError, ValidationError) as exc:
                raise AuthenticationUnavailableError("Invalid authentication response") from exc
            if payload.email_confirmed_at is None:
                raise PermissionError("Email is not confirmed")
            return self._identity(payload.id, payload.email, payload.user_metadata)
        finally:
            if close_client:
                client.close()

    @staticmethod
    def _identity(user_id: str, email: str, metadata: dict[str, object]) -> AuthenticatedIdentity:
        name = metadata.get("full_name") or metadata.get("name")
        avatar = metadata.get("avatar_url") or metadata.get("picture")
        return AuthenticatedIdentity(
            id=user_id,
            email=email.casefold(),
            display_name=str(name)[:200] if name else None,
            avatar_url=str(avatar) if avatar else None,
        )


class UserService:
    def __init__(self, db: Session, settings: Settings | None = None) -> None:
        self.db = db
        self.settings = settings or get_settings()
        self.users = UserRepository(db)

    def sync(self, identity: AuthenticatedIdentity) -> User:
        now = datetime.now(timezone.utc)
        admin_emails = {email.strip().casefold() for email in self.settings.admin_emails.split(",") if email.strip()}
        role = "admin" if identity.email.casefold() in admin_emails else "user"
        user = self.users.get(identity.id)
        if user is None:
            conflicting = self.users.get_by_email(identity.email)
            if conflicting is not None and conflicting.id != LEGACY_USER_ID:
                raise PermissionError("Email is already linked to another account")
            user = self.users.add(User(
                id=identity.id,
                email=identity.email,
                display_name=identity.display_name,
                avatar_url=identity.avatar_url,
                role=role,
                access_tier="free",
                registered_at=now,
                last_active_at=now,
            ))
            self.db.flush()
            from app.services.notifications import notify_after_commit
            notify_after_commit(self.db, self.settings, user.email, "зарегистрировался в SerboTalk")
            if role == "admin":
                self._claim_legacy_data(identity.id)
        else:
            if user.email != identity.email:
                user.email = identity.email
            if user.display_name != identity.display_name:
                user.display_name = identity.display_name
            if user.avatar_url != identity.avatar_url:
                user.avatar_url = identity.avatar_url
            if user.role != role:
                user.role = role
            last_active_at = user.last_active_at
            if last_active_at.tzinfo is None:
                last_active_at = last_active_at.replace(tzinfo=timezone.utc)
            if now - last_active_at >= timedelta(minutes=5):
                user.last_active_at = now
        if user in self.db.new or user in self.db.dirty:
            self.db.flush()
        return user

    def _claim_legacy_data(self, user_id: str) -> None:
        if self.users.get(LEGACY_USER_ID) is None:
            return
        for model, column in (
            (TrainingSession, TrainingSession.user_id),
            (TopicPreset, TopicPreset.owner_user_id),
            (ReviewPhrase, ReviewPhrase.user_id),
            (WordLearningItem, WordLearningItem.user_id),
            (LearnerSkill, LearnerSkill.user_id),
        ):
            self.db.execute(update(model).where(column == LEGACY_USER_ID).values({column.key: user_id}))
        self.db.execute(delete(User).where(User.id == LEGACY_USER_ID))

    def daily_limit(self, user: User) -> int | None:
        if user.role == "admin":
            return None
        return self.settings.premium_daily_phrase_limit if user.access_tier == "premium" else self.settings.free_daily_phrase_limit

    def usage(self, user: User, now: datetime | None = None) -> DailyUsageResponse:
        current = now or datetime.now(timezone.utc)
        start = datetime.combine(current.date(), time.min, tzinfo=timezone.utc)
        end = start + timedelta(days=1)
        used = self.users.count_attempts_between(user.id, start, end)
        limit = self.daily_limit(user)
        return DailyUsageResponse(
            used=used,
            limit=limit,
            remaining=None if limit is None else max(0, limit - used),
            resets_at=end,
        )

    def update_preferences(self, user: User, enabled: bool) -> None:
        self.users.set_assistance(user.id, enabled)
        self.db.commit()

    def current_response(self, user: User) -> CurrentUserResponse:
        from app.services.model_debug import can_debug
        return CurrentUserResponse(
            can_debug_models=can_debug(user, self.settings),
            id=user.id, email=user.email, display_name=user.display_name, avatar_url=user.avatar_url,
            assistance_enabled=user.assistance_enabled,
            role=user.role, access_tier=user.access_tier, registered_at=user.registered_at,
            last_active_at=user.last_active_at, daily_usage=self.usage(user),
        )

    def list_users(self) -> list[AdminUserResponse]:
        now = datetime.now(timezone.utc)
        start = datetime.combine(now.date(), time.min, tzinfo=timezone.utc)
        counts = self.users.count_attempts_between_by_user(start, start + timedelta(days=1))
        return [
            AdminUserResponse(
                id=user.id, email=user.email, display_name=user.display_name, role=user.role,
                access_tier=user.access_tier, registered_at=user.registered_at,
                last_active_at=user.last_active_at, phrases_today=counts.get(user.id, 0),
                daily_limit=self.daily_limit(user),
            )
            for user in self.users.list_real_users()
        ]
