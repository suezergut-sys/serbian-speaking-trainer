from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class FeedbackRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    content: str = Field(min_length=1, max_length=5000)


class FeedbackResponse(BaseModel):
    id: str
    created_at: datetime


class FeedbackTranscript(BaseModel):
    text: str = Field(min_length=1, max_length=5000)
