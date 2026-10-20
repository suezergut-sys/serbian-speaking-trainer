from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class TranscriptionModelOption(BaseModel):
    model_config = ConfigDict(extra="forbid")
    model: str = Field(min_length=1, max_length=200)
    language_parameter: Literal["language", "languages"] = "language"


class TranscriptionModelSelection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    model: str | None = Field(default=None, min_length=1, max_length=200)


class TranscriptionModelSettings(BaseModel):
    selected_model: str | None
    effective_model: str | None
    default_model: str | None
    options: list[str]
