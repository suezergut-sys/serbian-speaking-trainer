from fastapi.testclient import TestClient
from uuid import uuid4
import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.main import app
from app.models import Attempt, AttemptRequest, ErrorEvent, Exercise, LearnerSkill, ReviewPhrase, Skill, User
from app.schemas import AnswerAnalysis, AnswerIssue
from app.services.ai_adapter import AIServiceError, get_ai_provider
from tests.fakes import FakeAIProvider, create_custom_phrase


def _exercise(api_client: TestClient) -> dict:
    training_session = api_client.post("/api/sessions", json={"topic_id": "cafe"}).json()
    return api_client.post(f"/api/sessions/{training_session['id']}/next-exercise").json()


@pytest.mark.parametrize("language", ["ru", "en"])
def test_personal_topic_error_without_skills_is_saved_and_replayed(api_client: TestClient, db_session: Session, language: str) -> None:
    topic = api_client.post("/api/topics", json={"title_ru": "Личные планы"}).json()
    phrase = create_custom_phrase(api_client, {
        "source_ru": "Я приду завтра.", "canonical_sr": "Dolazim sutra.", "topic_id": topic["id"],
    })
    assert phrase.status_code == 201
    exercise = api_client.post("/api/sessions/start", json={"topic_id": topic["id"]}).json()["exercise"]
    assert exercise["targeted_skills"] == []
    skill_count = db_session.scalar(select(func.count()).select_from(Skill))
    reason = "Слово означает «сегодня», а задание говорит о завтрашнем дне." if language == "ru" else "The word means today, but the task refers to tomorrow."
    issue = AnswerIssue(type="meaning", skill_key=None, severity=0.5, confidence=1,
                        evidence="danas", correction="sutra", explanation_ru=reason)
    model = AnswerAnalysis(
        verdict="mostly_correct", semantic_score=0.7, grammar_score=1, lexical_score=0.7,
        naturalness_score=1, fluency_score=1, corrected_sr="Dolazim sutra.",
        short_feedback_ru=reason, detailed_feedback_ru=reason, issues=[issue],
    )
    ai = FakeAIProvider(available=True, analysis_result=model)
    app.dependency_overrides[get_ai_provider] = lambda: ai
    request = {"exercise_id": exercise["id"], "transcript_sr": "Dolazim danas.", "client_request_id": str(uuid4())}
    response = api_client.post("/api/attempts", json=request, headers={"X-Interface-Language": language})
    assert response.status_code == 201, response.json()
    result = response.json()
    assert result["analysis"]["verdict"] == "mostly_correct"
    assert result["analysis"]["issues"] == [issue.model_dump()]
    assert result["analysis"]["demonstrated_skills"] == result["learner_updates"] == []
    assert result["overall_score"] < 1
    assert api_client.post("/api/attempts", json=request).json() == result
    assert ai.analysis_calls == 1
    db_session.expire_all()
    stored = db_session.get(Attempt, result["id"])
    assert stored.analysis_json["issues"] == [issue.model_dump()]
    event = db_session.scalar(select(ErrorEvent).where(ErrorEvent.attempt_id == stored.id))
    assert event.skill_id is None
    assert event.evidence_json == {"evidence": "danas", "correction": "sutra"}
    assert db_session.scalar(select(func.count()).select_from(Skill)) == skill_count
    assert db_session.scalar(select(func.count()).select_from(LearnerSkill)) == 0


def test_submit_correct_text_attempt(api_client: TestClient, db_session: Session) -> None:
    exercise = _exercise(api_client)
    stored_exercise = db_session.get(Exercise, exercise["id"])
    assert stored_exercise is not None
    canonical = stored_exercise.target_hints_json["canonical_sr"]

    response = api_client.post(
        "/api/attempts",
        json={
            "exercise_id": exercise["id"],
            "transcript_sr": canonical,
            "reaction_ms": None,
            "timings": {},
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["analysis"]["verdict"] == "correct"
    assert payload["analysis"]["corrected_sr"] == canonical
    assert payload["analysis"]["pronunciation_score"] is None
    assert payload["overall_score"] == 1
    assert payload["analysis"]["issues"] == []
    assert payload["learner_updates"]
    assert all(update["mastery"] > 0 for update in payload["learner_updates"])
    stored = db_session.get(Attempt, payload["id"])
    assert stored is not None
    assert stored.transcript_sr == canonical
    assert stored.analysis_json["verdict"] == "correct"


def test_submit_incorrect_attempt_creates_error_event(api_client: TestClient, db_session: Session) -> None:
    exercise = _exercise(api_client)
    stored_exercise = db_session.get(Exercise, exercise["id"])
    assert stored_exercise is not None
    skill_key = stored_exercise.generation_meta_json["targeted_skill_keys"][0]
    app.dependency_overrides[get_ai_provider] = lambda: FakeAIProvider(available=True, analysis_result=AnswerAnalysis(
        verdict="needs_work", semantic_score=0.2, grammar_score=0.2, lexical_score=0.2,
        naturalness_score=0.2, fluency_score=1, corrected_sr="Ne znam.",
        short_feedback_ru="Попробуйте ещё раз.", detailed_feedback_ru="Нужно передать исходный смысл.",
        issues=[AnswerIssue(type="meaning", skill_key=skill_key, severity=0.8, confidence=0.9,
                            evidence="Ne znam.", correction="Исправленный вариант",
                            explanation_ru="Ответ означает «не знаю» и не выражает просьбу из задания.")],
    ))

    response = api_client.post(
        "/api/attempts",
        json={"exercise_id": exercise["id"], "transcript_sr": "Ne znam."},
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["analysis"]["verdict"] == "needs_work"
    assert payload["analysis"]["issues"]
    reason = "Ответ означает «не знаю» и не выражает просьбу из задания."
    assert payload["analysis"]["issues"][0]["explanation_ru"] == reason
    db_session.expire_all()
    stored_attempt = db_session.get(Attempt, payload["id"])
    assert stored_attempt.analysis_json["issues"][0]["explanation_ru"] == reason
    assert db_session.scalar(select(func.count()).select_from(ErrorEvent)) == 1
    assert db_session.scalar(select(func.count()).select_from(LearnerSkill)) == len(payload["learner_updates"])

    next_exercise = api_client.post(f"/api/sessions/{exercise['session_id']}/next-exercise")
    assert next_exercise.status_code == 201
    assert next_exercise.json()["source_ru"] != exercise["source_ru"]
    assert next_exercise.json()["targeted_skills"]


def test_attempt_validation_and_missing_exercise(api_client: TestClient) -> None:
    assert api_client.post(
        "/api/attempts",
        json={"exercise_id": "missing", "transcript_sr": "Dobar dan"},
    ).status_code == 404
    assert api_client.post(
        "/api/attempts",
        json={"exercise_id": "missing", "transcript_sr": ""},
    ).status_code == 422
    assert api_client.post(
        "/api/attempts",
        json={"exercise_id": "missing", "transcript_sr": "Dobar dan", "audio_blob": "forbidden"},
    ).status_code == 422


def test_attempt_request_replay_does_not_count_or_score_twice(api_client: TestClient, db_session: Session) -> None:
    exercise = _exercise(api_client)
    stored = db_session.get(Exercise, exercise["id"])
    assert stored is not None
    payload = {
        "client_request_id": str(uuid4()),
        "exercise_id": exercise["id"],
        "transcript_sr": stored.target_hints_json["canonical_sr"],
    }

    first = api_client.post("/api/attempts", json=payload)
    replay = api_client.post("/api/attempts", json=payload)

    assert first.status_code == replay.status_code == 201
    assert first.json() == replay.json()
    assert first.json()["daily_usage"]["used"] == 1
    assert db_session.scalar(select(func.count()).select_from(Attempt)) == 1
    assert db_session.scalar(select(func.count()).select_from(AttemptRequest)) == 1
    phrase = db_session.scalar(select(ReviewPhrase))
    assert phrase is not None and phrase.attempts == 1
    assert all(state.attempts == 1 for state in db_session.scalars(select(LearnerSkill)))

    conflict = api_client.post("/api/attempts", json={**payload, "transcript_sr": "Drugi odgovor"})
    assert conflict.status_code == 409
    assert conflict.json()["detail"]["code"] == "attempt_request_conflict"
    assert db_session.scalar(select(func.count()).select_from(Attempt)) == 1


def test_analysis_unavailable_preserves_progress_and_allows_same_request_retry(
    api_client: TestClient, db_session: Session,
) -> None:
    exercise = _exercise(api_client)
    stored = db_session.get(Exercise, exercise["id"])
    assert stored is not None
    db_session.commit()
    class FailingAI(FakeAIProvider):
        def analyze_answer(self, **_kwargs):
            raise AIServiceError("simulated provider failure")

    app.dependency_overrides[get_ai_provider] = lambda: FailingAI(available=True)
    payload = {
        "client_request_id": str(uuid4()),
        "exercise_id": exercise["id"],
        "transcript_sr": "Ne znam.",
    }

    unavailable = api_client.post("/api/attempts", json=payload)
    assert unavailable.status_code == 503
    assert unavailable.json()["detail"] == {
        "code": "analysis_unavailable",
        "message": "Answer analysis is temporarily unavailable. Please retry.",
        "retryable": True,
    }
    for model in (Attempt, LearnerSkill, ReviewPhrase):
        assert db_session.scalar(select(func.count()).select_from(model)) == 0
    assert db_session.scalar(select(func.count()).select_from(AttemptRequest)) == 1
    assert api_client.get("/api/auth/me").json()["daily_usage"]["used"] == 0

    app.dependency_overrides[get_ai_provider] = lambda: FakeAIProvider(
        available=True,
        analysis_result=AnswerAnalysis(
            verdict="mostly_correct", semantic_score=0.8, grammar_score=0.8,
            lexical_score=0.8, naturalness_score=0.8, fluency_score=1,
            corrected_sr="Mogu li da dobijem jelovnik?",
            short_feedback_ru="Почти верно.", detailed_feedback_ru="Уточните перевод.",
            issues=[AnswerIssue(
                type="meaning", skill_key=stored.generation_meta_json["targeted_skill_keys"][0],
                severity=0.2, confidence=0.8, evidence="Ne znam.",
                correction="Mogu li da dobijem jelovnik?",
            )],
        ),
    )
    retried = api_client.post("/api/attempts", json=payload)
    assert retried.status_code == 201
    assert retried.json()["daily_usage"]["used"] == 1
    assert db_session.scalar(select(func.count()).select_from(Attempt)) == 1


def test_invalid_structured_issue_does_not_persist_false_grade(
    api_client: TestClient, db_session: Session,
) -> None:
    exercise = _exercise(api_client)
    stored = db_session.get(Exercise, exercise["id"])
    assert stored is not None
    skill_key = stored.generation_meta_json["targeted_skill_keys"][0]
    db_session.commit()
    ai = FakeAIProvider(available=True, analysis_result=AnswerAnalysis(
        verdict="mostly_correct", semantic_score=0.88, grammar_score=0.88,
        lexical_score=0.88, naturalness_score=0.88, fluency_score=1,
        corrected_sr="Ne znam.",
        short_feedback_ru="Нужно заменить букву.",
        detailed_feedback_ru="Ложное замечание.",
        issues=[AnswerIssue(type="grammar", skill_key=skill_key, severity=0.2,
                            confidence=0.9, evidence="Ne znam.", correction="Ne znam.")],
    ))
    app.dependency_overrides[get_ai_provider] = lambda: ai

    response = api_client.post("/api/attempts", json={
        "client_request_id": str(uuid4()),
        "exercise_id": exercise["id"],
        "transcript_sr": "Ne znam.",
    })

    assert response.status_code == 503
    assert ai.analysis_calls == 2
    for model in (Attempt, LearnerSkill, ReviewPhrase, ErrorEvent):
        assert db_session.scalar(select(func.count()).select_from(model)) == 0
    assert db_session.scalar(select(func.count()).select_from(AttemptRequest)) == 1
    assert api_client.get("/api/auth/me").json()["daily_usage"]["used"] == 0


def test_same_client_request_id_is_scoped_to_user(api_client: TestClient, db_session: Session) -> None:
    first_exercise = _exercise(api_client)
    first_stored = db_session.get(Exercise, first_exercise["id"])
    assert first_stored is not None
    request_id = str(uuid4())
    assert api_client.post("/api/attempts", json={
        "client_request_id": request_id,
        "exercise_id": first_exercise["id"],
        "transcript_sr": first_stored.target_hints_json["canonical_sr"],
    }).status_code == 201

    second_user = User(id=str(uuid4()), email="second@example.com", role="user", access_tier="free")
    db_session.add(second_user)
    db_session.flush()
    app.dependency_overrides[get_current_user] = lambda: second_user
    second_exercise = _exercise(api_client)
    second_stored = db_session.get(Exercise, second_exercise["id"])
    assert second_stored is not None
    response = api_client.post("/api/attempts", json={
        "client_request_id": request_id,
        "exercise_id": second_exercise["id"],
        "transcript_sr": second_stored.target_hints_json["canonical_sr"],
    })
    assert response.status_code == 201
    assert db_session.scalar(select(func.count()).select_from(AttemptRequest)) == 2
