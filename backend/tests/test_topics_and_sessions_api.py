from fastapi.testclient import TestClient
from sqlalchemy import event, select
from sqlalchemy.orm import Session

from app.models import Exercise, ReviewPhrase, TopicPhrase, TopicPreset, TrainingSession


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
    catalog_phrase = db_session.get(TopicPhrase, stored.generation_meta_json["topic_phrase_id"])
    assert catalog_phrase is not None
    assert stored.target_hints_json["canonical_sr"] == catalog_phrase.canonical_sr
    assert db_session.get(TrainingSession, session_payload["id"]) is not None


def test_first_preset_exercise_uses_batched_skill_queries(api_client: TestClient, db_session: Session) -> None:
    session_id = api_client.post("/api/sessions", json={"topic_id": "cafe"}).json()["id"]
    statements: list[str] = []

    def capture_query(_connection, _cursor, statement, _parameters, _context, _executemany) -> None:
        statements.append(statement)

    assert db_session.bind is not None
    event.listen(db_session.bind, "before_cursor_execute", capture_query)
    try:
        response = api_client.post(f"/api/sessions/{session_id}/next-exercise")
    finally:
        event.remove(db_session.bind, "before_cursor_execute", capture_query)

    assert response.status_code == 201
    assert len([sql for sql in statements if "FROM learner_skills" in sql]) == 1
    assert len(statements) <= 8


def test_missing_resources_and_validation(api_client: TestClient) -> None:
    assert api_client.post("/api/sessions", json={"topic_id": "missing"}).status_code == 404
    assert api_client.get("/api/sessions/missing").status_code == 404
    assert api_client.post("/api/sessions/missing/next-exercise").status_code == 404
    assert api_client.post("/api/topics/normalize", json={"text": "x"}).status_code == 422
    assert api_client.post(
        "/api/sessions",
        json={"topic_id": "bank", "custom_topic_text": "Своя тема"},
    ).status_code == 422


def test_preset_word_hint_comes_from_persistent_topic_catalog(api_client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr("app.services.exercise_generator.random.choice", lambda choices: choices[0])
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


def test_topic_counts_and_selection_exclude_mastered_catalog_phrases(
    api_client: TestClient, db_session: Session, monkeypatch,
) -> None:
    first = db_session.get(TopicPhrase, "cafe-01")
    assert first is not None
    db_session.add(ReviewPhrase(
        source_ru=first.source_ru,
        source_normalized="можно мне пожалуйста меню",
        intended_sr_variants_json=[first.canonical_sr],
        topic_id="cafe",
        topic_phrase_id=first.id,
        status="mastered",
    ))
    db_session.flush()
    topics = api_client.get("/api/topics").json()
    assert next(topic for topic in topics if topic["id"] == "cafe")["phrase_count"] == 19

    monkeypatch.setattr("app.services.exercise_generator.random.choice", lambda choices: choices[-1])
    session_id = api_client.post("/api/sessions", json={"topic_id": "cafe"}).json()["id"]
    exercise = api_client.post(f"/api/sessions/{session_id}/next-exercise").json()
    stored = db_session.get(Exercise, exercise["id"])
    assert stored is not None
    assert stored.generation_meta_json["topic_phrase_id"] == "cafe-20"
