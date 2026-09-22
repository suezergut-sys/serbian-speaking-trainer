from app.config import Settings
from app.schemas import AnswerAnalysis, AnswerIssue, CreateAttemptRequest, DemonstratedSkill
from app.services.answer_analyzer import AnswerAnalyzer
from tests.fakes import FakeAIProvider


def test_exact_canonical_match_is_perfect_without_ai_analysis() -> None:
    ai = FakeAIProvider(available=True)
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


def test_analyzer_filters_unknown_skill_keys_and_applies_local_fluency() -> None:
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
            AnswerIssue(
                type="grammar", skill_key="invented.skill", severity=0.5, confidence=0.9,
                evidence="x", correction="y",
            ),
            AnswerIssue(
                type="grammar", skill_key="grammar.modal_da", severity=0.2, confidence=0.9,
                evidence='"da otvorim"', correction="da otvorim",
            ),
            AnswerIssue(
                type="grammar", skill_key="grammar.modal_da", severity=0, confidence=0.9,
                evidence="račun", correction=None,
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
