"""Text-only post-STT analysis using the configured text model and a short budget."""
from functools import lru_cache
from typing import Protocol

from app.config import Settings, get_settings
from app.schemas.transcriptions import TranscriptionAssistanceAnalysis
from app.services.ai_adapter import OpenAIStructuredProvider


class TranscriptionAssistanceProvider(Protocol):
    @property
    def is_available(self) -> bool: ...

    def analyze(self, *, source_ru: str, raw_text: str, canonical_sr: str | None,
                intended_sr_variants: list[str]) -> TranscriptionAssistanceAnalysis: ...


class OpenAITranscriptionAssistanceProvider(OpenAIStructuredProvider):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings.model_copy(update={
            "openai_timeout_seconds": settings.openai_assistance_timeout_seconds,
            "openai_max_retries": settings.openai_assistance_max_retries,
        }))

    def analyze(self, *, source_ru: str, raw_text: str, canonical_sr: str | None,
                intended_sr_variants: list[str]) -> TranscriptionAssistanceAnalysis:
        return self._parse(
            prompt_name="transcription_assistance_v3.md",
            payload={"source_ru": source_ru, "raw_text": raw_text, "canonical_sr": canonical_sr,
                     "intended_sr_variants": intended_sr_variants},
            schema=TranscriptionAssistanceAnalysis,
        )


@lru_cache
def get_transcription_assistance_provider() -> OpenAITranscriptionAssistanceProvider:
    return OpenAITranscriptionAssistanceProvider(get_settings())
