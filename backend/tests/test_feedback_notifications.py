import json
from datetime import datetime, timezone
from io import BytesIO
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy import select, inspect
from alembic import command
from alembic.config import Config
from pathlib import Path

from app.api.dependencies import get_current_user
from app.config import Settings, get_settings
from app.main import app
from app.models import Attempt, Exercise, ReviewPhrase, TrainingSession, User, UserFeedback
from app.services import notifications
from app.services.auth_service import AuthenticatedIdentity, UserService, LEGACY_USER_ID
from app.services.transcription_adapter import OpenAITranscriptionProvider, get_transcription_provider


real_send_notification = notifications.send_notification


def telegram_settings():
    return Settings(_env_file=None, telegram_bot_token="synthetic-token", telegram_chat_id="123")


def test_feedback_saved_with_owner_timestamp_and_notified(api_client, db_session, monkeypatch):
    sent = []
    monkeypatch.setattr(notifications, "send_notification", lambda settings, text: sent.append(text))
    app.dependency_overrides[get_settings] = telegram_settings
    response = api_client.post("/api/feedback", json={"content": "  Спасибо за тренировку!  "})
    assert response.status_code == 201
    feedback = db_session.get(UserFeedback, response.json()["id"])
    assert feedback.user_id == LEGACY_USER_ID
    assert feedback.content == "Спасибо за тренировку!"
    assert feedback.created_at is not None
    assert sent == ["learner@example.com оставил обратную связь в SerboTalk"]
    assert "content" not in response.json()
    for payload in ({"content": "  "}, {"content": "x" * 5001}, {"content": "x", "user_id": "other"}):
        assert api_client.post("/api/feedback", json=payload).status_code == 422
    assert len(list(db_session.scalars(select(UserFeedback)))) == 1


def test_feedback_requires_authentication(api_client):
    app.dependency_overrides.pop(get_current_user)
    assert api_client.post("/api/feedback", json={"content": "hello"}).status_code == 401
    assert api_client.post("/api/feedback/transcribe", files={"audio": ("x.webm", b"synthetic", "audio/webm")}).status_code == 401


def test_registration_only_after_commit_once_and_rollback_discards(db_session, monkeypatch):
    sent = []
    monkeypatch.setattr(notifications, "send_notification", lambda settings, text: sent.append(text))
    identity = AuthenticatedIdentity(str(uuid4()), "new@example.com", None, None)
    service = UserService(db_session, telegram_settings())
    service.sync(identity)
    assert sent == []
    db_session.rollback()
    db_session.commit()
    assert sent == []
    service.sync(identity)
    db_session.commit()
    service.sync(identity)
    db_session.commit()
    assert sent == ["new@example.com зарегистрировался в SerboTalk"]


def test_twentieth_attempt_notifies_once_even_on_idempotent_replay(api_client, db_session, monkeypatch):
    sent = []
    monkeypatch.setattr(notifications, "send_notification", lambda settings, text: sent.append(text))
    monkeypatch.setattr("app.config.get_settings", telegram_settings)
    started = api_client.post("/api/sessions/start", json={"topic_id": "bank", "length": 100}).json()
    session_id = started["session"]["id"]
    for index in range(18):
        exercise = Exercise(session_id=session_id, source_ru=f"synthetic {index}")
        db_session.add(exercise); db_session.flush()
        db_session.add(Attempt(exercise_id=exercise.id, transcript_sr="synthetic"))
    db_session.commit()
    payload = {"exercise_id": started["exercise"]["id"], "transcript_sr": db_session.get(Exercise, started["exercise"]["id"]).target_hints_json["canonical_sr"], "client_request_id": str(uuid4())}
    assert api_client.post("/api/attempts", json=payload).status_code == 201
    assert sent == []
    exercise = api_client.post(f"/api/sessions/{session_id}/next-exercise").json()
    payload = {**payload, "exercise_id": exercise["id"], "transcript_sr": db_session.get(Exercise, exercise["id"]).target_hints_json["canonical_sr"], "client_request_id": str(uuid4())}
    response = api_client.post("/api/attempts", json=payload)
    assert response.status_code == 201
    assert response.json()["daily_usage"]["used"] == 20
    assert len(sent) == 1 and "20 проверок" in sent[0]
    assert api_client.post("/api/attempts", json=payload).status_code == 201
    assert len(sent) == 1


def test_telegram_payload_timeout_and_safe_failure(monkeypatch, caplog):
    captured = []
    def fake_open(request, timeout):
        captured.append((json.loads(request.data), timeout))
        return BytesIO(b'{"ok":true}')
    monkeypatch.setattr(notifications, "urlopen", fake_open)
    assert real_send_notification(telegram_settings(), "test")
    assert captured == [({"chat_id": "123", "text": "test"}, 3)]
    def fail(*args, **kwargs):
        raise TimeoutError("synthetic-token private email")
    monkeypatch.setattr(notifications, "urlopen", fail)
    assert not real_send_notification(telegram_settings(), "test")
    assert "synthetic-token" not in caplog.text and "private email" not in caplog.text


def test_feedback_transcription_uses_no_serbian_language_or_debug_storage(api_client):
    provider = OpenAITranscriptionProvider(Settings(_env_file=None, openai_api_key="synthetic", openai_transcribe_model="test-model"))
    calls = []
    def create(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(text="Мне нравится приложение.")
    provider._client = SimpleNamespace(audio=SimpleNamespace(transcriptions=SimpleNamespace(create=create)))
    app.dependency_overrides[get_transcription_provider] = lambda: provider
    response = api_client.post("/api/feedback/transcribe", files={"audio": ("x.webm", b"synthetic audio", "audio/webm")})
    assert response.status_code == 200
    assert response.json() == {"text": "Мне нравится приложение."}
    assert "language" not in calls[0] and "languages" not in calls[0] and "prompt" not in calls[0]
    assert api_client.post("/api/feedback/transcribe", files={"audio": ("x", b"x", "text/plain")}).status_code == 415
    assert api_client.post("/api/feedback/transcribe", files={"audio": ("x.webm", b"x" * 1_100_000, "audio/webm")}).status_code == 413


def test_review_exercise_contains_original_topic(api_client, db_session):
    db_session.add(ReviewPhrase(user_id=LEGACY_USER_ID, topic_id="bank", source_ru="Синтетическая фраза", source_normalized="синтетическая фраза", intended_sr_variants_json=["Test."], status="active"))
    db_session.commit()
    response = api_client.post("/api/sessions/start", json={"review_mode": True})
    assert response.status_code == 201
    assert response.json()["exercise"]["topic_id"] == "bank"
    assert response.json()["exercise"]["topic_title_ru"] == "Банк"


def test_feedback_migration_roundtrip(tmp_path):
    from app.db.session import create_database_engine
    root = Path(__file__).resolve().parents[1]
    config = Config(str(root / "alembic.ini"))
    config.set_main_option("script_location", str(root / "alembic"))
    config.config_file_name = None
    engine = create_database_engine(f"sqlite:///{(tmp_path / 'feedback.db').as_posix()}")
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "head"); command.upgrade(config, "head")
        assert "user_feedback" in inspect(connection).get_table_names()
        command.downgrade(config, "2e89c4f8a7b2")
        assert "user_feedback" not in inspect(connection).get_table_names()
        command.upgrade(config, "head")
    engine.dispose()
