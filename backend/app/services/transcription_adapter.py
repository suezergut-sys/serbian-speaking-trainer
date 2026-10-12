from __future__ import annotations

from functools import lru_cache
from hashlib import sha256
from typing import Protocol

from openai import OpenAI, APIConnectionError, APITimeoutError, APIStatusError
from pydantic import ValidationError

from app.config import Settings, get_settings
from app.schemas import TranscriptionResponse
from app.request_metrics import measure_ai_call
from app.services.ai_adapter import load_prompt
from app.services.serbian_text import has_unexpected_letter_script
from app.services.model_debug import capture_model_call


class TranscriptionServiceError(RuntimeError):
    """Safe application-level error for unavailable speech transcription."""

    def __init__(self, code: str = "transcription_unavailable") -> None:
        self.code = code if code in {
            "transcription_unavailable", "transcription_not_configured", "transcription_timeout",
            "transcription_connection", "transcription_empty", "transcription_invalid_response",
            "transcription_unexpected_script", "transcription_audio_rejected",
            "transcription_provider_auth", "transcription_rate_limit", "transcription_provider_error",
        } else "transcription_unavailable"
        super().__init__(self.code)


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
            raise TranscriptionServiceError("transcription_not_configured")
        if self._client is None:
            self._client = OpenAI(
                api_key=self.settings.openai_api_key,
                timeout=self.settings.openai_timeout_seconds,
                max_retries=self.settings.openai_max_retries,
            )
        return self._client

    def transcribe(self, *, audio: bytes, filename: str, content_type: str) -> TranscriptionResponse:
        try:
            language_options = ({"languages": ["sr"]} if self.settings.openai_transcribe_language_parameter == "languages"
                                else {"language": "sr"})
            for retry in range(2):
                prompt = load_prompt("speech_transcription_v2.md" if retry == 0 else "speech_transcription_script_retry_v2.md")
                with capture_model_call("audio.transcriptions" if retry == 0 else "audio.transcriptions.script_retry",
                    self.settings.openai_transcribe_model or "", {
                        "model": self.settings.openai_transcribe_model, **language_options, "prompt": prompt,
                        "response_format": "json", "content_type": content_type, "audio_bytes": len(audio),
                        "audio_sha256": sha256(audio).hexdigest(),
                    }, self.settings.openai_api_key) as debug, measure_ai_call():
                    debug.attach_audio(audio, content_type)
                    create = (self.client.audio.transcriptions.with_raw_response.create
                              if debug.enabled and isinstance(self.client, OpenAI) else self.client.audio.transcriptions.create)
                    response = create(
                        file=(filename, audio, content_type),
                        model=self.settings.openai_transcribe_model,
                        **language_options,
                        prompt=prompt,
                        response_format="json",
                    )
                    if debug.enabled and isinstance(self.client, OpenAI):
                        debug.raw_received(response)
                        response = response.parse()
                    else:
                        debug.received(response)
                if not response.text.strip():
                    raise TranscriptionServiceError("transcription_empty")
                transcript = TranscriptionResponse(text=response.text.strip())
                if not has_unexpected_letter_script(transcript.text):
                    return transcript
            return TranscriptionResponse(text=transcript.text, review_required=True)
        except TranscriptionServiceError:
            raise
        except APITimeoutError as exc:
            raise TranscriptionServiceError("transcription_timeout") from exc
        except APIConnectionError as exc:
            raise TranscriptionServiceError("transcription_connection") from exc
        except APIStatusError as exc:
            code = {
                400: "transcription_audio_rejected", 413: "transcription_audio_rejected",
                401: "transcription_provider_auth", 403: "transcription_provider_auth",
                429: "transcription_rate_limit",
            }.get(exc.status_code, "transcription_provider_error")
            raise TranscriptionServiceError(code) from exc
        except (ValidationError, AttributeError, TypeError) as exc:
            raise TranscriptionServiceError("transcription_invalid_response") from exc
        except Exception as exc:
            raise TranscriptionServiceError() from exc


@lru_cache
def get_transcription_provider() -> OpenAITranscriptionProvider:
    return OpenAITranscriptionProvider(get_settings())
