from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class TopicContext(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=80)
    source: Literal["preset", "custom", "general"]
    title_ru: str = Field(min_length=1, max_length=160)
    title_en: str | None = Field(default=None, min_length=1, max_length=160)
    description_ru: str = Field(min_length=1, max_length=600)
    target_level: Literal["A2"] = "A2"
    likely_intents: list[str] = Field(default_factory=list, max_length=12)
    suggested_vocabulary: list[str] = Field(default_factory=list, max_length=20)
    excluded_domains: list[str] = Field(default_factory=list, max_length=10)
    normalized_prompt_context: str = Field(min_length=1, max_length=2000)


class TopicListItem(BaseModel):
    id: str
    title_ru: str
    title_en: str | None = None
    description_ru: str
    likely_intents: list[str]
    suggested_vocabulary: list[str]
    is_custom: bool = False
    phrase_count: int = Field(default=0, ge=0)
    custom_phrase_count: int = Field(default=0, ge=0)


class CreateTopicRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    title_ru: str = Field(min_length=2, max_length=160)


class NormalizeTopicRequest(BaseModel):
    text: str = Field(min_length=3, max_length=500)


class TopicTitleTranslation(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    source_language: Literal["ru", "en"]
    translated_title: str = Field(min_length=1, max_length=160)
