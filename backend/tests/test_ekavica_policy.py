from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from sqlalchemy import select

from app.config import Settings
from app.db.seed import seed_catalog
from app.db.topic_phrase_hints_en import ENGLISH_WORD_HINTS
from app.models import TopicPhrase
from app.schemas import AnswerAnalysis, CreateAttemptRequest, PhrasePreparation
from app.services.ai_adapter import AIServiceError, OpenAIStructuredProvider
from app.services.answer_analyzer import AnalysisUnavailableError, AnswerAnalyzer
from app.services.interface_language import interface_language
from app.services.serbian_standard import is_ekavian_candidate, validate_generated_serbian
from tests.fakes import FakeAIProvider


@pytest.mark.parametrize("text", ["DVIJE kafe", "двије кафе", "Lijepo vrijeme.", "Dijete pije mlijeko.", "Gdje je lijek?"])
def test_common_ijekavian_forms_are_rejected(text):
    assert not is_ekavian_candidate(text)


@pytest.mark.parametrize("text", ["Dve kafe.", "Две кафе.", "Nije jeo, pijem, prijatelj, bolje, dvoje, je.",
                                  "Želim dve mesečne karte.", "Vremena nema, volela bih."])
def test_ekavian_je_and_shared_forms_are_not_mechanically_replaced(text):
    assert is_ekavian_candidate(text)


@pytest.mark.parametrize("language", ["ru", "en"])
def test_preparation_has_common_policy_and_rejects_model_dialect_leakage(language):
    provider = OpenAIStructuredProvider(Settings(openai_api_key="mock", openai_text_model="env-model"))
    parse = Mock(return_value=SimpleNamespace(output_parsed=PhrasePreparation(
        intended_sr_variants=["Imam dvije kafe."],
    )))
    provider._client = SimpleNamespace(responses=SimpleNamespace(parse=parse))
    token = interface_language.set(language)
    try:
        with pytest.raises(AIServiceError):
            provider.prepare_phrase(source_ru="У меня два кофе.")
        parse.return_value.output_parsed = PhrasePreparation(intended_sr_variants=["Imam dve kafe."], source_versions={"ru": "У меня два кофе.", "en": "I have two coffees."})
        assert provider.prepare_phrase(source_ru="У меня два кофе.").intended_sr_variants == ["Imam dve kafe."]
    finally:
        interface_language.reset(token)
    assert "Ekavica" in parse.call_args.kwargs["instructions"]
    assert "transcript_sr, raw_text и evidence" in parse.call_args.kwargs["instructions"]


def test_generated_hints_and_alternatives_cannot_leak_ijekavica():
    with pytest.raises(ValueError):
        validate_generated_serbian(PhrasePreparation(
            intended_sr_variants=["Imam dve kafe."],
            word_hints=[{"word_ru": "две", "translation_sr": "dvije"}],
        ))
    with pytest.raises(ValueError):
        validate_generated_serbian(correct_analysis().model_copy(update={"accepted_alternatives": ["Dvije kafe."]}))


def correct_analysis():
    return AnswerAnalysis(verdict="correct", semantic_score=1, grammar_score=1, lexical_score=1,
                          naturalness_score=1, fluency_score=1, corrected_sr="Imam dve kafe.",
                          short_feedback_ru="Верно.", detailed_feedback_ru="Верно.")


@pytest.mark.parametrize("language", ["ru", "en"])
def test_stale_ijekavian_canonical_cannot_override_correct_ekavian_answer(language):
    ai = FakeAIProvider(available=True, analysis_result=correct_analysis())
    arguments = dict(source_ru="У меня два кофе.", transcript_sr="Imam dve kafe.",
                     canonical_sr="Imam dvije kafe.", intended_sr_variants=["Imam dvije kafe."],
                     target_skills=[], timing=CreateAttemptRequest(exercise_id="fixture", transcript_sr="Imam dve kafe."))
    token = interface_language.set(language)
    try:
        result = AnswerAnalyzer(ai).analyze(**arguments)
    finally:
        interface_language.reset(token)
    assert result.corrected_sr == "Imam dve kafe."
    assert result.verdict == "correct"
    assert ai.analysis_calls == 1


def test_ijekavian_snapshot_never_gets_perfect_score_via_exact_match():
    with pytest.raises(AnalysisUnavailableError):
        AnswerAnalyzer(FakeAIProvider(available=False)).analyze(
            source_ru="У меня два кофе.", transcript_sr="Imam dvije kafe.", canonical_sr="Imam dvije kafe.",
            intended_sr_variants=["Imam dvije kafe."], target_skills=[],
            timing=CreateAttemptRequest(exercise_id="fixture", transcript_sr="Imam dvije kafe."),
        )


def test_complete_seed_and_bilingual_hint_catalog_follow_ekavica(db_session):
    seed_catalog(db_session)
    db_session.flush()
    phrases = list(db_session.scalars(select(TopicPhrase)))
    assert len(phrases) == 210
    for phrase in phrases:
        validate_generated_serbian(PhrasePreparation(intended_sr_variants=[phrase.canonical_sr],
                                                     word_hints=phrase.word_hints_json))
    for hints in ENGLISH_WORD_HINTS.values():
        validate_generated_serbian(PhrasePreparation(word_hints=[
            {"word_ru": word, "translation_sr": translation} for word, translation in hints.items()
        ]))


def test_ijekavian_input_and_evidence_stay_literal_and_receive_dialect_feedback():
    from app.schemas import AnswerIssue

    transcript = "Imam dvije kafe."
    result = correct_analysis().model_copy(update={
        "verdict": "mostly_correct", "naturalness_score": .9,
        "issues": [AnswerIssue(type="naturalness", skill_key=None, severity=.1, confidence=1,
                               evidence="dvije", correction="dve",
                               explanation_ru="В этом курсе используется экавица: dve.")],
    })
    ai = FakeAIProvider(available=True, analysis_result=result)
    analyzed = AnswerAnalyzer(ai).analyze(
        source_ru="У меня два кофе.", transcript_sr=transcript, canonical_sr="Imam dve kafe.",
        intended_sr_variants=[], target_skills=[],
        timing=CreateAttemptRequest(exercise_id="fixture", transcript_sr=transcript),
    )
    assert analyzed.issues[0].evidence == "dvije"
    assert analyzed.issues[0].correction == "dve"
    assert analyzed.pronunciation_score is None
    assert ai.analysis_calls == 1


def test_model_cannot_silently_accept_known_ijekavian_answer():
    ai = FakeAIProvider(available=True, analysis_result=correct_analysis())
    with pytest.raises(AnalysisUnavailableError):
        AnswerAnalyzer(ai).analyze(
            source_ru="У меня два кофе.", transcript_sr="Imam dvije kafe.", canonical_sr="Imam dve kafe.",
            intended_sr_variants=[], target_skills=[],
            timing=CreateAttemptRequest(exercise_id="fixture", transcript_sr="Imam dvije kafe."),
        )
    assert ai.analysis_calls == 2


@pytest.mark.parametrize("prompt", ["exercise_generator_v2.md", "answer_analyzer_v4.md", "topic_normalizer.md",
                                    "phrase_preparation_v3.md", "transcription_assistance_v3.md"])
def test_every_structured_operation_loads_shared_policy(prompt):
    provider = OpenAIStructuredProvider(Settings(openai_api_key="mock", openai_text_model="env-model"))
    parse = Mock(return_value=SimpleNamespace(output_parsed=PhrasePreparation(intended_sr_variants=["Dve kafe."])))
    provider._client = SimpleNamespace(responses=SimpleNamespace(parse=parse))
    provider._parse(prompt_name=prompt, payload={}, schema=PhrasePreparation)
    assert "Обязательный вариант сербского языка: Ekavica" in parse.call_args.kwargs["instructions"]
