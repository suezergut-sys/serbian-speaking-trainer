from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.config import Settings
from app.db.session import create_database_engine
from app.main import app
from app.schemas import TopicContext
from app.services.ai_adapter import AIServiceError, OpenAIStructuredProvider, get_ai_provider
from app.request_metrics import start_request_metrics, stop_request_metrics
from app.services.transcription_adapter import OpenAITranscriptionProvider, TranscriptionServiceError


def test_server_timing_counts_sql_only_within_its_request(api_client: TestClient) -> None:
    topics = api_client.get("/api/topics")
    assert topics.status_code == 200
    timing = topics.headers["Server-Timing"]
    assert "total;dur=" in timing
    assert "db;dur=" in timing
    assert "db_queries;desc=\"" in timing
    assert "ai;dur=0.0" in timing
    assert "ai_calls;desc=\"0\"" in timing
    assert "db_queries;desc=\"0\"" not in timing

    health = api_client.get("/api/health")
    assert health.status_code == 200
    assert "db_queries;desc=\"0\"" in health.headers["Server-Timing"]
    assert "ai_calls;desc=\"0\"" in health.headers["Server-Timing"]


def test_sql_error_is_counted_and_timed() -> None:
    engine = create_database_engine("sqlite+pysqlite:///:memory:")
    metrics, token = start_request_metrics()
    try:
        with engine.connect() as connection:
            with pytest.raises(Exception):
                connection.execute(text("SELECT * FROM missing_metrics_table"))
        assert metrics.db_queries == 1
        assert metrics.db_ms >= 0
    finally:
        stop_request_metrics(token)
        engine.dispose()


def test_mocked_text_sdk_call_appears_in_server_timing(api_client: TestClient) -> None:
    provider = OpenAIStructuredProvider(Settings(openai_api_key="server-secret", openai_text_model="env-model"))
    provider._client = SimpleNamespace(responses=SimpleNamespace(parse=lambda **_kwargs: SimpleNamespace(
        output_parsed=TopicContext(
            id="mock-topic", source="custom", title_ru="Mock title",
            description_ru="Mock description", normalized_prompt_context="Mock context",
        )
    )))
    app.dependency_overrides[get_ai_provider] = lambda: provider

    response = api_client.post("/api/topics/normalize", json={"text": "Проверка задержки"})

    assert response.status_code == 200
    assert "ai_calls;desc=\"1\"" in response.headers["Server-Timing"]
    assert "ai;dur=" in response.headers["Server-Timing"]
    assert "server-secret" not in response.headers["Server-Timing"]
    assert "Проверка задержки" not in response.headers["Server-Timing"]


def test_failed_mocked_sdk_calls_still_count_without_exposing_input() -> None:
    def fail(**_kwargs):
        raise RuntimeError("mocked external failure")

    text_provider = OpenAIStructuredProvider(Settings(openai_api_key="server-secret", openai_text_model="env-model"))
    text_provider._client = SimpleNamespace(responses=SimpleNamespace(parse=fail))
    transcription_provider = OpenAITranscriptionProvider(Settings(
        openai_api_key="server-secret", openai_transcribe_model="env-model",
    ))
    transcription_provider._client = SimpleNamespace(audio=SimpleNamespace(
        transcriptions=SimpleNamespace(create=fail),
    ))

    metrics, token = start_request_metrics()
    try:
        with pytest.raises(AIServiceError, match="OpenAI request failed"):
            text_provider.normalize_topic("test input")
        with pytest.raises(TranscriptionServiceError, match="OpenAI transcription request failed"):
            transcription_provider.transcribe(audio=b"", filename="mock.webm", content_type="audio/webm")
        assert metrics.ai_calls == 2
        assert metrics.ai_ms >= 0
    finally:
        stop_request_metrics(token)
