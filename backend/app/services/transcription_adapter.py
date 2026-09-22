from __future__ import annotations

from functools import lru_cache
from typing import Protocol

from openai import OpenAI

from app.config import Settings, get_settings
from app.schemas import TranscriptionResponse


class TranscriptionServiceError(RuntimeError):
    """Safe application-level error for unavailable speech transcription."""


class TranscriptionProvider(Protocol):
    @property
    def is_available(self) -> bool: ...

    def transcribe(self, *, audio: bytes, filename: str, content_type: str) -> TranscriptionResponse: ...


class OpenAITranscriptionProvider:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._client: OpenAI | None = None

    @property
    def is_available(self) -> bool:
        return bool(self.settings.openai_api_key and self.settings.openai_transcribe_model)

    @property
    def client(self) -> OpenAI:
        if not self.is_available:
            raise TranscriptionServiceError("OpenAI transcription is not configured")
        if self._client is None:
            self._client = OpenAI(
                api_key=self.settings.openai_api_key,
                timeout=self.settings.openai_timeout_seconds,
                max_retries=self.settings.openai_max_retries,
            )
        return self._client

    def transcribe(self, *, audio: bytes, filename: str, content_type: str) -> TranscriptionResponse:
        try:
            response = self.client.audio.transcriptions.create(
                file=(filename, audio, content_type),
                model=self.settings.openai_transcribe_model,
                language="sr",
                prompt=(
                    "Doslovan prepis govora na srpskom jeziku, latinicom. "
                    "Ne prevodi, ne ispravljaj i ne preformuliši izgovorene reči."
                ),
                response_format="json",
            )
            return TranscriptionResponse(text=response.text.strip())
        except TranscriptionServiceError:
            raise
        except Exception as exc:
            raise TranscriptionServiceError("OpenAI transcription request failed") from exc


@lru_cache
def get_transcription_provider() -> OpenAITranscriptionProvider:
    return OpenAITranscriptionProvider(get_settings())
