from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, JsonValue, StringConstraints

from app.schemas.auth import DailyUsageResponse


class AnswerIssue(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["grammar", "vocabulary", "naturalness", "pronunciation", "fluency", "meaning"]
    # Feedback is independent of curriculum coverage (e.g. personal phrases).
    # A non-null key must still belong to the exercise's allowed targets.
    skill_key: str | None = Field(default=None, min_length=1, max_length=120)
    severity: float = Field(ge=0, le=1)
    confidence: float = Field(ge=0, le=1)
    evidence: str = Field(min_length=1, max_length=500)
    correction: str | None = Field(default=None, max_length=500)
    explanation_ru: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=800)] | None = None


class DemonstratedSkill(BaseModel):
    model_config = ConfigDict(extra="forbid")

    skill_key: str = Field(min_length=1, max_length=120)
    result: Literal["strong", "weak", "failed"]
    confidence: float = Field(ge=0, le=1)


class AnswerAnalysis(BaseModel):
    model_config = ConfigDict(extra="forbid")

    verdict: Literal["correct", "mostly_correct", "needs_work"]
    semantic_score: float = Field(ge=0, le=1)
    grammar_score: float = Field(ge=0, le=1)
    lexical_score: float = Field(ge=0, le=1)
    naturalness_score: float = Field(ge=0, le=1)
    pronunciation_score: float | None = Field(default=None, ge=0, le=1)
    fluency_score: float = Field(ge=0, le=1)
    corrected_sr: str = Field(min_length=1, max_length=600)
    short_feedback_ru: str = Field(min_length=1, max_length=300)
    detailed_feedback_ru: str = Field(min_length=1, max_length=2000)
    accepted_alternatives: list[str] = Field(default_factory=list, max_length=8)
    issues: list[AnswerIssue] = Field(default_factory=list, max_length=12)
    demonstrated_skills: list[DemonstratedSkill] = Field(default_factory=list, max_length=12)


class ExplainedAnswerIssue(AnswerIssue):
    explanation_ru: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=800)]


class ExplainedAnswerAnalysis(AnswerAnalysis):
    # New AI responses require a reason for every issue; stored older attempts remain readable.
    issues: list[ExplainedAnswerIssue] = Field(default_factory=list, max_length=12)


class CreateAttemptRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    exercise_id: str = Field(min_length=1, max_length=36)
    client_request_id: UUID | None = None
    transcript_sr: str = Field(min_length=1, max_length=1200)
    reaction_ms: int | None = Field(default=None, ge=0, le=600_000)
    speech_duration_ms: int | None = Field(default=None, ge=0, le=600_000)
    longest_pause_ms: int | None = Field(default=None, ge=0, le=600_000)
    pause_count: int | None = Field(default=None, ge=0, le=1000)
    timings: dict[str, JsonValue] = Field(default_factory=dict)
    hinted_words: list[str] = Field(default_factory=list, max_length=30)
    transcription_id: UUID | None = None
    accepted_transcription_changes: list[int] = Field(default_factory=list, max_length=1200)


class AttemptResponse(BaseModel):
    id: str
    exercise_id: str
    transcript_sr: str
    overall_score: float = Field(ge=0, le=1)
    analysis: AnswerAnalysis
    learner_updates: list["LearnerSkillUpdate"] = Field(default_factory=list)
    base_score: float = Field(ge=0, le=1)
    hint_penalty: float = Field(ge=0, le=1)
    daily_usage: DailyUsageResponse | None = None
    transcription_assisted: bool = False
    first_success_today: bool = False


class LearnerSkillUpdate(BaseModel):
    skill_key: str
    title_ru: str
    mastery: float = Field(ge=0, le=1)
    state: Literal["LEARNING", "CONSOLIDATING", "MASTERED"]
    attempts: int = Field(ge=0)
    next_review_at: datetime
