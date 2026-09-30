from datetime import datetime

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.models import Attempt, Exercise, TrainingSession, User
from app.repositories.base import Repository


class UserRepository(Repository[User]):
    def __init__(self, session: Session) -> None:
        super().__init__(session, User)

    def get_by_email(self, email: str) -> User | None:
        return self.session.scalar(select(User).where(func.lower(User.email) == email.casefold()))

    def lock(self, user_id: str) -> User | None:
        if self.session.get_bind().dialect.name == "sqlite":
            # SQLite ignores FOR UPDATE. Acquire its writer lock before reading
            # quota/session boundaries, including requests from legacy clients.
            self.session.execute(update(User).where(User.id == user_id).values(id=User.id))
        return self.session.scalar(select(User).where(User.id == user_id).with_for_update().execution_options(populate_existing=True))

    def list_real_users(self) -> list[User]:
        statement = (
            select(User)
            .where(User.email != "legacy@local.invalid")
            .order_by(User.registered_at.desc(), User.id.desc())
        )
        return list(self.session.scalars(statement))

    def count_attempts_between(self, user_id: str, start: datetime, end: datetime) -> int:
        statement = (
            select(func.count())
            .select_from(Attempt)
            .join(Exercise, Exercise.id == Attempt.exercise_id)
            .join(TrainingSession, TrainingSession.id == Exercise.session_id)
            .where(
                TrainingSession.user_id == user_id,
                Attempt.created_at >= start,
                Attempt.created_at < end,
            )
        )
        return int(self.session.scalar(statement) or 0)
