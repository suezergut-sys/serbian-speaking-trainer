from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Attempt, ErrorEvent, Exercise, LearnerSkill


def _exercise(api_client: TestClient) -> dict:
    training_session = api_client.post("/api/sessions", json={"topic_id": "cafe"}).json()
    return api_client.post(f"/api/sessions/{training_session['id']}/next-exercise").json()


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

    response = api_client.post(
        "/api/attempts",
        json={"exercise_id": exercise["id"], "transcript_sr": "Ne znam."},
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["analysis"]["verdict"] == "needs_work"
    assert payload["analysis"]["issues"]
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
