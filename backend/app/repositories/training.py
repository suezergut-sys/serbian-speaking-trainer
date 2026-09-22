from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Attempt, ErrorEvent, Exercise, ReviewPhrase, TrainingSession, WordLearningItem
from app.repositories.base import Repository


class TrainingSessionRepository(Repository[TrainingSession]):
    def __init__(self, session: Session) -> None:
        super().__init__(session, TrainingSession)


class ExerciseRepository(Repository[Exercise]):
    def __init__(self, session: Session) -> None:
        super().__init__(session, Exercise)

    def list_recent(self, session_id: str, *, limit: int = 8) -> list[Exercise]:
        statement = (
            select(Exercise)
            .where(Exercise.session_id == session_id)
            .order_by(Exercise.created_at.desc(), Exercise.id.desc())
            .limit(limit)
        )
        return list(self.session.scalars(statement))


class AttemptRepository(Repository[Attempt]):
    def __init__(self, session: Session) -> None:
        super().__init__(session, Attempt)

    def list_created_between(self, start: datetime, end: datetime) -> list[Attempt]:
        statement = (
            select(Attempt)
            .where(Attempt.created_at >= start, Attempt.created_at < end)
            .order_by(Attempt.created_at)
        )
        return list(self.session.scalars(statement))


class ErrorEventRepository(Repository[ErrorEvent]):
    def __init__(self, session: Session) -> None:
        super().__init__(session, ErrorEvent)


class ReviewPhraseRepository(Repository[ReviewPhrase]):
    def __init__(self, session: Session) -> None:
        super().__init__(session, ReviewPhrase)

    def find_by_source(self, source_normalized: str) -> ReviewPhrase | None:
        return self.session.scalar(select(ReviewPhrase).where(ReviewPhrase.source_normalized == source_normalized))

    def list_active(self, *, limit: int = 100) -> list[ReviewPhrase]:
        statement = (
            select(ReviewPhrase)
            .where(ReviewPhrase.status == "active")
            .order_by(ReviewPhrase.updated_at.desc(), ReviewPhrase.id.desc())
            .limit(limit)
        )
        return list(self.session.scalars(statement))

    def list_active_for_topic(self, topic_id: str, *, limit: int = 100) -> list[ReviewPhrase]:
        statement = (
            select(ReviewPhrase)
            .where(ReviewPhrase.status == "active", ReviewPhrase.topic_id == topic_id)
            .order_by(ReviewPhrase.updated_at.desc(), ReviewPhrase.id.desc())
            .limit(limit)
        )
        return list(self.session.scalars(statement))

    def activate_due(self, now: datetime) -> list[ReviewPhrase]:
        statement = select(ReviewPhrase).where(
            ReviewPhrase.status == "mastered",
            ReviewPhrase.next_review_at.is_not(None),
            ReviewPhrase.next_review_at <= now,
        )
        due = list(self.session.scalars(statement))
        for phrase in due:
            phrase.status = "active"
            phrase.perfect_streak = 0
            phrase.learning_errors = 0
            phrase.next_review_at = None
            phrase.updated_at = now
        if due:
            self.session.flush()
        return due

    def count_for_statistics(self) -> int:
        return int(self.session.scalar(select(func.count()).select_from(ReviewPhrase)) or 0)

    def list_for_statistics(
        self,
        *,
        limit: int | None,
        offset: int,
    ) -> list[tuple[ReviewPhrase, str]]:
        from app.models import TopicPreset

        topic_title = func.coalesce(TopicPreset.title_ru, "Свои фразы")
        statement = (
            select(ReviewPhrase, topic_title)
            .outerjoin(TopicPreset, TopicPreset.id == ReviewPhrase.topic_id)
            .order_by(topic_title, ReviewPhrase.created_at, ReviewPhrase.id)
            .offset(offset)
        )
        if limit is not None:
            statement = statement.limit(limit)
        return [(row[0], str(row[1])) for row in self.session.execute(statement).all()]

    def list_mastered_between(self, start: datetime, end: datetime) -> list[ReviewPhrase]:
        statement = (
            select(ReviewPhrase)
            .where(ReviewPhrase.mastered_at >= start, ReviewPhrase.mastered_at < end)
            .order_by(ReviewPhrase.mastered_at)
        )
        return list(self.session.scalars(statement))


class WordLearningRepository(Repository[WordLearningItem]):
    def __init__(self, session: Session) -> None:
        super().__init__(session, WordLearningItem)

    def find_by_source(self, source_normalized: str) -> WordLearningItem | None:
        return self.session.scalar(
            select(WordLearningItem).where(WordLearningItem.source_normalized == source_normalized)
        )

    def list_learning(self, *, limit: int = 200) -> list[WordLearningItem]:
        statement = (
            select(WordLearningItem)
            .where(WordLearningItem.status == "learning")
            .order_by(WordLearningItem.last_seen_at.desc(), WordLearningItem.id.desc())
            .limit(limit)
        )
        return list(self.session.scalars(statement))
