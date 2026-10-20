from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from sqlalchemy import select

from app.config import Settings, get_settings
from app.main import app
from app.models import ModelDebugSetting, User
from app.services.debug_mode import DebugModeService
from app.services.transcription_adapter import OpenAITranscriptionProvider, get_transcription_provider
from app.services.transcription_settings import TranscriptionSettingsService
from tests.test_transcriptions_api import _create_exercise

PATH = "/api/admin/model-debug/transcription"


def configure(db_session, *, owner=True):
    user = db_session.scalar(select(User))
    user.role = "admin"
    user.email = "suezergut@gmail.com" if owner else "other@example.com"
    db_session.commit()
    settings = Settings(_env_file=None, openai_api_key="server-secret", openai_transcribe_model="env-default",
        openai_transcribe_models=[{"model": "env-alternative", "language_parameter": "language"}])
    app.dependency_overrides[get_settings] = lambda: settings
    return user, settings


def test_selection_persists_independently_of_debug_and_rejects_unknown(api_client, db_session):
    user, settings = configure(db_session)
    assert api_client.get(PATH).json()["options"] == ["env-alternative", "env-default"]
    result = api_client.patch(PATH, json={"model": "env-alternative"})
    assert result.status_code == 200
    assert result.json()["effective_model"] == "env-alternative"
    assert api_client.get(PATH).json()["selected_model"] == "env-alternative"
    assert not db_session.get(ModelDebugSetting, user.id).enabled
    DebugModeService(db_session, user.id).change(True)
    DebugModeService(db_session, user.id).change(False)
    assert api_client.get(PATH).json()["selected_model"] == "env-alternative"
    assert api_client.patch(PATH, json={"model": "unconfigured"}).status_code == 422
    assert api_client.get(PATH).json()["effective_model"] == "env-alternative"
    # Removed allowlist entries and revoked ownership safely fall back to default.
    settings.openai_transcribe_models = []
    assert api_client.get(PATH).json()["effective_model"] == "env-default"
    assert api_client.patch(PATH, json={"model": None}).json()["selected_model"] is None


@pytest.mark.parametrize("role,email", [("user", "suezergut@gmail.com"), ("admin", "other@example.com")])
def test_other_users_cannot_read_or_change_experiment(api_client, db_session, role, email):
    user, settings = configure(db_session)
    TranscriptionSettingsService(db_session, settings, user.id).change("env-alternative")
    user.role, user.email = role, email
    db_session.commit()
    assert api_client.get(PATH).status_code == 403
    assert api_client.patch(PATH, json={"model": "env-alternative"}).status_code == 403
    assert TranscriptionSettingsService(db_session, settings, user.id).provider_settings().openai_transcribe_model == "env-default"


@pytest.mark.parametrize("alphabet", ["latin", "cyrillic"])
def test_actual_request_uses_owner_model_language_contract_and_alphabet(api_client, db_session, alphabet):
    user, settings = configure(db_session)
    exercise_id = _create_exercise(api_client)
    assert api_client.patch(PATH, json={"model": "env-alternative"}).status_code == 200
    provider = OpenAITranscriptionProvider(settings)
    create = Mock(return_value=SimpleNamespace(text="Желим кафу."))
    provider._client = SimpleNamespace(audio=SimpleNamespace(transcriptions=SimpleNamespace(create=create)))
    app.dependency_overrides[get_transcription_provider] = lambda: provider
    result = api_client.post("/api/transcriptions", data={"exercise_id": exercise_id, "alphabet": alphabet},
        files={"audio": ("speech.webm", b"synthetic", "audio/webm")})
    assert result.status_code == 200
    assert result.json()["text"] == "Želim kafu."
    kwargs = create.call_args.kwargs
    assert kwargs["model"] == "env-alternative"
    assert kwargs["language"] == "sr" and "languages" not in kwargs
    assert ("српском ћирилицом" if alphabet == "cyrillic" else "srpskom latinicom") in kwargs["prompt"]
    assert provider.settings.openai_transcribe_model == "env-default"  # No shared singleton mutation.
    assert provider.alphabet == "latin"


def test_invalid_alphabet_is_rejected_before_provider_call(api_client, db_session):
    configure(db_session)
    exercise_id = _create_exercise(api_client)
    assert api_client.post("/api/transcriptions", data={"exercise_id": exercise_id, "alphabet": "greek"},
        files={"audio": ("speech.webm", b"synthetic", "audio/webm")}).status_code == 422
