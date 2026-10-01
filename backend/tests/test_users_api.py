from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.orm import Session

from app.config import Settings
from app.api.dependencies import get_current_user
from app.models import Attempt, Exercise, TrainingSession, User
from app.main import app
from app.services.auth_service import (
    LEGACY_USER_ID,
    AuthenticatedIdentity,
    SupabaseAuthService,
    UserService,
)
from app.services import auth_service


def test_supabase_auth_validates_confirmed_user_payload() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["authorization"] == "Bearer token"
        assert request.headers["apikey"] == "publishable"
        return httpx.Response(200, json={
            "id": "11111111-1111-1111-1111-111111111111",
            "email": "Person@Example.com",
            "email_confirmed_at": "2026-09-22T10:00:00Z",
            "user_metadata": {"full_name": "Test Person", "avatar_url": "https://example.com/avatar.png"},
        })

    settings = Settings(
        _env_file=None,
        supabase_url="https://project.supabase.co",
        supabase_publishable_key="publishable",
    )
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        identity = SupabaseAuthService(settings, client).authenticate("token")

    assert identity.email == "person@example.com"
    assert identity.display_name == "Test Person"


def test_supabase_auth_verifies_es256_token_without_remote_request() -> None:
    key = ec.generate_private_key(ec.SECP256R1())
    now = datetime.now(timezone.utc)
    claims = {
        "iss": "https://project.supabase.co/auth/v1",
        "sub": "11111111-1111-1111-1111-111111111111",
        "aud": "authenticated",
        "exp": int((now + timedelta(minutes=30)).timestamp()),
        "iat": int(now.timestamp()),
        "email": "Person@Example.com",
        "app_metadata": {"provider": "google"},
        "user_metadata": {"email_verified": True, "full_name": "Test Person"},
    }
    token = jwt.encode(claims, key, algorithm="ES256", headers={"kid": "test-key"})
    settings = Settings(
        _env_file=None,
        supabase_url="https://project.supabase.co",
        supabase_publishable_key="publishable",
    )
    jwk_client = SimpleNamespace(get_signing_key_from_jwt=lambda _token: SimpleNamespace(key=key.public_key()))

    def reject_remote(_request: httpx.Request) -> httpx.Response:
        raise AssertionError("valid ES256 token must not call Supabase Auth")

    with httpx.Client(transport=httpx.MockTransport(reject_remote)) as client:
        service = SupabaseAuthService(settings, client, jwk_client)
        identity = service.authenticate(token)
        assert identity.email == "person@example.com"
        assert identity.display_name == "Test Person"
        with pytest.raises(PermissionError):
            service.authenticate(jwt.encode({**claims, "aud": "other"}, key, algorithm="ES256"))

    remote_calls = 0

    def confirm_remote(_request: httpx.Request) -> httpx.Response:
        nonlocal remote_calls
        remote_calls += 1
        return httpx.Response(200, json={
            "id": claims["sub"], "email": claims["email"],
            "email_confirmed_at": "2026-09-22T10:00:00Z",
        })

    untrusted_metadata = {**claims, "app_metadata": {"provider": "email"}}
    with httpx.Client(transport=httpx.MockTransport(confirm_remote)) as client:
        identity = SupabaseAuthService(settings, client, jwk_client).authenticate(
            jwt.encode(untrusted_metadata, key, algorithm="ES256")
        )
    assert identity.id == claims["sub"]
    assert remote_calls == 1


def test_current_user_and_admin_user_list(api_client: TestClient, db_session: Session) -> None:
    me = api_client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["daily_usage"] == {
        "used": 0,
        "limit": 10,
        "remaining": 10,
        "resets_at": me.json()["daily_usage"]["resets_at"],
    }
    assert api_client.get("/api/admin/users").status_code == 403

    user = db_session.get(User, me.json()["id"])
    assert user is not None
    user.role = "admin"
    db_session.flush()
    response = api_client.get("/api/admin/users")
    assert response.status_code == 200
    assert response.json()[0]["email"] == "learner@example.com"
    assert response.json()[0]["registered_at"]
    assert response.json()[0]["last_active_at"]


def test_admin_user_counts_keep_utc_boundaries_owners_and_zeroes(
    api_client: TestClient,
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fixed_now = datetime(2026, 10, 1, 12, tzinfo=timezone.utc)

    class FrozenDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            return fixed_now if tz is None else fixed_now.astimezone(tz)

    monkeypatch.setattr(auth_service, "datetime", FrozenDateTime)
    legacy = db_session.get(User, LEGACY_USER_ID)
    assert legacy is not None
    legacy.email = "legacy@local.invalid"
    legacy.role = "admin"
    users = [
        User(id=f"00000000-0000-0000-0000-{index:012d}", email=f"user{index}@example.com",
             role="user", access_tier="free", registered_at=fixed_now - timedelta(days=index))
        for index in (2, 3, 4)
    ]
    db_session.add_all(users)
    db_session.flush()

    def add_attempt(user_id: str, created_at: datetime, suffix: str, session: TrainingSession | None = None) -> TrainingSession:
        owned_session = session or TrainingSession(user_id=user_id, normalized_topic_json={})
        if session is None:
            db_session.add(owned_session)
            db_session.flush()
        exercise = Exercise(session_id=owned_session.id, source_ru=f"Phrase {suffix}")
        db_session.add(exercise)
        db_session.flush()
        db_session.add(Attempt(exercise_id=exercise.id, transcript_sr=f"Odgovor {suffix}", created_at=created_at))
        return owned_session

    day_start = datetime(2026, 10, 1, tzinfo=timezone.utc)
    first_session = add_attempt(users[0].id, day_start, "a-start")
    add_attempt(users[0].id, fixed_now, "a-same-session", first_session)
    add_attempt(users[0].id, fixed_now, "a-other-session")
    add_attempt(users[0].id, day_start - timedelta(microseconds=1), "a-yesterday")
    add_attempt(users[0].id, day_start + timedelta(days=1), "a-tomorrow")
    add_attempt(users[1].id, fixed_now, "b-first")
    add_attempt(users[1].id, fixed_now, "b-second")
    add_attempt(legacy.id, fixed_now, "legacy")
    db_session.flush()

    selects: list[str] = []

    def capture_sql(_connection, _cursor, statement, _parameters, _context, _executemany) -> None:
        if statement.lstrip().upper().startswith("SELECT"):
            selects.append(statement)

    assert db_session.bind is not None
    event.listen(db_session.bind, "before_cursor_execute", capture_sql)
    try:
        response = api_client.get("/api/admin/users")
    finally:
        event.remove(db_session.bind, "before_cursor_execute", capture_sql)

    assert response.status_code == 200
    assert [(row["id"], row["phrases_today"]) for row in response.json()] == [
        (users[0].id, 3), (users[1].id, 2), (users[2].id, 0),
    ]
    assert len(selects) == 2
    service = UserService(db_session)
    assert service.usage(users[0], fixed_now).used == 3
    assert service.usage(users[1], fixed_now).used == 2
    assert service.usage(users[2], fixed_now).used == 0


def test_admin_user_select_count_is_constant_as_users_grow(db_session: Session) -> None:
    assert db_session.bind is not None
    service = UserService(db_session)

    def select_count() -> int:
        selects: list[str] = []

        def capture_sql(_connection, _cursor, statement, _parameters, _context, _executemany) -> None:
            if statement.lstrip().upper().startswith("SELECT"):
                selects.append(statement)

        event.listen(db_session.bind, "before_cursor_execute", capture_sql)
        try:
            service.list_users()
        finally:
            event.remove(db_session.bind, "before_cursor_execute", capture_sql)
        assert any("GROUP BY training_sessions.user_id" in statement for statement in selects)
        return len(selects)

    one_user_queries = select_count()
    db_session.add_all([
        User(id=f"00000000-0000-0000-0000-{index:012d}", email=f"growth{index}@example.com")
        for index in range(10, 15)
    ])
    db_session.flush()

    assert one_user_queries == select_count() == 2


def test_admin_email_is_promoted_by_backend_configuration(db_session: Session) -> None:
    user = UserService(db_session).sync(AuthenticatedIdentity(
        id="33333333-3333-3333-3333-333333333333",
        email="suezergut@gmail.com",
        display_name="Admin",
        avatar_url=None,
    ))
    assert user.role == "admin"


def test_user_sync_skips_unchanged_write_until_activity_is_stale(db_session: Session) -> None:
    identity = AuthenticatedIdentity(
        id="44444444-4444-4444-4444-444444444444",
        email="person@example.com",
        display_name="Person",
        avatar_url=None,
    )
    service = UserService(db_session)
    user = service.sync(identity)
    db_session.commit()
    statements: list[str] = []

    def capture_query(_connection, _cursor, statement, _parameters, _context, _executemany) -> None:
        statements.append(statement)

    assert db_session.bind is not None
    event.listen(db_session.bind, "before_cursor_execute", capture_query)
    try:
        service.sync(identity)
        assert not any(statement.startswith("UPDATE users") for statement in statements)
        user.last_active_at = datetime.now(timezone.utc) - timedelta(minutes=6)
        db_session.flush()
        statements.clear()
        service.sync(identity)
        assert any(statement.startswith("UPDATE users") for statement in statements)
    finally:
        event.remove(db_session.bind, "before_cursor_execute", capture_query)


def test_protected_routes_require_bearer_authentication(api_client: TestClient) -> None:
    override = app.dependency_overrides.pop(get_current_user)
    try:
        assert api_client.get("/api/topics").status_code == 401
        assert api_client.get("/api/health").status_code == 200
    finally:
        app.dependency_overrides[get_current_user] = override


def test_free_user_is_limited_to_ten_attempts_per_utc_day(
    api_client: TestClient,
    db_session: Session,
) -> None:
    session = api_client.post("/api/sessions", json={"topic_id": "cafe"}).json()
    exercise = api_client.post(f"/api/sessions/{session['id']}/next-exercise").json()
    stored_exercise = db_session.get(Exercise, exercise["id"])
    assert stored_exercise is not None
    canonical = stored_exercise.target_hints_json["canonical_sr"]
    now = datetime.now(timezone.utc)
    db_session.add_all([
        Attempt(exercise_id=exercise["id"], transcript_sr=f"attempt {index}", created_at=now)
        for index in range(10)
    ])
    db_session.flush()

    response = api_client.post(
        "/api/attempts",
        json={"exercise_id": exercise["id"], "transcript_sr": canonical},
    )
    assert response.status_code == 429
    assert response.json()["detail"] == "Daily phrase limit reached"

    user = db_session.get(User, LEGACY_USER_ID)
    assert user is not None
    user.role = "admin"
    db_session.flush()
    assert api_client.post(
        "/api/attempts",
        json={"exercise_id": exercise["id"], "transcript_sr": canonical},
    ).status_code == 201


def test_user_cannot_open_another_users_session(api_client: TestClient, db_session: Session) -> None:
    other = User(
        id="22222222-2222-2222-2222-222222222222",
        email="other@example.com",
        role="user",
        access_tier="free",
    )
    db_session.add(other)
    db_session.flush()
    foreign_session = TrainingSession(user_id=other.id, normalized_topic_json={"topic": {
        "id": "general", "source": "general", "title_ru": "Test", "description_ru": "Test",
        "target_level": "A2", "likely_intents": [], "suggested_vocabulary": [],
        "excluded_domains": [], "normalized_prompt_context": "Test",
    }})
    db_session.add(foreign_session)
    db_session.flush()

    assert api_client.get(f"/api/sessions/{foreign_session.id}").status_code == 404
