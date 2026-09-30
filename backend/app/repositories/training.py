from datetime import datetime

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.models import Attempt, AttemptRequest, ErrorEvent, Exercise, ReviewPhrase, TrainingSession, WordLearningItem
from app.repositories.base import Repository

DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000001"


class TrainingSessionRepository(Repository[TrainingSession]):
    def __init__(self, session: Session, user_id: str = DEFAULT_USER_ID) -> None:
        super().__init__(session, TrainingSession)
        self.user_id = user_id

    def get_owned(self, session_id: str) -> TrainingSession | None:
        return self.session.scalar(select(TrainingSession).where(
            TrainingSession.id == session_id, TrainingSession.user_id == self.user_id,
        ))

    def get_owned_for_update(self, session_id: str) -> TrainingSession | None:
        if self.session.get_bind().dialect.name == "sqlite":
            # Serialize next-exercise against completion; SQLite ignores FOR UPDATE.
            self.session.execute(update(TrainingSession).where(
                TrainingSession.id == session_id, TrainingSession.user_id == self.user_id,
            ).values(id=TrainingSession.id))
        return self.session.scalar(select(TrainingSession).where(
            TrainingSession.id == session_id, TrainingSession.user_id == self.user_id,
        ).with_for_update())


class ExerciseRepository(Repository[Exercise]):
    def __init__(self, session: Session, user_id: str = DEFAULT_USER_ID) -> None:
        super().__init__(session, Exercise)
        self.user_id = user_id

    def get_owned(self, exercise_id: str) -> Exercise | None:
        return self.session.scalar(
            select(Exercise)
            .join(TrainingSession, TrainingSession.id == Exercise.session_id)
            .where(Exercise.id == exercise_id, TrainingSession.user_id == self.user_id)
        )

    def list_recent(self, session_id: str, *, limit: int = 8) -> list[Exercise]:
        statement = (
            select(Exercise)
            .where(Exercise.session_id == session_id)
            .order_by(Exercise.created_at.desc(), Exercise.id.desc())
            .limit(limit)
        )
        return list(self.session.scalars(statement))

    def get_by_client_id(self, session_id: str, client_request_id: str) -> Exercise | None:
        return self.session.scalar(
            select(Exercise)
            .where(Exercise.session_id == session_id, Exercise.client_request_id == client_request_id)
        )


class AttemptRepository(Repository[Attempt]):
    def __init__(self, session: Session, user_id: str = DEFAULT_USER_ID) -> None:
        super().__init__(session, Attempt)
        self.user_id = user_id

    def list_created_between(self, start: datetime, end: datetime) -> list[Attempt]:
        statement = (
            select(Attempt)
            .join(Exercise, Exercise.id == Attempt.exercise_id)
            .join(TrainingSession, TrainingSession.id == Exercise.session_id)
            .where(
                TrainingSession.user_id == self.user_id,
                Attempt.created_at >= start,
                Attempt.created_at < end,
            )
            .order_by(Attempt.created_at)
        )
        return list(self.session.scalars(statement))

    def count_checked_exercises(self, session_id: str) -> int:
        statement = (
            select(func.count(func.distinct(Attempt.exercise_id)))
            .join(Exercise, Exercise.id == Attempt.exercise_id)
            .where(Exercise.session_id == session_id)
        )
        return int(self.session.scalar(statement) or 0)


class AttemptRequestRepository(Repository[AttemptRequest]):
    def __init__(self, session: Session, user_id: str = DEFAULT_USER_ID) -> None:
        super().__init__(session, AttemptRequest)
        self.user_id = user_id

    def get_by_client_id(self, client_request_id: str) -> AttemptRequest | None:
        return self.session.get(AttemptRequest, (self.user_id, client_request_id))


class ErrorEventRepository(Repository[ErrorEvent]):
    def __init__(self, session: Session) -> None:
        super().__init__(session, ErrorEvent)


class ReviewPhraseRepository(Repository[ReviewPhrase]):
    def __init__(self, session: Session, user_id: str = DEFAULT_USER_ID) -> None:
        super().__init__(session, ReviewPhrase)
        self.user_id = user_id

    def get_owned(self, phrase_id: str) -> ReviewPhrase | None:
        return self.session.scalar(select(ReviewPhrase).where(
            ReviewPhrase.id == phrase_id, ReviewPhrase.user_id == self.user_id,
        ))

    def find_by_source(self, source_normalized: str) -> ReviewPhrase | None:
        return self.session.scalar(select(ReviewPhrase).where(
            ReviewPhrase.user_id == self.user_id,
            ReviewPhrase.source_normalized == source_normalized,
        ))

    def list_active(self, *, limit: int | None = None) -> list[ReviewPhrase]:
        statement = (
            select(ReviewPhrase)
            .where(ReviewPhrase.user_id == self.user_id, ReviewPhrase.status == "active")
            .order_by(ReviewPhrase.updated_at.desc(), ReviewPhrase.id.desc())
        )
        if limit is not None:
            statement = statement.limit(limit)
        return list(self.session.scalars(statement))

    def list_active_for_topic(self, topic_id: str, *, limit: int | None = None) -> list[ReviewPhrase]:
        statement = (
            select(ReviewPhrase)
            .where(
                ReviewPhrase.user_id == self.user_id,
                ReviewPhrase.status == "active",
                ReviewPhrase.topic_id == topic_id,
            )
            .order_by(ReviewPhrase.updated_at.desc(), ReviewPhrase.id.desc())
        )
        if limit is not None:
            statement = statement.limit(limit)
        return list(self.session.scalars(statement))

    def activate_due(self, now: datetime) -> list[ReviewPhrase]:
        statement = select(ReviewPhrase).where(
            ReviewPhrase.user_id == self.user_id,
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
        return int(self.session.scalar(
            select(func.count()).select_from(ReviewPhrase).where(ReviewPhrase.user_id == self.user_id)
        ) or 0)

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
            .where(ReviewPhrase.user_id == self.user_id)
            .order_by(topic_title, ReviewPhrase.created_at, ReviewPhrase.id)
            .offset(offset)
        )
        if limit is not None:
            statement = statement.limit(limit)
        return [(row[0], str(row[1])) for row in self.session.execute(statement).all()]

    def list_mastered_between(self, start: datetime, end: datetime) -> list[ReviewPhrase]:
        statement = (
            select(ReviewPhrase)
            .where(
                ReviewPhrase.user_id == self.user_id,
                ReviewPhrase.mastered_at >= start,
                ReviewPhrase.mastered_at < end,
            )
            .order_by(ReviewPhrase.mastered_at)
        )
        return list(self.session.scalars(statement))


class WordLearningRepository(Repository[WordLearningItem]):
    def __init__(self, session: Session, user_id: str = DEFAULT_USER_ID) -> None:
        super().__init__(session, WordLearningItem)
        self.user_id = user_id

    def find_by_source(self, source_normalized: str) -> WordLearningItem | None:
        return self.session.scalar(
            select(WordLearningItem).where(
                WordLearningItem.user_id == self.user_id,
                WordLearningItem.source_normalized == source_normalized,
            )
        )

    def list_learning(self, *, limit: int = 200) -> list[WordLearningItem]:
        statement = (
            select(WordLearningItem)
            .where(WordLearningItem.user_id == self.user_id, WordLearningItem.status == "learning")
            .order_by(WordLearningItem.last_seen_at.desc(), WordLearningItem.id.desc())
            .limit(limit)
        )
        return list(self.session.scalars(statement))
