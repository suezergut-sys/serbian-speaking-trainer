from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db
from app.schemas import TranscriptionResponse
from app.services.transcription_adapter import (
    TranscriptionProvider,
    TranscriptionServiceError,
    get_transcription_provider,
)
from app.services.transcription_service import (
    AudioTooLargeError,
    EmptyAudioError,
    TranscriptionExerciseNotFoundError,
    TranscriptionService,
    UnsupportedAudioTypeError,
)
from app.api.dependencies import get_current_user
from app.models import User

router = APIRouter(prefix="/transcriptions", tags=["transcriptions"])


@router.post("", response_model=TranscriptionResponse)
def create_transcription(
    exercise_id: Annotated[str, Form(min_length=1, max_length=36)],
    audio: Annotated[UploadFile, File()],
    db: Session = Depends(get_db),
    provider: TranscriptionProvider = Depends(get_transcription_provider),
    settings: Settings = Depends(get_settings),
    user: User = Depends(get_current_user),
) -> TranscriptionResponse:
    try:
        return TranscriptionService(db, provider, settings, user.id).transcribe(exercise_id=exercise_id, audio=audio)
    except TranscriptionExerciseNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Exercise not found") from exc
    except (UnsupportedAudioTypeError, EmptyAudioError) as exc:
        raise HTTPException(status_code=415, detail="Unsupported or empty audio") from exc
    except AudioTooLargeError as exc:
        raise HTTPException(status_code=413, detail="Audio is too large") from exc
    except TranscriptionServiceError as exc:
        raise HTTPException(status_code=503, detail="Voice transcription is temporarily unavailable") from exc
