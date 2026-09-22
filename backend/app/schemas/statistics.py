from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field


class DailyPhraseCount(BaseModel):
    date: date
    phrase_count: int = Field(ge=0)
    translation_count: int = Field(ge=0)
    correct_translation_count: int = Field(ge=0)
    mastered_phrase_count: int = Field(ge=0)


class MonthlyStatisticsResponse(BaseModel):
    month: str = Field(pattern=r"^\d{4}-\d{2}$")
    active_days: int = Field(ge=0)
    total_phrases: int = Field(ge=0)
    total_translations: int = Field(ge=0)
    correct_translations: int = Field(ge=0)
    mastered_phrases: int = Field(ge=0)
    days: list[DailyPhraseCount]


class PhraseStatisticsItem(BaseModel):
    id: str
    source_ru: str
    target_sr: str
    attempts: int = Field(ge=0)
    status: Literal["learning", "mastered"]
    difficulty: Literal["easy", "medium", "hard"] | None = None
    next_review_at: datetime | None = None


class PhraseStatisticsGroup(BaseModel):
    topic_id: str | None = None
    topic_title: str
    phrases: list[PhraseStatisticsItem]


class PhraseStatisticsResponse(BaseModel):
    total: int = Field(ge=0)
    page: int = Field(ge=1)
    page_size: Literal["10", "50", "all"]
    total_pages: int = Field(ge=1)
    groups: list[PhraseStatisticsGroup]
