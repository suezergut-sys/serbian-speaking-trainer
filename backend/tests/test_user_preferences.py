from app.api.dependencies import get_current_user
from app.main import app
from app.models import User
from app.services.auth_service import LEGACY_USER_ID, UserService
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.db import get_db
from app.db.seed import seed_catalog
from app.db.session import create_database_engine
from app.services.auth_service import AuthenticatedIdentity, SupabaseAuthService


def test_preferences_roundtrip_and_isolation(api_client, db_session):
    assert api_client.get("/api/auth/me/preferences").json() == {"assistance_enabled": False}
    assert api_client.patch("/api/auth/me/preferences", json={"assistance_enabled": True}).json() == {"assistance_enabled": True}
    db_session.expire_all()
    assert api_client.get("/api/auth/me").json()["assistance_enabled"] is True
    other = User(id="other-user", email="other@example.com")
    db_session.add(other)
    db_session.commit()
    app.dependency_overrides[get_current_user] = lambda: other
    assert api_client.get("/api/auth/me/preferences").json() == {"assistance_enabled": False}
    api_client.patch("/api/auth/me/preferences", json={"assistance_enabled": False})
    assert db_session.get(User, LEGACY_USER_ID).assistance_enabled is True
    app.dependency_overrides[get_current_user] = lambda: db_session.get(User, LEGACY_USER_ID)
    assert api_client.patch("/api/auth/me/preferences", json={"assistance_enabled": False}).status_code == 200
    db_session.expire_all()
    assert api_client.get("/api/auth/me/preferences").json()["assistance_enabled"] is False


def test_preferences_require_authentication(api_client):
    del app.dependency_overrides[get_current_user]
    assert api_client.get("/api/auth/me/preferences").status_code == 401
    assert api_client.patch("/api/auth/me/preferences", json={"assistance_enabled": True}).status_code == 401


def test_preferences_reject_coercion_and_foreign_fields(api_client):
    for payload in ({}, {"assistance_enabled": "true"}, {"assistance_enabled": 1},
                    {"assistance_enabled": True, "user_id": "someone-else"},
                    {"assistance_enabled": True, "role": "admin"}):
        assert api_client.patch("/api/auth/me/preferences", json=payload).status_code == 422
    assert api_client.get("/api/auth/me/preferences").json()["assistance_enabled"] is False


def test_service_changes_only_preference(db_session):
    user = db_session.get(User, LEGACY_USER_ID)
    service = UserService(db_session)
    service.update_preferences(user, True)
    db_session.expire_all()
    assert user.assistance_enabled is True
    assert user.role == "user"
    assert user.access_tier == "free"


def test_native_preference_patch_cors(api_client):
    for origin in ("http://localhost", "https://localhost", "capacitor://localhost"):
        response = api_client.options("/api/auth/me/preferences", headers={
            "Origin": origin,
            "Access-Control-Request-Method": "PATCH",
            "Access-Control-Request-Headers": "authorization,content-type",
        })
        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == origin
        assert "PATCH" in response.headers["access-control-allow-methods"]


@pytest.mark.parametrize("enabled", [True, False])
@pytest.mark.parametrize("first_client", ["SerboTalk Web", "SerboTalk/1.41 Android"])
def test_saved_preference_survives_restart_login_and_release_bootstrap(tmp_path, monkeypatch, enabled, first_client):
    """Use fresh DB connections and real auth sync, rather than a cached fixture user."""
    database_url = f"sqlite+pysqlite:///{(tmp_path / 'profile.db').as_posix()}"
    root = Path(__file__).resolve().parents[1]
    config = Config(str(root / "alembic.ini"))
    config.set_main_option("script_location", str(root / "alembic"))
    config.config_file_name = None
    identity = AuthenticatedIdentity("persisted-user", "persisted@example.com", "Before restart", None)
    monkeypatch.setattr(SupabaseAuthService, "authenticate", lambda _self, _token: identity)

    engine = create_database_engine(database_url)
    previous_overrides = app.dependency_overrides.copy()

    def database_session():
        with Session(engine) as session:
            yield session
            session.commit()

    app.dependency_overrides[get_db] = database_session
    try:
        with engine.begin() as connection:
            config.attributes["connection"] = connection
            command.upgrade(config, "head")
        with TestClient(app) as client:
            client.headers.update({"Authorization": "Bearer mocked-token", "User-Agent": first_client})
            # The first authenticated visit creates a profile with assistance enabled.
            assert client.get("/api/auth/me").json()["assistance_enabled"] is True
            assert client.get("/api/auth/me/preferences").json() == {"assistance_enabled": True}
            # Start with the opposite value so both explicit true and false are tested.
            assert client.patch("/api/auth/me/preferences", json={"assistance_enabled": not enabled}).status_code == 200
            assert client.patch("/api/auth/me/preferences", json={"assistance_enabled": enabled}).json() == {"assistance_enabled": enabled}
        engine.dispose()

        # Reopen the persisted file, run the same migration/seed release bootstrap,
        # and authenticate again with changed profile metadata and client version.
        engine = create_database_engine(database_url)
        with engine.begin() as connection:
            config.attributes["connection"] = connection
            command.upgrade(config, "head")
            command.upgrade(config, "head")
        with Session(engine) as session:
            seed_catalog(session)
            session.commit()
        identity = AuthenticatedIdentity(identity.id, identity.email, "After restart", "https://example.com/avatar.png")
        with TestClient(app) as client:
            client.headers.update({"Authorization": "Bearer refreshed-mocked-token", "User-Agent": "SerboTalk/next-version Web"})
            profile = client.get("/api/auth/me").json()
            assert profile["display_name"] == "After restart"
            assert profile["assistance_enabled"] is enabled
            assert client.get("/api/auth/me/preferences").json() == {"assistance_enabled": enabled}
        with Session(engine) as session:
            assert session.get(User, identity.id).assistance_enabled is enabled
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous_overrides)
        engine.dispose()


@pytest.mark.parametrize("enabled", [True, False])
def test_first_login_default_preserves_existing_choice(db_session, enabled):
    service = UserService(db_session)
    identity = AuthenticatedIdentity("new-learner", "new-learner@example.invalid", "Learner", None)
    user = service.sync(identity)
    assert user.assistance_enabled is True
    service.update_preferences(user, enabled)
    db_session.expire_all()
    refreshed = service.sync(AuthenticatedIdentity(identity.id, identity.email, "Updated name", None))
    assert refreshed.assistance_enabled is enabled
    assert refreshed.display_name == "Updated name"
