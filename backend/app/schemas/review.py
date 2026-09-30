from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.exercises import WordHint


class CreateReviewPhraseRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_ru: str = Field(min_length=3, max_length=240)
    canonical_sr: str = Field(min_length=1, max_length=300)
    topic_id: str = Field(min_length=1, max_length=80)
    intended_sr_variants: list[str] = Field(default_factory=list, max_length=4)
    word_hints: list[WordHint] = Field(default_factory=list, max_length=30)


class PrepareReviewPhraseRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_ru: str = Field(min_length=3, max_length=240)


class PreparedReviewPhraseResponse(BaseModel):
    source_ru: str
    canonical_sr: str
    intended_sr_variants: list[str]
    word_hints: list[WordHint]


class ReviewPhraseResponse(BaseModel):
    id: str
    source_ru: str
    canonical_sr: str
    topic_id: str | None = None
    topic_title: str | None = None
    best_score: float = Field(ge=0, le=1)
    attempts: int = Field(ge=0)
    perfect_streak: int = Field(ge=0)
    status: str
    difficulty: str | None = None
    next_review_at: datetime | None = None
    created_at: datetime


class ReviewPhraseSummaryResponse(BaseModel):
    phrase_count: int = Field(ge=0)


class WordHintResponse(WordHint):
    is_learning: bool = True


class LearningWordResponse(BaseModel):
    id: str
    source_ru: str
    translation_sr: str
    hint_count: int = Field(ge=1)
    mastery: float = Field(ge=0, le=1)
    status: str
