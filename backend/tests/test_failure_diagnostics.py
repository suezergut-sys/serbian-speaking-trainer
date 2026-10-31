from types import SimpleNamespace
from uuid import UUID, uuid4
from unittest.mock import Mock

import httpx
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.exceptions import ResponseValidationError
from fastapi.testclient import TestClient
from openai import APIStatusError, APITimeoutError
from sqlalchemy.exc import OperationalError

from app.services.failure_diagnostics import classify_provider_error, diagnostic, diagnostic_context
from app.services.ai_adapter import AIServiceError, OpenAIStructuredProvider
from app.services.answer_analyzer import AnalysisUnavailableError, AnswerAnalyzer
from app.schemas import AnswerAnalysis, AnswerIssue, CreateAttemptRequest
from app.config import Settings
from tests.fakes import FakeAIProvider


@pytest.mark.parametrize("status,code,reason,retryable", [
    (429, "rate_limit_exceeded", "rate_limit", True), (429, "insufficient_quota", "quota", False),
    (401, "invalid_api_key", "authentication", False), (500, "server_error", "provider_status", True),
    (400, "bad_request", "provider_status", False),
])
def test_provider_status_taxonomy_is_safe(status, code, reason, retryable):
    exc = APIStatusError("PRIVATE secret raw transcript", response=httpx.Response(status, request=httpx.Request("POST", "https://example.invalid")), body={"code": code, "message": "PRIVATE"})
    failure = classify_provider_error(exc)
    assert (failure.kind, failure.stage, failure.reason, failure.retryable) == ("external_model", "provider_request", reason, retryable)
    assert failure.provider_status == status
    assert "PRIVATE" not in failure.model_dump_json()


def test_timeout_and_schema_errors_are_different():
    assert classify_provider_error(APITimeoutError(request=httpx.Request("POST", "https://example.invalid"))).reason == "timeout"
    assert classify_provider_error(ValueError("PRIVATE invalid JSON")).kind == "response_parse"


@pytest.mark.parametrize("language", ["ru", "en"])
@pytest.mark.parametrize("transcript,evidence,correction", [
    ("Da li radiš. Radim sada.", "Da li radiš.", "Da li radiš?"),
    ("Да ли радиш. Радим сада.", "Да ли радиш.", "Да ли радиш?"),
])
def test_punctuation_rejection_retries_with_feedback_and_preserves_original(language, transcript, evidence, correction, caplog):
    from app.services.interface_language import interface_language
    invalid = AnswerAnalysis(verdict="mostly_correct", semantic_score=.98, grammar_score=.98,
        lexical_score=1, naturalness_score=.98, fluency_score=1, corrected_sr="Da li radiš? Radim trenutno.",
        short_feedback_ru="Synthetic", detailed_feedback_ru="Synthetic", issues=[AnswerIssue(
            type="naturalness", skill_key=None, severity=.1, confidence=1, evidence=evidence, correction=correction)])
    valid = invalid.model_copy(update={"verdict": "correct", "issues": []})
    calls = []
    class AI(FakeAIProvider):
        def analyze_answer(self, **kwargs):
            calls.append(kwargs)
            # Grounding evaluates latinica but never changes the stored original.
            if len(calls) == 1:
                from app.services.serbian_text import serbian_latin_for_evaluation
                return invalid.model_copy(update={"issues": [invalid.issues[0].model_copy(update={
                    "evidence": serbian_latin_for_evaluation(evidence), "correction": serbian_latin_for_evaluation(correction)})]})
            return valid
    token = interface_language.set(language)
    try:
        result = AnswerAnalyzer(AI(available=True)).analyze(source_ru="Synthetic source", transcript_sr=transcript,
            canonical_sr="Da li radiš? Radim trenutno.", intended_sr_variants=[], target_skills=[],
            timing=CreateAttemptRequest(exercise_id="synthetic", transcript_sr=transcript))
    finally:
        interface_language.reset(token)
    assert result.verdict == "correct" and result.issues == []
    assert len(calls) == 2 and "validation_feedback" not in calls[0]
    assert calls[1]["validation_feedback"] == "non_lexical_correction"
    assert calls[1]["transcript_sr"] == calls[0]["transcript_sr"]
    assert "non_lexical_correction" in caplog.text
    assert "Synthetic source" not in caplog.text and transcript not in caplog.text


def test_invalid_retry_has_parse_failure_not_provider_outage():
    analysis = AnswerAnalysis(verdict="mostly_correct", semantic_score=.9, grammar_score=.9, lexical_score=.9,
        naturalness_score=.9, fluency_score=1, corrected_sr="Radim trenutno.", short_feedback_ru="Synthetic",
        detailed_feedback_ru="Synthetic", issues=[AnswerIssue(type="meaning", skill_key=None, severity=.1,
        confidence=1, evidence="Radim.", correction="Radim?")])
    ai = FakeAIProvider(available=True, analysis_result=analysis)
    token = diagnostic_context.set(str(uuid4()))
    try:
        with pytest.raises(AnalysisUnavailableError) as error:
            AnswerAnalyzer(ai).analyze(source_ru="Synthetic", transcript_sr="Radim sada.",
                canonical_sr="Radim trenutno.", intended_sr_variants=[], target_skills=[],
                timing=CreateAttemptRequest(exercise_id="synthetic", transcript_sr="Radim sada."))
        assert error.value.failure.kind == "response_parse"
        assert error.value.failure.reason == "non_lexical_correction"
        assert error.value.failure.diagnostic_id == diagnostic_context.get()
        assert ai.analysis_calls == 2
    finally:
        diagnostic_context.reset(token)


def test_adapter_classifies_schema_failure_and_sends_retry_feedback():
    provider = OpenAIStructuredProvider(Settings(_env_file=None, openai_api_key="synthetic", openai_text_model="env-only-test"))
    parse = Mock(return_value=SimpleNamespace(output_parsed={"invalid": "PRIVATE"}))
    provider._client = SimpleNamespace(responses=SimpleNamespace(parse=parse))
    with pytest.raises(AIServiceError) as error:
        provider.analyze_answer(source_ru="Synthetic", transcript_sr="Synthetic", canonical_sr=None,
            intended_sr_variants=[], target_skills=[], timings={}, validation_feedback="non_lexical_correction")
    assert error.value.failure.kind == "response_parse"
    assert error.value.failure.stage == "structured_output"
    assert '"previous_validation_failure": "non_lexical_correction"' in parse.call_args.kwargs["input"]
    assert "PRIVATE" not in error.value.failure.model_dump_json()


@pytest.mark.parametrize("exception,stage,reason", [
    (ResponseValidationError([{"type": "missing", "loc": ["response", "PRIVATE"], "input": "PRIVATE"}]), "serialization", "serialization_failed"),
    (OperationalError("PRIVATE SQL", {}, Exception("PRIVATE secret")), "persistence", "persistence_failed"),
    (RuntimeError("PRIVATE transcript"), "server_return", "server_return_failed"),
])
def test_return_failures_never_leak_and_keep_request_id(exception, stage, reason):
    from app.main import response_validation_failed, persistence_failed, unhandled_return_failed, record_request_timing
    local = FastAPI()
    local.middleware("http")(record_request_timing)
    local.add_exception_handler(ResponseValidationError, response_validation_failed)
    local.add_exception_handler(OperationalError, persistence_failed)
    local.add_exception_handler(Exception, unhandled_return_failed)
    @local.get("/synthetic")
    def endpoint():
        raise exception
    request_id = str(uuid4())
    with TestClient(local, raise_server_exceptions=False) as client:
        response = client.get("/synthetic", headers={"X-Request-ID": request_id})
    assert response.status_code == 500
    assert response.headers["X-Request-ID"] == request_id
    failure = response.json()["detail"]["failure"]
    assert (failure["kind"], failure["stage"], failure["reason"]) == ("response_return", stage, reason)
    assert failure["diagnostic_id"] == request_id
    assert "PRIVATE" not in response.text


def test_failed_attempt_exposes_correlated_metadata_without_charging_attempt(api_client, db_session):
    from app.main import app
    from app.services.ai_adapter import get_ai_provider
    from app.models import Attempt
    from sqlalchemy import select, func
    from tests.test_attempts_api import _exercise
    exercise = _exercise(api_client)
    class AI(FakeAIProvider):
        def analyze_answer(self, **_kwargs):
            raise AIServiceError("PRIVATE", diagnostic("external_model", "provider_request", "quota", retryable=False))
    app.dependency_overrides[get_ai_provider] = lambda: AI(available=True)
    request_id = str(uuid4())
    response = api_client.post("/api/attempts", json={"exercise_id": exercise["id"], "transcript_sr": "Synthetic unmatched words."}, headers={"X-Request-ID": request_id})
    assert response.status_code == 503
    detail = response.json()["detail"]
    assert detail["code"] == "analysis_unavailable" and detail["retryable"] is False
    assert detail["failure"]["kind"] == "external_model" and detail["failure"]["reason"] == "quota"
    assert detail["failure"]["diagnostic_id"] == response.headers["X-Request-ID"] == request_id
    assert "PRIVATE" not in response.text
    assert db_session.scalar(select(func.count()).select_from(Attempt)) == 0


def test_bad_request_id_is_replaced_and_context_is_reset(api_client):
    response = api_client.get("/api/health", headers={"X-Request-ID": "PRIVATE unsafe value"})
    UUID(response.headers["X-Request-ID"])
    assert diagnostic_context.get() is None
