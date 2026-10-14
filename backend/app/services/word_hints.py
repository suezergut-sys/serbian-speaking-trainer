"""Choose independent hint dictionaries without changing canonical exercise data."""
from app.db.topic_phrase_hints_en import ENGLISH_WORD_HINTS
from app.db.topic_phrases_en import TOPIC_PHRASES_EN
from app.services.interface_language import interface_language


def english_word_hints(source: str) -> list[dict[str, str]] | None:
    english_source = TOPIC_PHRASES_EN.get(source, source)
    hints = ENGLISH_WORD_HINTS.get(english_source)
    if hints is None:
        return None
    # Legacy API field names support both source languages.
    return [{"word_ru": word, "translation_sr": translation} for word, translation in hints.items()]


def word_hints_for_language(source: str, stored: list[dict[str, str]]) -> list[dict[str, str]]:
    if interface_language.get() == "en":
        english = english_word_hints(source)
        if english is not None:
            return english
    return stored


def all_word_hints(source: str, stored: list[dict[str, str]]) -> list[dict[str, str]]:
    # A learner can switch language after opening hints within the same exercise.
    # Validate each submitted word against a real dictionary, never against user text.
    return [*stored, *(english_word_hints(source) or [])]
