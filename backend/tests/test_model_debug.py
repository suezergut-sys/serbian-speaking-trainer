from types import SimpleNamespace
from unittest.mock import Mock
import json
import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session
from alembic import command
from alembic.config import Config
from pathlib import Path
from app.config import Settings
from app.models import ModelDebugLog, User
from app.db.base import Base
from app.db.session import create_database_engine
from app.services.model_debug import DebugContext, debug_context, capture_model_call
from app.services.debug_mode import DebugModeService
from app.services.transcription_adapter import OpenAITranscriptionProvider, TranscriptionServiceError
from app.services.ai_adapter import OpenAIStructuredProvider
from app.schemas import TopicContext


@pytest.fixture
def debug_engine(tmp_path):
    engine = create_database_engine(f"sqlite:///{(tmp_path / 'debug.db').as_posix()}")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        db.add(User(id="maxim", email="suezergut@gmail.com", role="admin"))
        db.commit()
    yield engine
    engine.dispose()


def mode(engine, enabled):
    with Session(engine) as db:
        return DebugModeService(db, "maxim").change(enabled)


def logs(engine):
    with Session(engine) as db:
        return list(db.scalars(select(ModelDebugLog).order_by(ModelDebugLog.started_at)))


def test_opt_in_payload_time_secret_redaction_and_delete(debug_engine):
    token = debug_context.set(DebugContext("maxim", debug_engine))
    try:
        with capture_model_call("test", "env-model", {"input": "not recorded"}) as capture:
            capture.received(SimpleNamespace(text="not recorded"))
        assert logs(debug_engine) == []
        mode(debug_engine, True)
        with capture_model_call("test", "env-model", {"input": "secret123 request", "audio": "never", "authorization": "never"}, "secret123") as capture:
            capture.received(SimpleNamespace(text="secret123 reply"))
        rows = logs(debug_engine)
        assert len(rows) == 1
        assert rows[0].request_json["input"] == "[REDACTED] request"
        assert rows[0].response_json == {"text": "[REDACTED] reply"}
        assert rows[0].duration_ms >= 0 and rows[0].completed_at >= rows[0].started_at
        assert rows[0].request_json["audio"] == rows[0].request_json["authorization"] == "[REDACTED]"
        mode(debug_engine, False)
        assert logs(debug_engine) == []
        with Session(debug_engine) as db:
            assert DebugModeService(db, "maxim").read().enabled is False
    finally:
        debug_context.reset(token)


@pytest.mark.parametrize("reenable", [False, True])
def test_late_response_cannot_restore_logs_after_disable(debug_engine, reenable):
    mode(debug_engine, True)
    token = debug_context.set(DebugContext("maxim", debug_engine))
    try:
        with capture_model_call("audio.transcriptions", "env-model", {"input": "old"}) as capture:
            capture.attach_audio(b"synthetic", "audio/webm")
            mode(debug_engine, False)
            if reenable:
                mode(debug_engine, True)
            capture.received(SimpleNamespace(text="late"))
        assert logs(debug_engine) == []
        if reenable:
            with capture_model_call("new", "env-model", {"input": "new"}) as capture:
                capture.received(SimpleNamespace(text="new"))
            assert len(logs(debug_engine)) == 1
    finally:
        debug_context.reset(token)


def test_stt_retries_store_audio_once_outside_json(debug_engine):
    mode(debug_engine, True)
    token = debug_context.set(DebugContext("maxim", debug_engine))
    provider = OpenAITranscriptionProvider(Settings(openai_api_key="private-key", openai_transcribe_model="env-stt"))
    provider._client = SimpleNamespace(audio=SimpleNamespace(transcriptions=SimpleNamespace(create=Mock(side_effect=[
        SimpleNamespace(text="Θέλω"), SimpleNamespace(text="Potreben nam je ugovor.")]))))
    try:
        assert provider.transcribe(audio=b"never-save-this", filename="speech.webm", content_type="audio/webm").text == "Potreben nam je ugovor."
        rows = logs(debug_engine)
        assert len(rows) == 2
        assert rows[0].response_json["text"] == "Θέλω"
        assert rows[1].operation.endswith("script_retry")
        serialized = json.dumps([r.request_json for r in rows])
        assert "never-save-this" not in serialized and "private-key" not in serialized
        assert rows[0].request_json["audio_bytes"] == 15
        assert rows[0].request_json["audio_sha256"] == rows[1].request_json["audio_sha256"]
        with Session(debug_engine) as db:
            assert db.get(ModelDebugLog, rows[0].id).audio_payload == b"never-save-this"
            assert db.get(ModelDebugLog, rows[1].id).audio_payload is None
        provider._client.audio.transcriptions.create = Mock(side_effect=RuntimeError("private-key unsafe message"))
        with pytest.raises(TranscriptionServiceError):
            provider.transcribe(audio=b"never-save-this", filename="speech.webm", content_type="audio/webm")
        assert logs(debug_engine)[-1].error_json == {"type": "RuntimeError", "status_code": None, "body": None}
        with Session(debug_engine) as db:
            assert db.get(ModelDebugLog, logs(debug_engine)[-1].id).audio_payload == b"never-save-this"
    finally:
        debug_context.reset(token)


def test_text_adapter_logs_prompt_input_and_structured_response(debug_engine):
    mode(debug_engine, True)
    token = debug_context.set(DebugContext("maxim", debug_engine))
    provider = OpenAIStructuredProvider(Settings(openai_api_key="private", openai_text_model="env-text"))
    result = TopicContext(id="cafe", source="custom", title_ru="Кафе", description_ru="Заказ кофе", normalized_prompt_context="Order coffee")
    provider._client = SimpleNamespace(responses=SimpleNamespace(parse=Mock(return_value=SimpleNamespace(output_parsed=result))))
    try:
        provider.normalize_topic("Кофе")
        row = logs(debug_engine)[0]
        assert row.model == "env-text" and row.operation == "topic_normalizer.md"
        assert json.loads(row.request_json["input"])["user_topic_ru"] == "Кофе"
        assert row.request_json["instructions"]
        assert row.response_json["output_parsed"] == result.model_dump(mode="json")
    finally:
        debug_context.reset(token)


@pytest.mark.parametrize("email,role,expected", [("learner@example.com", "user", 403), ("other@example.com", "admin", 403), ("suezergut@gmail.com", "user", 403), ("suezergut@gmail.com", "admin", 200)])
def test_mode_api_authorization_and_disable_deletes(api_client, db_session, email, role, expected):
    user = db_session.scalar(select(User))
    user.email, user.role = email, role
    db_session.commit()
    response = api_client.get("/api/admin/model-debug")
    assert response.status_code == expected
    response = api_client.patch("/api/admin/model-debug", json={"enabled": True})
    assert response.status_code == expected
    assert api_client.get("/api/auth/me").json()["can_debug_models"] is (expected == 200)
    if expected == 200:
        assert response.json() == {"enabled": True}
        assert api_client.patch("/api/admin/model-debug", json={"enabled": "yes"}).status_code == 422
        assert api_client.patch("/api/admin/model-debug", json={"enabled": False}).json() == {"enabled": False}


def test_migration_upgrade_repeat_and_downgrade(tmp_path):
    root = Path(__file__).resolve().parents[1]
    engine = create_database_engine(f"sqlite:///{(tmp_path / 'migration.db').as_posix()}")
    config = Config(str(root / "alembic.ini"))
    config.set_main_option("script_location", str(root / "alembic"))
    config.config_file_name = None
    try:
        with engine.begin() as connection:
            config.attributes["connection"] = connection
            command.upgrade(config, "head")
            command.upgrade(config, "head")
        with Session(engine) as db:
            db.add(User(id="maxim", email="suezergut@gmail.com", role="admin"))
            db.commit()
            DebugModeService(db, "maxim").change(True)
        with engine.begin() as connection:
            config.attributes["connection"] = connection
            command.downgrade(config, "f53c9d123e44")
            from sqlalchemy import inspect
            assert "audio_payload" not in {column["name"] for column in inspect(connection).get_columns("model_debug_logs")}
            command.upgrade(config, "head")
            command.downgrade(config, "f42b8c012d33")
        with Session(engine) as db:
            assert db.get(User, "maxim") is not None
    finally:
        engine.dispose()


def test_api_context_captures_only_debug_administrator_and_disable_clears(api_client, db_session):
    from app.main import app
    from app.api.dependencies import get_current_user
    from app.services.transcription_adapter import get_transcription_provider
    from tests.test_transcriptions_api import _create_exercise
    user = db_session.scalar(select(User))
    user.email, user.role = "suezergut@gmail.com", "admin"
    db_session.commit()
    api_client.patch("/api/admin/model-debug", json={"enabled": True})
    exercise = _create_exercise(api_client)
    provider = OpenAITranscriptionProvider(Settings(openai_api_key="private", openai_transcribe_model="env-stt"))
    provider._client = SimpleNamespace(audio=SimpleNamespace(transcriptions=SimpleNamespace(create=Mock(return_value=SimpleNamespace(text="Želim kafu.")))))
    app.dependency_overrides[get_transcription_provider] = lambda: provider
    response = api_client.post("/api/transcriptions", data={"exercise_id": exercise}, files={"audio": ("speech.webm", b"synthetic", "audio/webm")})
    assert response.status_code == 200
    assert len(list(db_session.scalars(select(ModelDebugLog)))) == 1
    row = db_session.scalar(select(ModelDebugLog))
    download = api_client.get(f"/api/admin/model-debug/logs/{row.id}/audio")
    assert download.status_code == 200 and download.content == b"synthetic"
    assert download.headers["cache-control"] == "no-store"
    assert debug_context.get() is None
    other = User(id="other", email="other@example.com", role="user")
    db_session.add(other)
    db_session.commit()
    app.dependency_overrides[get_current_user] = lambda: other
    assert api_client.get(f"/api/admin/model-debug/logs/{row.id}/audio").status_code == 403
    other_exercise = _create_exercise(api_client)
    response = api_client.post("/api/transcriptions", data={"exercise_id": other_exercise}, files={"audio": ("speech.webm", b"synthetic", "audio/webm")})
    assert response.status_code == 200
    assert len(list(db_session.scalars(select(ModelDebugLog)))) == 1
    app.dependency_overrides[get_current_user] = lambda: user
    assert api_client.patch("/api/admin/model-debug", json={"enabled": False}).status_code == 200
    assert list(db_session.scalars(select(ModelDebugLog))) == []
    assert api_client.get(f"/api/admin/model-debug/logs/{row.id}/audio").status_code == 404


def test_no_auth_cannot_read_or_change_mode(api_client):
    from app.main import app
    from app.api.dependencies import get_current_user
    app.dependency_overrides.pop(get_current_user)
    assert api_client.get("/api/admin/model-debug").status_code == 401
    assert api_client.patch("/api/admin/model-debug", json={"enabled": True}).status_code == 401
    assert api_client.get("/api/admin/model-debug/logs/example/audio").status_code == 401


def test_repeated_enable_is_idempotent_for_inflight_call(debug_engine):
    mode(debug_engine, True)
    token = debug_context.set(DebugContext("maxim", debug_engine))
    try:
        with capture_model_call("pending", "env-model", {"input": "current"}) as capture:
            mode(debug_engine, True)
            capture.received(SimpleNamespace(text="received"))
        assert len(logs(debug_engine)) == 1
    finally:
        debug_context.reset(token)


def test_audio_retention_expiry_and_owner_scope(debug_engine):
    from datetime import datetime, timedelta, timezone
    from sqlalchemy import update
    mode(debug_engine, True)
    token = debug_context.set(DebugContext("maxim", debug_engine))
    try:
        for number in range(22):
            with capture_model_call("audio.transcriptions", "env-model", {}) as capture:
                capture.attach_audio(bytes([number]), "audio/webm")
        with Session(debug_engine) as db:
            rows = list(db.scalars(select(ModelDebugLog).order_by(ModelDebugLog.started_at)))
            assert sum(row.audio_payload is not None for row in rows) == 20
            assert rows[0].audio_payload is None
            latest_id = rows[-1].id
            assert DebugModeService(db, "another-owner").audio(latest_id) is None
            assert DebugModeService(db, "maxim").audio(latest_id) == (bytes([21]), "audio/webm")
            db.execute(update(ModelDebugLog).where(ModelDebugLog.id == latest_id).values(
                audio_expires_at=datetime.now(timezone.utc) - timedelta(seconds=1)))
            db.commit()
            assert DebugModeService(db, "maxim").audio(latest_id) is None
            db.expire_all()
            assert db.get(ModelDebugLog, latest_id).audio_payload is None
        mode(debug_engine, False)
        assert logs(debug_engine) == []
    finally:
        debug_context.reset(token)


@pytest.mark.parametrize("enabled,payload,kind", [(False, b"x", "audio/webm"),
    (True, b"", "audio/webm"), (True, b"x" * 1_000_001, "audio/webm"), (True, b"x", "text/html")],
    ids=["disabled", "empty", "oversized", "unsupported"])
def test_audio_capture_rejects_disabled_empty_oversized_or_unsupported(debug_engine, enabled, payload, kind):
    mode(debug_engine, enabled)
    token = debug_context.set(DebugContext("maxim", debug_engine))
    try:
        with capture_model_call("audio.transcriptions", "env-model", {}) as capture:
            capture.attach_audio(payload, kind)
        with Session(debug_engine) as db:
            assert all(row.audio_payload is None for row in db.scalars(select(ModelDebugLog)))
    finally:
        debug_context.reset(token)


def test_error_body_redacted_and_training_rollback_does_not_erase_log(debug_engine):
    import httpx
    from openai import APIStatusError
    mode(debug_engine, True)
    token = debug_context.set(DebugContext("maxim", debug_engine))
    try:
        failure = APIStatusError("do not record headers", response=httpx.Response(500, request=httpx.Request("POST", "https://example.invalid")),
                                 body={"error": "server-key failure", "input_audio": "private audio", "api_key": "server-key"})
        with pytest.raises(APIStatusError):
            with capture_model_call("error", "env-model", {"input": "request"}, "server-key"):
                raise failure
        with Session(debug_engine) as training:
            training.rollback()
        row = logs(debug_engine)[0]
        assert row.error_json["status_code"] == 500
        assert row.error_json["body"] == {"error": "[REDACTED] failure", "input_audio": "[REDACTED]", "api_key": "[REDACTED]"}
    finally:
        debug_context.reset(token)


@pytest.mark.parametrize("invalid", [False, True])
def test_real_sdk_mock_http_captures_raw_body_before_validation(debug_engine, invalid):
    import httpx
    from openai import OpenAI
    from app.services.ai_adapter import AIServiceError
    mode(debug_engine, True)
    topic = TopicContext(id="cafe", source="custom", title_ru="Кафе", description_ru="Заказ кофе", normalized_prompt_context="Order coffee")
    text = "invalid json" if invalid else topic.model_dump_json()
    body = {"id": "resp-test", "object": "response", "created_at": 1, "status": "completed", "model": "env-text",
            "output": [{"id": "msg-test", "type": "message", "status": "completed", "role": "assistant",
                        "content": [{"type": "output_text", "text": text, "annotations": []}]}]}
    provider = OpenAIStructuredProvider(Settings(openai_api_key="server-key", openai_text_model="env-text"))
    provider._client = OpenAI(api_key="server-key", max_retries=0, http_client=httpx.Client(transport=httpx.MockTransport(
        lambda request: httpx.Response(200, json=body))))
    token = debug_context.set(DebugContext("maxim", debug_engine))
    try:
        if invalid:
            with pytest.raises(AIServiceError):
                provider.normalize_topic("Кофе")
        else:
            assert provider.normalize_topic("Кофе") == topic
        row = logs(debug_engine)[0]
        assert row.response_json["body"] == body
        assert row.request_json["text"]["format"]["strict"] is True
        assert "server-key" not in json.dumps(row.request_json)
        assert row.error_json is not None if invalid else row.error_json is None
    finally:
        debug_context.reset(token)
        provider._client.close()
