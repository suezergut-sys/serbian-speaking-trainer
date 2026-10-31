from __future__ import annotations

from difflib import SequenceMatcher
from app.services.failure_diagnostics import DiagnosticFailure, diagnostic, classify_provider_error, record_failure

from app.config import Settings, get_settings
from app.db.topic_phrases_en import TOPIC_PHRASES_EN
from app.schemas import AnswerAnalysis, AnswerIssue, CreateAttemptRequest, DemonstratedSkill
from app.services.ai_adapter import AIServiceError, StructuredAIProvider
from app.services.serbian_text import normalized_serbian_words, serbian_latin_for_evaluation
from app.services.interface_language import interface_language
from app.services.serbian_standard import is_ekavian_candidate, validate_generated_serbian


class AnalysisUnavailableError(DiagnosticFailure):
    def __init__(self, failure=None):
        super().__init__("Answer analysis unavailable", failure or diagnostic("external_model", "provider_request", "provider_failure"))


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
        # A stale dialect-contaminated snapshot must not become a perfect-answer
        # shortcut or be reapplied after the model returns an Ekavian correction.
        if canonical_sr and not is_ekavian_candidate(canonical_sr):
            canonical_sr = None
        intended_sr_variants = [variant for variant in intended_sr_variants if is_ekavian_candidate(variant)]
        acceptable_variants = list(dict.fromkeys([
            *([canonical_sr] if canonical_sr else []), *intended_sr_variants,
        ]))
        normalized_transcript = self._normalize(transcript_sr)
        exact_variant = next(
            (
                variant
                for variant in acceptable_variants
                if normalized_transcript == self._normalize(variant)
            ),
            None,
        )
        if exact_variant is not None and is_ekavian_candidate(exact_variant):
            return self._exact_match(exact_variant, acceptable_variants, target_keys, timing)

        if not self.ai.is_available:
            raise AnalysisUnavailableError(diagnostic("external_model", "configuration", "not_configured", retryable=False))
        evaluation_transcript = serbian_latin_for_evaluation(transcript_sr)
        # A structured response can still contradict the words that were actually transcribed.
        # Retry once before any score or learner-model update can be persisted.
        validation_feedback = None
        for attempt_index in range(2):
            try:
                analysis = AnswerAnalysis.model_validate(
                    self.ai.analyze_answer(
                        source_ru=(TOPIC_PHRASES_EN.get(source_ru, source_ru)
                                   if interface_language.get() == "en" else source_ru),
                        transcript_sr=evaluation_transcript,
                        canonical_sr=canonical_sr,
                        intended_sr_variants=acceptable_variants,
                        target_skills=target_skills,
                        timings=self._timing_payload(timing),
                        **({"validation_feedback": validation_feedback} if validation_feedback else {}),
                    )
                )
                validate_generated_serbian(analysis)
            except (AIServiceError, ValueError) as exc:
                raise AnalysisUnavailableError(exc.failure if isinstance(exc, DiagnosticFailure) else classify_provider_error(exc)) from exc
            validation_feedback = self._grounding_failure(analysis, evaluation_transcript, target_keys)
            if validation_feedback is None and analysis.verdict == "correct" and not is_ekavian_candidate(evaluation_transcript):
                validation_feedback = "dialect_verdict"
            if validation_feedback is None:
                break
            failure = diagnostic("response_parse", "grounding", validation_feedback)
            record_failure(failure, attempt=attempt_index + 1)
        else:
            raise AnalysisUnavailableError(failure)

        fluency = self._local_fluency(timing, analysis.fluency_score)
        issues = analysis.issues
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
        analysis = self._align_with_canonical(analysis, canonical_sr)
        return self._ground_token_feedback(analysis, canonical_sr)

    @classmethod
    def _response_is_grounded(cls, analysis: AnswerAnalysis, transcript_sr: str, target_keys: list[str]) -> bool:
        return cls._grounding_failure(analysis, transcript_sr, target_keys) is None

    @classmethod
    def _grounding_failure(cls, analysis: AnswerAnalysis, transcript_sr: str, target_keys: list[str]) -> str | None:
        transcript_words = f" {cls._normalize(transcript_sr)} "
        for issue in analysis.issues:
            evidence = cls._normalize(issue.evidence)
            if issue.skill_key is not None and issue.skill_key not in target_keys:
                return "unknown_skill"
            if issue.severity <= 0:
                return "invalid_severity"
            if not evidence or f" {evidence} " not in transcript_words:
                return "unsupported_evidence"
            if issue.correction is not None and evidence == cls._normalize(issue.correction):
                return "non_lexical_correction"
        if analysis.verdict == "correct" and analysis.issues:
            return "contradictory_verdict"
        if analysis.verdict != "correct" and not analysis.issues:
            return "missing_issue"
        return None

    @classmethod
    def _ground_token_feedback(
        cls, analysis: AnswerAnalysis, canonical_sr: str | None,
    ) -> AnswerAnalysis:
        if not canonical_sr or not analysis.issues:
            return analysis
        local_word_correction = any(
            issue.correction is not None
            and " " not in (evidence := cls._normalize(issue.evidence))
            and " " not in (correction := cls._normalize(issue.correction))
            and f" {correction} " in f" {cls._normalize(canonical_sr)} "
            and SequenceMatcher(None, evidence, correction).ratio() >= 0.8
            for issue in analysis.issues
        )
        if not local_word_correction:
            return analysis
        # For a local word correction, the structured pair is the only supported
        # explanation. Free-form feedback may claim a different letter was spoken.
        details: list[str] = []
        english = interface_language.get() == "en"
        for position, issue in enumerate(analysis.issues):
            part = (
                f"В распознанном ответе «{issue.evidence}»; "
                f"исправленный вариант — «{issue.correction}»."
                if issue.correction else f"Проверьте фрагмент «{issue.evidence}»."
            )
            if english:
                part = (
                    f'The transcript contains “{issue.evidence}”; the correction is “{issue.correction}”.'
                    if issue.correction else f'Check the fragment “{issue.evidence}”.'
                )
            remaining = len(analysis.issues) - position
            if len(" ".join([*details, part])) > 1900:
                details.append(f"There are {remaining} more comments in the issue list." if english
                               else f"Есть ещё {remaining} замечаний в списке ошибок.")
                break
            details.append(part)
        return analysis.model_copy(update={
            "short_feedback_ru": (
                ("One word in your answer needs correcting." if len(analysis.issues) == 1
                 else "Several parts of your answer need correcting.") if english else
                ("В ответе есть неточность в одном слове." if len(analysis.issues) == 1
                 else "В ответе есть несколько неточностей.")
            ),
            "detailed_feedback_ru": " ".join(details),
        })

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
        if interface_language.get() == "en":
            feedback = {
                "correct": "Your answer is correct; the canonical translation is shown below.",
                "mostly_correct": "The main meaning is conveyed; use the canonical translation and the comments below.",
                "needs_work": "Compare your answer with the canonical translation and comments below.",
            }[analysis.verdict]
            detail = {
                "correct": f'Your answer conveys the intended meaning. The canonical translation “{canonical_sr}” is correct and natural in this context.',
                "mostly_correct": f'The main meaning is conveyed. The canonical translation “{canonical_sr}” is correct and natural; specific comments are listed below.',
                "needs_work": f'The canonical translation “{canonical_sr}” is correct and natural. Edit your answer using the comments below.',
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
            short_feedback_ru=("Your answer exactly matches a natural reference translation." if interface_language.get() == "en"
                               else "Ответ полностью совпадает с естественным эталонным вариантом."),
            detailed_feedback_ru=(
                "Meaning, grammar, vocabulary and naturalness match the reference translation." if interface_language.get() == "en"
                else "Смысл, грамматика, лексика и естественность соответствуют эталонному варианту."
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
        return normalized_serbian_words(value)
