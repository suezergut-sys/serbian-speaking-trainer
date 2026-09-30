from __future__ import annotations

import re
from difflib import SequenceMatcher

from pydantic import ValidationError

from app.config import Settings, get_settings
from app.schemas import AnswerAnalysis, AnswerIssue, CreateAttemptRequest, DemonstratedSkill
from app.services.ai_adapter import AIServiceError, StructuredAIProvider


class AnalysisUnavailableError(RuntimeError):
    pass


class AnswerAnalyzer:
    def __init__(self, ai: StructuredAIProvider, settings: Settings | None = None) -> None:
        self.ai = ai
        self.settings = settings or get_settings()

    def analyze(
        self,
        *,
        source_ru: str,
        transcript_sr: str,
        intended_sr_variants: list[str],
        target_skills: list[dict[str, str]],
        timing: CreateAttemptRequest,
        canonical_sr: str | None = None,
    ) -> AnswerAnalysis:
        target_keys = list(dict.fromkeys(skill["key"] for skill in target_skills))
        normalized_transcript = self._normalize(transcript_sr)
        exact_variant = next(
            (
                variant
                for variant in intended_sr_variants
                if normalized_transcript == self._normalize(variant)
            ),
            None,
        )
        if exact_variant is not None:
            return self._exact_match(exact_variant, intended_sr_variants, target_keys, timing)

        if not self.ai.is_available:
            raise AnalysisUnavailableError
        try:
            analysis = AnswerAnalysis.model_validate(
                self.ai.analyze_answer(
                    source_ru=source_ru,
                    transcript_sr=transcript_sr,
                    canonical_sr=canonical_sr,
                    intended_sr_variants=intended_sr_variants,
                    target_skills=target_skills,
                    timings=self._timing_payload(timing),
                )
            )
        except (AIServiceError, ValidationError) as exc:
            raise AnalysisUnavailableError from exc

        fluency = self._local_fluency(timing, analysis.fluency_score)
        issues = [
            issue
            for issue in analysis.issues
            if issue.skill_key in target_keys
            and issue.severity > 0
            and (
                issue.correction is None
                or self._normalize(issue.evidence) != self._normalize(issue.correction)
            )
        ]
        demonstrated = [skill for skill in analysis.demonstrated_skills if skill.skill_key in target_keys]
        demonstrated_keys = {skill.skill_key for skill in demonstrated}
        default_result = {"correct": "strong", "mostly_correct": "weak", "needs_work": "failed"}[analysis.verdict]
        demonstrated.extend(
            DemonstratedSkill(skill_key=key, result=default_result, confidence=0.6)
            for key in target_keys
            if key not in demonstrated_keys
        )
        analysis = analysis.model_copy(
            update={
                "pronunciation_score": None,
                "fluency_score": fluency,
                "issues": issues,
                "demonstrated_skills": demonstrated,
            }
        )
        return self._align_with_canonical(analysis, canonical_sr)

    @classmethod
    def _align_with_canonical(
        cls,
        analysis: AnswerAnalysis,
        canonical_sr: str | None,
    ) -> AnswerAnalysis:
        if not canonical_sr:
            return analysis
        if cls._normalize(analysis.corrected_sr) == cls._normalize(canonical_sr):
            return analysis.model_copy(update={"corrected_sr": canonical_sr})

        feedback = {
            "correct": "Ответ корректен; ниже показан канонический вариант.",
            "mostly_correct": "Смысл в основном передан; ориентируйтесь на канонический вариант и замечания ниже.",
            "needs_work": "Сверьте ответ с каноническим вариантом и замечаниями ниже.",
        }[analysis.verdict]
        detail = {
            "correct": (
                f"Ответ передаёт нужный смысл. Канонический вариант «{canonical_sr}» "
                "корректен и естественен в этом контексте."
            ),
            "mostly_correct": (
                f"Основной смысл передан. Канонический вариант «{canonical_sr}» "
                "корректен и естественен; конкретные замечания к ответу перечислены ниже."
            ),
            "needs_work": (
                f"Канонический вариант «{canonical_sr}» корректен и естественен. "
                "Исправьте ответ с учётом замечаний ниже."
            ),
        }[analysis.verdict]
        return analysis.model_copy(
            update={
                "corrected_sr": canonical_sr,
                "short_feedback_ru": feedback,
                "detailed_feedback_ru": detail,
            }
        )

    def _exact_match(
        self,
        matched_variant: str,
        alternatives: list[str],
        target_keys: list[str],
        timing: CreateAttemptRequest,
    ) -> AnswerAnalysis:
        fluency = self._local_fluency(timing, 1.0)
        return AnswerAnalysis(
            verdict="correct",
            semantic_score=1.0,
            grammar_score=1.0,
            lexical_score=1.0,
            naturalness_score=1.0,
            pronunciation_score=None,
            fluency_score=fluency,
            corrected_sr=matched_variant,
            short_feedback_ru="Ответ полностью совпадает с естественным эталонным вариантом.",
            detailed_feedback_ru=(
                "Смысл, грамматика, лексика и естественность соответствуют эталонному варианту."
            ),
            accepted_alternatives=alternatives,
            issues=[],
            demonstrated_skills=[
                DemonstratedSkill(skill_key=key, result="strong", confidence=1.0)
                for key in target_keys
            ],
        )

    def _local_fluency(self, timing: CreateAttemptRequest, model_score: float) -> float:
        if all(
            value is None
            for value in (timing.reaction_ms, timing.speech_duration_ms, timing.longest_pause_ms, timing.pause_count)
        ):
            return model_score
        score = 1.0
        if timing.reaction_ms and timing.reaction_ms > self.settings.long_reaction_ms:
            score -= min(0.35, 0.1 + (timing.reaction_ms - self.settings.long_reaction_ms) / 10_000)
        if timing.longest_pause_ms and timing.longest_pause_ms > self.settings.long_internal_pause_ms:
            score -= min(0.3, 0.1 + (timing.longest_pause_ms - self.settings.long_internal_pause_ms) / 8_000)
        if timing.pause_count and timing.pause_count > 2:
            score -= min(0.2, (timing.pause_count - 2) * 0.04)
        return round(max(0.0, min(1.0, score)), 3)

    @staticmethod
    def overall_score(analysis: AnswerAnalysis) -> float:
        value = (
            analysis.semantic_score * 0.35
            + analysis.grammar_score * 0.25
            + analysis.lexical_score * 0.15
            + analysis.naturalness_score * 0.15
            + analysis.fluency_score * 0.10
        )
        return round(max(0.0, min(1.0, value)), 3)

    @classmethod
    def _local_fallback(
        cls,
        transcript: str,
        alternatives: list[str],
        target_keys: list[str],
    ) -> AnswerAnalysis:
        if not alternatives:
            return AnswerAnalysis(
                verdict="needs_work",
                semantic_score=0.5,
                grammar_score=0.5,
                lexical_score=0.5,
                naturalness_score=0.5,
                pronunciation_score=None,
                fluency_score=1.0,
                corrected_sr=transcript,
                short_feedback_ru="Для точной проверки этой добавленной фразы требуется подключение OpenAI.",
                detailed_feedback_ru="Фраза сохранена для повторения, но локальный режим не может надёжно построить эталонный перевод для произвольного текста.",
                accepted_alternatives=[],
                issues=[],
                demonstrated_skills=[],
            )
        usable_alternatives = alternatives
        normalized = cls._normalize(transcript)
        best = max(
            usable_alternatives,
            key=lambda value: SequenceMatcher(None, normalized, cls._normalize(value)).ratio(),
        )
        similarity = SequenceMatcher(None, normalized, cls._normalize(best)).ratio()
        if similarity >= 0.88:
            verdict, feedback, detail, result = (
                "correct",
                "Ответ близок к естественному варианту.",
                "Локальная проверка не обнаружила заметного расхождения с несколькими допустимыми вариантами.",
                "strong",
            )
        elif similarity >= 0.6:
            verdict, feedback, detail, result = (
                "mostly_correct",
                "Смысл понятен, но формулировку стоит сделать точнее.",
                "Локальная проверка видит частичное совпадение. Для надёжной семантической оценки подключите OpenAI.",
                "weak",
            )
        else:
            verdict, feedback, detail, result = (
                "needs_work",
                "Ответ заметно отличается от ожидаемого смысла.",
                "Сверьте смысл и конструкцию с предложенным вариантом. Локальная проверка является запасным режимом.",
                "failed",
            )
        score = round(max(0.05, similarity), 3)
        issues = []
        if verdict != "correct" and target_keys:
            issues.append(
                AnswerIssue(
                    type="meaning",
                    skill_key=target_keys[0],
                    severity=round(1 - score, 3),
                    confidence=0.55,
                    evidence=transcript,
                    correction=best,
                )
            )
        return AnswerAnalysis(
            verdict=verdict,
            semantic_score=score,
            grammar_score=score,
            lexical_score=score,
            naturalness_score=score,
            pronunciation_score=None,
            fluency_score=1.0,
            corrected_sr=best,
            short_feedback_ru=feedback,
            detailed_feedback_ru=detail,
            accepted_alternatives=usable_alternatives,
            issues=issues,
            demonstrated_skills=[
                DemonstratedSkill(skill_key=key, result=result, confidence=0.55) for key in target_keys
            ],
        )

    @staticmethod
    def _timing_payload(timing: CreateAttemptRequest) -> dict[str, object]:
        return {
            "reaction_ms": timing.reaction_ms,
            "speech_duration_ms": timing.speech_duration_ms,
            "longest_pause_ms": timing.longest_pause_ms,
            "pause_count": timing.pause_count,
            "events": timing.timings,
        }

    @staticmethod
    def _normalize(value: str) -> str:
        return re.sub(r"[^a-zčćžšđ0-9]+", " ", value.casefold()).strip()
