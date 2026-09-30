from fastapi.testclient import TestClient
from uuid import uuid4
from sqlalchemy import event, func, select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.main import app
from app.models import Attempt, Exercise, ReviewPhrase, TopicPhrase, TopicPreset, TrainingSession


def test_new_session_skips_attempt_count_but_existing_session_reads_it(
    api_client: TestClient, db_session: Session,
) -> None:
    statements: list[str] = []

    def capture_query(_connection, _cursor, statement, _parameters, _context, _executemany) -> None:
        statements.append(statement.lower())

    assert db_session.bind is not None
    event.listen(db_session.bind, "before_cursor_execute", capture_query)
    try:
        created = api_client.post("/api/sessions", json={"topic_id": "cafe", "length": 3})
        creation_queries = list(statements)
        statements.clear()
        fetched = api_client.get(f"/api/sessions/{created.json()['id']}")
        fetch_queries = list(statements)
    finally:
        event.remove(db_session.bind, "before_cursor_execute", capture_query)

    assert created.status_code == 201
    assert fetched.status_code == 200
    assert created.json()["completed_count"] == fetched.json()["completed_count"] == 0
    assert len(creation_queries) == 3
    def is_attempt_count(sql: str) -> bool:
        return "count(" in sql and "distinct" in sql and "attempts.exercise_id" in sql

    assert not any(is_attempt_count(sql) for sql in creation_queries)
    assert len([sql for sql in fetch_queries if is_attempt_count(sql)]) == 1


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
    assert exercise.json()["detail"]["code"] == "topic_empty"


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
    catalog_phrase = db_session.get(TopicPhrase, stored.generation_meta_json["topic_phrase_id"])
    assert catalog_phrase is not None
    assert stored.target_hints_json["canonical_sr"] == catalog_phrase.canonical_sr
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
    lock_updates = [
        sql for sql in statements
        if sql.lstrip().startswith("UPDATE training_sessions SET id=training_sessions.id")
    ]
    assert len(lock_updates) == 1
    assert len(statements) - len(lock_updates) <= 8


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


def test_next_exercise_request_id_replays_and_legacy_no_body_can_advance(
    api_client: TestClient, db_session: Session,
) -> None:
    session_id = api_client.post("/api/sessions", json={"topic_id": "cafe", "length": 3}).json()["id"]
    request_id = str(uuid4())
    url = f"/api/sessions/{session_id}/next-exercise"

    first = api_client.post(url, json={"client_request_id": request_id})
    replay = api_client.post(url, json={"client_request_id": request_id})
    second = api_client.post(url, json={"client_request_id": str(uuid4())})
    legacy = api_client.post(url)

    assert first.status_code == replay.status_code == second.status_code == legacy.status_code == 201
    assert first.json() == replay.json()
    assert len({first.json()["id"], second.json()["id"], legacy.json()["id"]}) == 3
    assert len(db_session.scalars(select(Exercise).where(Exercise.session_id == session_id)).all()) == 3


def test_normal_session_completes_after_checked_length_and_rejects_surplus(
    api_client: TestClient, db_session: Session,
) -> None:
    session_id = api_client.post("/api/sessions", json={"topic_id": "cafe", "length": 2}).json()["id"]
    url = f"/api/sessions/{session_id}/next-exercise"
    first = api_client.post(url).json()
    second = api_client.post(url).json()
    surplus = api_client.post(url).json()

    for exercise, expected_count in ((first, 1), (second, 2)):
        stored = db_session.get(Exercise, exercise["id"])
        assert stored is not None
        response = api_client.post("/api/attempts", json={
            "client_request_id": str(uuid4()),
            "exercise_id": exercise["id"],
            "transcript_sr": stored.target_hints_json["canonical_sr"],
        })
        assert response.status_code == 201
        assert response.json()["daily_usage"]["used"] == expected_count

    fetched = api_client.get(f"/api/sessions/{session_id}")
    assert fetched.json()["status"] == "completed"
    assert fetched.json()["completed_count"] == 2
    entity = db_session.get(TrainingSession, session_id)
    assert entity is not None and entity.ended_at is not None
    assert api_client.post(url).json()["detail"]["code"] == "session_completed"
    surplus_attempt = api_client.post("/api/attempts", json={
        "exercise_id": surplus["id"], "transcript_sr": "Ne mogu.",
    })
    assert surplus_attempt.status_code == 409
    assert surplus_attempt.json()["detail"]["code"] == "session_completed"
    assert len(db_session.scalars(select(Attempt)).all()) == 2


def test_review_carousel_remains_open_after_requested_length(
    api_client: TestClient, db_session: Session,
) -> None:
    normal = api_client.post("/api/sessions", json={"topic_id": "cafe"}).json()
    first = api_client.post(f"/api/sessions/{normal['id']}/next-exercise").json()
    stored = db_session.get(Exercise, first["id"])
    assert stored is not None
    assert api_client.post("/api/attempts", json={
        "exercise_id": first["id"], "transcript_sr": stored.target_hints_json["canonical_sr"],
    }).status_code == 201

    review = api_client.post("/api/sessions", json={"review_mode": True, "length": 1}).json()
    review_url = f"/api/sessions/{review['id']}/next-exercise"
    review_exercise = api_client.post(review_url).json()
    stored_review = db_session.get(Exercise, review_exercise["id"])
    assert stored_review is not None
    assert api_client.post("/api/attempts", json={
        "exercise_id": review_exercise["id"],
        "transcript_sr": stored_review.target_hints_json["canonical_sr"],
    }).status_code == 201
    assert api_client.get(f"/api/sessions/{review['id']}").json()["status"] == "active"
    assert api_client.get(f"/api/sessions/{review['id']}").json()["completed_count"] == 1
    assert api_client.post(review_url).status_code == 201


def test_added_phrase_is_counted_and_selectable_in_its_topic(
    api_client: TestClient, db_session: Session, monkeypatch,
) -> None:
    added = ReviewPhrase(
        source_ru="Мне нужен стол у окна.",
        source_normalized="мне нужен стол у окна",
        intended_sr_variants_json=["Treba mi sto pored prozora."],
        topic_id="cafe",
        status="active",
    )
    db_session.add(added)
    db_session.flush()
    topics = api_client.get("/api/topics").json()
    assert next(topic for topic in topics if topic["id"] == "cafe")["phrase_count"] == 21

    monkeypatch.setattr("app.services.exercise_generator.random.choice", lambda choices: choices[-1])
    session_id = api_client.post("/api/sessions", json={"topic_id": "cafe"}).json()["id"]
    exercise = api_client.post(f"/api/sessions/{session_id}/next-exercise").json()
    assert exercise["source_ru"] == added.source_ru
    stored = db_session.get(Exercise, exercise["id"])
    assert stored is not None
    assert stored.generation_meta_json["review_phrase_id"] == added.id
