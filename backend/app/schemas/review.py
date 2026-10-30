from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic_core import PydanticCustomError

from app.schemas.exercises import WordHint, SourceVersions


class CreateReviewPhraseRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    preparation_id: str = Field(min_length=36, max_length=36)
    topic_id: str = Field(min_length=1, max_length=80)


class PrepareReviewPhraseRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    source_ru: str = Field(min_length=3, max_length=240)

    @field_validator("source_ru")
    @classmethod
    def limit_words(cls, value: str) -> str:
        value = " ".join(value.split())
        if len(value.split()) > 15:
            raise PydanticCustomError("phrase_word_limit", "A phrase may contain at most 15 words")
        return value


class PreparedReviewPhraseResponse(BaseModel):
    source_versions: SourceVersions | None = None
    preparation_id: str
    source_ru: str
    canonical_sr: str
    intended_sr_variants: list[str]
    word_hints: list[WordHint]


class ReviewPhraseResponse(BaseModel):
    source_versions: SourceVersions | None = None
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
