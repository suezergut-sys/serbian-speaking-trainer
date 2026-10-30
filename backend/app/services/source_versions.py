"""Validated bilingual presentation; original sources and Serbian evidence stay intact."""
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.models import Exercise
from app.repositories.source_versions import SourceVersionRepository
from app.schemas.exercises import BilingualPhrasePreparation, SourceVersions, WordHint
from app.services.ai_adapter import AIServiceError, StructuredAIProvider
from app.services.hint_alignment import aligned_word_hints
from app.services.interface_language import interface_language
from app.services.word_hints import preset_english_source, english_word_hints


class SourceLanguageUnavailableError(RuntimeError):
    pass


def source_matches_language(source: str, language: str) -> bool:
    cyrillic = any('\u0400' <= ch <= '\u052f' for ch in source)
    return cyrillic if language == 'ru' else not cyrillic and any('a' <= ch.lower() <= 'z' for ch in source)


def preparation_versions(ai: StructuredAIProvider, source: str, canonical: str | None = None) -> BilingualPhrasePreparation:
    if not ai.is_available:
        raise SourceLanguageUnavailableError
    try:
        candidate = ai.prepare_phrase(source_ru=source, canonical_sr=canonical)
        result = BilingualPhrasePreparation.model_validate(candidate.model_dump() if hasattr(candidate, 'model_dump') else candidate)
        if canonical and next(iter(result.intended_sr_variants), '') != canonical:
            raise SourceLanguageUnavailableError
        if source not in (result.source_versions.ru, result.source_versions.en):
            raise SourceLanguageUnavailableError
        canonical = canonical or next(iter(result.intended_sr_variants), '')
        for language in ('ru', 'en'):
            hints = getattr(result.source_versions, 'hints_' + language)
            setattr(result.source_versions, 'hints_' + language, [WordHint.model_validate(item) for item in aligned_word_hints(
                getattr(result.source_versions, language), canonical, [hint.model_dump() for hint in hints])])
        return result
    except (AIServiceError, ValidationError) as exc:
        raise SourceLanguageUnavailableError from exc


def version_payload(source: str, canonical: str, versions: SourceVersions) -> dict:
    return {'source': source, 'canonical_sr': canonical, 'versions': versions.model_dump()}


def read_versions(payload: dict, source: str, canonical: str) -> SourceVersions | None:
    if payload.get('source') != source or payload.get('canonical_sr') != canonical:
        return None
    try:
        return SourceVersions.model_validate(payload['versions'])
    except (KeyError, ValidationError):
        return None


def exercise_versions(exercise: Exercise) -> SourceVersions | None:
    canonical = exercise.target_hints_json.get('canonical_sr') or next(iter(exercise.target_hints_json.get('intended_sr_variants', [])), '')
    cached = read_versions(exercise.target_hints_json.get('source_versions', {}), exercise.source_ru, canonical)
    if cached is not None:
        return cached
    english = preset_english_source(exercise.source_ru, canonical)
    if english is None:
        return None
    return SourceVersions(ru=exercise.source_ru, en=english,
        hints_ru=aligned_word_hints(exercise.source_ru, canonical, list(exercise.target_hints_json.get('word_hints', []))),
        hints_en=aligned_word_hints(english, canonical, english_word_hints(exercise.source_ru, canonical) or []))


def exercise_source(exercise: Exercise, language: str) -> str:
    versions = exercise_versions(exercise)
    if versions is not None:
        return getattr(versions, language)
    if source_matches_language(exercise.source_ru, language):
        return exercise.source_ru
    raise SourceLanguageUnavailableError


class SourceLanguageService:
    def __init__(self, db: Session, ai: StructuredAIProvider, user_id: str):
        self.repo = SourceVersionRepository(db, user_id)
        self.ai = ai

    def ensure(self, exercise: Exercise) -> SourceVersions | None:
        versions = exercise_versions(exercise)
        if versions is not None:
            return versions
        phrase = self.repo.exercise_phrase(exercise)
        canonical = exercise.target_hints_json.get('canonical_sr') or next(iter(exercise.target_hints_json.get('intended_sr_variants', [])), '')
        if phrase is not None:
            versions = read_versions(phrase.source_versions_json or {}, exercise.source_ru, canonical)
        if versions is None:
            if not self.ai.is_available and source_matches_language(exercise.source_ru, interface_language.get()):
                return None  # Legacy native-language exercise remains usable without AI.
            versions = preparation_versions(self.ai, exercise.source_ru, canonical).source_versions
        self.repo.cache(exercise, phrase, version_payload(exercise.source_ru, canonical, versions))
        return versions
