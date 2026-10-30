import httpx
import pytest

from scripts.delete_account import provider_remover


USER_ID = '11111111-1111-1111-1111-111111111111'
EMAIL = 'disposable@example.invalid'


def mock_provider(monkeypatch, handler):
    real_client = httpx.Client
    monkeypatch.setattr(httpx, 'Client', lambda **kwargs: real_client(
        timeout=kwargs['timeout'], transport=httpx.MockTransport(handler)))


def test_provider_confirms_identity_and_verifies_removal(monkeypatch):
    calls = []

    def handler(request):
        assert request.url == f'https://auth.example.invalid/auth/v1/admin/users/{USER_ID}'
        assert request.headers['apikey'] == 'synthetic-secret'
        calls.append(request.method)
        if calls == ['GET']:
            return httpx.Response(200, json={'id': USER_ID, 'email': EMAIL.upper()})
        return httpx.Response(200 if request.method == 'DELETE' else 404)

    mock_provider(monkeypatch, handler)
    provider_remover('https://auth.example.invalid/', 'synthetic-secret')(USER_ID, EMAIL)
    assert calls == ['GET', 'DELETE', 'GET']


@pytest.mark.parametrize('payload', [
    {'id': USER_ID, 'email': 'different@example.invalid'},
    {'id': '22222222-2222-2222-2222-222222222222', 'email': EMAIL},
    {'unexpected': 'unvalidated provider response'},
])
def test_provider_never_deletes_a_mismatched_or_invalid_identity(monkeypatch, payload):
    calls = []

    def handler(request):
        calls.append(request.method)
        return httpx.Response(200, json=payload)

    mock_provider(monkeypatch, handler)
    with pytest.raises((PermissionError, RuntimeError)):
        provider_remover('https://auth.example.invalid', 'synthetic-secret')(USER_ID, EMAIL)
    assert calls == ['GET']


def test_provider_retry_accepts_an_already_removed_identity(monkeypatch):
    calls = []

    def handler(request):
        calls.append(request.method)
        return httpx.Response(404)

    mock_provider(monkeypatch, handler)
    provider_remover('https://auth.example.invalid', 'synthetic-secret')(USER_ID, EMAIL)
    assert calls == ['GET']


def test_provider_does_not_report_success_until_identity_is_absent(monkeypatch):
    def handler(request):
        return httpx.Response(200, json={'id': USER_ID, 'email': EMAIL})

    mock_provider(monkeypatch, handler)
    with pytest.raises(RuntimeError, match='not yet verified'):
        provider_remover('https://auth.example.invalid', 'synthetic-secret')(USER_ID, EMAIL)
