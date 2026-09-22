from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Exercise, TopicPreset, TrainingSession


def test_topics_and_preset_session_snapshot(api_client: TestClient, db_session: Session) -> None:
    topics = api_client.get("/api/topics")
    assert topics.status_code == 200
    assert len(topics.json()) == 9
    miscellaneous = next(topic for topic in topics.json() if topic["id"] == "misc")
    assert miscellaneous["title_ru"] == "Разное"
    assert miscellaneous["phrase_count"] == 0

    created = api_client.post("/api/sessions", json={"topic_id": "bank", "length": 10})
    assert created.status_code == 201
    payload = created.json()
    assert payload["topic"]["title_ru"] == "Банк"
    assert payload["requested_length"] == 10

    bank = db_session.get(TopicPreset, "bank")
    assert bank is not None
    bank.title_ru = "Изменённый банк"
    db_session.flush()

    fetched = api_client.get(f"/api/sessions/{payload['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["topic"]["title_ru"] == "Банк"


def test_custom_topic_is_persisted_empty_without_generated_phrases(api_client: TestClient) -> None:
    topic = api_client.post("/api/topics", json={"title_ru": "Разговор с арендодателем"})
    assert topic.status_code == 201
    payload = topic.json()
    assert payload["is_custom"] is True
    assert payload["phrase_count"] == 0

    created = api_client.post("/api/sessions", json={"topic_id": payload["id"]})
    assert created.status_code == 201
    assert created.json()["topic"]["source"] == "custom"
    exercise = api_client.post(f"/api/sessions/{created.json()['id']}/next-exercise")
    assert exercise.status_code == 409


def test_next_exercise_is_persisted_without_exposing_answer(api_client: TestClient, db_session: Session) -> None:
    session_payload = api_client.post("/api/sessions", json={"topic_id": "cafe"}).json()

    response = api_client.post(f"/api/sessions/{session_payload['id']}/next-exercise")

    assert response.status_code == 201
    payload = response.json()
    assert payload["source_ru"]
    assert 1 <= len(payload["targeted_skills"]) <= 3
    assert "intended_sr_variants" not in payload
    stored = db_session.scalar(select(Exercise).where(Exercise.id == payload["id"]))
    assert stored is not None
    assert stored.target_hints_json["intended_sr_variants"]
    assert stored.target_hints_json["canonical_sr"] == "Mogu li da dobijem jelovnik, molim vas?"
    assert stored.generation_meta_json["topic_phrase_id"] == "cafe-01"
    assert db_session.get(TrainingSession, session_payload["id"]) is not None


def test_missing_resources_and_validation(api_client: TestClient) -> None:
    assert api_client.post("/api/sessions", json={"topic_id": "missing"}).status_code == 404
    assert api_client.get("/api/sessions/missing").status_code == 404
    assert api_client.post("/api/sessions/missing/next-exercise").status_code == 404
    assert api_client.post("/api/topics/normalize", json={"text": "x"}).status_code == 422
    assert api_client.post(
        "/api/sessions",
        json={"topic_id": "bank", "custom_topic_text": "Своя тема"},
    ).status_code == 422


def test_preset_word_hint_comes_from_persistent_topic_catalog(api_client: TestClient) -> None:
    session_payload = api_client.post("/api/sessions", json={"topic_id": "rent"}).json()
    exercise = api_client.post(f"/api/sessions/{session_payload['id']}/next-exercise").json()

    response = api_client.post(
        f"/api/exercises/{exercise['id']}/word-hints",
        json={"word": "светлую"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "word_ru": "светлую",
        "translation_sr": "svetao",
        "is_learning": True,
    }
