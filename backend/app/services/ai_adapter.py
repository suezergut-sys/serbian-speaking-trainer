from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Protocol

from openai import OpenAI

from app.config import Settings, get_settings
from app.schemas import AnswerAnalysis, ExerciseGenerationResult, PhrasePreparation, TopicContext, WordHint
from app.schemas.topics import TopicTitleTranslation
from app.schemas.transcriptions import TranscriptionAssistanceAnalysis
from app.schemas.attempts import ExplainedAnswerAnalysis
from app.request_metrics import measure_ai_call
from app.services.model_debug import capture_model_call
from app.services.interface_language import interface_language
from app.services.serbian_standard import validate_generated_serbian
from app.services.hint_alignment import aligned_word_hints

PROMPTS_DIR = Path(__file__).resolve().parents[1] / "prompts"


class AIServiceError(RuntimeError):
    """Safe application-level error for an unavailable or invalid AI response."""


class StructuredAIProvider(Protocol):
    @property
    def is_available(self) -> bool: ...

    def translate_topic_title(self, text: str) -> TopicTitleTranslation: ...

    def normalize_topic(self, text: str) -> TopicContext: ...

    def generate_exercise(
        self,
        *,
        topic: TopicContext,
        target_skills: list[dict[str, str]],
        recent_sources: list[str],
        retry_reason: str | None = None,
    ) -> ExerciseGenerationResult: ...

    def analyze_answer(
        self,
        *,
        source_ru: str,
        transcript_sr: str,
        canonical_sr: str | None,
        intended_sr_variants: list[str],
        target_skills: list[dict[str, str]],
        timings: dict[str, object],
    ) -> AnswerAnalysis: ...

    def prepare_phrase(self, *, source_ru: str, canonical_sr: str | None = None) -> PhrasePreparation: ...


@lru_cache
def load_prompt(name: str) -> str:
    return (PROMPTS_DIR / name).read_text(encoding="utf-8").strip()


class OpenAIStructuredProvider:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._client: OpenAI | None = None

    @property
    def is_available(self) -> bool:
        return bool(self.settings.openai_api_key and self.settings.openai_text_model)

    @property
    def client(self) -> OpenAI:
        if not self.is_available:
            raise AIServiceError("OpenAI text generation is not configured")
        if self._client is None:
            self._client = OpenAI(
                api_key=self.settings.openai_api_key,
                timeout=self.settings.openai_timeout_seconds,
                max_retries=self.settings.openai_max_retries,
            )
        return self._client

    def translate_topic_title(self, text: str) -> TopicTitleTranslation:
        return self._parse(
            prompt_name="topic_title_translation_v1.md",
            payload={"title": text, "interface_language": interface_language.get()},
            schema=TopicTitleTranslation,
        )

    def normalize_topic(self, text: str) -> TopicContext:
        payload = {"user_topic_ru": text, "target_level": "A2"}
        return self._parse(
            prompt_name="topic_normalizer.md",
            payload=payload,
            schema=TopicContext,
        )

    def generate_exercise(
        self,
        *,
        topic: TopicContext,
        target_skills: list[dict[str, str]],
        recent_sources: list[str],
        retry_reason: str | None = None,
    ) -> ExerciseGenerationResult:
        payload = {
            "topic": topic.model_dump(),
            "target_skills": target_skills,
            "recent_source_ru": recent_sources,
            "retry_reason": retry_reason,
        }
        return self._parse(
            prompt_name="exercise_generator_v2.md",
            payload=payload,
            schema=ExerciseGenerationResult,
        )

    def analyze_answer(
        self,
        *,
        source_ru: str,
        transcript_sr: str,
        canonical_sr: str | None,
        intended_sr_variants: list[str],
        target_skills: list[dict[str, str]],
        timings: dict[str, object],
    ) -> AnswerAnalysis:
        payload = {
            "source_text": source_ru,
            "feedback_language": interface_language.get(),
            "transcript_sr": transcript_sr,
            "canonical_sr": canonical_sr,
            "intended_sr_variants": intended_sr_variants,
            "target_skills": target_skills,
            "timings": timings,
            "target_level": "A2",
        }
        return self._parse(
            prompt_name="answer_analyzer_v4.md",
            payload=payload,
            schema=ExplainedAnswerAnalysis,
        )

    def prepare_phrase(self, *, source_ru: str, canonical_sr: str | None = None) -> PhrasePreparation:
        return self._parse(
            prompt_name="phrase_preparation_v3.md",
            payload={"source_ru": source_ru, "canonical_sr": canonical_sr, "target_level": "A2"},
            schema=PhrasePreparation,
        )

    def _parse(
        self,
        *,
        prompt_name: str,
        payload: dict[str, object],
        schema: type[TopicTitleTranslation] | type[TopicContext] | type[ExerciseGenerationResult] | type[AnswerAnalysis] | type[ExplainedAnswerAnalysis] | type[PhrasePreparation] | type[TranscriptionAssistanceAnalysis],
    ):
        try:
            instructions = load_prompt(prompt_name)
            if prompt_name == "answer_analyzer_v4.md" and interface_language.get() == "en":
                instructions += "\n\n" + load_prompt("feedback_language_en_v1.md")
            instructions += "\n\n" + load_prompt("serbian_ekavica_v1.md")
            input_json = json.dumps(payload, ensure_ascii=False)
            with capture_model_call(prompt_name, self.settings.openai_text_model or "", {
                "model": self.settings.openai_text_model, "instructions": instructions,
                "input": input_json, "text_format": schema.model_json_schema(), "store": False,
            }, self.settings.openai_api_key) as debug, measure_ai_call():
                parse = (self.client.responses.with_raw_response.parse
                         if debug.enabled and isinstance(self.client, OpenAI) else self.client.responses.parse)
                response = parse(
                    model=self.settings.openai_text_model,
                    instructions=instructions,
                    input=input_json,
                    text_format=schema,
                    store=False,
                )
                if debug.enabled and isinstance(self.client, OpenAI):
                    debug.raw_received(response, text_request=True)
                    response = response.parse()
                else:
                    debug.received(response)
            parsed = response.output_parsed
            if parsed is None:
                raise AIServiceError("OpenAI returned no structured output")
            result = schema.model_validate(parsed)
            validate_generated_serbian(result)
            if isinstance(result, (PhrasePreparation, ExerciseGenerationResult)):
                canonical = next(iter(result.intended_sr_variants), "")
                if payload.get("canonical_sr") and canonical != payload["canonical_sr"]:
                    raise AIServiceError("Canonical answer changed during hint preparation")
                source = str(payload.get("source_ru", getattr(result, "source_ru", "")))
                result.word_hints = [WordHint.model_validate(item) for item in aligned_word_hints(
                    source, canonical, [hint.model_dump() for hint in result.word_hints])]
            return result
        except AIServiceError:
            raise
        except Exception as exc:
            raise AIServiceError("OpenAI request failed") from exc


@lru_cache
def get_ai_provider() -> OpenAIStructuredProvider:
    return OpenAIStructuredProvider(get_settings())
