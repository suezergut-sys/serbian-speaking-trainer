from datetime import datetime

from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from app.models import Exercise, PhrasePreparationReceipt, ReviewPhrase, TopicPreset, TrainingSession


class CustomContentRepository:
    def __init__(self, db: Session, user_id: str) -> None:
        self.db = db
        self.user_id = user_id

    def topic_count(self) -> int:
        return int(self.db.scalar(select(func.count()).select_from(TopicPreset).where(
            TopicPreset.owner_user_id == self.user_id, TopicPreset.is_custom.is_(True),
        )) or 0)

    def phrases(self, topic_id: str | None = None) -> list[ReviewPhrase]:
        query = select(ReviewPhrase).where(
            ReviewPhrase.user_id == self.user_id, ReviewPhrase.topic_phrase_id.is_(None),
        )
        if topic_id is not None:
            query = query.where(ReviewPhrase.topic_id == topic_id)
        return list(self.db.scalars(query.order_by(ReviewPhrase.created_at, ReviewPhrase.id)))

    def phrase_counts(self) -> dict[str, int]:
        return {str(topic_id): int(count) for topic_id, count in self.db.execute(
            select(ReviewPhrase.topic_id, func.count()).where(
                ReviewPhrase.user_id == self.user_id, ReviewPhrase.topic_phrase_id.is_(None),
            ).group_by(ReviewPhrase.topic_id)
        )}

    def phrase_count(self, topic_id: str | None = None) -> int:
        query = select(func.count()).select_from(ReviewPhrase).where(
            ReviewPhrase.user_id == self.user_id, ReviewPhrase.topic_phrase_id.is_(None),
        )
        if topic_id is not None:
            query = query.where(ReviewPhrase.topic_id == topic_id)
        return int(self.db.scalar(query) or 0)

    def receipt(self, receipt_id: str) -> PhrasePreparationReceipt | None:
        return self.db.scalar(select(PhrasePreparationReceipt).where(
            PhrasePreparationReceipt.id == receipt_id, PhrasePreparationReceipt.user_id == self.user_id,
        ))

    def add_receipt(self, receipt: PhrasePreparationReceipt, now: datetime) -> None:
        self.db.execute(delete(PhrasePreparationReceipt).where(
            PhrasePreparationReceipt.user_id == self.user_id, PhrasePreparationReceipt.expires_at <= now,
        ).execution_options(synchronize_session=False))
        self.db.add(receipt)
        self.db.flush()

    def invalidate_training(self, phrase_ids: set[str], topic_id: str | None = None) -> None:
        # Keep attempts/statistics, but prevent snapshots or in-flight answers from
        # recreating a deleted card. Lock in the same user -> session order as attempts.
        affected_sessions = [TrainingSession.normalized_topic_json["review_phrase"]["id"].as_string().in_(phrase_ids)]
        if topic_id is not None:
            affected_sessions.append(TrainingSession.topic_id == topic_id)
        sessions = self.db.scalars(select(TrainingSession).where(
            TrainingSession.user_id == self.user_id, or_(*affected_sessions),
        ).order_by(TrainingSession.id).with_for_update().execution_options(populate_existing=True))
        for session in sessions:
            single = session.normalized_topic_json.get("review_phrase") or {}
            if (topic_id is not None and session.topic_id == topic_id) or single.get("id") in phrase_ids:
                session.status = "unavailable"
        exercises = self.db.scalars(select(Exercise).join(TrainingSession).where(
            TrainingSession.user_id == self.user_id,
            Exercise.generation_meta_json["review_phrase_id"].as_string().in_(phrase_ids),
        ).execution_options(populate_existing=True))
        for exercise in exercises:
            if exercise.generation_meta_json.get("review_phrase_id") in phrase_ids:
                exercise.generation_meta_json = {**exercise.generation_meta_json, "custom_content_deleted": True}
        self.db.flush()

    def delete_topic(self, topic: TopicPreset) -> None:
        phrases = list(self.db.scalars(select(ReviewPhrase).where(
            ReviewPhrase.user_id == self.user_id, ReviewPhrase.topic_id == topic.id,
        )))
        self.invalidate_training({phrase.id for phrase in phrases}, topic.id)
        for phrase in phrases:
            self.db.delete(phrase)
        self.db.flush()
        self.db.delete(topic)
        self.db.flush()
