from unittest.mock import Mock

import pytest

from app.services.hint_alignment import aligned_word_hints


def hint(source, target):
    return {"word_ru": source, "translation_sr": target}


@pytest.mark.parametrize("canonical", ["Nemam s kim da pričam.", "Немам с ким да причам."])
def test_short_nonliteral_fragment_replaces_literal_words(canonical):
    assert aligned_word_hints("Мне не с кем поговорить.", canonical, [
        hint("мне", "mi"), hint("мне не с кем", "nemam s kim"),
        hint("не", "ne"), hint("с", "s"), hint("кем", "kim"), hint("поговорить", "da pričam"),
    ]) == [hint("мне не с кем", "nemam s kim"), hint("поговорить", "da pričam")]


def test_complete_words_and_diacritics_and_source_boundaries():
    assert aligned_word_hints("Мне пора идти.", "Nemam vremena.", [hint("мне", "mi")]) == []
    assert aligned_word_hints("Куда идти?", "Kući.", [hint("идти", "kuci")]) == []
    assert aligned_word_hints("Где, у вас?", "Gde imate?", [hint("где у вас", "Gde imate")]) == []
    assert aligned_word_hints("Когда?", "Kad?", [hint("где", "Kad"), hint("?", "?")]) == []


def test_conflicting_repeated_keys_are_not_guessed_and_long_hints_are_withheld():
    assert aligned_word_hints("В Сербию в конце года.", "U Srbiju krajem godine.", [
        hint("в", "u"), hint("в", "krajem"), hint("в Сербию", "U Srbiju"), hint("в конце", "krajem"),
    ]) == [hint("в сербию", "U Srbiju"), hint("в конце", "krajem")]
    assert aligned_word_hints("Мне не с кем сейчас поговорить.", "Nemam s kim sada da pričam.", [
        hint("мне не с кем сейчас", "Nemam s kim sada da pričam"),
        hint("мне не с кем сейчас поговорить", "Nemam s kim"),
    ]) == []


def test_custom_fragment_api_and_one_penalty_without_ai(api_client, db_session):
    from app.models import Exercise, WordLearningItem
    from sqlalchemy import select
    started = api_client.post("/api/sessions/start", json={"topic_id": "bank", "length": 10}).json()
    exercise = db_session.get(Exercise, started["exercise"]["id"])
    exercise.source_ru = "Мне не с кем поговорить."
    exercise.target_hints_json = {"canonical_sr": "Nemam s kim da pričam.",
        "intended_sr_variants": ["Nemam s kim da pričam."], "word_hints": [
            hint("мне не с кем", "nemam s kim"), hint("мне", "mi"), hint("поговорить", "da pričam")]}
    exercise.generation_meta_json = {**exercise.generation_meta_json, "targeted_skill_keys": []}
    db_session.commit()
    url = f"/api/exercises/{exercise.id}/word-hints"
    # Legacy APKs submit individual words; return the construction, never mi.
    legacy = api_client.post(url, json={"word": "мне"})
    assert legacy.status_code == 200
    assert legacy.json()["word_ru"] == "мне не с кем"
    assert legacy.json()["translation_sr"] == "nemam s kim"
    for _ in range(2):
        opened = api_client.post(url, json={"word": "мне не с кем"})
        assert opened.status_code == 200
        assert opened.json()["translation_sr"] == "nemam s kim"
    result = api_client.post("/api/attempts", json={"exercise_id": exercise.id,
        "transcript_sr": "Nemam s kim da pričam.", "hinted_words": ["мне не с кем", "мне не с кем", "мне", "кем"]})
    assert result.status_code == 201, result.text
    assert result.json()["hint_penalty"] == .08
    assert [w.source_ru for w in db_session.scalars(select(WordLearningItem))] == ["мне не с кем"]


def test_legacy_word_requests_never_guess_between_two_fragments():
    from app.services.word_hints import resolve_hint
    hints = [hint("в конце", "krajem"), hint("в Сербию", "u Srbiju")]
    assert resolve_hint(hints, "в") is None
    assert resolve_hint(hints, "в конце") == hints[0]


def test_personal_canonical_never_borrows_preset_english_hints():
    from app.db.topic_phrases import TOPIC_PHRASES
    from app.services.interface_language import interface_language
    from app.services.word_hints import word_hints_for_language, preset_english_source
    phrase = TOPIC_PHRASES[0]
    token = interface_language.set("en")
    try:
        assert preset_english_source(phrase.source_ru, phrase.canonical_sr) is not None
        assert preset_english_source(phrase.source_ru, "Drugačiji prevod.") is None
        assert word_hints_for_language(phrase.source_ru, [], "Drugačiji prevod.") == []
    finally:
        interface_language.reset(token)


def test_new_preparation_prompt_filters_noncanonical_model_hints_and_preserves_canonical():
    from types import SimpleNamespace
    from app.config import Settings
    from app.schemas.exercises import PhrasePreparation
    from app.services.ai_adapter import OpenAIStructuredProvider, AIServiceError
    provider = OpenAIStructuredProvider(Settings(openai_api_key="mock", openai_text_model="from-env"))
    parse = Mock(return_value=SimpleNamespace(output_parsed=PhrasePreparation(
        intended_sr_variants=["Nemam s kim da pričam."], word_hints=[
            hint("мне", "mi"), hint("мне не с кем", "nemam s kim"), hint("поговорить", "da pričam")])))
    provider._client = SimpleNamespace(responses=SimpleNamespace(parse=parse))
    result = provider.prepare_phrase(source_ru="Мне не с кем поговорить.", canonical_sr="Nemam s kim da pričam.")
    assert [h.word_ru for h in result.word_hints] == ["мне не с кем", "поговорить"]
    assert "максимум 4" in parse.call_args.kwargs["instructions"]
    assert parse.call_args.kwargs["model"] == "from-env"
    with pytest.raises(AIServiceError):
        provider.prepare_phrase(source_ru="Мне не с кем поговорить.", canonical_sr="Nemam s kim da razgovaram.")
