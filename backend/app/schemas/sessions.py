from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.exercises import ExerciseResponse
from app.schemas.topics import TopicContext


class CreateSessionRequest(BaseModel):
    topic_id: str | None = Field(default=None, max_length=80)
    custom_topic_text: str | None = Field(default=None, min_length=3, max_length=500)
    review_phrase_id: str | None = Field(default=None, max_length=36)
    review_mode: bool = False
    length: int = Field(default=20, ge=1, le=100)

    @model_validator(mode="after")
    def choose_one_topic_source(self) -> "CreateSessionRequest":
        selected = [
            self.topic_id is not None,
            self.custom_topic_text is not None,
            self.review_phrase_id is not None,
            self.review_mode,
        ]
        if sum(selected) > 1:
            raise ValueError("Choose only one session source")
        return self


class SessionResponse(BaseModel):
    id: str
    status: str
    level: str
    started_at: datetime
    requested_length: int
    completed_count: int = 0
    topic: TopicContext


class NextExerciseRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    client_request_id: UUID | None = None


class StartSessionResponse(BaseModel):
    session: SessionResponse
    exercise: ExerciseResponse
