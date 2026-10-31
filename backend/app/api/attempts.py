from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas import AttemptResponse, CreateAttemptRequest
from app.services.ai_adapter import StructuredAIProvider, get_ai_provider
from app.services.attempt_service import AttemptInProgressError, AttemptRequestConflictError, AttemptService, ExerciseNotFoundError
from app.services.attempt_service import DailyLimitExceededError
from app.services.attempt_service import InvalidTranscriptionReceiptError, UnexpectedTranscriptScriptError
from app.services.answer_analyzer import AnalysisUnavailableError
from app.services.session_service import SessionCompletedError, SessionUnavailableError
from app.api.dependencies import get_current_user
from app.models import User
from app.services.failure_diagnostics import record_failure

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
    except UnexpectedTranscriptScriptError as exc:
        raise HTTPException(status_code=422, detail={"code": "transcript_unexpected_script"}) from exc
    except InvalidTranscriptionReceiptError as exc:
        raise HTTPException(status_code=422, detail="Invalid transcription assistance receipt") from exc
    except DailyLimitExceededError as exc:
        raise HTTPException(status_code=429, detail="Daily phrase limit reached") from exc
    except AttemptInProgressError as exc:
        raise HTTPException(status_code=409, headers={"Retry-After": "1"}, detail={
            "code": "attempt_in_progress", "message": "Answer analysis is in progress. Please retry.",
            "retryable": True,
        }) from exc
    except AttemptRequestConflictError as exc:
        raise HTTPException(status_code=409, detail={"code": "attempt_request_conflict", "message": "Request ID was already used for another answer"}) from exc
    except SessionCompletedError as exc:
        raise HTTPException(status_code=409, detail={"code": "session_completed", "message": "Session is complete"}) from exc
    except SessionUnavailableError as exc:
        raise HTTPException(status_code=409, detail={"code": "session_unavailable", "message": "Session is unavailable"}) from exc
    except AnalysisUnavailableError as exc:
        db.rollback()
        record_failure(exc.failure)
        raise HTTPException(status_code=503, detail={
            "code": "analysis_unavailable",
            "message": "Answer analysis is temporarily unavailable. Please retry.",
            "retryable": exc.failure.retryable,
            "failure": exc.failure.model_dump(mode="json"),
        }) from exc
