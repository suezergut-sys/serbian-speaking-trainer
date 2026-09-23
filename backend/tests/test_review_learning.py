from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ReviewPhrase, WordLearningItem
from app.main import app
from app.schemas import PhrasePreparation, PrepareReviewPhraseRequest, WordHint
from app.services.ai_adapter import get_ai_provider
from app.services.review_service import PhrasePreparationUnavailableError, ReviewService
from tests.fakes import FakeAIProvider


def test_phrase_preparation_returns_validated_canonical_translation(db_session: Session) -> None:
    ai = FakeAIProvider(
        available=True,
        phrase_result=PhrasePreparation(
            intended_sr_variants=["Kasniću deset minuta."],
            word_hints=[WordHint(word_ru="задержусь", translation_sr="kasniću")],
        ),
    )

    prepared = ReviewService(db_session, ai).prepare_phrase(
        PrepareReviewPhraseRequest(source_ru="  Я задержусь на десять минут.  ")
    )

    assert prepared.source_ru == "Я задержусь на десять минут."
    assert prepared.canonical_sr == "Kasniću deset minuta."


def test_phrase_preparation_fails_safely_without_ai(db_session: Session) -> None:
    with pytest.raises(PhrasePreparationUnavailableError):
        ReviewService(db_session, FakeAIProvider()).prepare_phrase(
            PrepareReviewPhraseRequest(source_ru="Я задержусь на десять минут.")
        )


def test_phrase_preparation_api_returns_canonical_translation(api_client: TestClient) -> None:
    app.dependency_overrides[get_ai_provider] = lambda: FakeAIProvider(
        available=True,
        phrase_result=PhrasePreparation(
            intended_sr_variants=["Kasniću deset minuta."],
            word_hints=[],
        ),
    )

    response = api_client.post(
        "/api/review-phrases/prepare",
        json={"source_ru": "Я задержусь на десять минут."},
    )

    assert response.status_code == 200
    assert response.json()["canonical_sr"] == "Kasniću deset minuta."


def _exercise(api_client: TestClient) -> dict:
    session = api_client.post("/api/sessions", json={"topic_id": "cafe"}).json()
    return api_client.post(f"/api/sessions/{session['id']}/next-exercise").json()


def test_word_hint_is_saved_and_reduces_score(api_client: TestClient, db_session: Session) -> None:
    exercise = _exercise(api_client)

    hint = api_client.post(
        f"/api/exercises/{exercise['id']}/word-hints",
        json={"word": "меню"},
    )
    assert hint.status_code == 200
    assert hint.json()["translation_sr"] == "jelovnik"

    attempt = api_client.post(
        "/api/attempts",
        json={
            "exercise_id": exercise["id"],
            "transcript_sr": "Mogu li da dobijem jelovnik, molim vas?",
            "hinted_words": ["меню"],
        },
    )
    assert attempt.status_code == 201
    payload = attempt.json()
    assert payload["hint_penalty"] == 0.08
    assert payload["overall_score"] == round(payload["base_score"] - 0.08, 3)
    assert db_session.scalar(select(WordLearningItem).where(WordLearningItem.source_normalized == "меню"))
    assert api_client.get("/api/review-phrases").json()[0]["source_ru"] == exercise["source_ru"]


def test_custom_review_phrase_creates_exact_exercise(api_client: TestClient) -> None:
    created = api_client.post(
        "/api/review-phrases",
        json={
            "source_ru": "Мне нужно позвонить хозяину квартиры.",
            "canonical_sr": "Moram da pozovem vlasnika stana.",
            "topic_id": "misc",
        },
    )
    assert created.status_code == 201
    phrase = created.json()

    session = api_client.post("/api/sessions", json={"review_phrase_id": phrase["id"]})
    assert session.status_code == 201
    exercise = api_client.post(f"/api/sessions/{session.json()['id']}/next-exercise")
    assert exercise.status_code == 201
    assert exercise.json()["source_ru"] == phrase["source_ru"]


def test_review_mode_cycles_through_active_phrases(api_client: TestClient) -> None:
    sources = ["Мне нужно позвонить хозяину.", "Я задержусь на десять минут."]
    translations = ["Moram da pozovem vlasnika.", "Kasniću deset minuta."]
    for source, canonical in zip(sources, translations, strict=True):
        response = api_client.post(
            "/api/review-phrases",
            json={"source_ru": source, "canonical_sr": canonical, "topic_id": "misc"},
        )
        assert response.status_code == 201

    session = api_client.post("/api/sessions", json={"review_mode": True})
    assert session.status_code == 201
    first = api_client.post(f"/api/sessions/{session.json()['id']}/next-exercise")
    second = api_client.post(f"/api/sessions/{session.json()['id']}/next-exercise")

    assert first.status_code == 201
    assert second.status_code == 201
    assert {first.json()["source_ru"], second.json()["source_ru"]} == set(sources)


def test_review_mode_rejects_an_empty_queue(api_client: TestClient) -> None:
    response = api_client.post("/api/sessions", json={"review_mode": True})
    assert response.status_code == 409
    assert response.json()["detail"] == "Review queue is empty"


def test_review_mode_starts_with_first_phrase_in_one_request(api_client: TestClient) -> None:
    created = api_client.post(
        "/api/review-phrases",
        json={
            "source_ru": "Мне нужно позвонить хозяину.",
            "canonical_sr": "Moram da pozovem vlasnika.",
            "topic_id": "misc",
        },
    )
    assert created.status_code == 201

    response = api_client.post("/api/sessions/start", json={"review_mode": True, "length": 10})

    assert response.status_code == 201
    payload = response.json()
    assert payload["session"]["topic"]["id"] == "review-phrases"
    assert payload["exercise"]["source_ru"] == created.json()["source_ru"]
    assert payload["exercise"]["session_id"] == payload["session"]["id"]


def test_ninety_five_percent_counts_as_a_correct_review(
    db_session: Session,
) -> None:
    phrase = ReviewPhrase(
        source_ru="Мне нужно позвонить хозяину.",
        source_normalized="мне нужно позвонить хозяину",
        intended_sr_variants_json=["Moram da pozovem stanodavca."],
    )
    db_session.add(phrase)
    db_session.commit()
    service = ReviewService(db_session, FakeAIProvider())

    service.record_attempt(
        source_ru=phrase.source_ru,
        intended_sr_variants=phrase.intended_sr_variants_json,
        word_hints=[], targeted_skill_keys=[], score=0.7, hinted_words=[],
        review_phrase_id=phrase.id,
    )
    for _ in range(2):
        service.record_attempt(
            source_ru=phrase.source_ru,
            intended_sr_variants=phrase.intended_sr_variants_json,
            word_hints=[],
            targeted_skill_keys=[],
            score=0.95,
            hinted_words=[],
            review_phrase_id=phrase.id,
        )
    db_session.commit()

    db_session.refresh(phrase)
    assert phrase.status == "mastered"
    assert phrase.perfect_streak == 2
    assert phrase.difficulty == "medium"
    assert phrase.interval_days == 7
    assert phrase.next_review_at is not None


def test_review_phrase_leaves_active_list_after_two_perfect_attempts(
    api_client: TestClient,
    db_session: Session,
) -> None:
    exercise = _exercise(api_client)
    phrase = ReviewPhrase(
        source_ru=exercise["source_ru"],
        source_normalized="можно мне пожалуйста меню",
        intended_sr_variants_json=["Mogu li da dobijem jelovnik, molim vas?"],
    )
    db_session.add(phrase)
    db_session.commit()

    for _ in range(2):
        session = api_client.post("/api/sessions", json={"review_phrase_id": phrase.id}).json()
        review_exercise = api_client.post(f"/api/sessions/{session['id']}/next-exercise").json()
        response = api_client.post(
            "/api/attempts",
            json={
                "exercise_id": review_exercise["id"],
                "transcript_sr": "Mogu li da dobijem jelovnik, molim vas?",
            },
        )
        assert response.json()["overall_score"] == 1.0

    assert api_client.get("/api/review-phrases").json() == []
    db_session.refresh(phrase)
    assert phrase.status == "mastered"
    assert phrase.perfect_streak == 2


def test_first_try_success_is_easy_and_due_phrase_returns_with_longer_interval(
    db_session: Session,
) -> None:
    phrase = ReviewPhrase(
        source_ru="Где находится вокзал?",
        source_normalized="где находится вокзал",
        intended_sr_variants_json=["Gde se nalazi stanica?"],
    )
    db_session.add(phrase)
    db_session.commit()
    service = ReviewService(db_session, FakeAIProvider())
    started_at = datetime(2026, 9, 20, 10, tzinfo=timezone.utc)

    for minute in (0, 1):
        service.record_attempt(
            source_ru=phrase.source_ru,
            intended_sr_variants=phrase.intended_sr_variants_json,
            word_hints=[], targeted_skill_keys=[], score=0.95, hinted_words=[],
            review_phrase_id=phrase.id, now=started_at + timedelta(minutes=minute),
        )
    assert phrase.status == "mastered"
    assert phrase.difficulty == "easy"
    assert phrase.interval_days == 14

    phrase.next_review_at = started_at - timedelta(seconds=1)
    db_session.flush()
    assert service.list_phrases()[0].id == phrase.id
    assert phrase.status == "active"
    assert phrase.perfect_streak == 0

    for minute in (2, 3):
        service.record_attempt(
            source_ru=phrase.source_ru,
            intended_sr_variants=phrase.intended_sr_variants_json,
            word_hints=[], targeted_skill_keys=[], score=1.0, hinted_words=[],
            review_phrase_id=phrase.id, now=started_at + timedelta(minutes=minute),
        )
    assert phrase.status == "mastered"
    assert phrase.interval_days == 35
    assert phrase.mastery_count == 2


def test_two_errors_make_phrase_hard(db_session: Session) -> None:
    phrase = ReviewPhrase(
        source_ru="Мне нужен билет.",
        source_normalized="мне нужен билет",
        intended_sr_variants_json=["Treba mi karta."],
    )
    db_session.add(phrase)
    db_session.commit()
    service = ReviewService(db_session, FakeAIProvider())

    for score in (0.4, 0.8, 0.95, 1.0):
        service.record_attempt(
            source_ru=phrase.source_ru,
            intended_sr_variants=phrase.intended_sr_variants_json,
            word_hints=[], targeted_skill_keys=[], score=score, hinted_words=[],
            review_phrase_id=phrase.id,
        )

    assert phrase.status == "mastered"
    assert phrase.difficulty == "hard"
    assert phrase.incorrect_attempts == 2
    assert phrase.interval_days == 3
