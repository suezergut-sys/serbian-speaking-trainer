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


@pytest.mark.parametrize("valid", ["Želeo bih jaku kafu.", "Желео бих јаку кафу."])
def test_unexpected_script_retries_once_using_same_memory_buffer(valid):
    provider = OpenAITranscriptionProvider(Settings(_env_file=None, openai_api_key="secret", openai_transcribe_model="env-model"))
    create = Mock(side_effect=[SimpleNamespace(text="Θέλω καφέ"), SimpleNamespace(text=valid)])
    provider._client = SimpleNamespace(audio=SimpleNamespace(transcriptions=SimpleNamespace(create=create)))
    audio = b"synthetic"
    result = provider.transcribe(audio=audio, filename="speech.webm", content_type="audio/webm")
    assert result.text == valid
    assert create.call_count == 2
    first, second = [call.kwargs for call in create.call_args_list]
    assert first["file"][1] is audio and second["file"][1] is audio
    assert first["model"] == second["model"] == "env-model"
    assert first["languages"] == second["languages"] == ["sr"]
    assert "language" not in first and "language" not in second
    assert first["prompt"] != second["prompt"]
    assert "Ne prevodi" in second["prompt"]


@pytest.mark.parametrize("text", ["Θέλω καφέ", "Платячу банковном картицом."])
def test_unexpected_script_retry_is_bounded_and_returns_reviewable_text(text):
    provider = OpenAITranscriptionProvider(Settings(openai_api_key="secret", openai_transcribe_model="env-model"))
    create = Mock(return_value=SimpleNamespace(text=text))
    provider._client = SimpleNamespace(audio=SimpleNamespace(transcriptions=SimpleNamespace(create=create)))
    result = provider.transcribe(audio=b"synthetic", filename="speech.webm", content_type="audio/webm")
    assert result.text == text
    assert result.review_required is True
    assert create.call_count == 2


def test_valid_transcription_does_not_retry_or_correct_spoken_errors():
    provider = OpenAITranscriptionProvider(Settings(openai_api_key="secret", openai_transcribe_model="env-model"))
    create = Mock(return_value=SimpleNamespace(text="Potreben nam je pisani ugovor."))
    provider._client = SimpleNamespace(audio=SimpleNamespace(transcriptions=SimpleNamespace(create=create)))
    assert provider.transcribe(audio=b"synthetic", filename="speech.webm", content_type="audio/webm").text == "Potreben nam je pisani ugovor."
    create.assert_called_once()


def test_timeout_during_script_retry_keeps_safe_timeout_error():
    provider = OpenAITranscriptionProvider(Settings(openai_api_key="secret", openai_transcribe_model="env-model"))
    create = Mock(side_effect=[SimpleNamespace(text="Θέλω καφέ"), APITimeoutError(request=httpx.Request("POST", "https://example.invalid"))])
    provider._client = SimpleNamespace(audio=SimpleNamespace(transcriptions=SimpleNamespace(create=create)))
    with pytest.raises(TranscriptionServiceError) as caught:
        provider.transcribe(audio=b"synthetic", filename="speech.webm", content_type="audio/webm")
    assert caught.value.code == "transcription_timeout"
    assert create.call_count == 2


def test_legacy_language_parameter_is_explicitly_configurable():
    provider = OpenAITranscriptionProvider(Settings(openai_api_key="secret", openai_transcribe_model="env-model",
        openai_transcribe_language_parameter="language"))
    create = Mock(return_value=SimpleNamespace(text="Moj odgovor."))
    provider._client = SimpleNamespace(audio=SimpleNamespace(transcriptions=SimpleNamespace(create=create)))
    provider.transcribe(audio=b"synthetic", filename="speech.webm", content_type="audio/webm")
    assert create.call_args.kwargs["language"] == "sr"
    assert "languages" not in create.call_args.kwargs
    assert "a b c č ć d đ" in create.call_args.kwargs["prompt"]


@pytest.mark.parametrize("parameter", ["language", "languages"])
@pytest.mark.parametrize("alphabet", ["latin", "cyrillic"])
def test_real_sdk_serializes_language_and_script_prompt(parameter, alphabet):
    from openai import OpenAI
    requests = []

    def respond(request):
        requests.append(request.read().decode("utf-8"))
        return httpx.Response(200, json={"text": "Želim kafu."})

    provider = OpenAITranscriptionProvider(Settings(_env_file=None, openai_api_key="synthetic-key",
        openai_transcribe_model="env-model", openai_transcribe_language_parameter=parameter), alphabet)
    provider._client = OpenAI(api_key="synthetic-key", max_retries=0,
        http_client=httpx.Client(transport=httpx.MockTransport(respond)))
    try:
        assert provider.transcribe(audio=b"synthetic", filename="speech.webm", content_type="audio/webm").text == "Želim kafu."
        assert len(requests) == 1
        field = "languages[]" if parameter == "languages" else "language"
        assert f'name="{field}"' in requests[0]
        assert ("српском ћирилицом" if alphabet == "cyrillic" else "srpskom latinicom") in requests[0]
    finally:
        provider._client.close()
