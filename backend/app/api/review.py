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
    ReviewPhraseSummaryResponse,
    WordHintResponse,
)
from app.services.ai_adapter import StructuredAIProvider, get_ai_provider
from app.services.review_service import (
    PhrasePreparationUnavailableError,
    ReviewPhraseNotFoundError,
    ReviewService,
    WordHintNotFoundError,
)
from app.api.dependencies import get_current_user
from app.models import User

router = APIRouter(tags=["review"])


@router.get("/custom-phrases", response_model=list[ReviewPhraseResponse])
def list_custom_phrases(
    db: Session = Depends(get_db),
    ai: StructuredAIProvider = Depends(get_ai_provider),
    user: User = Depends(get_current_user),
) -> list[ReviewPhraseResponse]:
    return ReviewService(db, ai, user.id).list_custom_phrases()


@router.delete("/custom-phrases/{phrase_id}", status_code=204)
def delete_custom_phrase(
    phrase_id: str,
    db: Session = Depends(get_db),
    ai: StructuredAIProvider = Depends(get_ai_provider),
    user: User = Depends(get_current_user),
) -> None:
    try:
        ReviewService(db, ai, user.id).delete_custom_phrase(phrase_id)
    except ReviewPhraseNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Phrase not found") from exc


class RevealWordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    word: str = Field(min_length=1, max_length=120)


@router.get("/review-phrases", response_model=list[ReviewPhraseResponse])
def list_review_phrases(
    db: Session = Depends(get_db),
    ai: StructuredAIProvider = Depends(get_ai_provider),
    user: User = Depends(get_current_user),
) -> list[ReviewPhraseResponse]:
    return ReviewService(db, ai, user.id).list_phrases()


@router.get("/review-phrases/summary", response_model=ReviewPhraseSummaryResponse)
def review_phrase_summary(
    db: Session = Depends(get_db),
    ai: StructuredAIProvider = Depends(get_ai_provider),
    user: User = Depends(get_current_user),
) -> ReviewPhraseSummaryResponse:
    return ReviewService(db, ai, user.id).summary()


@router.post("/review-phrases", response_model=ReviewPhraseResponse, status_code=status.HTTP_201_CREATED)
def create_review_phrase(
    request: CreateReviewPhraseRequest,
    db: Session = Depends(get_db),
    ai: StructuredAIProvider = Depends(get_ai_provider),
    user: User = Depends(get_current_user),
) -> ReviewPhraseResponse:
    try:
        return ReviewService(db, ai, user.id).create_phrase(request)
    except ReviewPhraseNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Topic not found") from exc


@router.post("/review-phrases/prepare", response_model=PreparedReviewPhraseResponse)
def prepare_review_phrase(
    request: PrepareReviewPhraseRequest,
    db: Session = Depends(get_db),
    ai: StructuredAIProvider = Depends(get_ai_provider),
    user: User = Depends(get_current_user),
) -> PreparedReviewPhraseResponse:
    try:
        return ReviewService(db, ai, user.id).prepare_phrase(request)
    except PhrasePreparationUnavailableError as exc:
        raise HTTPException(status_code=503, detail="Canonical translation is unavailable") from exc


@router.post("/exercises/{exercise_id}/word-hints", response_model=WordHintResponse)
def reveal_word_hint(
    exercise_id: str,
    request: RevealWordRequest,
    db: Session = Depends(get_db),
    ai: StructuredAIProvider = Depends(get_ai_provider),
    user: User = Depends(get_current_user),
) -> WordHintResponse:
    try:
        return ReviewService(db, ai, user.id).reveal_word(exercise_id, request.word)
    except WordHintNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Word hint not found") from exc


@router.get("/learning-words", response_model=list[LearningWordResponse])
def list_learning_words(
    db: Session = Depends(get_db),
    ai: StructuredAIProvider = Depends(get_ai_provider),
    user: User = Depends(get_current_user),
) -> list[LearningWordResponse]:
    return ReviewService(db, ai, user.id).list_words()
