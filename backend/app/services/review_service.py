from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session
from pydantic import ValidationError

from app.models import Exercise, ReviewPhrase, WordLearningItem, PhrasePreparationReceipt
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
from app.repositories.custom_content import CustomContentRepository
from app.services.custom_content_policy import CustomContentError, MAX_TOPIC_PHRASES, MAX_CUSTOM_PHRASES
from app.services.ai_adapter import AIServiceError, StructuredAIProvider
from app.services.word_hints import all_word_hints, resolve_hint
from app.services.hint_alignment import aligned_word_hints
from app.services.source_versions import preparation_versions, version_payload, SourceLanguageUnavailableError

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
            preparation = preparation_versions(self.ai, source)
        except (AIServiceError, ValidationError, SourceLanguageUnavailableError) as exc:
            raise PhrasePreparationUnavailableError from exc
        variants = [" ".join(value.split()) for value in preparation.intended_sr_variants]
        if not variants or any(not value or len(value) > 300 for value in variants):
            raise PhrasePreparationUnavailableError
        preparation.word_hints = [WordHint.model_validate(item) for item in aligned_word_hints(
            source, variants[0], [hint.model_dump() for hint in preparation.word_hints])]
        now = datetime.now(timezone.utc)
        receipt = PhrasePreparationReceipt(user_id=self.user_id, source_ru=source,
            preparation_json=PhrasePreparation(intended_sr_variants=variants, word_hints=preparation.word_hints, source_versions=preparation.source_versions).model_dump(),
            expires_at=now + timedelta(minutes=30))
        CustomContentRepository(self.db, self.user_id).add_receipt(receipt, now)
        return PreparedReviewPhraseResponse(
            preparation_id=receipt.id,
            source_ru=source,
            canonical_sr=variants[0],
            intended_sr_variants=variants,
            word_hints=preparation.word_hints,
            source_versions=preparation.source_versions,
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

    def list_custom_phrases(self) -> list[ReviewPhraseResponse]:
        titles = {topic.id: topic.title_ru for topic in self.topics.list_enabled()}
        return [self._phrase_response(phrase, topic_title=titles.get(phrase.topic_id))
                for phrase in CustomContentRepository(self.db, self.user_id).phrases()]

    def create_phrase(self, request: CreateReviewPhraseRequest) -> ReviewPhraseResponse:
        UserRepository(self.db).lock(self.user_id)
        content = CustomContentRepository(self.db, self.user_id)
        topic = self.topics.get_visible(request.topic_id)
        if topic is None or not topic.enabled:
            raise ReviewPhraseNotFoundError(request.topic_id)
        if not topic.is_custom or topic.owner_user_id != self.user_id:
            raise CustomContentError("custom_topic_required", 422)
        receipt = content.receipt(request.preparation_id)
        now = datetime.now(timezone.utc)
        if receipt is None or receipt.expires_at.replace(tzinfo=timezone.utc) <= now:
            raise CustomContentError("phrase_preparation_expired")
        if receipt.saved_phrase_id:
            saved = self.phrases.get_owned(receipt.saved_phrase_id)
            if saved is None or receipt.saved_topic_id != topic.id:
                raise CustomContentError("phrase_preparation_used")
            return self._phrase_response(saved, topic_title=topic.title_ru)
        source = receipt.source_ru
        preparation = PhrasePreparation.model_validate(receipt.preparation_json)
        existing = self.phrases.find_by_source(normalize_ru(source))
        if existing is not None:
            if existing.topic_id != topic.id or existing.topic_phrase_id is not None:
                raise CustomContentError("phrase_already_exists")
            # Adding the same phrase never edits its canonical answer or progress.
            phrase = existing
        else:
            if content.phrase_count(topic.id) >= MAX_TOPIC_PHRASES:
                raise CustomContentError("custom_phrase_limit")
            if content.phrase_count() >= MAX_CUSTOM_PHRASES:
                raise CustomContentError("custom_total_phrase_limit")
            phrase = self.phrases.add(ReviewPhrase(
                user_id=self.user_id, source_ru=source, source_normalized=normalize_ru(source),
                intended_sr_variants_json=preparation.intended_sr_variants,
                word_hints_json=[hint.model_dump() for hint in preparation.word_hints], topic_id=topic.id,
                source_versions_json=version_payload(source, preparation.intended_sr_variants[0], preparation.source_versions) if preparation.source_versions else {},
            ))
        receipt.saved_phrase_id = phrase.id
        receipt.saved_topic_id = topic.id
        self.db.flush()
        return self._phrase_response(phrase, topic_title=topic.title_ru)

    def delete_custom_phrase(self, phrase_id: str) -> None:
        UserRepository(self.db).lock(self.user_id)
        phrase = self.phrases.get_owned(phrase_id)
        if phrase is None or phrase.topic_phrase_id is not None:
            raise ReviewPhraseNotFoundError(phrase_id)
        CustomContentRepository(self.db, self.user_id).invalidate_training({phrase.id})
        self.db.delete(phrase)
        self.db.flush()

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
        stored = list(exercise.target_hints_json.get("word_hints", []))
        canonical = exercise.target_hints_json.get("canonical_sr") or next(iter(exercise.target_hints_json.get("intended_sr_variants", [])), "")
        # Both dictionaries belong to the same immutable exercise/canonical pair.
        # This also handles a language change while a hint POST is in flight.
        selected = all_word_hints(exercise.source_ru, stored, canonical, exercise.target_hints_json.get('source_versions'))
        resolved = resolve_hint(selected, word)
        hint = WordHint.model_validate(resolved) if resolved else None
        if hint is None:
            raise WordHintNotFoundError(word)
        normalized = normalize_ru(hint.word_ru)
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
        from app.services.source_versions import read_versions
        return ReviewPhraseResponse(
            id=item.id,
            source_ru=item.source_ru,
            source_versions=read_versions(item.source_versions_json or {}, item.source_ru, next(iter(item.intended_sr_variants_json), "")),
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
