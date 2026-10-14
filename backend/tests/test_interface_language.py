import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from app.config import Settings
from app.schemas import AnswerAnalysis, CreateAttemptRequest, PhrasePreparation
from app.db.topic_phrases import TOPIC_PHRASES
from app.db.topic_phrase_hints import TOPIC_PHRASE_HINTS
from app.services.ai_adapter import OpenAIStructuredProvider, get_ai_provider
from app.services.interface_language import interface_language, parse_interface_language
from app.main import app
from tests.fakes import FakeAIProvider
from app.services.answer_analyzer import AnswerAnalyzer


@pytest.mark.parametrize("header,expected", [
    ("", "ru"), ("ru", "ru"), ("en", "en"), ("en-GB,en;q=0.9", "en"),
    ("EN-us", "en"), ("ru,en;q=0.8", "ru"), ("invalid", "ru"),
])
def test_language_header_is_bounded_and_defaults_to_russian(header, expected):
    assert parse_interface_language(header) == expected


def test_request_language_does_not_leak_to_old_clients(api_client):
    languages = []
    provider = FakeAIProvider(available=True, phrase_result=PhrasePreparation(
        intended_sr_variants=["Treba mi karta."],
        word_hints=[{"word_ru": "ticket", "translation_sr": "karta"}],
    ))
    original = provider.prepare_phrase

    def prepare_phrase(**kwargs):
        languages.append(interface_language.get())
        return original(**kwargs)

    provider.prepare_phrase = prepare_phrase
    app.dependency_overrides[get_ai_provider] = lambda: provider
    for headers in ({"X-Interface-Language": "en"}, {}, {"X-Interface-Language": "ru"}, {"Accept-Language": "en"}):
        response = api_client.post("/api/review-phrases/prepare", json={"source_ru": "I need a ticket."}, headers=headers)
        assert response.status_code == 200
        assert response.json()["source_ru"] == "I need a ticket."
    assert languages == ["en", "ru", "ru", "ru"]
    assert interface_language.get() == "ru"


def test_english_analysis_uses_versioned_instructions_and_the_same_validated_schema():
    result = AnswerAnalysis(
        verdict="correct", semantic_score=1, grammar_score=1, lexical_score=1,
        naturalness_score=1, fluency_score=1, corrected_sr="Želim kartu.",
        short_feedback_ru="Correct.", detailed_feedback_ru="Your answer is correct.",
    )
    provider = OpenAIStructuredProvider(Settings(openai_api_key="synthetic", openai_text_model="from-env"))
    parse = Mock(return_value=SimpleNamespace(output_parsed=result.model_dump()))
    provider._client = SimpleNamespace(responses=SimpleNamespace(parse=parse))
    token = interface_language.set("en")
    try:
        response = provider.analyze_answer(source_ru="Я хочу билет.", transcript_sr="Želim kartu.",
            canonical_sr="Želim kartu.", intended_sr_variants=["Želim kartu."], target_skills=[], timings={})
        assert response.corrected_sr == "Želim kartu."
        assert "Write all user-facing explanations in English" in parse.call_args.kwargs["instructions"]
        assert parse.call_args.kwargs["model"] == "from-env"
        assert parse.call_args.kwargs["store"] is False
    finally:
        interface_language.reset(token)


def test_catalog_has_the_same_canonical_phrases_and_exact_hint_aliases():
    path = Path(__file__).resolve().parents[2] / "frontend/src/locales/phrases.en.json"
    catalog = {item["id"]: item for item in json.loads(path.read_text(encoding="utf-8"))}
    assert set(catalog) == {item.id for item in TOPIC_PHRASES}
    for seed in TOPIC_PHRASES:
        item = catalog[seed.id]
        assert item["source_ru"] == seed.source_ru
        assert item["canonical_sr"] == seed.canonical_sr
        assert item["source_en"]
        assert all(hint in TOPIC_PHRASE_HINTS[seed.id] for hint in item["word_hints"].values())


def test_english_exact_match_keeps_the_canonical_score_without_ai():
    token = interface_language.set("en")
    try:
        result = AnswerAnalyzer(FakeAIProvider()).analyze(source_ru="Я хочу билет.",
            transcript_sr="Želim kartu.", canonical_sr="Želim kartu.", intended_sr_variants=["Želim kartu."],
            target_skills=[], timing=CreateAttemptRequest(exercise_id="00000000-0000-0000-0000-000000000001", transcript_sr="Želim kartu."))
        assert result.semantic_score == 1
        assert result.corrected_sr == "Želim kartu."
        assert result.short_feedback_ru.startswith("Your answer")
    finally:
        interface_language.reset(token)
