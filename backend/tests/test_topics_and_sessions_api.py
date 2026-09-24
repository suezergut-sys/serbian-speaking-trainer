from fastapi.testclient import TestClient
from sqlalchemy import event, func, select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.main import app
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
    assert payload["word_hints"]
    assert {"word_ru", "translation_sr"} <= payload["word_hints"][0].keys()
    stored = db_session.scalar(select(Exercise).where(Exercise.id == payload["id"]))
    assert stored is not None
    assert stored.target_hints_json["intended_sr_variants"]
    assert stored.target_hints_json["canonical_sr"] == "Mogu li da dobijem jelovnik, molim vas?"
    assert stored.generation_meta_json["topic_phrase_id"] == "cafe-01"
    assert db_session.get(TrainingSession, session_payload["id"]) is not None


def test_start_session_returns_first_exercise_in_one_request(api_client: TestClient, db_session: Session, caplog) -> None:
    response = api_client.post("/api/sessions/start", json={"topic_id": "cafe", "length": 10})

    assert response.status_code == 201
    payload = response.json()
    assert payload["session"]["topic"]["id"] == "cafe"
    assert payload["exercise"]["session_id"] == payload["session"]["id"]
    assert payload["exercise"]["source_ru"]
    assert "intended_sr_variants" not in payload["exercise"]
    assert payload["exercise"]["word_hints"]
    assert "canonical_sr" not in payload["exercise"]
    assert db_session.get(Exercise, payload["exercise"]["id"]) is not None
    assert "total;dur=" in response.headers["Server-Timing"]
    assert any(
        record.name == "app.performance" and "path=/api/sessions/start" in record.message
        for record in caplog.records
    )


def test_start_session_rolls_back_when_topic_has_no_phrases(api_client: TestClient, db_session: Session) -> None:
    before = db_session.scalar(select(func.count()).select_from(TrainingSession))

    original_db_override = app.dependency_overrides[get_db]

    def transactional_db():
        try:
            yield db_session
            db_session.commit()
        except Exception:
            db_session.rollback()
            raise

    app.dependency_overrides[get_db] = transactional_db
    try:
        response = api_client.post("/api/sessions/start", json={"topic_id": "misc", "length": 10})
    finally:
        app.dependency_overrides[get_db] = original_db_override

    assert response.status_code == 409
    assert db_session.scalar(select(func.count()).select_from(TrainingSession)) == before


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
    assert len([sql for sql in statements if "JOIN learner_skills" in sql]) == 1
    assert len(statements) <= 7


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
    assert {"word_ru": "светлую", "translation_sr": "svetao"} in exercise["word_hints"]
