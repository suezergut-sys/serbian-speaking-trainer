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


class TranscriptionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=1, max_length=1200)
    raw_text: str | None = None
    transcription_id: str | None = None
    policy_version: str | None = None
    changes: list[TranscriptionChange] = Field(default_factory=list, max_length=3)
