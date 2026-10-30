import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, time, timedelta, timezone
from uuid import uuid4

from sqlalchemy import delete, update
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Attempt, AttemptRequest, ErrorEvent, Exercise
from app.repositories import (
    AttemptRepository, AttemptRequestRepository, ErrorEventRepository, ExerciseRepository,
    SkillRepository, TrainingSessionRepository,
)
from app.schemas import AttemptResponse, CreateAttemptRequest
from app.services.ai_adapter import StructuredAIProvider
from app.services.answer_analyzer import AnswerAnalyzer
from app.services.serbian_text import has_unexpected_letter_script
from app.services.session_service import SessionCompletedError, SessionUnavailableError
from app.services.learner_model import LearnerModelService
from app.services.review_service import ReviewService
from app.services.word_hints import all_word_hints, resolve_hint
from app.services.auth_service import UserService
from app.models import User
from app.repositories.transcriptions import TranscriptionReceiptRepository
from app.services.custom_content_policy import CustomContentError
from app.schemas.transcriptions import TranscriptionChange


class UnexpectedTranscriptScriptError(ValueError):
    pass


class InvalidTranscriptionReceiptError(ValueError):
    pass


class ExerciseNotFoundError(LookupError):
    pass


class DailyLimitExceededError(RuntimeError):
    pass


class AttemptRequestConflictError(RuntimeError):
    pass


class AttemptInProgressError(RuntimeError):
    pass


@dataclass(frozen=True)
class _Reservation:
    request_id: str
    client_supplied: bool
    fencing_token: int
    exercise_id: str
    source_ru: str
    canonical_sr: str | None
    intended_variants: list[str]
    target_keys: list[str]
    target_skills: list[dict[str, str]]


class AttemptService:
    @staticmethod
    def _analysis_source(exercise: Exercise) -> str:
        from app.services.source_versions import exercise_source
        from app.services.interface_language import interface_language
        return exercise_source(exercise, interface_language.get())

    def __init__(self, db: Session, ai: StructuredAIProvider, user: User) -> None:
        self.db = db
        self.user = user
        self.attempts = AttemptRepository(db, user.id)
        self.requests = AttemptRequestRepository(db, user.id)
        self.errors = ErrorEventRepository(db)
        self.exercises = ExerciseRepository(db, user.id)
        self.sessions = TrainingSessionRepository(db, user.id)
        self.skills = SkillRepository(db)
        self.analyzer = AnswerAnalyzer(ai)
        self.learner_model = LearnerModelService(db, user.id)
        self.review = ReviewService(db, ai, user.id)

    def create(self, request: CreateAttemptRequest) -> AttemptResponse:
        if has_unexpected_letter_script(request.transcript_sr):
            raise UnexpectedTranscriptScriptError()
        assistance = self._transcription_evidence(request)
        reserved = self._reserve(request)
        if isinstance(reserved, AttemptResponse):
            return reserved
        try:
            analysis = self.analyzer.analyze(
                source_ru=reserved.source_ru,
                transcript_sr=request.transcript_sr.strip(),
                canonical_sr=reserved.canonical_sr,
                intended_sr_variants=reserved.intended_variants,
                target_skills=reserved.target_skills,
                timing=request,
            )
        except Exception:
            self._release(reserved)
            raise
        try:
            return self._finalize(request, reserved, analysis, assistance)
        except Exception:
            self.db.rollback()
            self._release(reserved)
            raise

    def _reserve(self, request: CreateAttemptRequest) -> _Reservation | AttemptResponse:
        request_id = str(request.client_request_id) if request.client_request_id else str(uuid4())
        payload_hash = self._payload_hash(request)
        exercise = self.exercises.get_owned(request.exercise_id)
        if exercise is None:
            raise ExerciseNotFoundError(request.exercise_id)
        locked_user = UserService(self.db).users.lock(self.user.id)
        if locked_user is None:
            raise ExerciseNotFoundError(request.exercise_id)
        exercise = self.exercises.get_owned(request.exercise_id)
        if exercise is None:
            raise ExerciseNotFoundError(request.exercise_id)
        if exercise.generation_meta_json.get("custom_content_deleted"):
            raise CustomContentError("custom_content_deleted")
        lease_now = datetime.now(timezone.utc)
        existing = self.requests.get_by_client_id(request_id) if request.client_request_id else None
        if existing is not None:
            if existing.payload_hash != payload_hash:
                raise AttemptRequestConflictError
            if existing.response_json is not None:
                return self._replay(existing, payload_hash)
            if existing.lease_expires_at is not None and self._utc(existing.lease_expires_at) > lease_now:
                raise AttemptInProgressError

        training_session = self.sessions.get_owned_for_update(exercise.session_id)
        if training_session is None:
            raise ExerciseNotFoundError(request.exercise_id)
        now = datetime.now(timezone.utc)
        if training_session.status == "completed":
            raise SessionCompletedError(training_session.id)
        if training_session.status != "active":
            raise SessionUnavailableError(training_session.id)
        is_carousel = bool(training_session.normalized_topic_json.get("review_carousel"))
        requested_length = int(training_session.normalized_topic_json.get("session_length", 20))
        if not is_carousel and self.attempts.count_checked_exercises(training_session.id) >= requested_length:
            raise SessionCompletedError(training_session.id)
        if not is_carousel and self.requests.count_checked_or_reserved_exercises(training_session.id, now) >= requested_length:
            raise AttemptInProgressError

        usage = UserService(self.db).usage(locked_user, now=now)
        if usage.remaining == 0:
            raise DailyLimitExceededError
        if usage.limit is not None:
            day_start = datetime.combine(now.date(), time.min, tzinfo=timezone.utc)
            if usage.used + self.requests.count_active_between(day_start, day_start + timedelta(days=1), now) >= usage.limit:
                raise AttemptInProgressError

        target_keys = list(exercise.generation_meta_json.get("targeted_skill_keys", []))
        catalog = {skill.key: skill for skill in self.skills.list(limit=500)}
        target_skills = [
            {"key": key, "category": catalog[key].category, "title_ru": catalog[key].title_ru}
            for key in target_keys
            if key in catalog
        ]
        intended_variants = list(exercise.target_hints_json.get("intended_sr_variants", []))
        canonical_sr = exercise.target_hints_json.get("canonical_sr")
        settings = get_settings()
        lease_seconds = max(60.0, 2 * settings.openai_timeout_seconds * (settings.openai_max_retries + 1) + 30.0)
        token = (existing.fencing_token or 0) + 1 if existing is not None else 1
        if existing is None:
            self.requests.add(AttemptRequest(
                user_id=self.user.id,
                client_request_id=request_id,
                payload_hash=payload_hash,
                exercise_id=exercise.id,
                reserved_at=now,
                lease_expires_at=now + timedelta(seconds=lease_seconds),
                fencing_token=token,
            ))
        else:
            existing.exercise_id = exercise.id
            existing.reserved_at = now
            existing.lease_expires_at = now + timedelta(seconds=lease_seconds)
            existing.fencing_token = token
        reserved = _Reservation(
            request_id=request_id,
            client_supplied=request.client_request_id is not None,
            fencing_token=token,
            exercise_id=exercise.id,
            source_ru=self._analysis_source(exercise),
            canonical_sr=str(canonical_sr) if canonical_sr else None,
            intended_variants=intended_variants,
            target_keys=target_keys,
            target_skills=target_skills,
        )
        self.db.commit()
        self.db.expire_all()
        return reserved

    def _transcription_evidence(self, request: CreateAttemptRequest) -> dict:
        if request.transcription_id is None:
            if request.accepted_transcription_changes:
                raise InvalidTranscriptionReceiptError()
            return {}
        receipt = TranscriptionReceiptRepository(self.db, self.user.id).get_owned(str(request.transcription_id), request.exercise_id)
        if receipt is None:
            raise InvalidTranscriptionReceiptError()
        changes = [TranscriptionChange.model_validate(c) for c in receipt.changes_json]
        accepted = set(request.accepted_transcription_changes)
        if any(i < 0 or i >= len(changes) or changes[i].action != "suggested" for i in accepted):
            raise InvalidTranscriptionReceiptError()
        return {"raw_text": receipt.raw_text, "policy_version": receipt.policy_version,
            "changes": receipt.changes_json, "accepted": sorted(accepted), "assisted": bool(accepted)}

    def _finalize(self, request: CreateAttemptRequest, reserved: _Reservation, analysis, assistance: dict | None = None) -> AttemptResponse:
        assistance = assistance or {}
        locked_user = UserService(self.db).users.lock(self.user.id)
        entry = self.requests.get_by_client_id(reserved.request_id)
        now = datetime.now(timezone.utc)
        if (
            locked_user is None or entry is None or entry.fencing_token != reserved.fencing_token
            or entry.response_json is not None or entry.lease_expires_at is None
            or self._utc(entry.lease_expires_at) <= now
        ):
            raise AttemptInProgressError
        exercise = self.exercises.get_owned(reserved.exercise_id)
        if exercise is None:
            raise ExerciseNotFoundError(reserved.exercise_id)
        if exercise.generation_meta_json.get("custom_content_deleted"):
            raise CustomContentError("custom_content_deleted")
        training_session = self.sessions.get_owned_for_update(exercise.session_id)
        if training_session is None:
            raise ExerciseNotFoundError(reserved.exercise_id)
        if training_session.status == "unavailable":
            raise SessionUnavailableError(training_session.id)
        is_carousel = bool(training_session.normalized_topic_json.get("review_carousel"))
        requested_length = int(training_session.normalized_topic_json.get("session_length", 20))
        target_keys = reserved.target_keys
        intended_variants = reserved.intended_variants
        catalog = {skill.key: skill for skill in self.skills.list(limit=500)}
        base_score = self.analyzer.overall_score(analysis)
        available_hints = all_word_hints(exercise.source_ru, list(exercise.target_hints_json.get("word_hints", [])),
            exercise.target_hints_json.get("canonical_sr") or next(iter(exercise.target_hints_json.get("intended_sr_variants", [])), ""), exercise.target_hints_json.get('source_versions'))
        hinted_words = list(dict.fromkeys(
            hint["word_ru"]
            for word in request.hinted_words if (hint := resolve_hint(available_hints, word)) is not None
        ))
        self.review.record_revealed_words(exercise, hinted_words)
        hint_penalty = self.review.hint_penalty(hinted_words)
        overall_score = round(max(0.0, base_score - hint_penalty), 3)
        day_start = datetime.combine(now.date(), time.min, tzinfo=timezone.utc)
        day_end = day_start + timedelta(days=1)
        created_at = entry.reserved_at or now
        # The existing user lock serializes this check with other accepted answers.
        first_success_today = (
            overall_score == 1
            and day_start <= self._utc(created_at) < day_end
            and not self.attempts.has_perfect_between(day_start, day_end)
        )
        attempt = self.attempts.add(
            Attempt(
                exercise_id=exercise.id,
                transcript_sr=request.transcript_sr.strip(),
                reaction_ms=request.reaction_ms,
                speech_duration_ms=request.speech_duration_ms,
                longest_pause_ms=request.longest_pause_ms,
                pause_count=request.pause_count,
                timings_json={**request.timings, "transcription_assistance": assistance},
                hinted_words_json=hinted_words,
                analysis_json=analysis.model_dump(),
                overall_score=overall_score,
                created_at=created_at,
            )
        )
        for issue in analysis.issues:
            skill = catalog.get(issue.skill_key)
            self.errors.add(
                ErrorEvent(
                    attempt_id=attempt.id,
                    skill_id=skill.id if skill else None,
                    type=issue.type,
                    severity=issue.severity,
                    confidence=issue.confidence,
                    evidence_json={"evidence": issue.evidence, "correction": issue.correction},
                )
            )
        learner_updates = self.learner_model.update_from_analysis(
            analysis,
            context_novelty=1.0 if exercise.generation_meta_json.get("novelty_signature") else 0.7,
        )
        self.review.record_attempt(
            source_ru=exercise.source_ru,
            intended_sr_variants=intended_variants,
            word_hints=list(exercise.target_hints_json.get("word_hints", [])),
            targeted_skill_keys=target_keys,
            score=overall_score,
            hinted_words=hinted_words,
            review_phrase_id=exercise.generation_meta_json.get("review_phrase_id"),
            topic_id=exercise.generation_meta_json.get("topic_id"),
            topic_phrase_id=exercise.generation_meta_json.get("topic_phrase_id"),
        )
        if not is_carousel and self.attempts.count_checked_exercises(training_session.id) >= requested_length:
            training_session.status = "completed"
            training_session.ended_at = datetime.now(timezone.utc)
            self.db.flush()
        response = AttemptResponse(
            id=attempt.id,
            exercise_id=attempt.exercise_id,
            transcript_sr=attempt.transcript_sr,
            overall_score=overall_score,
            analysis=analysis,
            learner_updates=learner_updates,
            base_score=base_score,
            hint_penalty=hint_penalty,
            daily_usage=UserService(self.db).usage(locked_user),
            transcription_assisted=bool(assistance.get("assisted")),
            first_success_today=first_success_today,
        )
        entry.attempt_id = attempt.id
        entry.response_json = response.model_dump(mode="json")
        self.db.flush()
        if response.daily_usage and response.daily_usage.used == 20:
            from app.config import get_settings
            from app.services.notifications import notify_after_commit
            notify_after_commit(self.db, get_settings(), locked_user.email, "выполнил 20 проверок за день в SerboTalk")
        self.db.commit()
        return response

    def _release(self, reserved: _Reservation) -> None:
        # Keep client-supplied IDs so fencing tokens never reset after failure.
        try:
            owned_lease = (
                AttemptRequest.user_id == self.user.id,
                AttemptRequest.client_request_id == reserved.request_id,
                AttemptRequest.fencing_token == reserved.fencing_token,
                AttemptRequest.response_json.is_(None),
            )
            if reserved.client_supplied:
                self.db.execute(update(AttemptRequest).where(*owned_lease).values(
                    lease_expires_at=datetime.now(timezone.utc) - timedelta(seconds=1),
                ))
            else:
                self.db.execute(delete(AttemptRequest).where(*owned_lease))
            self.db.commit()
        except Exception:
            self.db.rollback()
            # An unreleased lease expires; preserve the original safe error.

    @staticmethod
    def _utc(value: datetime) -> datetime:
        return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)

    @staticmethod
    def _payload_hash(request: CreateAttemptRequest) -> str:
        payload = request.model_dump(mode="json", exclude={"client_request_id"})
        # Preserve hashes saved by older APKs for unassisted idempotent retries.
        if request.transcription_id is None and not request.accepted_transcription_changes:
            payload.pop("transcription_id", None)
            payload.pop("accepted_transcription_changes", None)
        serialized = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(serialized.encode("utf-8")).hexdigest()

    @staticmethod
    def _replay(existing: AttemptRequest, payload_hash: str | None) -> AttemptResponse:
        if existing.payload_hash != payload_hash or existing.response_json is None:
            raise AttemptRequestConflictError
        return AttemptResponse.model_validate(existing.response_json)
