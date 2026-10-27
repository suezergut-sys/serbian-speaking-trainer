"""Validate short source fragments against the canonical answer, never a glossary."""
import re

from app.schemas.exercises import WordHint
from app.services.serbian_text import serbian_latin

WORD = re.compile(r"[^\W_]+(?:[-'’][^\W_]+)*", re.UNICODE)
MAX_SOURCE_WORDS = 4
MAX_TARGET_WORDS = 5


def words(text: str) -> list[str]:
    return WORD.findall(text.casefold())


def aligned_word_hints(source: str, canonical: str, hints: list[dict[str, str]]) -> list[dict[str, str]]:
    """Fail closed on absent, long, conflicting or overlapping fragments.

    This is structural validation, not semantic translation. Curated data and the
    preparation prompt supply meaning. Identical repeated keys share one hint;
    conflicting translations of a repeated key are withheld rather than guessed.
    """
    target = words(serbian_latin(canonical))
    source_matches = list(WORD.finditer(source))
    source_words = [match.group().casefold() for match in source_matches]
    candidates: dict[str, tuple[dict[str, str], list[tuple[int, int]]]] = {}
    conflicts: set[str] = set()
    for raw in hints:
        hint = WordHint.model_validate(raw).model_dump()
        key = hint["word_ru"].strip().casefold()
        fragment = words(key)
        translation = words(serbian_latin(hint["translation_sr"]))
        if not 1 <= len(fragment) <= MAX_SOURCE_WORDS or not 1 <= len(translation) <= MAX_TARGET_WORDS:
            continue
        # Compare complete tokens, preserving diacritics; mi must not match nemam.
        if not any(target[i:i + len(translation)] == translation for i in range(len(target))):
            continue
        spans = [(i, i + len(fragment)) for i in range(len(source_words))
                 if source_words[i:i + len(fragment)] == fragment
                 and source[source_matches[i].start():source_matches[i + len(fragment) - 1].end()].casefold() == key]
        if not spans:
            continue
        if key in candidates and words(candidates[key][0]["translation_sr"]) != words(hint["translation_sr"]):
            conflicts.add(key)
        candidates[key] = ({"word_ru": key, "translation_sr": hint["translation_sr"].strip()}, spans)
    occupied: set[int] = set()
    selected: list[tuple[int, dict[str, str]]] = []
    for key, (hint, spans) in sorted(candidates.items(), key=lambda item: -len(words(item[0]))):
        if key in conflicts or any(set(range(start, end)) & occupied for start, end in spans):
            continue
        for start, end in spans:
            occupied.update(range(start, end))
        selected.append((spans[0][0], hint))
    return [hint for _, hint in sorted(selected, key=lambda item: item[0])]
