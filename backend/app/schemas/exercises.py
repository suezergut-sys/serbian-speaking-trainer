from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class WordHint(BaseModel):
    model_config = ConfigDict(extra="forbid")

    word_ru: str = Field(min_length=1, max_length=120)
    translation_sr: str = Field(min_length=1, max_length=240)


class PhrasePreparation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    intended_sr_variants: list[str] = Field(default_factory=list, max_length=4)
    word_hints: list[WordHint] = Field(default_factory=list, max_length=30)


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
    id: str
    session_id: str
    source_ru: str
    targeted_skills: list[str]
    expected_level: Literal["A2"] = "A2"
    difficulty: float
    word_hints: list[WordHint] = Field(default_factory=list, max_length=30)
