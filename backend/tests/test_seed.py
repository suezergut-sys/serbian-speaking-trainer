import re

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.seed import SKILLS, TOPICS, seed_catalog
from app.db.topic_phrases import TOPIC_PHRASES
from app.db.topic_phrase_hints import TOPIC_PHRASE_HINTS
from app.models import Exercise, Skill, TopicPhrase, TopicPreset, TrainingSession
from app.schemas import WordHint


def test_seed_is_complete_and_idempotent(db_session: Session) -> None:
    assert 40 <= len(SKILLS) <= 60
    assert len(TOPICS) == 9
    assert len(TOPIC_PHRASES) == 160
    assert len(TOPIC_PHRASE_HINTS) == 160
    assert all(TOPIC_PHRASE_HINTS[item.id] for item in TOPIC_PHRASES)
    allowed_omitted_words = {"я", "мне", "вы", "в"}
    for item in TOPIC_PHRASES:
        source_words = {word.casefold() for word in re.findall(r"[А-Яа-яЁё]+", item.source_ru)}
        hinted_words = {
            word.casefold()
            for hint in TOPIC_PHRASE_HINTS[item.id]
            for word in re.findall(r"[А-Яа-яЁё]+", hint["word_ru"])
        }
        assert source_words <= hinted_words
        assert all(hint["translation_sr"] != "перевод требует OpenAI" for hint in TOPIC_PHRASE_HINTS[item.id])
        assert all(not re.search(r"[А-Яа-яЁё]", WordHint.model_validate(hint).translation_sr) for hint in TOPIC_PHRASE_HINTS[item.id])
        canonical_tokens = set(re.findall(r"[a-zčćžšđ]+", item.canonical_sr.casefold()))
        for hint in TOPIC_PHRASE_HINTS[item.id]:
            hint_tokens = set(re.findall(r"[a-zčćžšđ]+", hint["translation_sr"].casefold()))
            hint_source_words = {word.casefold() for word in re.findall(r"[А-Яа-яЁё]+", hint["word_ru"])}
            assert hint_tokens <= canonical_tokens or hint_source_words <= allowed_omitted_words
    assert all(
        len([item for item in TOPIC_PHRASES if item.topic_id == topic["id"]]) == 20
        for topic in TOPICS
        if topic["id"] != "misc"
    )
    assert not [item for item in TOPIC_PHRASES if item.topic_id == "misc"]

    assert seed_catalog(db_session) == (50, 9, 160)
    assert seed_catalog(db_session) == (0, 0, 0)
    assert db_session.scalar(select(func.count()).select_from(Skill)) == 50
    assert db_session.scalar(select(func.count()).select_from(TopicPreset)) == 9
    assert db_session.scalar(select(func.count()).select_from(TopicPhrase)) == 160
    rent_phrase = db_session.get(TopicPhrase, "rent-01")
    assert rent_phrase is not None
    assert {hint["word_ru"]: hint["translation_sr"] for hint in rent_phrase.word_hints_json}["светлую"] == "svetao"

    training = TrainingSession(normalized_topic_json={})
    db_session.add(training)
    db_session.flush()
    exercise = Exercise(
        session_id=training.id,
        source_ru=rent_phrase.source_ru,
        target_hints_json={"word_hints": [{"word_ru": "светлую", "translation_sr": "перевод требует OpenAI"}]},
        generation_meta_json={"topic_phrase_id": "rent-01"},
    )
    db_session.add(exercise)
    db_session.flush()

    assert seed_catalog(db_session) == (0, 0, 0)
    assert {hint["word_ru"]: hint["translation_sr"] for hint in exercise.target_hints_json["word_hints"]}["светлую"] == "svetao"
