from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas import AttemptResponse, CreateAttemptRequest
from app.services.ai_adapter import StructuredAIProvider, get_ai_provider
from app.services.attempt_service import AttemptService, ExerciseNotFoundError

router = APIRouter(prefix="/attempts", tags=["attempts"])


@router.post("", response_model=AttemptResponse, status_code=status.HTTP_201_CREATED)
def create_attempt(
    request: CreateAttemptRequest,
    db: Session = Depends(get_db),
    ai: StructuredAIProvider = Depends(get_ai_provider),
) -> AttemptResponse:
    try:
        return AttemptService(db, ai).create(request)
    except ExerciseNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Exercise not found") from exc
