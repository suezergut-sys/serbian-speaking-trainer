import pytest
import unicodedata

from app.config import Settings
from app.schemas import AnswerAnalysis, AnswerIssue, CreateAttemptRequest, DemonstratedSkill
from app.services.ai_adapter import AIServiceError
from app.services.answer_analyzer import AnalysisUnavailableError, AnswerAnalyzer
from app.services.serbian_text import serbian_latin, serbian_latin_for_evaluation
from tests.fakes import FakeAIProvider


def test_exact_canonical_match_is_perfect_without_ai_analysis() -> None:
    ai = FakeAIProvider(available=False)
    analyzer = AnswerAnalyzer(ai)

    result = analyzer.analyze(
        source_ru="Я ищу светлую двухкомнатную квартиру в центре.",
        transcript_sr="  tražim svetao dvosoban stan u centru  ",
        intended_sr_variants=["Tražim svetao dvosoban stan u centru."],
        target_skills=[
            {"key": "grammar.present", "category": "grammar", "title_ru": "Настоящее время"},
            {"key": "grammar.accusative", "category": "grammar", "title_ru": "Винительный падеж"},
        ],
        timing=CreateAttemptRequest(
            exercise_id="exercise",
            transcript_sr="tražim svetao dvosoban stan u centru",
        ),
    )

    assert ai.analysis_calls == 0
    assert result.verdict == "correct"
    assert result.semantic_score == result.grammar_score == 1
    assert result.lexical_score == result.naturalness_score == 1
    assert result.fluency_score == 1
    assert result.issues == []
    assert all(skill.result == "strong" and skill.confidence == 1 for skill in result.demonstrated_skills)


def test_noncanonical_answer_waits_for_valid_ai_analysis() -> None:
    request = CreateAttemptRequest(exercise_id="exercise", transcript_sr="Ne znam.")
    arguments = {
        "source_ru": "Я хотел бы заказать кофе.",
        "transcript_sr": request.transcript_sr,
        "intended_sr_variants": ["Voleo bih da naručim kafu."],
        "target_skills": [],
        "timing": request,
    }
    with pytest.raises(AnalysisUnavailableError):
        AnswerAnalyzer(FakeAIProvider(available=False)).analyze(**arguments)

    class FailingAI(FakeAIProvider):
        def analyze_answer(self, **_kwargs):
            raise AIServiceError("test provider failure")

    with pytest.raises(AnalysisUnavailableError):
        AnswerAnalyzer(FailingAI(available=True)).analyze(**arguments)


def test_analyzer_applies_local_fluency_to_grounded_analysis() -> None:
    model_result = AnswerAnalysis(
        verdict="mostly_correct",
        semantic_score=0.8,
        grammar_score=0.7,
        lexical_score=0.8,
        naturalness_score=0.7,
        pronunciation_score=0.9,
        fluency_score=0.9,
        corrected_sr="Voleo bih da otvorim račun.",
        short_feedback_ru="Смысл передан.",
        detailed_feedback_ru="Нужно немного поправить форму.",
        accepted_alternatives=["Želeo bih da otvorim račun."],
        issues=[
            AnswerIssue(
                type="grammar", skill_key="grammar.modal_da", severity=0.3, confidence=0.9,
                evidence="otvoriti", correction="da otvorim",
            ),
        ],
        demonstrated_skills=[
            DemonstratedSkill(skill_key="invented.skill", result="weak", confidence=0.9),
        ],
    )
    settings = Settings(long_reaction_ms=2500, long_internal_pause_ms=1500)
    analyzer = AnswerAnalyzer(FakeAIProvider(available=True, analysis_result=model_result), settings)

    result = analyzer.analyze(
        source_ru="Я хотел бы открыть счёт.",
        transcript_sr="Voleo bih otvoriti račun.",
        intended_sr_variants=["Voleo bih da otvorim račun."],
        target_skills=[{"key": "grammar.modal_da", "category": "grammar", "title_ru": "Модальная конструкция"}],
        timing=CreateAttemptRequest(
            exercise_id="exercise",
            transcript_sr="Voleo bih otvoriti račun.",
            reaction_ms=5000,
            longest_pause_ms=3000,
            pause_count=4,
        ),
    )

    assert [issue.skill_key for issue in result.issues] == ["grammar.modal_da"]
    assert [skill.skill_key for skill in result.demonstrated_skills] == ["grammar.modal_da"]
    assert result.pronunciation_score is None
    assert result.fluency_score < 0.9


@pytest.mark.parametrize("transcript", [
    "Platiću bankovnom karticom.",
    unicodedata.normalize("NFD", "Platiću bankovnom karticom."),
    "Платићу bankovnom karticom.",
])
def test_bank_card_exact_answer_has_no_false_spelling_grade(transcript: str) -> None:
    ai = FakeAIProvider(available=True)
    analyzer = AnswerAnalyzer(ai)
    result = analyzer.analyze(
        source_ru="Я заплачу банковской картой.",
        transcript_sr=transcript,
        canonical_sr="Platiću bankovnom karticom.",
        intended_sr_variants=["Platiću bankovnom karticom."],
        target_skills=[],
        timing=CreateAttemptRequest(exercise_id="exercise", transcript_sr=transcript),
    )

    assert ai.analysis_calls == 0
    assert result.verdict == "correct"
    assert result.grammar_score == result.naturalness_score == 1
    assert result.issues == []
    assert result.corrected_sr == "Platiću bankovnom karticom."


def test_canonical_exact_answer_is_accepted_when_variants_are_missing() -> None:
    ai = FakeAIProvider(available=True)
    canonical = "Platiću bankovnom karticom."
    result = AnswerAnalyzer(ai).analyze(
        source_ru="Я заплачу банковской картой.",
        transcript_sr=canonical,
        canonical_sr=canonical,
        intended_sr_variants=[],
        target_skills=[],
        timing=CreateAttemptRequest(exercise_id="exercise", transcript_sr=canonical),
    )

    assert ai.analysis_calls == 0
    assert result.verdict == "correct"
    assert result.accepted_alternatives == [canonical]


@pytest.mark.parametrize("transcript,canonical", [
    ("Plаtiću bankоvnom karticоm.", "Platiću bankovnom karticom."),
    ("Platiću bankovnom kartiсom.", "Platiću bankovnom karticom."),
    ("Poрijem vodu.", "Popijem vodu."),
    ("Рopijem vodu.", "Popijem vodu."),
    ("Попијем воду.", "Popijem vodu."),
])
def test_keyboard_homoglyphs_in_latin_words_match_canonical(
    transcript: str, canonical: str,
) -> None:
    ai = FakeAIProvider(available=True)
    result = AnswerAnalyzer(ai).analyze(
        source_ru="Я заплачу или выпью воду.", transcript_sr=transcript,
        canonical_sr=canonical, intended_sr_variants=[canonical], target_skills=[],
        timing=CreateAttemptRequest(exercise_id="exercise", transcript_sr=transcript),
    )

    assert result.verdict == "correct"
    assert result.grammar_score == 1
    assert result.issues == []
    assert ai.analysis_calls == 0


def test_keyboard_normalizer_preserves_cyrillic_phonetics_and_real_typos() -> None:
    assert serbian_latin_for_evaluation("Попијем воду.") == "Popijem vodu."
    assert serbian_latin_for_evaluation("Сr") == "Sr"
    assert serbian_latin_for_evaluation("Poвijem") == "Povijem"
    assert serbian_latin("Poрijem") == "Porijem"  # STT conversion stays phonetic.
    assert AnswerAnalyzer._normalize("Platicu") != AnswerAnalyzer._normalize("Platiću")
    assert AnswerAnalyzer._normalize("Poяijem") != AnswerAnalyzer._normalize("Popijem")


@pytest.mark.parametrize("source,expected", [
    ("ab1с", "ab1s"),
    ("ab_с", "ab_s"),
    ("ááс", "áác"),
    ("ab҃с", "ab҃c"),
])
def test_keyboard_context_uses_letter_runs_only(source: str, expected: str) -> None:
    assert serbian_latin_for_evaluation(source) == expected


def test_nonexact_manual_answer_is_cleaned_before_ai_analysis() -> None:
    transcript = "Poрijem malo vode."
    canonical = "Popijem vodu."
    analysis = AnswerAnalysis(
        verdict="mostly_correct", semantic_score=0.9, grammar_score=0.9,
        lexical_score=0.8, naturalness_score=0.9, fluency_score=1,
        corrected_sr=canonical, short_feedback_ru="Уберите лишнее слово.",
        detailed_feedback_ru="Фраза содержит лишнее слово.",
        issues=[AnswerIssue(type="vocabulary", skill_key="vocabulary.water", severity=0.2,
                            confidence=0.9, evidence="malo vode", correction="vodu")],
    )

    class CapturingAI(FakeAIProvider):
        def analyze_answer(self, **kwargs) -> AnswerAnalysis:
            self.payload = kwargs
            return super().analyze_answer(**kwargs)

    ai = CapturingAI(available=True, analysis_result=analysis)
    result = AnswerAnalyzer(ai).analyze(
        source_ru="Я выпью воды.", transcript_sr=transcript,
        canonical_sr=canonical, intended_sr_variants=[canonical],
        target_skills=[{"key": "vocabulary.water", "category": "vocabulary", "title_ru": "Вода"}],
        timing=CreateAttemptRequest(exercise_id="exercise", transcript_sr=transcript),
    )

    assert ai.analysis_calls == 1
    assert ai.payload["transcript_sr"] == "Popijem malo vode."
    assert result.verdict == "mostly_correct"


@pytest.mark.parametrize("transcript", [
    "Я Platiću bankovnom karticom.",
    "Platιću bankovnom karticom.",
    "Platicu bankovnom karticom.",
])
def test_unexpected_letters_and_real_diacritics_do_not_get_exact_match(transcript: str) -> None:
    with pytest.raises(AnalysisUnavailableError):
        AnswerAnalyzer(FakeAIProvider(available=False)).analyze(
            source_ru="Я заплачу банковской картой.",
            transcript_sr=transcript,
            canonical_sr="Platiću bankovnom karticom.",
            intended_sr_variants=["Platiću bankovnom karticom."],
            target_skills=[],
            timing=CreateAttemptRequest(exercise_id="exercise", transcript_sr=transcript),
        )


def test_genuine_extra_letter_keeps_correction_without_invented_feedback() -> None:
    transcript = "Allergičan sam na neke antibiotike."
    canonical = "Alergičan sam na neke antibiotike."
    analysis = AnswerAnalysis(
        verdict="mostly_correct", semantic_score=1, grammar_score=0.8,
        lexical_score=0.8, naturalness_score=0.8, fluency_score=1,
        corrected_sr=canonical,
        short_feedback_ru="Нужно добавить букву e.",
        detailed_feedback_ru="В этом слове отсутствует e.",
        issues=[AnswerIssue(
            type="vocabulary", skill_key="vocabulary.health", severity=0.2,
            confidence=0.9, evidence="Allergičan", correction="Alergičan",
        )],
    )
    ai = FakeAIProvider(available=True, analysis_result=analysis)
    result = AnswerAnalyzer(ai).analyze(
        source_ru="У меня аллергия на некоторые антибиотики.",
        transcript_sr=transcript,
        canonical_sr=canonical,
        intended_sr_variants=[canonical],
        target_skills=[{"key": "vocabulary.health", "category": "vocabulary", "title_ru": "Здоровье"}],
        timing=CreateAttemptRequest(exercise_id="exercise", transcript_sr=transcript),
    )

    assert ai.analysis_calls == 1
    assert result.verdict == "mostly_correct"
    assert result.issues[0].evidence == "Allergičan"
    assert result.issues[0].correction == "Alergičan"
    assert "букву e" not in result.short_feedback_ru
    assert "отсутствует e" not in result.detailed_feedback_ru
    assert "Allergičan" in result.detailed_feedback_ru
    assert "Alergičan" in result.detailed_feedback_ru


@pytest.mark.parametrize("second_evidence,second_correction,transcript", [
    ("samm", "sam", "Allergičan samm na neke antibiotike."),
    ("na nekim antibioticima", "na neke antibiotike", "Allergičan sam na nekim antibioticima."),
])
def test_local_error_with_another_issue_never_keeps_invented_letter_claim(
    second_evidence: str, second_correction: str, transcript: str,
) -> None:
    canonical = "Alergičan sam na neke antibiotike."
    analysis = AnswerAnalysis(
        verdict="mostly_correct", semantic_score=0.9, grammar_score=0.8,
        lexical_score=0.8, naturalness_score=0.8, fluency_score=1,
        corrected_sr=canonical,
        short_feedback_ru="Нужно добавить букву e.",
        detailed_feedback_ru="Здесь отсутствует буква e.",
        issues=[
            AnswerIssue(type="vocabulary", skill_key="vocabulary.health", severity=0.2,
                        confidence=0.9, evidence="Allergičan", correction="Alergičan"),
            AnswerIssue(type="grammar", skill_key="grammar.case", severity=0.3,
                        confidence=0.9, evidence=second_evidence, correction=second_correction),
        ],
    )
    result = AnswerAnalyzer(FakeAIProvider(available=True, analysis_result=analysis)).analyze(
        source_ru="У меня аллергия на некоторые антибиотики.",
        transcript_sr=transcript,
        canonical_sr=canonical,
        intended_sr_variants=[canonical],
        target_skills=[
            {"key": "vocabulary.health", "category": "vocabulary", "title_ru": "Здоровье"},
            {"key": "grammar.case", "category": "grammar", "title_ru": "Падеж"},
        ],
        timing=CreateAttemptRequest(exercise_id="exercise", transcript_sr=transcript),
    )

    assert result.verdict == "mostly_correct"
    assert len(result.issues) == 2
    assert "букву e" not in result.short_feedback_ru
    assert "буква e" not in result.detailed_feedback_ru
    assert second_evidence in result.detailed_feedback_ru
    assert second_correction in result.detailed_feedback_ru


def test_below_correct_without_grounded_issue_retries_then_refuses_grade() -> None:
    analysis = AnswerAnalysis(
        verdict="mostly_correct", semantic_score=0.8, grammar_score=0.8,
        lexical_score=0.8, naturalness_score=0.8, fluency_score=1,
        corrected_sr="Voleo bih da otvorim račun.",
        short_feedback_ru="Нужно исправить.", detailed_feedback_ru="Неконкретная ошибка.",
    )
    ai = FakeAIProvider(available=True, analysis_result=analysis)
    transcript = "Želeo bih da otvorim račun."
    with pytest.raises(AnalysisUnavailableError):
        AnswerAnalyzer(ai).analyze(
            source_ru="Я хотел бы открыть счёт.", transcript_sr=transcript,
            canonical_sr="Voleo bih da otvorim račun.",
            intended_sr_variants=["Voleo bih da otvorim račun."],
            target_skills=[{"key": "grammar.modal_da", "category": "grammar", "title_ru": "Конструкция"}],
            timing=CreateAttemptRequest(exercise_id="exercise", transcript_sr=transcript),
        )
    assert ai.analysis_calls == 2


def test_invalid_first_analysis_can_recover_on_bounded_retry() -> None:
    canonical = "Alergičan sam na neke antibiotike."
    transcript = "Allergičan sam na neke antibiotike."
    common = dict(
        verdict="mostly_correct", semantic_score=1, grammar_score=0.8,
        lexical_score=0.8, naturalness_score=0.8, fluency_score=1,
        corrected_sr=canonical,
        short_feedback_ru="Есть ошибка.", detailed_feedback_ru="Проверьте слово.",
    )
    invalid = AnswerAnalysis(**common, issues=[AnswerIssue(
        type="vocabulary", skill_key="vocabulary.health", severity=0.2,
        confidence=0.9, evidence="nonexistent", correction="Alergičan",
    )])
    valid = AnswerAnalysis(**common, issues=[AnswerIssue(
        type="vocabulary", skill_key="vocabulary.health", severity=0.2,
        confidence=0.9, evidence="Allergičan", correction="Alergičan",
    )])

    class RecoveringAI(FakeAIProvider):
        def analyze_answer(self, **_kwargs) -> AnswerAnalysis:
            self.analysis_calls += 1
            return invalid if self.analysis_calls == 1 else valid

    ai = RecoveringAI(available=True)
    result = AnswerAnalyzer(ai).analyze(
        source_ru="У меня аллергия на некоторые антибиотики.", transcript_sr=transcript,
        canonical_sr=canonical, intended_sr_variants=[canonical],
        target_skills=[{"key": "vocabulary.health", "category": "vocabulary", "title_ru": "Здоровье"}],
        timing=CreateAttemptRequest(exercise_id="exercise", transcript_sr=transcript),
    )

    assert ai.analysis_calls == 2
    assert result.issues[0].evidence == "Allergičan"


def test_generated_grounded_feedback_stays_within_schema_limit() -> None:
    issues = [AnswerIssue(
        type="grammar", skill_key="grammar.case", severity=0.2, confidence=0.9,
        evidence="Allergičan", correction="Alergičan",
    )]
    issues.extend(AnswerIssue(
        type="grammar", skill_key="grammar.case", severity=0.2, confidence=0.9,
        evidence="x" * 400, correction="y" * 400,
    ) for _ in range(11))
    analysis = AnswerAnalysis(
        verdict="mostly_correct", semantic_score=0.8, grammar_score=0.8,
        lexical_score=0.8, naturalness_score=0.8, fluency_score=1,
        corrected_sr="Alergičan sam na neke antibiotike.",
        short_feedback_ru="Есть ошибка.", detailed_feedback_ru="Есть ошибка.",
        issues=issues,
    )

    result = AnswerAnalyzer._ground_token_feedback(analysis, analysis.corrected_sr)

    assert len(result.detailed_feedback_ru) <= 2000
    assert "Есть ещё" in result.detailed_feedback_ru
    AnswerAnalysis.model_validate(result.model_dump())


def test_unanchored_or_no_op_issue_retries_then_refuses_false_grade() -> None:
    analysis = AnswerAnalysis(
        verdict="mostly_correct", semantic_score=0.88, grammar_score=0.88,
        lexical_score=0.88, naturalness_score=0.88, fluency_score=1,
        corrected_sr="Platiću bankovnom karticom.",
        short_feedback_ru="Неправильная буква i.",
        detailed_feedback_ru="Замените латинскую i на сербскую i.",
        issues=[AnswerIssue(
            type="grammar", skill_key="grammar.spelling", severity=0.2,
            confidence=0.9, evidence="Platiću", correction="Platiću",
        )],
    )
    ai = FakeAIProvider(available=True, analysis_result=analysis)
    transcript = "Platíću bankovnom karticom."
    with pytest.raises(AnalysisUnavailableError):
        AnswerAnalyzer(ai).analyze(
            source_ru="Я заплачу банковской картой.",
            transcript_sr=transcript,
            canonical_sr="Platiću bankovnom karticom.",
            intended_sr_variants=["Platiću bankovnom karticom."],
            target_skills=[{"key": "grammar.spelling", "category": "grammar", "title_ru": "Правописание"}],
            timing=CreateAttemptRequest(exercise_id="exercise", transcript_sr=transcript),
        )
    assert ai.analysis_calls == 2


def test_analyzer_keeps_feedback_consistent_with_canonical_variant() -> None:
    model_result = AnswerAnalysis(
        verdict="mostly_correct",
        semantic_score=0.96,
        grammar_score=0.78,
        lexical_score=0.82,
        naturalness_score=0.75,
        pronunciation_score=None,
        fluency_score=1.0,
        corrected_sr="Odlično. Doći ću večeras i pokupiću aparat za kafu.",
        short_feedback_ru="Лучше использовать pokupiću.",
        detailed_feedback_ru="В этом контексте pokupiću звучит естественнее, чем канонический вариант.",
        accepted_alternatives=[],
        issues=[],
        demonstrated_skills=[],
    )
    analyzer = AnswerAnalyzer(FakeAIProvider(available=True, analysis_result=model_result))
    canonical = "Odlično. Doći ću večeras i uzeću aparat za kafu."

    result = analyzer.analyze(
        source_ru="Отлично. Я приеду сегодня вечером и заберу кофеварку.",
        transcript_sr="Odlično. Doći ću večeras i uzecu aparat za kafu.",
        canonical_sr=canonical,
        intended_sr_variants=[canonical],
        target_skills=[],
        timing=CreateAttemptRequest(exercise_id="exercise", transcript_sr="answer"),
    )

    assert result.corrected_sr == canonical
    assert "pokupiću" not in result.short_feedback_ru
    assert "pokupiću" not in result.detailed_feedback_ru
    assert "корректен и естественен" in result.detailed_feedback_ru
