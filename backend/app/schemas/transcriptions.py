from pydantic import BaseModel, ConfigDict, Field
from typing import Literal


class TranscriptionChange(BaseModel):
    model_config = ConfigDict(extra="forbid")
    start: int = Field(ge=0)
    end: int = Field(gt=0)
    original: str = Field(min_length=1, max_length=1200)
    replacement: str = Field(min_length=1, max_length=1200)
    kind: Literal["orthography_artifact", "phonetic_ambiguity", "ending_ambiguity"]
    action: Literal["applied", "suggested"]
    reason_code: Literal["reviewed_spelling", "confirm_ambiguous_sound"]
    explanation_ru: str | None = Field(default=None, max_length=300)
    similarity: float | None = Field(default=None, ge=0, le=1)


class TranscriptionCandidate(BaseModel):
    """Structured model hypothesis, never an instruction to rewrite the answer."""
    model_config = ConfigDict(extra="forbid")

    original: str = Field(min_length=1, max_length=1200)
    occurrence_index: int = Field(ge=0, le=1200)
    replacement: str = Field(min_length=1, max_length=1200)
    kind: Literal["orthography_artifact", "phonetic_ambiguity", "ending_ambiguity"]
    plausible_stt_error: bool
    preserves_meaning: bool
    explanation_ru: str = Field(min_length=1, max_length=300)


class TranscriptionAssistanceAnalysis(BaseModel):
    model_config = ConfigDict(extra="forbid")

    acceptable_variant: bool
    candidates: list[TranscriptionCandidate] = Field(max_length=1200)


class TranscriptionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=1, max_length=1200)
    raw_text: str | None = None
    transcription_id: str | None = None
    policy_version: str | None = None
    changes: list[TranscriptionChange] = Field(default_factory=list, max_length=1200)
    assistance_status: Literal["analyzed", "unavailable"] | None = None
