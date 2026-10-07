from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Protocol

from openai import OpenAI

from app.config import Settings, get_settings
from app.schemas import AnswerAnalysis, ExerciseGenerationResult, PhrasePreparation, TopicContext
from app.schemas.transcriptions import TranscriptionAssistanceAnalysis
from app.schemas.attempts import ExplainedAnswerAnalysis
from app.request_metrics import measure_ai_call

PROMPTS_DIR = Path(__file__).resolve().parents[1] / "prompts"


class AIServiceError(RuntimeError):
    """Safe application-level error for an unavailable or invalid AI response."""


class StructuredAIProvider(Protocol):
    @property
    def is_available(self) -> bool: ...

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
            prompt_name="exercise_generator.md",
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
            "source_ru": source_ru,
            "transcript_sr": transcript_sr,
            "canonical_sr": canonical_sr,
            "intended_sr_variants": intended_sr_variants,
            "target_skills": target_skills,
            "timings": timings,
            "target_level": "A2",
        }
        return self._parse(
            prompt_name="answer_analyzer_v2.md",
            payload=payload,
            schema=ExplainedAnswerAnalysis,
        )

    def prepare_phrase(self, *, source_ru: str, canonical_sr: str | None = None) -> PhrasePreparation:
        return self._parse(
            prompt_name="phrase_preparation.md",
            payload={"source_ru": source_ru, "canonical_sr": canonical_sr, "target_level": "A2"},
            schema=PhrasePreparation,
        )

    def _parse(
        self,
        *,
        prompt_name: str,
        payload: dict[str, object],
        schema: type[TopicContext] | type[ExerciseGenerationResult] | type[AnswerAnalysis] | type[ExplainedAnswerAnalysis] | type[PhrasePreparation] | type[TranscriptionAssistanceAnalysis],
    ):
        try:
            with measure_ai_call():
                response = self.client.responses.parse(
                    model=self.settings.openai_text_model,
                    instructions=load_prompt(prompt_name),
                    input=json.dumps(payload, ensure_ascii=False),
                    text_format=schema,
                    store=False,
                )
            parsed = response.output_parsed
            if parsed is None:
                raise AIServiceError("OpenAI returned no structured output")
            return schema.model_validate(parsed)
        except AIServiceError:
            raise
        except Exception as exc:
            raise AIServiceError("OpenAI request failed") from exc


@lru_cache
def get_ai_provider() -> OpenAIStructuredProvider:
    return OpenAIStructuredProvider(get_settings())
