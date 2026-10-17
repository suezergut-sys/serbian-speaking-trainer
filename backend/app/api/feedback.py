from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.config import Settings, get_settings
from app.db import get_db
from app.models import User
from app.schemas.feedback import FeedbackRequest, FeedbackResponse, FeedbackTranscript
from app.services.feedback import FeedbackService, transcribe_feedback
from app.services.transcription_adapter import OpenAITranscriptionProvider, TranscriptionServiceError, get_transcription_provider

router = APIRouter(prefix="/feedback", tags=["feedback"])


@router.post("", response_model=FeedbackResponse, status_code=201)
def create_feedback(payload: FeedbackRequest, user: User = Depends(get_current_user),
                    db: Session = Depends(get_db), settings: Settings = Depends(get_settings)) -> FeedbackResponse:
    return FeedbackService(db, settings).create(user, payload)


@router.post("/transcribe", response_model=FeedbackTranscript)
def transcribe(audio: UploadFile = File(), _user: User = Depends(get_current_user),
               settings: Settings = Depends(get_settings),
               provider: OpenAITranscriptionProvider = Depends(get_transcription_provider)) -> FeedbackTranscript:
    try:
        payload = audio.file.read(settings.max_audio_bytes + 1)
        if len(payload) > settings.max_audio_bytes:
            raise HTTPException(413, "Audio is too large")
        try:
            return transcribe_feedback(provider, payload, (audio.content_type or "").split(";", 1)[0].lower())
        except ValueError:
            raise HTTPException(415, "Unsupported or empty audio") from None
        except TranscriptionServiceError:
            raise HTTPException(503, "Feedback transcription unavailable") from None
    finally:
        audio.file.close()
