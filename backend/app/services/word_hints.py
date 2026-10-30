"""Choose independent hint dictionaries without changing canonical exercise data."""
from app.db.topic_phrase_hints_en import ENGLISH_WORD_HINTS
from app.db.topic_phrases_en import TOPIC_PHRASES_EN
from app.db.topic_phrases import TOPIC_PHRASES
from app.services.interface_language import interface_language
from app.services.hint_alignment import aligned_word_hints, words


_CANONICAL_BY_SOURCE = {p.source_ru: p.canonical_sr for p in TOPIC_PHRASES}


def preset_english_source(source: str, canonical: str) -> str | None:
    return TOPIC_PHRASES_EN.get(source) if _CANONICAL_BY_SOURCE.get(source) == canonical else None


def english_word_hints(source: str, canonical: str | None = None) -> list[dict[str, str]] | None:
    if canonical is not None and preset_english_source(source, canonical) is None:
        return None
    english_source = TOPIC_PHRASES_EN.get(source, source)
    hints = ENGLISH_WORD_HINTS.get(english_source)
    if hints is None:
        return None
    # Legacy API field names support both source languages.
    return [{"word_ru": word, "translation_sr": translation} for word, translation in hints.items()]


def word_hints_for_language(source: str, stored: list[dict[str, str]], canonical: str | None = None) -> list[dict[str, str]]:
    if interface_language.get() == "en":
        english = english_word_hints(source, canonical)
        if english is not None:
            return aligned_word_hints(TOPIC_PHRASES_EN.get(source, source), canonical, english) if canonical is not None else english
    return aligned_word_hints(source, canonical, stored) if canonical is not None else stored


def all_word_hints(source: str, stored: list[dict[str, str]], canonical: str | None = None, versions: dict | None = None) -> list[dict[str, str]]:
    # A learner can switch language after opening hints within the same exercise.
    # Validate each submitted word against a real dictionary, never against user text.
    english = english_word_hints(source, canonical) or []
    if canonical is not None:
        stored = aligned_word_hints(source, canonical, stored)
        english = aligned_word_hints(TOPIC_PHRASES_EN.get(source, source), canonical, english)
    extra = []
    if versions:
        from app.services.source_versions import read_versions
        validated = read_versions(versions, source, canonical or '')
        if validated is not None:
            extra = [hint.model_dump() for hint in [*validated.hints_ru, *validated.hints_en]]
    return [*stored, *english, *extra]


def resolve_hint(hints: list[dict[str, str]], key: str) -> dict[str, str] | None:
    """Resolve legacy single-word requests to one unambiguous canonical fragment.

    Old APKs cannot send grouped keys. They can still receive the construction,
    and attempt finalization charges its canonical key once. Never guess between
    two constructions containing the same word.
    """
    requested = words(key)
    exact = next((hint for hint in hints if words(hint["word_ru"]) == requested), None)
    if exact is not None:
        return exact
    if len(requested) != 1:
        return None
    candidates = {hint["word_ru"]: hint for hint in hints if requested[0] in words(hint["word_ru"])}
    return next(iter(candidates.values())) if len(candidates) == 1 else None
