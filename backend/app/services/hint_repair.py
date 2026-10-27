"""Explicit, transaction-scoped maintenance of hints; never changes answers/progress."""
from copy import deepcopy

from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.db.topic_phrases import TOPIC_PHRASES
from app.db.topic_phrase_hints import TOPIC_PHRASE_HINTS
from app.models import Exercise, ReviewPhrase, TopicPhrase, TrainingSession
from app.schemas.exercises import WordHint
from app.services.hint_alignment import aligned_word_hints


class HintRepair(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source: str
    canonical: str
    hints: list[WordHint]


def repair_hint_snapshots(db: Session, personal: dict[str, HintRepair], *, apply: bool = False) -> list[dict]:
    """Return a minimal rollback journal. Caller writes it privately before commit.

    Personal repairs are scoped by reviewed phrase ID AND exact source/canonical.
    Copies with another canonical are withheld for separate review. No calls to AI.
    A dry run never assigns model attributes. The caller owns commit/rollback.
    """
    presets = {p.id: HintRepair(source=p.source_ru, canonical=p.canonical_sr,
                               hints=TOPIC_PHRASE_HINTS[p.id]) for p in TOPIC_PHRASES}
    for repair in [*presets.values(), *personal.values()]:
        hints = [h.model_dump() for h in repair.hints]
        if not hints or aligned_word_hints(repair.source, repair.canonical, hints) != hints:
            raise ValueError("Repair contains unaligned hints")
    changes: list[dict] = []

    def assign(row, column, after):
        before = deepcopy(getattr(row, column))
        if before == after:
            return
        changes.append({"table": row.__tablename__, "id": row.id, "column": column,
                        "before": before, "after": after})
        if apply:
            setattr(row, column, after)
            if isinstance(row, ReviewPhrase):
                # Hint maintenance must not look like a new learning event.
                flag_modified(row, "updated_at")

    def matching(repair, source, canonical):
        return repair is not None and repair.source == source and repair.canonical == canonical

    def rows(model):
        statement = select(model)
        return db.scalars(statement.with_for_update() if apply else statement)

    for row in rows(TopicPhrase):
        repair = presets.get(row.id)
        if matching(repair, row.source_ru, row.canonical_sr):
            assign(row, "word_hints_json", [h.model_dump() for h in repair.hints])
    for row in rows(ReviewPhrase):
        repair = presets.get(row.topic_phrase_id) if row.topic_phrase_id else personal.get(row.id)
        if matching(repair, row.source_ru, next(iter(row.intended_sr_variants_json), "")):
            assign(row, "word_hints_json", [h.model_dump() for h in repair.hints])
    for row in rows(Exercise):
        meta, target = row.generation_meta_json, row.target_hints_json
        repair = presets.get(meta.get("topic_phrase_id")) or personal.get(meta.get("review_phrase_id"))
        canonical = target.get("canonical_sr") or next(iter(target.get("intended_sr_variants", [])), "")
        if matching(repair, row.source_ru, canonical):
            assign(row, "target_hints_json", {**target, "word_hints": [h.model_dump() for h in repair.hints]})
    for row in rows(TrainingSession):
        payload = row.normalized_topic_json.get("review_phrase")
        if not isinstance(payload, dict):
            continue
        repair = presets.get(payload.get("topic_phrase_id")) or personal.get(payload.get("id"))
        if matching(repair, payload.get("source_ru"), next(iter(payload.get("intended_sr_variants", [])), "")):
            assign(row, "normalized_topic_json", {**row.normalized_topic_json,
                "review_phrase": {**payload, "word_hints": [h.model_dump() for h in repair.hints]}})
    return changes
