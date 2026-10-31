from fastapi.testclient import TestClient
from app.main import app


def test_retired_reviewer_login_never_issues_tokens():
    with TestClient(app) as client:
        response = client.post("/api/auth/review-login", json={"username": "synthetic", "password": "synthetic"})
    assert response.status_code == 410
    assert response.headers["cache-control"] == "no-store"
    assert "access_token" not in response.text
    assert "/api/auth/review-login" not in app.openapi()["paths"]
