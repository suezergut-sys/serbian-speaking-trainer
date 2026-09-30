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


def serbian_latin(text: str) -> str:
    """Use one Unicode form and Serbian Latin script for internal comparison."""
    return unicodedata.normalize("NFC", text).translate(_CYRILLIC_TO_LATIN)


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
    return re.sub(r"[\W_]+", " ", serbian_latin(text).casefold()).strip()
