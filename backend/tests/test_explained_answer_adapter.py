from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from app.config import Settings
from app.schemas import AnswerAnalysis, AnswerIssue, CreateAttemptRequest
from app.schemas.attempts import ExplainedAnswerAnalysis
from app.services.ai_adapter import AIServiceError, OpenAIStructuredProvider
from app.services.answer_analyzer import AnswerAnalyzer
from tests.fakes import FakeAIProvider


def analysis(issue):
    return AnswerAnalysis(
        verdict="mostly_correct", semantic_score=.9, grammar_score=.8,
        lexical_score=.8, naturalness_score=.8, fluency_score=1,
        corrected_sr="Molim vas, popravi odgovor.", short_feedback_ru="Есть неточность.",
        detailed_feedback_ru="Проверьте форму слова.", issues=[AnswerIssue(**issue)],
    )


def test_new_ai_contract_requires_reason_but_stored_legacy_issues_are_readable():
    issue = dict(type="grammar", skill_key="grammar.form", severity=.2, confidence=.9,
                 evidence="poprave", correction="popravi")
    legacy = analysis(issue).model_dump()
    provider = OpenAIStructuredProvider(Settings(openai_api_key="mock-secret", openai_text_model="env-model"))
    parse = Mock(return_value=SimpleNamespace(output_parsed=legacy))
    provider._client = SimpleNamespace(responses=SimpleNamespace(parse=parse))
    arguments = dict(source_ru="Исправь ответ.", transcript_sr="poprave odgovor",
                     canonical_sr="popravi odgovor", intended_sr_variants=[], target_skills=[], timings={})
    with pytest.raises(AIServiceError):
        provider.analyze_answer(**arguments)
    legacy["issues"][0]["explanation_ru"] = "Здесь обращение к одному человеку: нужна форма повелительного наклонения."
    result = provider.analyze_answer(**arguments)
    assert result.issues[0].explanation_ru == legacy["issues"][0]["explanation_ru"]
    assert parse.call_args.kwargs["text_format"] is ExplainedAnswerAnalysis
    assert parse.call_args.kwargs["model"] == "env-model"
    assert "не снижай оценки ради совпадения" in parse.call_args.kwargs["instructions"]
    assert AnswerAnalysis.model_validate(analysis(issue).model_dump()).issues[0].explanation_ru is None


@pytest.mark.parametrize("issue_type,evidence,correction,explanation", [
    ("grammar", "poprave", "popravi", "При обращении к одному человеку нужна форма повелительного наклонения."),
    ("vocabulary", "kupim", "prodajem", "Первое слово означает покупку, а задание говорит о продаже."),
    ("naturalness", "ja se zovem", "zovem se", "Местоимение задаёт акцент; нейтральное представление не требует акцента на говорящем."),
])
def test_per_issue_reason_survives_canonical_alignment_and_token_feedback(issue_type, evidence, correction, explanation):
    model = analysis(dict(type=issue_type, skill_key="grammar.form", severity=.2, confidence=.9,
                          evidence=evidence, correction=correction, explanation_ru=explanation))
    canonical = f"{correction} odgovor."
    transcript = f"{evidence} odgovor."
    result = AnswerAnalyzer(FakeAIProvider(available=True, analysis_result=model)).analyze(
        source_ru="Задание", transcript_sr=transcript, canonical_sr=canonical,
        intended_sr_variants=[canonical], target_skills=[{"key": "grammar.form"}],
        timing=CreateAttemptRequest(exercise_id="fixture", transcript_sr=transcript),
    )
    assert result.issues[0].explanation_ru == explanation
    assert result.corrected_sr == canonical
    assert result.pronunciation_score is None
