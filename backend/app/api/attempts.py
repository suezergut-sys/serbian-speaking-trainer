from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas import AttemptResponse, CreateAttemptRequest
from app.services.ai_adapter import StructuredAIProvider, get_ai_provider
from app.services.attempt_service import AttemptService, ExerciseNotFoundError
from app.services.attempt_service import DailyLimitExceededError
from app.api.dependencies import get_current_user
from app.models import User

router = APIRouter(prefix="/attempts", tags=["attempts"])


@router.post("", response_model=AttemptResponse, status_code=status.HTTP_201_CREATED)
def create_attempt(
    request: CreateAttemptRequest,
    db: Session = Depends(get_db),
    ai: StructuredAIProvider = Depends(get_ai_provider),
    user: User = Depends(get_current_user),
) -> AttemptResponse:
    try:
        return AttemptService(db, ai, user).create(request)
    except ExerciseNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Exercise not found") from exc
    except DailyLimitExceededError as exc:
        raise HTTPException(status_code=429, detail="Daily phrase limit reached") from exc
