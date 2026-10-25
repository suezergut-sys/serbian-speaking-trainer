from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import Boolean, CheckConstraint, DateTime, Float, ForeignKey, Index, Integer, JSON, LargeBinary, String, Text, UniqueConstraint, false
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

LEGACY_USER_ID = "00000000-0000-0000-0000-000000000001"


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return str(uuid4())


class ModelDebugSetting(Base):
    __tablename__ = "model_debug_settings"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    generation: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    transcription_model: Mapped[str | None] = mapped_column(String(200))


class ModelDebugLog(Base):
    __tablename__ = "model_debug_logs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    operation: Mapped[str] = mapped_column(String(100))
    model: Mapped[str] = mapped_column(String(200))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    duration_ms: Mapped[float] = mapped_column(Float)
    request_json: Mapped[dict[str, Any]] = mapped_column(JSON)
    response_json: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    error_json: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    audio_payload: Mapped[bytes | None] = mapped_column(LargeBinary, deferred=True)
    audio_content_type: Mapped[str | None] = mapped_column(String(100))
    audio_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class TrainingSession(Base):
    __tablename__ = "training_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, default=LEGACY_USER_ID)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    level: Mapped[str] = mapped_column(String(10), default="A2")
    topic_id: Mapped[str | None] = mapped_column(ForeignKey("topic_presets.id", ondelete="SET NULL"))
    custom_topic_text: Mapped[str | None] = mapped_column(Text)
    normalized_topic_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(20), default="active")

    topic: Mapped[TopicPreset | None] = relationship(back_populates="sessions")
    exercises: Mapped[list[Exercise]] = relationship(back_populates="session", cascade="all, delete-orphan")


class Exercise(Base):
    __tablename__ = "exercises"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    session_id: Mapped[str] = mapped_column(ForeignKey("training_sessions.id", ondelete="CASCADE"), index=True)
    client_request_id: Mapped[str | None] = mapped_column(String(36))
    source_ru: Mapped[str] = mapped_column(Text)
    target_hints_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    targeted_skill_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    generation_meta_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    session: Mapped[TrainingSession] = relationship(back_populates="exercises")
    attempts: Mapped[list[Attempt]] = relationship(back_populates="exercise", cascade="all, delete-orphan")

    __table_args__ = (Index("uq_exercises_session_request", "session_id", "client_request_id", unique=True),)


class Attempt(Base):
    __tablename__ = "attempts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    exercise_id: Mapped[str] = mapped_column(ForeignKey("exercises.id", ondelete="CASCADE"), index=True)
    transcript_sr: Mapped[str] = mapped_column(Text)
    reaction_ms: Mapped[int | None] = mapped_column(Integer)
    speech_duration_ms: Mapped[int | None] = mapped_column(Integer)
    longest_pause_ms: Mapped[int | None] = mapped_column(Integer)
    pause_count: Mapped[int | None] = mapped_column(Integer)
    timings_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    hinted_words_json: Mapped[list[str]] = mapped_column(JSON, default=list)
    analysis_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    overall_score: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)

    exercise: Mapped[Exercise] = relationship(back_populates="attempts")
    error_events: Mapped[list[ErrorEvent]] = relationship(back_populates="attempt", cascade="all, delete-orphan")

    __table_args__ = (CheckConstraint("overall_score IS NULL OR (overall_score >= 0 AND overall_score <= 1)"),)


class AttemptRequest(Base):
    __tablename__ = "attempt_requests"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    client_request_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    payload_hash: Mapped[str] = mapped_column(String(64))
    exercise_id: Mapped[str | None] = mapped_column(ForeignKey("exercises.id", ondelete="CASCADE"))
    reserved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    lease_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    fencing_token: Mapped[int] = mapped_column(Integer, default=1)
    attempt_id: Mapped[str | None] = mapped_column(ForeignKey("attempts.id", ondelete="CASCADE"))
    response_json: Mapped[dict[str, Any] | None] = mapped_column(JSON)


class TranscriptionReceipt(Base):
    __tablename__ = "transcription_receipts"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    exercise_id: Mapped[str] = mapped_column(ForeignKey("exercises.id", ondelete="CASCADE"), index=True)
    raw_text: Mapped[str] = mapped_column(Text)
    changes_json: Mapped[list[dict[str, Any]]] = mapped_column(JSON)
    policy_version: Mapped[str] = mapped_column(String(40))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class PhrasePreparationReceipt(Base):
    __tablename__ = "phrase_preparation_receipts"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    source_ru: Mapped[str] = mapped_column(Text)
    preparation_json: Mapped[dict[str, Any]] = mapped_column(JSON)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    saved_phrase_id: Mapped[str | None] = mapped_column(String(36))
    saved_topic_id: Mapped[str | None] = mapped_column(String(80))


class Skill(Base):
    __tablename__ = "skills"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    key: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    category: Mapped[str] = mapped_column(String(40), index=True)
    title_ru: Mapped[str] = mapped_column(String(200))
    explanation_ru: Mapped[str] = mapped_column(Text)
    difficulty: Mapped[float] = mapped_column(Float, default=0.5)
    parent_skill_id: Mapped[str | None] = mapped_column(ForeignKey("skills.id", ondelete="SET NULL"))

    parent: Mapped[Skill | None] = relationship(remote_side=[id])
    learner_states: Mapped[list[LearnerSkill]] = relationship(back_populates="skill", cascade="all, delete-orphan")
    error_events: Mapped[list[ErrorEvent]] = relationship(back_populates="skill")

    __table_args__ = (CheckConstraint("difficulty >= 0 AND difficulty <= 1"),)


class LearnerSkill(Base):
    __tablename__ = "learner_skills"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, default=LEGACY_USER_ID)
    skill_id: Mapped[str] = mapped_column(ForeignKey("skills.id", ondelete="CASCADE"), primary_key=True)
    mastery: Mapped[float] = mapped_column(Float, default=0)
    state: Mapped[str] = mapped_column(String(20), default="LEARNING")
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    successes: Mapped[int] = mapped_column(Integer, default=0)
    hesitations: Mapped[int] = mapped_column(Integer, default=0)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    next_review_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    streak: Mapped[int] = mapped_column(Integer, default=0)

    skill: Mapped[Skill] = relationship(back_populates="learner_states")

    __table_args__ = (CheckConstraint("mastery >= 0 AND mastery <= 1"),)


class ErrorEvent(Base):
    __tablename__ = "error_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    attempt_id: Mapped[str] = mapped_column(ForeignKey("attempts.id", ondelete="CASCADE"), index=True)
    skill_id: Mapped[str | None] = mapped_column(ForeignKey("skills.id", ondelete="SET NULL"), index=True)
    type: Mapped[str] = mapped_column(String(40))
    severity: Mapped[float] = mapped_column(Float)
    confidence: Mapped[float] = mapped_column(Float)
    evidence_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)

    attempt: Mapped[Attempt] = relationship(back_populates="error_events")
    skill: Mapped[Skill | None] = relationship(back_populates="error_events")

    __table_args__ = (
        CheckConstraint("severity >= 0 AND severity <= 1"),
        CheckConstraint("confidence >= 0 AND confidence <= 1"),
    )


class TopicPreset(Base):
    __tablename__ = "topic_presets"

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    owner_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title_ru: Mapped[str] = mapped_column(String(160))
    title_en: Mapped[str | None] = mapped_column(String(160), nullable=True)
    description_ru: Mapped[str] = mapped_column(Text)
    intents_json: Mapped[list[str]] = mapped_column(JSON, default=list)
    vocabulary_json: Mapped[list[str]] = mapped_column(JSON, default=list)
    is_custom: Mapped[bool] = mapped_column(Boolean, default=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)

    sessions: Mapped[list[TrainingSession]] = relationship(back_populates="topic")
    phrases: Mapped[list[TopicPhrase]] = relationship(back_populates="topic", cascade="all, delete-orphan")


class TopicPhrase(Base):
    __tablename__ = "topic_phrases"

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    topic_id: Mapped[str] = mapped_column(ForeignKey("topic_presets.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer)
    source_ru: Mapped[str] = mapped_column(Text)
    canonical_sr: Mapped[str] = mapped_column(Text)
    word_hints_json: Mapped[list[dict[str, str]]] = mapped_column(JSON, default=list)
    targeted_skill_keys_json: Mapped[list[str]] = mapped_column(JSON, default=list)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)

    topic: Mapped[TopicPreset] = relationship(back_populates="phrases")

    __table_args__ = (
        CheckConstraint("position >= 1", name="ck_topic_phrases_position_positive"),
        UniqueConstraint("topic_id", "position", name="uq_topic_phrases_topic_position"),
    )


class ReviewPhrase(Base):
    __tablename__ = "review_phrases"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, default=LEGACY_USER_ID)
    source_ru: Mapped[str] = mapped_column(Text)
    source_normalized: Mapped[str] = mapped_column(String(280), index=True)
    intended_sr_variants_json: Mapped[list[str]] = mapped_column(JSON, default=list)
    word_hints_json: Mapped[list[dict[str, str]]] = mapped_column(JSON, default=list)
    targeted_skill_keys_json: Mapped[list[str]] = mapped_column(JSON, default=list)
    topic_id: Mapped[str | None] = mapped_column(ForeignKey("topic_presets.id", ondelete="SET NULL"), index=True)
    topic_phrase_id: Mapped[str | None] = mapped_column(
        ForeignKey("topic_phrases.id", ondelete="SET NULL"), index=True
    )
    best_score: Mapped[float] = mapped_column(Float, default=0)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    perfect_streak: Mapped[int] = mapped_column(Integer, default=0)
    incorrect_attempts: Mapped[int] = mapped_column(Integer, default=0)
    learning_errors: Mapped[int] = mapped_column(Integer, default=0)
    difficulty: Mapped[str | None] = mapped_column(String(12))
    mastery_count: Mapped[int] = mapped_column(Integer, default=0)
    interval_days: Mapped[int] = mapped_column(Integer, default=0)
    next_review_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    status: Mapped[str] = mapped_column(String(20), default="active", index=True)
    mastered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    __table_args__ = (
        CheckConstraint("best_score >= 0 AND best_score <= 1"),
        UniqueConstraint("user_id", "source_normalized", name="uq_review_phrases_user_source"),
    )


class WordLearningItem(Base):
    __tablename__ = "word_learning_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, default=LEGACY_USER_ID)
    source_ru: Mapped[str] = mapped_column(String(120))
    source_normalized: Mapped[str] = mapped_column(String(120), index=True)
    translation_sr: Mapped[str] = mapped_column(String(240))
    hint_count: Mapped[int] = mapped_column(Integer, default=1)
    mastery: Mapped[float] = mapped_column(Float, default=0)
    status: Mapped[str] = mapped_column(String(20), default="learning", index=True)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    __table_args__ = (
        CheckConstraint("mastery >= 0 AND mastery <= 1"),
        UniqueConstraint("user_id", "source_normalized", name="uq_word_learning_user_source"),
    )


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    display_name: Mapped[str | None] = mapped_column(String(200))
    avatar_url: Mapped[str | None] = mapped_column(Text)
    role: Mapped[str] = mapped_column(String(20), default="user", index=True)
    access_tier: Mapped[str] = mapped_column(String(40), default="free", index=True)
    assistance_enabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    registered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    last_active_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)

    __table_args__ = (
        CheckConstraint("role IN ('user', 'admin')", name="ck_users_role"),
        CheckConstraint("access_tier IN ('free', 'premium')", name="ck_users_access_tier"),
    )


class UserFeedback(Base):
    __tablename__ = "user_feedback"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    content: Mapped[str] = mapped_column(Text)
