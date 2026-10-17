from sqlalchemy.orm import Session

from app.config import Settings
from app.models import User, UserFeedback
from app.repositories.feedback import FeedbackRepository
from app.schemas.feedback import FeedbackRequest, FeedbackResponse, FeedbackTranscript
from app.services.notifications import notify_after_commit
from app.services.transcription_adapter import OpenAITranscriptionProvider, TranscriptionServiceError
from app.services.transcription_service import ALLOWED_AUDIO_TYPES


class FeedbackService:
    def __init__(self, db: Session, settings: Settings) -> None:
        self.db = db
        self.settings = settings
        self.feedback = FeedbackRepository(db)

    def create(self, user: User, payload: FeedbackRequest) -> FeedbackResponse:
        entry = self.feedback.add(UserFeedback(user_id=user.id, content=payload.content))
        result = FeedbackResponse(id=entry.id, created_at=entry.created_at)
        notify_after_commit(self.db, self.settings, user.email, "оставил обратную связь в SerboTalk")
        self.db.commit()
        return result


def transcribe_feedback(provider: OpenAITranscriptionProvider, audio: bytes, content_type: str) -> FeedbackTranscript:
    extension = ALLOWED_AUDIO_TYPES.get(content_type)
    if extension is None or not audio:
        raise ValueError("Unsupported or empty audio")
    if not provider.is_available:
        raise TranscriptionServiceError("transcription_not_configured")
    return provider.transcribe_feedback(audio=audio, filename=f"feedback{extension}", content_type=content_type)
