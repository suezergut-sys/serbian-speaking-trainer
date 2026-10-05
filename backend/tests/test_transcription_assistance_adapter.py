import json
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from app.config import Settings
from app.schemas.transcriptions import TranscriptionAssistanceAnalysis
from app.services.ai_adapter import AIServiceError
from app.services.transcription_assistance_adapter import OpenAITranscriptionAssistanceProvider


def test_structured_text_analysis_uses_env_model_and_short_separate_budget():
    provider = OpenAITranscriptionAssistanceProvider(Settings(
        openai_api_key="server-secret", openai_text_model="env-text-model",
        openai_assistance_timeout_seconds=4, openai_assistance_max_retries=1,
    ))
    assert provider.client.max_retries == 1
    assert provider.client.timeout == 4
    provider.client.close()
    parse = Mock(return_value=SimpleNamespace(output_parsed={"acceptable_variant": True, "candidates": []}))
    provider._client = SimpleNamespace(responses=SimpleNamespace(parse=parse))
    result = provider.analyze(source_ru="Задание", raw_text="Текст", canonical_sr="Эталон", intended_sr_variants=["Вариант"])
    assert isinstance(result, TranscriptionAssistanceAnalysis) and result.acceptable_variant
    args = parse.call_args.kwargs
    assert args["model"] == "env-text-model" and args["store"] is False
    assert args["text_format"] is TranscriptionAssistanceAnalysis
    assert json.loads(args["input"]) == {"source_ru": "Задание", "raw_text": "Текст", "canonical_sr": "Эталон", "intended_sr_variants": ["Вариант"]}
    assert "Аудио тебе не передано" in args["instructions"]
    assert "server-secret" not in json.dumps(args, default=str)


@pytest.mark.parametrize("parsed", [None, {"text": "free text"}, {"acceptable_variant": False, "candidates": [{"original": "bad"}]}])
def test_invalid_structured_output_and_refusal_fail_safely(parsed):
    provider = OpenAITranscriptionAssistanceProvider(Settings(openai_api_key="server-secret", openai_text_model="env-model"))
    provider._client = SimpleNamespace(responses=SimpleNamespace(parse=Mock(return_value=SimpleNamespace(output_parsed=parsed))))
    with pytest.raises(AIServiceError):
        provider.analyze(source_ru="Задание", raw_text="Текст", canonical_sr=None, intended_sr_variants=[])


def test_timeout_and_sdk_errors_are_wrapped_without_user_text():
    provider = OpenAITranscriptionAssistanceProvider(Settings(openai_api_key="server-secret", openai_text_model="env-model"))
    provider._client = SimpleNamespace(responses=SimpleNamespace(parse=Mock(side_effect=TimeoutError("private transcript"))))
    with pytest.raises(AIServiceError, match="OpenAI request failed") as caught:
        provider.analyze(source_ru="Задание", raw_text="Текст", canonical_sr=None, intended_sr_variants=[])
    assert "private" not in str(caught.value)
