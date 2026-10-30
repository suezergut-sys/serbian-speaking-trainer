from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class WordHint(BaseModel):
    model_config = ConfigDict(extra="forbid")

    word_ru: str = Field(min_length=1, max_length=120)
    translation_sr: str = Field(min_length=1, max_length=240)


class SourceVersions(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    ru: str = Field(min_length=3, max_length=400)
    en: str = Field(min_length=3, max_length=400)
    hints_ru: list[WordHint] = Field(default_factory=list, max_length=30)
    hints_en: list[WordHint] = Field(default_factory=list, max_length=30)

    @field_validator("ru")
    @classmethod
    def russian_text(cls, value: str) -> str:
        if not any("а" <= ch.lower() <= "я" or ch.lower() == "ё" for ch in value):
            raise ValueError("Russian source must contain Russian text")
        return value

    @field_validator("en")
    @classmethod
    def english_text(cls, value: str) -> str:
        if any("\u0400" <= ch <= "\u052f" for ch in value) or not any("a" <= ch.lower() <= "z" for ch in value):
            raise ValueError("English source must contain Latin text without Cyrillic")
        return value


class PhrasePreparation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    intended_sr_variants: list[str] = Field(default_factory=list, max_length=4)
    word_hints: list[WordHint] = Field(default_factory=list, max_length=30)
    source_versions: SourceVersions | None = None


class BilingualPhrasePreparation(PhrasePreparation):
    intended_sr_variants: list[str] = Field(min_length=1, max_length=4)
    source_versions: SourceVersions


class ExerciseGenerationResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_ru: str = Field(min_length=3, max_length=240)
    topic_fit: str = Field(min_length=1, max_length=400)
    intended_sr_variants: list[str] = Field(min_length=1, max_length=6)
    targeted_skills: list[str] = Field(default_factory=list, max_length=3)
    expected_level: Literal["A2"] = "A2"
    difficulty: float = Field(ge=0, le=1)
    novelty_signature: str = Field(min_length=1, max_length=160)
    word_hints: list[WordHint] = Field(default_factory=list, max_length=30)


class ExerciseResponse(BaseModel):
    topic_id: str | None = None
    topic_title_ru: str | None = None
    id: str
    session_id: str
    source_ru: str
    source_en: str | None = None
    source_versions: SourceVersions | None = None
    source_text: str | None = None
    source_language: Literal["ru", "en"] | None = None
    source_hints: list[WordHint] = Field(default_factory=list, max_length=30)
    targeted_skills: list[str]
    expected_level: Literal["A2"] = "A2"
    difficulty: float
    word_hints: list[WordHint] = Field(default_factory=list, max_length=30)
