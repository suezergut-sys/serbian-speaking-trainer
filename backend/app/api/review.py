from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas import (
    CreateReviewPhraseRequest,
    LearningWordResponse,
    PreparedReviewPhraseResponse,
    PrepareReviewPhraseRequest,
    ReviewPhraseResponse,
    WordHintResponse,
)
from app.services.ai_adapter import StructuredAIProvider, get_ai_provider
from app.services.review_service import (
    PhrasePreparationUnavailableError,
    ReviewPhraseNotFoundError,
    ReviewService,
    WordHintNotFoundError,
)

router = APIRouter(tags=["review"])


class RevealWordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    word: str = Field(min_length=1, max_length=120)


@router.get("/review-phrases", response_model=list[ReviewPhraseResponse])
def list_review_phrases(
    db: Session = Depends(get_db),
    ai: StructuredAIProvider = Depends(get_ai_provider),
) -> list[ReviewPhraseResponse]:
    return ReviewService(db, ai).list_phrases()


@router.post("/review-phrases", response_model=ReviewPhraseResponse, status_code=status.HTTP_201_CREATED)
def create_review_phrase(
    request: CreateReviewPhraseRequest,
    db: Session = Depends(get_db),
    ai: StructuredAIProvider = Depends(get_ai_provider),
) -> ReviewPhraseResponse:
    try:
        return ReviewService(db, ai).create_phrase(request)
    except ReviewPhraseNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Topic not found") from exc


@router.post("/review-phrases/prepare", response_model=PreparedReviewPhraseResponse)
def prepare_review_phrase(
    request: PrepareReviewPhraseRequest,
    db: Session = Depends(get_db),
    ai: StructuredAIProvider = Depends(get_ai_provider),
) -> PreparedReviewPhraseResponse:
    try:
        return ReviewService(db, ai).prepare_phrase(request)
    except PhrasePreparationUnavailableError as exc:
        raise HTTPException(status_code=503, detail="Canonical translation is unavailable") from exc


@router.post("/exercises/{exercise_id}/word-hints", response_model=WordHintResponse)
def reveal_word_hint(
    exercise_id: str,
    request: RevealWordRequest,
    db: Session = Depends(get_db),
    ai: StructuredAIProvider = Depends(get_ai_provider),
) -> WordHintResponse:
    try:
        return ReviewService(db, ai).reveal_word(exercise_id, request.word)
    except WordHintNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Word hint not found") from exc


@router.get("/learning-words", response_model=list[LearningWordResponse])
def list_learning_words(
    db: Session = Depends(get_db),
    ai: StructuredAIProvider = Depends(get_ai_provider),
) -> list[LearningWordResponse]:
    return ReviewService(db, ai).list_words()
