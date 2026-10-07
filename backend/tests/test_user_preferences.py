from app.api.dependencies import get_current_user
from app.main import app
from app.models import User
from app.services.auth_service import LEGACY_USER_ID, UserService


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
