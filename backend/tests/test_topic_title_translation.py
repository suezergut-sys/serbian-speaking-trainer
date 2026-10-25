from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from sqlalchemy import select

from app.main import app
from app.models import TopicPreset, User, ReviewPhrase
from app.api.dependencies import get_current_user
from app.services.ai_adapter import AIServiceError, OpenAIStructuredProvider, get_ai_provider
from app.services.interface_language import interface_language
from app.config import Settings
from app.schemas.topics import TopicTitleTranslation
from tests.fakes import FakeAIProvider


@pytest.mark.parametrize(("source", "language", "translation", "ru", "en"), [
    ("  Моя   работа ", "ru", "My work", "Моя работа", "My work"),
    ("My work", "en", "Моя работа", "Моя работа", "My work"),
])
def test_titles_are_persisted_original_preserved_and_duplicate_skips_ai(api_client, db_session, source, language, translation, ru, en):
    ai = FakeAIProvider()
    ai.translate_topic_title = Mock(return_value=TopicTitleTranslation(source_language=language, translated_title=translation))
    app.dependency_overrides[get_ai_provider] = lambda: ai
    result = api_client.post("/api/topics", json={"title_ru": source}, headers={"X-Interface-Language": "en"}).json()
    assert result["title_ru"] == ru and result["title_en"] == en
    stored = db_session.get(TopicPreset, result["id"])
    assert (stored.title_ru, stored.title_en) == (ru, en)
    assert api_client.post("/api/topics", json={"title_ru": source}).json()["id"] == result["id"]
    assert ai.translate_topic_title.call_count == 1
    assert next(row for row in api_client.get("/api/topics").json() if row["id"] == result["id"])["title_en"] == en
    session = api_client.post("/api/sessions", json={"topic_id": result["id"]}).json()
    assert session["topic"]["title_en"] == en
    # Statistics transports both titles even after reload and language changes.
    db_session.add(ReviewPhrase(user_id=stored.owner_user_id, topic_id=stored.id, source_ru="Фраза", source_normalized="фраза", intended_sr_variants_json=["Fraza."], status="active"))
    db_session.flush()
    from app.services.statistics_service import StatisticsService
    stats = StatisticsService(db_session, stored.owner_user_id)
    assert stats.phrase_topics()[0].topic_title_en == en
    assert stats.phrases(page=1, page_size="20").groups[0].topic_title_en == en
    other = User(id="other-title-owner", email="other@example.invalid", role="user", access_tier="premium")
    db_session.add(other)
    db_session.flush()
    app.dependency_overrides[get_current_user] = lambda: other
    assert result["id"] not in {row["id"] for row in api_client.get("/api/topics").json()}


@pytest.mark.parametrize("value", [{"source_language": "ru", "translated_title": " "}, {"source_language": "sr", "translated_title": "Hello"}, {"source_language": "en", "translated_title": "x" * 161}, {}])
def test_invalid_translation_is_safe_and_does_not_create_topic(api_client, db_session, value):
    ai = FakeAIProvider()
    ai.translate_topic_title = Mock(return_value=value)
    app.dependency_overrides[get_ai_provider] = lambda: ai
    result = api_client.post("/api/topics", json={"title_ru": "Новая тема"})
    assert result.status_code == 503
    assert result.json() == {"detail": {"code": "topic_translation_unavailable"}}
    assert not list(db_session.scalars(select(TopicPreset).where(TopicPreset.is_custom.is_(True))))


def test_network_translation_failure_does_not_create_topic_and_retry_works(api_client):
    ai = FakeAIProvider()
    ai.translate_topic_title = Mock(side_effect=[AIServiceError("private upstream details"), TopicTitleTranslation(source_language="ru", translated_title="New topic")])
    app.dependency_overrides[get_ai_provider] = lambda: ai
    body = {"title_ru": "Новая тема"}
    assert api_client.post("/api/topics", json=body).json() == {"detail": {"code": "topic_translation_unavailable"}}
    assert api_client.post("/api/topics", json=body).json()["title_en"] == "New topic"


def test_title_adapter_uses_validated_structured_output_and_env_model():
    provider = OpenAIStructuredProvider(Settings(_env_file=None, openai_api_key="synthetic", openai_text_model="env-model", openai_timeout_seconds=2, openai_max_retries=0))
    parse = Mock(return_value=SimpleNamespace(output_parsed={"source_language": "ru", "translated_title": "My work"}))
    provider._client = SimpleNamespace(responses=SimpleNamespace(parse=parse))
    token = interface_language.set("en")
    try:
        assert provider.translate_topic_title("Моя работа").translated_title == "My work"
    finally:
        interface_language.reset(token)
    assert parse.call_args.kwargs["model"] == "env-model"
    assert parse.call_args.kwargs["text_format"] is TopicTitleTranslation
    assert parse.call_args.kwargs["store"] is False
    assert '"interface_language": "en"' in parse.call_args.kwargs["input"]
