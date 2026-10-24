import httpx
import pytest

from app.api import dependencies
from app.config import Settings, get_settings
from app.main import app
from app.services.auth_service import SupabaseAuthService


@pytest.mark.parametrize("remote_status,confirmed,expected", [
    (200, True, 200), (200, False, 401), (401, True, 401), (503, True, 503),
])
def test_email_session_requires_remote_confirmation_and_keeps_roles(
    api_client, monkeypatch, remote_status, confirmed, expected,
):
    settings = Settings(
        _env_file=None, supabase_url="https://synthetic.supabase.co",
        supabase_publishable_key="synthetic-public-key", admin_emails="",
    )
    calls = []

    def handler(request):
        calls.append(request)
        assert request.headers["authorization"] == "Bearer synthetic-email-session"
        return httpx.Response(remote_status, json={
            "id": "11111111-1111-1111-1111-111111111111", "email": "email@example.invalid",
            "email_confirmed_at": "2026-10-24T00:00:00Z" if confirmed else None,
            "app_metadata": {"provider": "email"},
            "user_metadata": {"role": "admin", "access_tier": "premium"},
        })

    app.dependency_overrides.pop(dependencies.get_current_user)
    app.dependency_overrides[get_settings] = lambda: settings
    with httpx.Client(transport=httpx.MockTransport(handler)) as remote:
        service = SupabaseAuthService(settings, remote)
        monkeypatch.setattr(dependencies, "SupabaseAuthService", lambda _settings: service)
        response = api_client.get("/api/auth/me", headers={"Authorization": "Bearer synthetic-email-session"})
        assert response.status_code == expected
        if expected == 200:
            assert response.json()["role"] == "user"
            assert response.json()["access_tier"] == "free"
            assert response.json()["id"] == "11111111-1111-1111-1111-111111111111"
            assert api_client.get("/api/admin/users", headers={"Authorization": "Bearer synthetic-email-session"}).status_code == 403
        else:
            assert response.json()["detail"] in {"Invalid authentication", "Authentication unavailable"}
    assert len(calls) == (2 if expected == 200 else settings.auth_max_retries + 1 if remote_status == 503 else 1)
