"""Bounded text-only assistance; never changes STT or calls a second model."""
import re

from app.schemas.transcriptions import TranscriptionChange

POLICY_VERSION = "local-v1"
# Whole reviewed forms only: never remove doubled consonants globally.
ORTHOGRAPHY = {"allergičan": "alergičan", "allergična": "alergična", "allergično": "alergično"}
FOLD = str.maketrans({"č": "c", "ć": "c", "š": "s", "ž": "z", "đ": "d"})


def words(text: str):
    return list(re.finditer(r"[^\W\d_]+", text, re.UNICODE))


def apply_changes(raw: str, changes: list[TranscriptionChange], selected: set[int]) -> str:
    result = raw
    for index in range(len(changes) - 1, -1, -1):
        change = changes[index]
        if index in selected:
            result = result[:change.start] + change.replacement + result[change.end:]
    return result


def propose(raw: str, variants: list[str]) -> list[TranscriptionChange]:
    tokens = words(raw)
    changes: list[TranscriptionChange] = []
    for token in tokens:
        replacement = ORTHOGRAPHY.get(token.group().casefold())
        if replacement:
            if token.group()[0].isupper():
                replacement = replacement.capitalize()
            changes.append(TranscriptionChange(start=token.start(), end=token.end(), original=token.group(),
                replacement=replacement, kind="orthography_artifact", action="applied", reason_code="reviewed_spelling"))
            if len(changes) == 3:
                return changes
    corrected = apply_changes(raw, changes, set(range(len(changes))))
    # A valid alternate translation must not be nudged towards another variant.
    current = [m.group().casefold() for m in words(corrected)]
    candidates = [[m.group().casefold() for m in words(v)] for v in variants
                  if re.findall(r"\d+", v) == re.findall(r"\d+", raw)]
    if current in candidates:
        return changes
    for index, token in enumerate(tokens):
        if any(c.start == token.start() for c in changes):
            continue
        original = token.group().casefold()
        options: dict[str, str] = {}
        for candidate in candidates:
            if len(candidate) != len(current):
                continue
            # Require the entire surrounding sentence to match, preserving negation,
            # missing words and alternate syntax. Only one uncertain token at a time.
            if any(a != b for i, (a, b) in enumerate(zip(current, candidate)) if i != index):
                continue
            replacement = candidate[index]
            if replacement == original:
                continue
            if original.translate(FOLD) == replacement.translate(FOLD):
                options[replacement] = "phonetic_ambiguity"
            elif len(original) > 3 and original[:-1] == replacement[:-1] and {original[-1], replacement[-1]} == {"i", "e"}:
                options[replacement] = "ending_ambiguity"
        # Multiple valid resolutions: do not guess.
        if len(options) == 1:
            replacement, kind = next(iter(options.items()))
            if token.group()[0].isupper():
                replacement = replacement.capitalize()
            changes.append(TranscriptionChange(start=token.start(), end=token.end(), original=token.group(),
                replacement=replacement, kind=kind, action="suggested", reason_code="confirm_ambiguous_sound"))
        if len(changes) == 3:
            break
    return sorted(changes, key=lambda change: change.start)
