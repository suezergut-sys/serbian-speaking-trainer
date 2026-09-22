from datetime import datetime, timezone

import httpx
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.config import Settings
from app.api.dependencies import get_current_user
from app.models import Attempt, TrainingSession, User
from app.main import app
from app.services.auth_service import (
    LEGACY_USER_ID,
    AuthenticatedIdentity,
    SupabaseAuthService,
    UserService,
)


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


def test_admin_email_is_promoted_by_backend_configuration(db_session: Session) -> None:
    user = UserService(db_session).sync(AuthenticatedIdentity(
        id="33333333-3333-3333-3333-333333333333",
        email="suezergut@gmail.com",
        display_name="Admin",
        avatar_url=None,
    ))
    assert user.role == "admin"


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
    now = datetime.now(timezone.utc)
    db_session.add_all([
        Attempt(exercise_id=exercise["id"], transcript_sr=f"attempt {index}", created_at=now)
        for index in range(10)
    ])
    db_session.flush()

    response = api_client.post(
        "/api/attempts",
        json={"exercise_id": exercise["id"], "transcript_sr": "Mogu li da dobijem jelovnik, molim vas?"},
    )
    assert response.status_code == 429
    assert response.json()["detail"] == "Daily phrase limit reached"

    user = db_session.get(User, LEGACY_USER_ID)
    assert user is not None
    user.role = "admin"
    db_session.flush()
    assert api_client.post(
        "/api/attempts",
        json={"exercise_id": exercise["id"], "transcript_sr": "Mogu li da dobijem jelovnik, molim vas?"},
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
