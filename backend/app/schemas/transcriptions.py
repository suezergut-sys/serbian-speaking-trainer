from pydantic import BaseModel, ConfigDict, Field


class TranscriptionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=1, max_length=1200)
