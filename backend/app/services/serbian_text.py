from __future__ import annotations

import re
import unicodedata


_CYRILLIC_TO_LATIN = str.maketrans({
    "А": "A", "Б": "B", "В": "V", "Г": "G", "Д": "D", "Ђ": "Đ", "Е": "E",
    "Ж": "Ž", "З": "Z", "И": "I", "Ј": "J", "К": "K", "Л": "L", "Љ": "Lj",
    "М": "M", "Н": "N", "Њ": "Nj", "О": "O", "П": "P", "Р": "R", "С": "S",
    "Т": "T", "Ћ": "Ć", "У": "U", "Ф": "F", "Х": "H", "Ц": "C", "Ч": "Č",
    "Џ": "Dž", "Ш": "Š",
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "ђ": "đ", "е": "e",
    "ж": "ž", "з": "z", "и": "i", "ј": "j", "к": "k", "л": "l", "љ": "lj",
    "м": "m", "н": "n", "њ": "nj", "о": "o", "п": "p", "р": "r", "с": "s",
    "т": "t", "ћ": "ć", "у": "u", "ф": "f", "х": "h", "ц": "c", "ч": "č",
    "џ": "dž", "ш": "š",
})

# A Russian keyboard can insert visually Latin letters inside an otherwise Latin
# word. These ambiguous letters need visual interpretation only in that context.
_VISUAL_CYRILLIC_TO_LATIN = str.maketrans({
    "А": "A", "В": "B", "Е": "E", "К": "K", "М": "M", "Н": "H",
    "О": "O", "Р": "P", "С": "C", "Т": "T", "У": "Y", "Х": "X",
    "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "у": "y", "х": "x",
})


def serbian_latin(text: str) -> str:
    """Use one Unicode form and Serbian Latin script for internal comparison."""
    return unicodedata.normalize("NFC", text).translate(_CYRILLIC_TO_LATIN)


def serbian_latin_for_evaluation(text: str) -> str:
    """Correct visual keyboard homoglyphs in Latin-dominant words only."""
    composed = unicodedata.normalize("NFC", text)

    def convert_token(token: str) -> str:
        latin = sum(
            unicodedata.category(char).startswith("L")
            and unicodedata.name(char, "").startswith("LATIN ")
            for char in token
        )
        cyrillic = sum(
            unicodedata.category(char).startswith("L")
            and unicodedata.name(char, "").startswith("CYRILLIC ")
            for char in token
        )
        if latin > cyrillic:
            token = token.translate(_VISUAL_CYRILLIC_TO_LATIN)
        return token.translate(_CYRILLIC_TO_LATIN)

    result: list[str] = []
    token: list[str] = []
    for char in composed:
        if unicodedata.category(char).startswith(("L", "M")):
            token.append(char)
        else:
            if token:
                result.append(convert_token("".join(token)))
                token.clear()
            result.append(char)
    if token:
        result.append(convert_token("".join(token)))
    return "".join(result)


def has_unexpected_letter_script(text: str) -> bool:
    """Allow Latin text and the Serbian Cyrillic alphabet, including mixed STT output."""
    for letter in unicodedata.normalize("NFC", text):
        if unicodedata.category(letter).startswith("L") and (
            ord(letter) not in _CYRILLIC_TO_LATIN
            and not unicodedata.name(letter, "").startswith("LATIN ")
        ):
            return True
    return False


def normalized_serbian_words(text: str) -> str:
    # Keep unfamiliar letters visible: dropping them could make a bad transcript
    # appear identical to the canonical answer.
    return re.sub(r"[\W_]+", " ", serbian_latin_for_evaluation(text).casefold()).strip()
