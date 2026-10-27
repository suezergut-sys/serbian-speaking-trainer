from copy import deepcopy

from sqlalchemy import inspect

from app.models import Exercise, ReviewPhrase, TrainingSession
from app.services.hint_repair import HintRepair, repair_hint_snapshots
from app.db.seed import seed_catalog


def snapshot(row):
    return {col.key: deepcopy(getattr(row, col.key)) for col in inspect(row).mapper.column_attrs}


def test_repair_is_scoped_dry_by_default_and_idempotent_preserving_history(db_session):
    seed_catalog(db_session)
    before = [{"word_ru": "мне", "translation_sr": "mi"}]
    canonical = "Nemam s kim da pričam."
    phrase = ReviewPhrase(source_ru="Мне не с кем поговорить.", source_normalized="test-fragment",
        intended_sr_variants_json=[canonical], word_hints_json=before,
        attempts=7, best_score=.91, perfect_streak=2, learning_errors=3, interval_days=5)
    other = ReviewPhrase(source_ru="Мне не с кем поговорить.", source_normalized="test-other",
        intended_sr_variants_json=["Nemam s kim da razgovaram."], word_hints_json=before)
    db_session.add_all([phrase, other]); db_session.flush()
    payload = {"id": phrase.id, "source_ru": phrase.source_ru, "intended_sr_variants": [canonical], "word_hints": before}
    session = TrainingSession(normalized_topic_json={"review_phrase": payload, "other": "preserved"})
    db_session.add(session); db_session.flush()
    exercise = Exercise(session_id=session.id, source_ru=phrase.source_ru,
        target_hints_json={"canonical_sr": canonical, "word_hints": before},
        generation_meta_json={"review_phrase_id": phrase.id, "revealed_hint_words": ["мне"]})
    db_session.add(exercise); db_session.commit()
    original = snapshot(phrase)
    repair = HintRepair(source=phrase.source_ru, canonical=canonical, hints=[
        {"word_ru":"мне не с кем", "translation_sr":"nemam s kim"},
        {"word_ru":"поговорить", "translation_sr":"da pričam"}])
    expected = [h.model_dump() for h in repair.hints]
    dry = repair_hint_snapshots(db_session, {phrase.id: repair})
    assert len(dry) == 3
    assert snapshot(phrase) == original
    changes = repair_hint_snapshots(db_session, {phrase.id: repair}, apply=True)
    assert changes == dry
    db_session.commit()
    assert phrase.word_hints_json == expected
    assert snapshot(phrase) == {**original, "word_hints_json": expected}
    assert other.word_hints_json == before
    assert exercise.target_hints_json == {"canonical_sr": canonical, "word_hints": expected}
    assert exercise.generation_meta_json["revealed_hint_words"] == ["мне"]
    assert session.normalized_topic_json == {"review_phrase": {**payload, "word_hints": expected}, "other":"preserved"}
    assert repair_hint_snapshots(db_session, {phrase.id: repair}, apply=True) == []


def test_repair_refuses_unaligned_manifest(db_session):
    import pytest
    repair = HintRepair(source="Мне не с кем поговорить.", canonical="Nemam s kim da pričam.",
                        hints=[{"word_ru":"мне", "translation_sr":"mi"}])
    with pytest.raises(ValueError, match="unaligned"):
        repair_hint_snapshots(db_session, {"reviewed-id":repair}, apply=True)
