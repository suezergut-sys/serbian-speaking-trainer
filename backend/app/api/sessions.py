from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas import CreateSessionRequest, ExerciseResponse, SessionResponse
from app.services.ai_adapter import StructuredAIProvider, get_ai_provider
from app.services.exercise_generator import ExerciseGenerator
from app.services.review_service import ReviewQueueEmptyError
from app.services.session_service import SessionNotFoundError, SessionService
from app.services.topic_service import TopicNotFoundError
from app.api.dependencies import get_current_user
from app.models import User

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
def create_session(
    request: CreateSessionRequest,
    db: Session = Depends(get_db),
    ai: StructuredAIProvider = Depends(get_ai_provider),
    user: User = Depends(get_current_user),
) -> SessionResponse:
    try:
        return SessionService(db, ai, user.id).create(request)
    except TopicNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Topic not found") from exc
    except ReviewQueueEmptyError as exc:
        raise HTTPException(status_code=409, detail="Review queue is empty") from exc


@router.get("/{session_id}", response_model=SessionResponse)
def get_session(
    session_id: str,
    db: Session = Depends(get_db),
    ai: StructuredAIProvider = Depends(get_ai_provider),
    user: User = Depends(get_current_user),
) -> SessionResponse:
    try:
        return SessionService(db, ai, user.id).get(session_id)
    except SessionNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Session not found") from exc


@router.post("/{session_id}/next-exercise", response_model=ExerciseResponse, status_code=status.HTTP_201_CREATED)
def next_exercise(
    session_id: str,
    db: Session = Depends(get_db),
    ai: StructuredAIProvider = Depends(get_ai_provider),
    user: User = Depends(get_current_user),
) -> ExerciseResponse:
    try:
        return ExerciseGenerator(db, ai, user.id).generate_next(session_id)
    except SessionNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Session not found") from exc
    except ReviewQueueEmptyError as exc:
        raise HTTPException(status_code=409, detail="Review queue is empty") from exc
