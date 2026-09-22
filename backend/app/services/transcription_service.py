from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.config import Settings
from app.repositories import ExerciseRepository
from app.schemas import TranscriptionResponse
from app.services.transcription_adapter import TranscriptionProvider, TranscriptionServiceError

ALLOWED_AUDIO_TYPES = {
    "audio/webm": ".webm",
    "audio/ogg": ".ogg",
    "audio/mp4": ".mp4",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
}


class TranscriptionExerciseNotFoundError(LookupError):
    pass


class UnsupportedAudioTypeError(ValueError):
    pass


class AudioTooLargeError(ValueError):
    pass


class EmptyAudioError(ValueError):
    pass


class TranscriptionService:
    def __init__(self, db: Session, provider: TranscriptionProvider, settings: Settings) -> None:
        self.exercises = ExerciseRepository(db)
        self.provider = provider
        self.settings = settings

    def transcribe(self, *, exercise_id: str, audio: UploadFile) -> TranscriptionResponse:
        if self.exercises.get(exercise_id) is None:
            raise TranscriptionExerciseNotFoundError(exercise_id)
        if not self.provider.is_available:
            raise TranscriptionServiceError("OpenAI transcription is not configured")

        content_type = (audio.content_type or "").split(";", 1)[0].lower()
        extension = ALLOWED_AUDIO_TYPES.get(content_type)
        if extension is None:
            raise UnsupportedAudioTypeError(content_type)

        payload = audio.file.read(self.settings.max_audio_bytes + 1)
        if not payload:
            raise EmptyAudioError()
        if len(payload) > self.settings.max_audio_bytes:
            raise AudioTooLargeError()

        # The bytes live only in this request and are never written to app storage.
        result = self.provider.transcribe(
            audio=payload,
            filename=f"speech{extension}",
            content_type=content_type,
        )
        return TranscriptionResponse(text=serbian_cyrillic_to_latin(result.text))


_SERBIAN_CYRILLIC_TO_LATIN = str.maketrans({
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


def serbian_cyrillic_to_latin(text: str) -> str:
    return text.translate(_SERBIAN_CYRILLIC_TO_LATIN)
