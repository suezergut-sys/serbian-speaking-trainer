from sqlalchemy.orm import Session

from app.models import Attempt, ErrorEvent
from app.repositories import AttemptRepository, ErrorEventRepository, ExerciseRepository, SkillRepository
from app.schemas import AttemptResponse, CreateAttemptRequest
from app.services.ai_adapter import StructuredAIProvider
from app.services.answer_analyzer import AnswerAnalyzer
from app.services.learner_model import LearnerModelService
from app.services.review_service import ReviewService, normalize_ru
from app.services.auth_service import UserService
from app.models import User


class ExerciseNotFoundError(LookupError):
    pass


class DailyLimitExceededError(RuntimeError):
    pass


class AttemptService:
    def __init__(self, db: Session, ai: StructuredAIProvider, user: User) -> None:
        self.db = db
        self.user = user
        self.attempts = AttemptRepository(db, user.id)
        self.errors = ErrorEventRepository(db)
        self.exercises = ExerciseRepository(db, user.id)
        self.skills = SkillRepository(db)
        self.analyzer = AnswerAnalyzer(ai)
        self.learner_model = LearnerModelService(db, user.id)
        self.review = ReviewService(db, ai, user.id)

    def create(self, request: CreateAttemptRequest) -> AttemptResponse:
        exercise = self.exercises.get_owned(request.exercise_id)
        if exercise is None:
            raise ExerciseNotFoundError(request.exercise_id)
        locked_user = UserService(self.db).users.lock(self.user.id)
        if locked_user is None:
            raise ExerciseNotFoundError(request.exercise_id)
        usage = UserService(self.db).usage(locked_user)
        if usage.remaining == 0:
            raise DailyLimitExceededError

        target_keys = list(exercise.generation_meta_json.get("targeted_skill_keys", []))
        catalog = {skill.key: skill for skill in self.skills.list(limit=500)}
        target_skills = [
            {"key": key, "category": catalog[key].category, "title_ru": catalog[key].title_ru}
            for key in target_keys
            if key in catalog
        ]
        intended_variants = list(exercise.target_hints_json.get("intended_sr_variants", []))
        canonical_sr = exercise.target_hints_json.get("canonical_sr")
        analysis = self.analyzer.analyze(
            source_ru=exercise.source_ru,
            transcript_sr=request.transcript_sr.strip(),
            canonical_sr=str(canonical_sr) if canonical_sr else None,
            intended_sr_variants=intended_variants,
            target_skills=target_skills,
            timing=request,
        )
        base_score = self.analyzer.overall_score(analysis)
        available_hints = {
            normalize_ru(item.get("word_ru", ""))
            for item in exercise.target_hints_json.get("word_hints", [])
        }
        hinted_words = list(dict.fromkeys(
            word.strip() for word in request.hinted_words if normalize_ru(word) in available_hints
        ))
        hint_penalty = self.review.hint_penalty(hinted_words)
        overall_score = round(max(0.0, base_score - hint_penalty), 3)
        attempt = self.attempts.add(
            Attempt(
                exercise_id=exercise.id,
                transcript_sr=request.transcript_sr.strip(),
                reaction_ms=request.reaction_ms,
                speech_duration_ms=request.speech_duration_ms,
                longest_pause_ms=request.longest_pause_ms,
                pause_count=request.pause_count,
                timings_json=request.timings,
                hinted_words_json=hinted_words,
                analysis_json=analysis.model_dump(),
                overall_score=overall_score,
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
        return AttemptResponse(
            id=attempt.id,
            exercise_id=attempt.exercise_id,
            transcript_sr=attempt.transcript_sr,
            overall_score=overall_score,
            analysis=analysis,
            learner_updates=learner_updates,
            base_score=base_score,
            hint_penalty=hint_penalty,
        )
