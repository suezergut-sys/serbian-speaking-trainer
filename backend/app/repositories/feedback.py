from sqlalchemy.orm import Session

from app.models import UserFeedback
from app.repositories.base import Repository


class FeedbackRepository(Repository[UserFeedback]):
    def __init__(self, session: Session) -> None:
        super().__init__(session, UserFeedback)
