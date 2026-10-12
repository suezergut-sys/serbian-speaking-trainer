from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.config import Settings
from app.repositories import ExerciseRepository
from app.schemas import TranscriptionResponse
from app.schemas.transcriptions import TranscriptionAssistanceAnalysis
from app.services.ai_adapter import AIServiceError
from app.services.transcription_assistance_adapter import TranscriptionAssistanceProvider
from pydantic import ValidationError
from app.services.transcription_adapter import TranscriptionProvider, TranscriptionServiceError
from app.services.serbian_text import has_unexpected_letter_script, serbian_latin
from app.services.transcription_assistance import POLICY_VERSION, validate_analysis
from app.repositories.transcriptions import TranscriptionReceiptRepository

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
    def __init__(self, db: Session, provider: TranscriptionProvider, settings: Settings, user_id: str,
                 assistance_provider: TranscriptionAssistanceProvider) -> None:
        self.exercises = ExerciseRepository(db, user_id)
        self.provider = provider
        self.settings = settings
        self.db = db
        self.receipts = TranscriptionReceiptRepository(db, user_id)
        self.assistance_provider = assistance_provider

    def transcribe(self, *, exercise_id: str, audio: UploadFile, assistance_enabled: bool = False) -> TranscriptionResponse:
        exercise = self.exercises.get_owned(exercise_id)
        if exercise is None:
            raise TranscriptionExerciseNotFoundError(exercise_id)
        if not self.provider.is_available:
            raise TranscriptionServiceError("transcription_not_configured")

        content_type = (audio.content_type or "").split(";", 1)[0].lower()
        extension = ALLOWED_AUDIO_TYPES.get(content_type)
        if extension is None:
            raise UnsupportedAudioTypeError(content_type)

        payload = audio.file.read(self.settings.max_audio_bytes + 1)
        if not payload:
            raise EmptyAudioError()
        if len(payload) > self.settings.max_audio_bytes:
            raise AudioTooLargeError()

        # Normal requests keep bytes in memory; authorized debug capture may retain them temporarily.
        try:
            result = self.provider.transcribe(
                audio=payload, filename=f"speech{extension}", content_type=content_type,
            )
        finally:
            del payload
            audio.file.close()
        if has_unexpected_letter_script(result.text) or result.review_required:
            # Preserve the original spelling for manual review; never run assistance or scoring.
            return TranscriptionResponse(text=result.text, review_required=True)
        raw = serbian_latin(result.text)
        if not assistance_enabled:
            return TranscriptionResponse(text=raw)
        variants = list(exercise.target_hints_json.get("intended_sr_variants", []))
        canonical = exercise.target_hints_json.get("canonical_sr")
        if canonical:
            variants.append(str(canonical))
        if not self.assistance_provider.is_available:
            return TranscriptionResponse(text=raw, raw_text=raw, assistance_status="unavailable")
        try:
            analysis = TranscriptionAssistanceAnalysis.model_validate(self.assistance_provider.analyze(
                source_ru=exercise.source_ru, raw_text=raw,
                canonical_sr=serbian_latin(str(canonical)) if canonical else None,
                intended_sr_variants=[serbian_latin(v) for v in variants],
            ))
            changes = validate_analysis(raw, [serbian_latin(v) for v in variants], analysis)
        except (AIServiceError, ValidationError, ValueError):
            return TranscriptionResponse(text=raw, raw_text=raw, assistance_status="unavailable")
        receipt = self.receipts.add(exercise_id, raw, [c.model_dump() for c in changes], POLICY_VERSION)
        response = TranscriptionResponse(text=raw, raw_text=raw, transcription_id=receipt.id,
            policy_version=POLICY_VERSION, changes=changes, assistance_status="analyzed")
        self.db.commit()
        return response


def serbian_cyrillic_to_latin(text: str) -> str:
    return serbian_latin(text)
