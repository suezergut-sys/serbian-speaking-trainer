import re

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.seed import SKILLS, TOPICS, seed_catalog
from app.db.topic_phrases import TOPIC_PHRASES
from app.db.topic_phrase_hints import TOPIC_PHRASE_HINTS
from app.models import Exercise, Skill, TopicPhrase, TopicPreset, TrainingSession
from app.schemas import WordHint
from app.services.hint_alignment import aligned_word_hints


def test_seed_is_complete_and_idempotent(db_session: Session) -> None:
    assert 40 <= len(SKILLS) <= 60
    assert len(TOPICS) == 9
    assert len(TOPIC_PHRASES) == 210
    assert len(TOPIC_PHRASE_HINTS) == 210
    assert all(TOPIC_PHRASE_HINTS[item.id] for item in TOPIC_PHRASES)
    for item in TOPIC_PHRASES:
        assert aligned_word_hints(item.source_ru, item.canonical_sr, TOPIC_PHRASE_HINTS[item.id]) == TOPIC_PHRASE_HINTS[item.id]
        assert all(hint["translation_sr"] != "перевод требует OpenAI" for hint in TOPIC_PHRASE_HINTS[item.id])
        assert all(not re.search(r"[А-Яа-яЁё]", WordHint.model_validate(hint).translation_sr) for hint in TOPIC_PHRASE_HINTS[item.id])
        canonical_tokens = set(re.findall(r"[a-zčćžšđ]+", item.canonical_sr.casefold()))
        for hint in TOPIC_PHRASE_HINTS[item.id]:
            hint_tokens = set(re.findall(r"[a-zčćžšđ]+", hint["translation_sr"].casefold()))
            assert hint_tokens <= canonical_tokens
    assert all(
        len([item for item in TOPIC_PHRASES if item.topic_id == topic["id"]]) == 20
        for topic in TOPICS
        if topic["id"] != "misc"
    )
    assert len([item for item in TOPIC_PHRASES if item.topic_id == "misc"]) == 50

    assert seed_catalog(db_session) == (50, 9, 210)
    assert seed_catalog(db_session) == (0, 0, 0)
    assert db_session.scalar(select(func.count()).select_from(Skill)) == 50
    assert db_session.scalar(select(func.count()).select_from(TopicPreset)) == 9
    assert db_session.scalar(select(func.count()).select_from(TopicPhrase)) == 210
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
