from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import Boolean, CheckConstraint, DateTime, Float, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return str(uuid4())


class TrainingSession(Base):
    __tablename__ = "training_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
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
    source_ru: Mapped[str] = mapped_column(Text)
    target_hints_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    targeted_skill_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    generation_meta_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    session: Mapped[TrainingSession] = relationship(back_populates="exercises")
    attempts: Mapped[list[Attempt]] = relationship(back_populates="exercise", cascade="all, delete-orphan")


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
    learner_state: Mapped[LearnerSkill | None] = relationship(back_populates="skill", cascade="all, delete-orphan")
    error_events: Mapped[list[ErrorEvent]] = relationship(back_populates="skill")

    __table_args__ = (CheckConstraint("difficulty >= 0 AND difficulty <= 1"),)


class LearnerSkill(Base):
    __tablename__ = "learner_skills"

    skill_id: Mapped[str] = mapped_column(ForeignKey("skills.id", ondelete="CASCADE"), primary_key=True)
    mastery: Mapped[float] = mapped_column(Float, default=0)
    state: Mapped[str] = mapped_column(String(20), default="LEARNING")
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    successes: Mapped[int] = mapped_column(Integer, default=0)
    hesitations: Mapped[int] = mapped_column(Integer, default=0)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    next_review_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    streak: Mapped[int] = mapped_column(Integer, default=0)

    skill: Mapped[Skill] = relationship(back_populates="learner_state")

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
    title_ru: Mapped[str] = mapped_column(String(160))
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
        CheckConstraint("position >= 1 AND position <= 20"),
        UniqueConstraint("topic_id", "position", name="uq_topic_phrases_topic_position"),
    )


class ReviewPhrase(Base):
    __tablename__ = "review_phrases"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    source_ru: Mapped[str] = mapped_column(Text)
    source_normalized: Mapped[str] = mapped_column(String(280), unique=True, index=True)
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

    __table_args__ = (CheckConstraint("best_score >= 0 AND best_score <= 1"),)


class WordLearningItem(Base):
    __tablename__ = "word_learning_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    source_ru: Mapped[str] = mapped_column(String(120))
    source_normalized: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    translation_sr: Mapped[str] = mapped_column(String(240))
    hint_count: Mapped[int] = mapped_column(Integer, default=1)
    mastery: Mapped[float] = mapped_column(Float, default=0)
    status: Mapped[str] = mapped_column(String(20), default="learning", index=True)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    __table_args__ = (CheckConstraint("mastery >= 0 AND mastery <= 1"),)
