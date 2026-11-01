import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.main import app
from app.services.auth_service import AuthenticationUnavailableError
from app.services.review_login import ReviewLoginService, ReviewLoginRateLimitError


def settings():
    return Settings(_env_file=None, supabase_url="https://synthetic.supabase.co", supabase_publishable_key="synthetic-public-key", review_login_email="review@example.com")


def test_alias_resolves_only_server_side_and_returns_only_tokens():
    def handle(request):
        import json
        assert request.url.params["grant_type"] == "password"
        assert json.loads(request.content) == {"email": "review@example.com", "password": "synthetic-password"}
        return httpx.Response(200, json={"access_token": "synthetic-access", "refresh_token": "synthetic-refresh", "user": {"email": "review@example.com"}})
    with httpx.Client(transport=httpx.MockTransport(handle)) as client:
        result = ReviewLoginService(settings(), client).sign_in(" SerboTalkReview ", "synthetic-password")
    assert result.model_dump() == {"access_token": "synthetic-access", "refresh_token": "synthetic-refresh"}


@pytest.mark.parametrize("username,password", [("unknown", "synthetic"), ("review@example.com", "synthetic"), ("serbotalkreview", ""), ("serbotalkreview", "x" * 1025)])
def test_invalid_credentials_do_not_call_provider(username, password):
    def handle(request):
        pytest.fail("Unexpected provider request")
    with httpx.Client(transport=httpx.MockTransport(handle)) as client, pytest.raises(PermissionError):
        ReviewLoginService(settings(), client).sign_in(username, password)


@pytest.mark.parametrize("status,body,error", [(400, {"msg": "private"}, PermissionError), (429, {}, ReviewLoginRateLimitError), (500, {}, AuthenticationUnavailableError), (200, {"access_token": "missing-refresh"}, AuthenticationUnavailableError)])
def test_provider_failures_are_generic_and_never_retried(status, body, error):
    calls = []
    def handle(request):
        calls.append(request)
        return httpx.Response(status, json=body)
    with httpx.Client(transport=httpx.MockTransport(handle)) as client, pytest.raises(error) as caught:
        ReviewLoginService(settings(), client).sign_in("serbotalkreview", "synthetic-password")
    assert "private" not in str(caught.value)
    assert len(calls) == 1


def test_timeout_is_safe():
    def handle(request):
        raise httpx.ReadTimeout("private", request=request)
    with httpx.Client(transport=httpx.MockTransport(handle)) as client, pytest.raises(AuthenticationUnavailableError):
        ReviewLoginService(settings(), client).sign_in("serbotalkreview", "synthetic-password")


def test_route_validation_never_echoes_password():
    with TestClient(app) as client:
        result = client.post("/api/auth/review-login", json={"username": [], "password": "synthetic-sensitive"})
    assert result.status_code == 422
    assert "synthetic-sensitive" not in result.text
    assert result.headers["cache-control"] == "no-store"


@pytest.mark.parametrize("error,status", [(PermissionError(), 401), (ReviewLoginRateLimitError(), 429), (AuthenticationUnavailableError(), 503)])
def test_route_failures_are_not_cached(monkeypatch, error, status):
    def fail(*args):
        raise error
    monkeypatch.setattr(ReviewLoginService, "sign_in", fail)
    with TestClient(app) as client:
        result = client.post("/api/auth/review-login", json={"username": "serbotalkreview", "password": "synthetic"})
    assert result.status_code == status
    assert result.headers["cache-control"] == "no-store"


def test_route_returns_session_without_auth_requirement(monkeypatch):
    from app.schemas.auth import ReviewLoginResponse
    monkeypatch.setattr(ReviewLoginService, "sign_in", lambda *args: ReviewLoginResponse(access_token="synthetic-access", refresh_token="synthetic-refresh"))
    with TestClient(app) as client:
        result = client.post("/api/auth/review-login", json={"username": "serbotalkreview", "password": "synthetic"})
    assert result.status_code == 200
    assert result.json() == {"access_token": "synthetic-access", "refresh_token": "synthetic-refresh"}
    assert result.headers["cache-control"] == "no-store"


@pytest.mark.parametrize("payload", [
    {"username": "x" * 101, "password": "synthetic-sensitive"},
    {"username": "serbotalkreview", "password": "synthetic-sensitive" * 100},
    {"username": "serbotalkreview", "password": "synthetic-sensitive", "user_id": "other"},
])
def test_review_request_bounds_and_extra_fields_are_safe(payload):
    with TestClient(app) as client:
        response = client.post("/api/auth/review-login", json=payload)
    assert response.status_code == 422
    assert "synthetic-sensitive" not in response.text
    assert response.headers["cache-control"] == "no-store"
