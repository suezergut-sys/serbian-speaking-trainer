from datetime import datetime, timezone

from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.orm import Session

from app.models import Attempt, Exercise, ReviewPhrase, TopicPhrase, TopicPreset, TrainingSession, User


def _add_attempt(db: Session, *, created_at: datetime, suffix: str, score: float = 0.8) -> None:
    training_session = TrainingSession(normalized_topic_json={})
    db.add(training_session)
    db.flush()
    exercise = Exercise(session_id=training_session.id, source_ru=f"Фраза {suffix}")
    db.add(exercise)
    db.flush()
    db.add(
        Attempt(
            exercise_id=exercise.id,
            transcript_sr=f"Odgovor {suffix}",
            overall_score=score,
            created_at=created_at,
        )
    )


def test_monthly_statistics_groups_completed_phrases_by_local_day(
    api_client: TestClient,
    db_session: Session,
) -> None:
    _add_attempt(
        db_session,
        created_at=datetime(2026, 8, 31, 22, 30, tzinfo=timezone.utc),
        suffix="one",
    )
    _add_attempt(
        db_session,
        created_at=datetime(2026, 9, 1, 10, 0, tzinfo=timezone.utc),
        suffix="two",
        score=0.95,
    )
    db_session.add(
        ReviewPhrase(
            source_ru="Освоенная фраза",
            source_normalized="освоенная фраза",
            status="mastered",
            perfect_streak=3,
            mastered_at=datetime(2026, 9, 1, 11, 0, tzinfo=timezone.utc),
        )
    )
    _add_attempt(
        db_session,
        created_at=datetime(2026, 9, 2, 21, 30, tzinfo=timezone.utc),
        suffix="three",
    )
    db_session.commit()

    response = api_client.get(
        "/api/statistics/monthly",
        params={"month": "2026-09", "utc_offset_minutes": 180},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["month"] == "2026-09"
    assert payload["active_days"] == 2
    assert payload["total_phrases"] == 3
    assert len(payload["days"]) == 30
    assert payload["total_translations"] == 3
    assert payload["correct_translations"] == 1
    assert payload["mastered_phrases"] == 1
    assert payload["days"][0] == {
        "date": "2026-09-01",
        "phrase_count": 2,
        "translation_count": 2,
        "correct_translation_count": 1,
        "mastered_phrase_count": 1,
    }
    assert payload["days"][2]["translation_count"] == 1


def test_monthly_statistics_validates_month_and_timezone(api_client: TestClient) -> None:
    invalid_month = api_client.get(
        "/api/statistics/monthly",
        params={"month": "2026-13", "utc_offset_minutes": 180},
    )
    invalid_timezone = api_client.get(
        "/api/statistics/monthly",
        params={"month": "2026-09", "utc_offset_minutes": 900},
    )

    assert invalid_month.status_code == 422
    assert invalid_timezone.status_code == 422


def test_monthly_statistics_reads_only_timestamps_and_scores(
    api_client: TestClient,
    db_session: Session,
) -> None:
    _add_attempt(db_session, created_at=datetime(2026, 9, 1, 2, 30, tzinfo=timezone.utc), suffix="projection", score=0.95)
    db_session.add(ReviewPhrase(
        source_ru="Освоенная", source_normalized="освоенная", status="mastered",
        mastered_at=datetime(2026, 9, 1, 2, 30, tzinfo=timezone.utc),
    ))
    db_session.commit()
    sql: list[str] = []

    def capture_sql(_connection, _cursor, statement, _parameters, _context, _executemany) -> None:
        sql.append(statement)

    assert db_session.bind is not None
    event.listen(db_session.bind, "before_cursor_execute", capture_sql)
    try:
        response = api_client.get("/api/statistics/monthly", params={"month": "2026-08", "utc_offset_minutes": -180})
    finally:
        event.remove(db_session.bind, "before_cursor_execute", capture_sql)

    assert response.status_code == 200
    assert response.json()["total_phrases"] == 1
    assert response.json()["correct_translations"] == 1
    assert response.json()["mastered_phrases"] == 1
    assert response.json()["days"][30]["date"] == "2026-08-31"
    assert response.json()["days"][30]["mastered_phrase_count"] == 1
    attempt_sql = [statement for statement in sql if "FROM attempts" in statement]
    mastered_sql = [statement for statement in sql if "FROM review_phrases" in statement]
    assert len(attempt_sql) == len(mastered_sql) == 1
    assert "SELECT attempts.created_at, attempts.overall_score" in attempt_sql[0]
    assert "SELECT review_phrases.mastered_at" in mastered_sql[0]
    assert "transcript_sr" not in attempt_sql[0]
    assert "source_ru" not in mastered_sql[0]


def test_phrase_statistics_are_grouped_by_database_topics_and_paginated(
    api_client: TestClient,
    db_session: Session,
) -> None:
    topic_phrase = db_session.get(TopicPhrase, "cafe-01")
    assert topic_phrase is not None
    db_session.add(
        ReviewPhrase(
            source_ru=topic_phrase.source_ru,
            source_normalized="можно мне пожалуйста меню",
            intended_sr_variants_json=[topic_phrase.canonical_sr],
            topic_id=topic_phrase.topic_id,
            topic_phrase_id=topic_phrase.id,
            attempts=2,
            perfect_streak=2,
            status="mastered",
            difficulty="easy",
            interval_days=14,
            next_review_at=datetime(2026, 10, 4, tzinfo=timezone.utc),
        )
    )
    db_session.add(
        ReviewPhrase(
            source_ru="Своя фраза",
            source_normalized="своя фраза",
            intended_sr_variants_json=["Moja rečenica"],
            attempts=1,
            status="active",
            difficulty="medium",
        )
    )
    db_session.commit()

    response = api_client.get("/api/statistics/phrases", params={"page": 1, "page_size": "10"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 2
    assert {group["topic_title"] for group in payload["groups"]} == {"Кафе", "Свои фразы"}
    cafe = next(group for group in payload["groups"] if group["topic_title"] == "Кафе")
    assert cafe["phrases"][0]["target_sr"] == topic_phrase.canonical_sr
    assert cafe["phrases"][0]["status"] == "mastered"
    assert cafe["phrases"][0]["next_review_at"] is not None

    invalid = api_client.get("/api/statistics/phrases", params={"page_size": "25"})
    assert invalid.status_code == 422


def test_phrase_statistics_hides_foreign_topic_title_for_stale_reference(
    api_client: TestClient,
    db_session: Session,
) -> None:
    other_user = User(id="22222222-2222-2222-2222-222222222222", email="other-statistics@example.com")
    db_session.add(other_user)
    db_session.flush()
    own_topic = TopicPreset(
        id="own-statistics-topic", owner_user_id="00000000-0000-0000-0000-000000000001",
        title_ru="Моя тема", description_ru="Описание",
    )
    foreign_topic = TopicPreset(
        id="foreign-statistics-topic", owner_user_id=other_user.id,
        title_ru="Секретное название", description_ru="Описание",
    )
    db_session.add_all([own_topic, foreign_topic])
    db_session.flush()
    db_session.add_all([
        ReviewPhrase(
            source_ru="Устаревшая связь", source_normalized="устаревшая связь",
            intended_sr_variants_json=["Stara veza"], topic_id=foreign_topic.id,
        ),
        ReviewPhrase(
            source_ru="Своя тема", source_normalized="своя тема",
            intended_sr_variants_json=["Moja tema"], topic_id=own_topic.id,
        ),
        ReviewPhrase(
            user_id=other_user.id, source_ru="Чужая фраза", source_normalized="чужая фраза",
            intended_sr_variants_json=["Tuđa rečenica"], topic_id=foreign_topic.id,
        ),
    ])
    db_session.commit()

    response = api_client.get("/api/statistics/phrases", params={"page_size": "all"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 2
    assert "Секретное название" not in response.text
    assert "Чужая фраза" not in response.text
    groups = {group["topic_id"]: group for group in payload["groups"]}
    assert groups[foreign_topic.id]["topic_title"] == "Свои фразы"
    assert groups[foreign_topic.id]["phrases"][0]["source_ru"] == "Устаревшая связь"
    assert groups[own_topic.id]["topic_title"] == "Моя тема"
    topic_response = api_client.get("/api/statistics/phrase-topics")
    assert topic_response.status_code == 200
    assert "Секретное название" not in topic_response.text
    assert sum(topic["phrase_count"] for topic in topic_response.json()) == 2


def test_phrase_topic_filter_paginates_before_grouping_and_isolates_accounts(api_client, db_session):
    for index in range(11):
        db_session.add(ReviewPhrase(source_ru=f"Банк {index}", source_normalized=f"банк {index}", topic_id="bank", attempts=index))
    db_session.add(ReviewPhrase(source_ru="Кафе", source_normalized="кафе тест", topic_id="cafe", attempts=3))
    db_session.add(ReviewPhrase(source_ru="Без темы", source_normalized="без темы"))
    other = User(id="22222222-2222-2222-2222-222222222222", email="foreign-topic-filter@example.com")
    db_session.add(other)
    db_session.flush()
    db_session.add(ReviewPhrase(user_id=other.id, source_ru="Чужая фраза", source_normalized="чужая фраза", topic_id="bank"))
    db_session.commit()
    topics = api_client.get("/api/statistics/phrase-topics").json()
    assert {topic["topic_id"]: topic["phrase_count"] for topic in topics} == {"bank": 11, "cafe": 1, None: 1}
    response = api_client.get("/api/statistics/phrases", params={"topic_id": "bank", "page": 2, "page_size": "10"})
    payload = response.json()
    assert payload["total"] == 11 and payload["total_pages"] == 2
    assert len(payload["groups"]) == 1 and len(payload["groups"][0]["phrases"]) == 1
    assert payload["groups"][0]["topic_id"] == "bank"
    assert "Чужая фраза" not in response.text
    unassigned = api_client.get("/api/statistics/phrases", params={"topic_id": "unassigned"}).json()
    assert unassigned["total"] == 1 and unassigned["groups"][0]["topic_id"] is None
    empty = api_client.get("/api/statistics/phrases", params={"topic_id": other.id, "page": 5}).json()
    assert empty["total"] == 0 and empty["page"] == 1 and empty["groups"] == []
