def test_capacitor_origin_can_call_api(api_client):
    response = api_client.options(
        "/api/health",
        headers={
            "Origin": "https://localhost",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "https://localhost"


def test_unknown_web_origin_is_not_allowed(api_client):
    response = api_client.options(
        "/api/health",
        headers={
            "Origin": "https://untrusted.example",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert "access-control-allow-origin" not in response.headers
