from fastapi.testclient import TestClient
import unicodedata

from app.config import Settings, get_settings
from app.main import app
from app.services.transcription_adapter import get_transcription_provider
from tests.fakes import FakeTranscriptionProvider


def _create_exercise(api_client: TestClient) -> str:
    session_response = api_client.post("/api/sessions", json={"topic_id": "bank", "length": 3})
    session_id = session_response.json()["id"]
    exercise_response = api_client.post(f"/api/sessions/{session_id}/next-exercise")
    return exercise_response.json()["id"]


def test_transcribes_supported_audio_without_persisting_it(api_client: TestClient) -> None:
    exercise_id = _create_exercise(api_client)
    provider = FakeTranscriptionProvider(text="Желим да отворим рачун.")
    app.dependency_overrides[get_transcription_provider] = lambda: provider
    app.dependency_overrides[get_settings] = lambda: Settings(
        openai_api_key="server-secret",
        openai_transcribe_model="model-from-env",
        max_audio_bytes=100_000,
    )

    response = api_client.post(
        "/api/transcriptions",
        data={"exercise_id": exercise_id},
        files={"audio": ("speech.webm", b"webm-audio-bytes", "audio/webm")},
    )

    assert response.status_code == 200
    assert response.json() == {"text": "Želim da otvorim račun."}
    assert provider.calls == [{
        "audio": b"webm-audio-bytes",
        "filename": "speech.webm",
        "content_type": "audio/webm",
    }]
    assert "server-secret" not in response.text


def test_transcription_normalizes_mixed_script_and_combining_marks(api_client: TestClient) -> None:
    exercise_id = _create_exercise(api_client)
    provider = FakeTranscriptionProvider(text=unicodedata.normalize("NFD", "Платићу bankovnom karticom."))
    app.dependency_overrides[get_transcription_provider] = lambda: provider
    app.dependency_overrides[get_settings] = lambda: Settings(
        openai_api_key="server-secret", openai_transcribe_model="model-from-env",
    )

    response = api_client.post(
        "/api/transcriptions", data={"exercise_id": exercise_id},
        files={"audio": ("speech.webm", b"webm-audio-bytes", "audio/webm")},
    )

    assert response.status_code == 200
    assert response.json() == {"text": "Platiću bankovnom karticom."}


def test_transcription_rejects_non_serbian_letter_scripts(api_client: TestClient) -> None:
    exercise_id = _create_exercise(api_client)
    provider = FakeTranscriptionProvider(text="Platιћу bankovnom karticom.")
    app.dependency_overrides[get_transcription_provider] = lambda: provider
    app.dependency_overrides[get_settings] = lambda: Settings(
        openai_api_key="server-secret", openai_transcribe_model="model-from-env",
    )

    response = api_client.post(
        "/api/transcriptions", data={"exercise_id": exercise_id},
        files={"audio": ("speech.webm", b"webm-audio-bytes", "audio/webm")},
    )

    assert response.status_code == 503
    assert response.json() == {"detail": "Voice transcription is temporarily unavailable"}


def test_rejects_unsupported_audio_before_provider_call(api_client: TestClient) -> None:
    exercise_id = _create_exercise(api_client)
    provider = FakeTranscriptionProvider()
    app.dependency_overrides[get_transcription_provider] = lambda: provider

    response = api_client.post(
        "/api/transcriptions",
        data={"exercise_id": exercise_id},
        files={"audio": ("speech.txt", b"not-audio", "text/plain")},
    )

    assert response.status_code == 415
    assert provider.calls == []


def test_rejects_audio_over_configured_limit(api_client: TestClient) -> None:
    exercise_id = _create_exercise(api_client)
    provider = FakeTranscriptionProvider()
    app.dependency_overrides[get_transcription_provider] = lambda: provider
    app.dependency_overrides[get_settings] = lambda: Settings(
        openai_api_key="server-secret",
        openai_transcribe_model="model-from-env",
        max_audio_bytes=10_000,
    )

    response = api_client.post(
        "/api/transcriptions",
        data={"exercise_id": exercise_id},
        files={"audio": ("speech.webm", b"x" * 10_001, "audio/webm")},
    )

    assert response.status_code == 413
    assert provider.calls == []


def test_reports_unavailable_transcription(api_client: TestClient) -> None:
    exercise_id = _create_exercise(api_client)

    response = api_client.post(
        "/api/transcriptions",
        data={"exercise_id": exercise_id},
        files={"audio": ("speech.webm", b"audio", "audio/webm")},
    )

    assert response.status_code == 503
    assert response.json() == {"detail": "Voice transcription is temporarily unavailable"}


def test_rejects_oversized_request_before_multipart_can_spool(api_client: TestClient) -> None:
    response = api_client.post(
        "/api/transcriptions",
        data={"exercise_id": "exercise"},
        files={"audio": ("speech.webm", b"x" * 1_064_001, "audio/webm")},
    )

    assert response.status_code == 413
    assert response.json() == {"detail": "Audio is too large"}
