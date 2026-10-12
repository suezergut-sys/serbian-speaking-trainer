import httpx
from pydantic import ValidationError

from app.config import Settings
from app.schemas.auth import ReviewLoginResponse
from app.services.auth_service import AuthenticationUnavailableError


class ReviewLoginRateLimitError(RuntimeError):
    pass


class ReviewLoginService:
    """Resolve one configured alias; Supabase remains the password authority."""

    def __init__(self, settings: Settings, client: httpx.Client | None = None):
        self.settings = settings
        self.client = client

    def sign_in(self, username: str, password: str) -> ReviewLoginResponse:
        settings = self.settings
        if not settings.review_login_email or not settings.supabase_url or not settings.supabase_publishable_key:
            raise AuthenticationUnavailableError("Review sign-in is unavailable")
        if username.strip().casefold() != settings.review_login_username.casefold() or not 1 <= len(password) <= 1024:
            raise PermissionError("Review sign-in failed")
        client = self.client or httpx.Client(timeout=settings.auth_timeout_seconds)
        try:
            # No retries for password attempts. Provider rate limits are preserved.
            response = client.post(
                f"{settings.supabase_url.rstrip('/')}/auth/v1/token",
                params={"grant_type": "password"},
                headers={"apikey": settings.supabase_publishable_key},
                json={"email": settings.review_login_email, "password": password},
            )
            if response.status_code == 429:
                raise ReviewLoginRateLimitError("Try again later")
            if response.status_code in {400, 401, 403, 422}:
                raise PermissionError("Review sign-in failed")
            if response.status_code != 200:
                raise AuthenticationUnavailableError("Review sign-in is unavailable")
            return ReviewLoginResponse.model_validate(response.json())
        except (httpx.RequestError, ValueError, ValidationError) as exc:
            raise AuthenticationUnavailableError("Review sign-in is unavailable") from exc
        finally:
            if self.client is None:
                client.close()
