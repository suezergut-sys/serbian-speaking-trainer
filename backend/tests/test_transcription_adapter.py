from types import SimpleNamespace
from unittest.mock import Mock

import httpx
import pytest
from openai import APIConnectionError, APITimeoutError, APIStatusError

from app.config import Settings
from app.services.transcription_adapter import OpenAITranscriptionProvider, TranscriptionServiceError


@pytest.mark.parametrize("failure, code", [
    (APITimeoutError(request=httpx.Request("POST", "https://example.invalid")), "transcription_timeout"),
    (APIConnectionError(request=httpx.Request("POST", "https://example.invalid")), "transcription_connection"),
    (RuntimeError("private provider body"), "transcription_unavailable"),
])
def test_provider_errors_are_classified_without_exposing_details(failure, code):
    provider = OpenAITranscriptionProvider(Settings(openai_api_key="secret", openai_transcribe_model="env-model"))
    provider._client = SimpleNamespace(audio=SimpleNamespace(transcriptions=SimpleNamespace(create=Mock(side_effect=failure))))
    with pytest.raises(TranscriptionServiceError) as caught:
        provider.transcribe(audio=b"synthetic", filename="speech.webm", content_type="audio/webm")
    assert caught.value.code == code
    assert "private" not in str(caught.value)


@pytest.mark.parametrize("status, code", [
    (400, "transcription_audio_rejected"), (401, "transcription_provider_auth"),
    (403, "transcription_provider_auth"), (429, "transcription_rate_limit"),
    (500, "transcription_provider_error"),
])
def test_provider_http_errors(status, code):
    request = httpx.Request("POST", "https://example.invalid")
    failure = APIStatusError("private", response=httpx.Response(status, request=request), body={"secret": "private"})
    test_provider_errors_are_classified_without_exposing_details(failure, code)


@pytest.mark.parametrize("response, code", [
    (SimpleNamespace(text="  "), "transcription_empty"),
    (SimpleNamespace(text="x" * 1201), "transcription_invalid_response"),
    (SimpleNamespace(text=None), "transcription_invalid_response"),
    (SimpleNamespace(), "transcription_invalid_response"),
])
def test_invalid_or_empty_model_response(response, code):
    provider = OpenAITranscriptionProvider(Settings(openai_api_key="secret", openai_transcribe_model="env-model"))
    provider._client = SimpleNamespace(audio=SimpleNamespace(transcriptions=SimpleNamespace(create=Mock(return_value=response))))
    with pytest.raises(TranscriptionServiceError) as caught:
        provider.transcribe(audio=b"synthetic", filename="speech.webm", content_type="audio/webm")
    assert caught.value.code == code
