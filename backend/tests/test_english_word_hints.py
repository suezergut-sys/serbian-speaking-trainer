import re

from sqlalchemy import select

from app.db.topic_phrase_hints import TOPIC_PHRASE_HINTS
from app.db.topic_phrase_hints_en import ENGLISH_WORD_HINTS
from app.db.topic_phrases import TOPIC_PHRASES
from app.models import Exercise, WordLearningItem
from app.services.interface_language import interface_language
from app.services.word_hints import word_hints_for_language
from app.services.hint_alignment import aligned_word_hints
from app.db.topic_phrases_en import TOPIC_PHRASES_EN


def _exercise(api_client, db_session, phrase_id, *, missing_stored_hints=False):
    response = api_client.post("/api/sessions/start", json={"topic_id": "bank", "length": 10})
    assert response.status_code == 201
    exercise = db_session.get(Exercise, response.json()["exercise"]["id"])
    phrase = next(item for item in TOPIC_PHRASES if item.id == phrase_id)
    exercise.source_ru = phrase.source_ru
    exercise.intended_sr_variants_json = [phrase.canonical_sr]
    exercise.target_hints_json = {"canonical_sr": phrase.canonical_sr,
        "word_hints": [] if missing_stored_hints else TOPIC_PHRASE_HINTS[phrase_id]}
    exercise.generation_meta_json = {**exercise.generation_meta_json, "targeted_skill_keys": []}
    db_session.commit()
    return exercise, phrase


def test_all_english_catalog_hints_are_short_canonical_fragments_without_forced_coverage():
    assert len(ENGLISH_WORD_HINTS) == 210
    for phrase in TOPIC_PHRASES:
        source = TOPIC_PHRASES_EN[phrase.source_ru]
        hints = [{"word_ru": k, "translation_sr": v} for k,v in ENGLISH_WORD_HINTS[source].items()]
        assert hints
        assert aligned_word_hints(source, phrase.canonical_sr, hints) == hints


def test_english_hints_are_not_derived_from_stored_russian_hints():
    token = interface_language.set("en")
    try:
        hints = word_hints_for_language("Когда лучше покупать дешёвые авиабилеты?", [])
        by_word = {hint["word_ru"]: hint["translation_sr"] for hint in hints}
        assert by_word["best"] == "najbolje"
        assert by_word["to buy"] == "kupiti"
        assert "time" not in by_word
        assert "the" not in by_word
        assert word_hints_for_language("My own English text.", [{"word_ru": "own", "translation_sr": "sopstveni"}]) == [{"word_ru": "own", "translation_sr": "sopstveni"}]
    finally:
        interface_language.reset(token)
    assert word_hints_for_language("Когда лучше покупать дешёвые авиабилеты?", []) == []


def test_english_exercise_response_has_english_keys_without_changing_stored_dictionary(api_client, db_session):
    response = api_client.post("/api/sessions/start", json={"topic_id": "bank", "length": 10}, headers={"X-Interface-Language": "en"})
    assert response.status_code == 201
    data = response.json()["exercise"]
    assert all(not re.search("[А-Яа-я]", hint["word_ru"]) for hint in data["word_hints"])
    stored = db_session.get(Exercise, data["id"]).target_hints_json["word_hints"]
    assert any(re.search("[А-Яа-я]", hint["word_ru"]) for hint in stored)


def test_review_exercise_with_old_empty_hints_saves_english_words_and_charges_them(api_client, db_session):
    exercise, phrase = _exercise(api_client, db_session, "vacation-10", missing_stored_hints=True)
    headers = {"X-Interface-Language": "en"}
    for word in ["best", "cheap", "to buy", "to buy"]:
        response = api_client.post(f"/api/exercises/{exercise.id}/word-hints", json={"word": word}, headers=headers)
        assert response.status_code == 200
        assert response.json()["word_ru"] == word
    assert api_client.post(f"/api/exercises/{exercise.id}/word-hints", json={"word": "unknown"}, headers=headers).status_code == 404
    result = api_client.post("/api/attempts", json={"exercise_id": exercise.id,
        "transcript_sr": phrase.canonical_sr, "hinted_words": ["best", "cheap", "to buy", "to buy", "unknown"]}, headers=headers)
    assert result.status_code == 201, result.text
    assert result.json()["hint_penalty"] == 0.24
    assert result.json()["overall_score"] == 0.76
    words = db_session.scalars(select(WordLearningItem)).all()
    assert {word.source_ru for word in words} == {"best", "cheap", "to buy"}
    assert all(word.hint_count == 1 for word in words)


def test_language_switch_keeps_each_dictionary_identity_and_old_client_compatibility(api_client, db_session):
    exercise, phrase = _exercise(api_client, db_session, "bank-01")
    for word, headers in [("want", {"X-Interface-Language": "en"}), ("хочу", {}), ("хочу", {"X-Interface-Language": "en"})]:
        response = api_client.post(f"/api/exercises/{exercise.id}/word-hints", json={"word": word}, headers=headers)
        assert response.status_code == 200
        assert response.json()["word_ru"].lower() == word
    result = api_client.post("/api/attempts", json={"exercise_id": exercise.id,
        "transcript_sr": phrase.canonical_sr, "hinted_words": ["want", "хочу"]})
    assert result.status_code == 201, result.text
    assert result.json()["hint_penalty"] == 0.16
    assert {word.source_ru.lower() for word in db_session.scalars(select(WordLearningItem))} == {"want", "хочу"}



def test_possessive_word_is_saved_as_one_english_hint(api_client, db_session):
    exercise, phrase = _exercise(api_client, db_session, "bank-07")
    headers = {"X-Interface-Language": "en"}
    response = api_client.post(f"/api/exercises/{exercise.id}/word-hints", json={"word": "bank's"}, headers=headers)
    assert response.status_code == 200
    assert response.json()["word_ru"] == "bank's"
    assert response.json()["translation_sr"] == "banke"
    result = api_client.post("/api/attempts", json={"exercise_id": exercise.id,
        "transcript_sr": phrase.canonical_sr, "hinted_words": ["bank's", "bank's"]}, headers=headers)
    assert result.status_code == 201
    assert result.json()["hint_penalty"] == 0.08
    words = db_session.scalars(select(WordLearningItem)).all()
    assert [word.source_ru for word in words] == ["bank's"]
