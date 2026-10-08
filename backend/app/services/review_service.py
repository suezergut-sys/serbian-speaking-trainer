from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models import Exercise, ReviewPhrase, WordLearningItem
from app.repositories import ExerciseRepository, ReviewPhraseRepository, TopicPresetRepository, UserRepository, WordLearningRepository
from app.schemas import (
    CreateReviewPhraseRequest,
    LearningWordResponse,
    PhrasePreparation,
    PreparedReviewPhraseResponse,
    PrepareReviewPhraseRequest,
    ReviewPhraseResponse,
    ReviewPhraseSummaryResponse,
    WordHint,
    WordHintResponse,
)
from app.services.ai_adapter import AIServiceError, StructuredAIProvider

CORRECT_SCORE_THRESHOLD = 0.95
CORRECT_STREAK_TO_MASTER = 3
HINT_PENALTY_PER_WORD = 0.08
MAX_HINT_PENALTY = 0.30
BASE_INTERVAL_DAYS = {"easy": 3, "medium": 2, "hard": 1}
INTERVAL_MULTIPLIERS = {"easy": 2.5, "medium": 2.0, "hard": 1.5}
MAX_INTERVAL_DAYS = 365


class ReviewPhraseNotFoundError(LookupError):
    pass


class ReviewQueueEmptyError(LookupError):
    pass


class WordHintNotFoundError(LookupError):
    pass


class PhrasePreparationUnavailableError(RuntimeError):
    pass


def normalize_ru(value: str) -> str:
    return re.sub(r"[^а-яёa-z0-9]+", " ", value.casefold()).strip()


class ReviewService:
    def __init__(self, db: Session, ai: StructuredAIProvider, user_id: str = "00000000-0000-0000-0000-000000000001") -> None:
        self.db = db
        self.user_id = user_id
        self.ai = ai
        self.phrases = ReviewPhraseRepository(db, user_id)
        self.words = WordLearningRepository(db, user_id)
        self.exercises = ExerciseRepository(db, user_id)
        self.topics = TopicPresetRepository(db, user_id)

    def prepare_phrase(self, request: PrepareReviewPhraseRequest) -> PreparedReviewPhraseResponse:
        source = " ".join(request.source_ru.split())
        if not self.ai.is_available:
            raise PhrasePreparationUnavailableError
        try:
            preparation = PhrasePreparation.model_validate(self.ai.prepare_phrase(source_ru=source))
        except AIServiceError as exc:
            raise PhrasePreparationUnavailableError from exc
        if not preparation.intended_sr_variants:
            raise PhrasePreparationUnavailableError
        return PreparedReviewPhraseResponse(
            source_ru=source,
            canonical_sr=preparation.intended_sr_variants[0],
            intended_sr_variants=preparation.intended_sr_variants,
            word_hints=preparation.word_hints,
        )

    def list_phrases(self) -> list[ReviewPhraseResponse]:
        self.phrases.activate_due(datetime.now(timezone.utc))
        return [
            self._phrase_response(item, topic_title=topic_title)
            for item, topic_title in self.phrases.list_active_with_topic_titles()
        ]

    def summary(self) -> ReviewPhraseSummaryResponse:
        self.phrases.activate_due(datetime.now(timezone.utc))
        return ReviewPhraseSummaryResponse(phrase_count=self.phrases.count_active())

    def get_phrase(self, phrase_id: str) -> ReviewPhrase:
        self.phrases.activate_due(datetime.now(timezone.utc))
        phrase = self.phrases.get_owned(phrase_id)
        if phrase is None or phrase.status != "active":
            raise ReviewPhraseNotFoundError(phrase_id)
        return phrase

    def create_phrase(self, request: CreateReviewPhraseRequest) -> ReviewPhraseResponse:
        source = " ".join(request.source_ru.split())
        topic = self.topics.get_visible(request.topic_id)
        if topic is None or not topic.enabled:
            raise ReviewPhraseNotFoundError(request.topic_id)
        normalized = normalize_ru(source)
        variants = [request.canonical_sr, *request.intended_sr_variants]
        variants = list(dict.fromkeys(" ".join(value.split()) for value in variants if value.strip()))
        existing = self.phrases.find_by_source(normalized)
        if existing is not None:
            existing.status = "active"
            existing.mastered_at = None
            existing.next_review_at = None
            existing.perfect_streak = 0
            existing.learning_errors = 0
            existing.topic_id = topic.id
            existing.intended_sr_variants_json = variants
            existing.word_hints_json = [hint.model_dump() for hint in request.word_hints]
            existing.updated_at = datetime.now(timezone.utc)
            self.db.flush()
            return self._phrase_response(existing, topic_title=topic.title_ru)

        phrase = self.phrases.add(
            ReviewPhrase(
                user_id=self.user_id,
                source_ru=source,
                source_normalized=normalized,
                intended_sr_variants_json=variants,
                word_hints_json=[hint.model_dump() for hint in request.word_hints],
                topic_id=topic.id,
            )
        )
        return self._phrase_response(phrase, topic_title=topic.title_ru)

    def record_attempt(
        self,
        *,
        source_ru: str,
        intended_sr_variants: list[str],
        word_hints: list[dict[str, str]],
        targeted_skill_keys: list[str],
        score: float,
        hinted_words: list[str],
        review_phrase_id: str | None,
        topic_id: str | None = None,
        topic_phrase_id: str | None = None,
        now: datetime | None = None,
    ) -> ReviewPhraseResponse | None:
        phrase = self.phrases.get_owned(review_phrase_id) if review_phrase_id else self.phrases.find_by_source(normalize_ru(source_ru))
        is_correct = score >= CORRECT_SCORE_THRESHOLD and not hinted_words
        if phrase is None:
            phrase = self.phrases.add(
                ReviewPhrase(
                    user_id=self.user_id,
                    source_ru=source_ru,
                    source_normalized=normalize_ru(source_ru),
                    intended_sr_variants_json=intended_sr_variants,
                    word_hints_json=word_hints,
                    targeted_skill_keys_json=targeted_skill_keys,
                    topic_id=topic_id,
                    topic_phrase_id=topic_phrase_id,
                )
            )
        else:
            phrase.topic_id = phrase.topic_id or topic_id
            phrase.topic_phrase_id = phrase.topic_phrase_id or topic_phrase_id
        phrase.attempts += 1
        phrase.best_score = max(phrase.best_score, score)
        phrase.perfect_streak = phrase.perfect_streak + 1 if is_correct else 0
        if not is_correct:
            phrase.incorrect_attempts += 1
            phrase.learning_errors += 1
            phrase.status = "active"
            phrase.mastered_at = None
            phrase.next_review_at = None
            phrase.difficulty = "medium" if phrase.learning_errors == 1 else "hard"
        elif phrase.attempts == 1:
            phrase.difficulty = "easy"
        elif phrase.learning_errors == 1:
            phrase.difficulty = "medium"
        elif phrase.learning_errors > 1:
            phrase.difficulty = "hard"

        now = now or datetime.now(timezone.utc)
        was_mastered = phrase.status == "mastered"
        phrase.status = "mastered" if phrase.perfect_streak >= CORRECT_STREAK_TO_MASTER else "active"
        if phrase.status == "mastered" and not was_mastered:
            phrase.mastered_at = now
            difficulty = phrase.difficulty or "medium"
            if phrase.mastery_count == 0 or phrase.interval_days <= 0:
                phrase.interval_days = BASE_INTERVAL_DAYS[difficulty]
            else:
                phrase.interval_days = min(
                    MAX_INTERVAL_DAYS,
                    max(phrase.interval_days + 1, round(phrase.interval_days * INTERVAL_MULTIPLIERS[difficulty])),
                )
            phrase.mastery_count += 1
            phrase.next_review_at = now + timedelta(days=phrase.interval_days)
        elif phrase.status != "mastered":
            phrase.mastered_at = None
            phrase.next_review_at = None
        phrase.updated_at = now
        self.db.flush()
        topic = self.topics.get_visible(phrase.topic_id) if phrase.topic_id else None
        return self._phrase_response(phrase, topic_title=topic.title_ru if topic else None)

    def reveal_word(self, exercise_id: str, word: str) -> WordHintResponse:
        if UserRepository(self.db).lock(self.user_id) is None:
            raise WordHintNotFoundError(word)
        exercise = self.exercises.get_owned(exercise_id)
        if exercise is None:
            raise WordHintNotFoundError(word)
        return self._record_word_hint(exercise, word)

    def record_revealed_words(self, exercise: Exercise, words: list[str]) -> None:
        """Persist client-visible hints if their background POST was lost or late.

        The caller holds the user lock and includes this in attempt finalization.
        """
        for word in words:
            self._record_word_hint(exercise, word)

    def _record_word_hint(self, exercise: Exercise, word: str) -> WordHintResponse:
        normalized = normalize_ru(word)
        hints = [WordHint.model_validate(item) for item in exercise.target_hints_json.get("word_hints", [])]
        hint = next((item for item in hints if normalize_ru(item.word_ru) == normalized), None)
        if hint is None:
            raise WordHintNotFoundError(word)
        already_revealed = list(exercise.generation_meta_json.get("revealed_hint_words", []))
        if normalized in already_revealed:
            return WordHintResponse(word_ru=hint.word_ru, translation_sr=hint.translation_sr)
        learning = self.words.find_by_source(normalized)
        if learning is None:
            learning = self.words.add(
                WordLearningItem(
                    user_id=self.user_id,
                    source_ru=hint.word_ru,
                    source_normalized=normalized,
                    translation_sr=hint.translation_sr,
                )
            )
        else:
            learning.hint_count += 1
            learning.translation_sr = hint.translation_sr
            learning.status = "learning"
            learning.last_seen_at = datetime.now(timezone.utc)
            self.db.flush()
        exercise.generation_meta_json = {
            **exercise.generation_meta_json,
            "revealed_hint_words": [*already_revealed, normalized],
        }
        self.db.flush()
        return WordHintResponse(word_ru=hint.word_ru, translation_sr=hint.translation_sr)

    def list_words(self) -> list[LearningWordResponse]:
        return [
            LearningWordResponse(
                id=item.id,
                source_ru=item.source_ru,
                translation_sr=item.translation_sr,
                hint_count=item.hint_count,
                mastery=item.mastery,
                status=item.status,
            )
            for item in self.words.list_learning()
        ]

    @staticmethod
    def hint_penalty(words: list[str]) -> float:
        unique = {normalize_ru(word) for word in words if normalize_ru(word)}
        return min(MAX_HINT_PENALTY, len(unique) * HINT_PENALTY_PER_WORD)

    @staticmethod
    def _phrase_response(item: ReviewPhrase, *, topic_title: str | None) -> ReviewPhraseResponse:
        return ReviewPhraseResponse(
            id=item.id,
            source_ru=item.source_ru,
            canonical_sr=next(iter(item.intended_sr_variants_json), ""),
            topic_id=item.topic_id,
            topic_title=topic_title,
            best_score=item.best_score,
            attempts=item.attempts,
            perfect_streak=item.perfect_streak,
            status=item.status,
            difficulty=item.difficulty,
            next_review_at=item.next_review_at,
            created_at=item.created_at,
        )
