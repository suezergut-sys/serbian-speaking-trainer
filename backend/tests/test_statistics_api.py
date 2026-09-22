from datetime import datetime, timezone

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Attempt, Exercise, ReviewPhrase, TopicPhrase, TrainingSession


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
