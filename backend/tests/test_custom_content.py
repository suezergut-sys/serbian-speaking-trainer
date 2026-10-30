import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.main import app
from app.models import ReviewPhrase, User, PhrasePreparationReceipt, TopicPreset, Attempt
from datetime import datetime, timedelta, timezone
from sqlalchemy import select, func
from app.services.ai_adapter import get_ai_provider
from tests.fakes import FakeAIProvider, create_custom_phrase


@pytest.mark.parametrize(("path", "body"), [
    ("/api/topics", {"title_ru": "   "}),
    ("/api/topics", {"title_ru": " x "}),
    ("/api/review-phrases/prepare", {"source_ru": "   "}),
    ("/api/review-phrases", {"source_ru": "   ", "canonical_sr": "Zdravo", "topic_id": "misc"}),
    ("/api/review-phrases", {"source_ru": "Привет", "canonical_sr": "  ", "topic_id": "misc"}),
])
def test_blank_custom_content_is_rejected(api_client: TestClient, path: str, body: dict) -> None:
    assert api_client.post(path, json=body).status_code == 422


@pytest.mark.parametrize("result", [
    {"unexpected": "invalid"}, {"intended_sr_variants": []},
    {"intended_sr_variants": ["   "]}, {"intended_sr_variants": ["x" * 301]},
])
def test_invalid_structured_translation_is_a_safe_failure(api_client: TestClient, monkeypatch, result) -> None:
    ai = FakeAIProvider(available=True)
    monkeypatch.setattr(ai, "prepare_phrase", lambda **_kwargs: result)
    app.dependency_overrides[get_ai_provider] = lambda: ai
    response = api_client.post("/api/review-phrases/prepare", json={"source_ru": "Я скоро вернусь."})
    assert response.status_code == 503
    assert response.json() == {"detail": "Canonical translation is unavailable"}


def test_custom_topic_and_phrase_are_private_and_trainable(api_client: TestClient, db_session: Session) -> None:
    topic = api_client.post("/api/topics", json={"title_ru": "  Моя   тема  "}).json()
    duplicate = api_client.post("/api/topics", json={"title_ru": "МОЯ ТЕМА"}).json()
    assert duplicate["id"] == topic["id"]
    assert topic["title_ru"] == "Моя тема"
    phrase = create_custom_phrase(api_client, {
        "source_ru": "Я скоро вернусь.", "canonical_sr": "Uskoro se vraćam.", "topic_id": topic["id"],
    }).json()
    topics = api_client.get("/api/topics").json()
    assert next(item for item in topics if item["id"] == topic["id"])["phrase_count"] == 1
    started = api_client.post("/api/sessions/start", json={"topic_id": topic["id"]})
    assert started.status_code == 201
    assert started.json()["exercise"]["source_ru"] == phrase["source_ru"]

    other = User(id="custom-content-other", email="other@example.invalid", role="user", access_tier="free")
    db_session.add(other)
    db_session.flush()
    app.dependency_overrides[get_current_user] = lambda: other
    assert topic["id"] not in {item["id"] for item in api_client.get("/api/topics").json()}
    assert api_client.get("/api/review-phrases").json() == []
    assert api_client.post("/api/review-phrases", json={
        "source_ru": "Я скоро вернусь.", "canonical_sr": "Uskoro se vraćam.", "topic_id": topic["id"],
    }).status_code == 422
    assert api_client.post("/api/sessions/start", json={"topic_id": topic["id"]}).status_code == 404


def test_duplicate_phrase_preserves_canonical_and_progress(api_client: TestClient, db_session: Session) -> None:
    topic = api_client.post("/api/topics", json={"title_ru": "Мои фразы"}).json()["id"]
    body = {"source_ru": "Я скоро вернусь.", "canonical_sr": "Uskoro se vraćam.", "topic_id": topic}
    first = create_custom_phrase(api_client, body).json()
    stored = db_session.get(ReviewPhrase, first["id"])
    stored.perfect_streak = 2
    db_session.flush()
    second = create_custom_phrase(api_client, {**body, "canonical_sr": "Changed model translation"}).json()
    assert first["id"] == second["id"]
    assert second["canonical_sr"] == first["canonical_sr"]
    assert second["perfect_streak"] == 2
    other_topic = api_client.post("/api/topics", json={"title_ru": "Другая тема"}).json()["id"]
    conflict = create_custom_phrase(api_client, {**body, "topic_id": other_topic})
    assert conflict.status_code == 409
    assert conflict.json()["detail"]["code"] == "phrase_already_exists"


def test_word_limit_boundary_without_calling_ai_for_sixteen_words(api_client: TestClient, monkeypatch) -> None:
    ai = FakeAIProvider(available=True)
    calls = []
    def prepare(**kwargs):
        calls.append(kwargs)
        return {"intended_sr_variants": ["Uskoro se vraćam."], "source_versions": {"ru": kwargs["source_ru"], "en": "A synthetic fifteen word phrase."}}
    monkeypatch.setattr(ai, "prepare_phrase", prepare)
    app.dependency_overrides[get_ai_provider] = lambda: ai
    assert api_client.post("/api/review-phrases/prepare", json={"source_ru": "слово " * 15}).status_code == 200
    rejected = api_client.post("/api/review-phrases/prepare", json={"source_ru": "слово " * 16})
    assert rejected.status_code == 422
    assert rejected.json()["detail"][0]["type"] == "phrase_word_limit"
    assert len(calls) == 1


def test_server_receipt_blocks_tampering_foreign_expired_and_replay_after_delete(api_client: TestClient, db_session: Session) -> None:
    topic = api_client.post("/api/topics", json={"title_ru": "Личная тема"}).json()["id"]
    phrase = create_custom_phrase(api_client, {"source_ru": "Я скоро вернусь.", "canonical_sr": "Uskoro se vraćam.", "topic_id": topic}).json()
    receipt = db_session.scalar(select(PhrasePreparationReceipt))
    payload = {"preparation_id": receipt.id, "topic_id": topic}
    assert api_client.post("/api/review-phrases", json={**payload, "canonical_sr": "Fake"}).status_code == 422
    assert api_client.post("/api/review-phrases", json={**payload, "source_ru": "Другая фраза"}).status_code == 422
    assert api_client.post("/api/review-phrases", json={**payload, "word_hints": []}).status_code == 422
    assert api_client.post("/api/review-phrases", json=payload).json()["id"] == phrase["id"]
    assert api_client.post("/api/review-phrases", json={**payload, "topic_id": "misc"}).json()["detail"]["code"] == "custom_topic_required"
    assert api_client.delete(f"/api/custom-phrases/{phrase['id']}").status_code == 204
    assert api_client.post("/api/review-phrases", json=payload).json()["detail"]["code"] == "phrase_preparation_used"
    receipt.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db_session.flush()
    assert api_client.post("/api/review-phrases", json=payload).json()["detail"]["code"] == "phrase_preparation_expired"


def test_five_topics_limit_and_delete_frees_slot(api_client: TestClient) -> None:
    topics = [api_client.post("/api/topics", json={"title_ru": f"Своя тема {i}"}).json() for i in range(5)]
    assert api_client.post("/api/topics", json={"title_ru": "Своя тема 0"}).status_code == 201
    rejected = api_client.post("/api/topics", json={"title_ru": "Шестая тема"})
    assert rejected.status_code == 409
    assert rejected.json()["detail"]["code"] == "custom_topic_limit"
    assert api_client.delete(f"/api/topics/{topics[0]['id']}").status_code == 204
    assert api_client.post("/api/topics", json={"title_ru": "Шестая тема"}).status_code == 201
    assert api_client.delete("/api/topics/misc").status_code == 404


def test_thirty_phrases_including_mastered_and_delete_frees_slot(api_client: TestClient, db_session: Session) -> None:
    topic = api_client.post("/api/topics", json={"title_ru": "Личная тема"}).json()["id"]
    for i in range(30):
        created = create_custom_phrase(api_client, {"source_ru": f"Моя фраза {i}", "canonical_sr": f"Moja fraza {i}", "topic_id": topic})
        assert created.status_code == 201
    first = api_client.get("/api/custom-phrases").json()[0]
    stored = db_session.get(ReviewPhrase, first["id"])
    stored.status = "mastered"
    db_session.flush()
    assert len(api_client.get("/api/custom-phrases").json()) == 30
    listed_topic = next(item for item in api_client.get("/api/topics").json() if item["id"] == topic)
    assert listed_topic["custom_phrase_count"] == 30
    body = {"source_ru": "Тридцать первая фраза", "canonical_sr": "Nova fraza", "topic_id": topic}
    rejected = create_custom_phrase(api_client, body)
    assert rejected.status_code == 409
    assert rejected.json()["detail"]["code"] == "custom_phrase_limit"
    assert api_client.delete(f"/api/custom-phrases/{first['id']}").status_code == 204
    assert create_custom_phrase(api_client, body).status_code == 201


def test_delete_topic_removes_all_phrases_and_blocks_stale_exercises_preserving_history(api_client: TestClient, db_session: Session) -> None:
    topic = api_client.post("/api/topics", json={"title_ru": "Личная тема"}).json()["id"]
    phrase = create_custom_phrase(api_client, {"source_ru": "Я скоро вернусь.", "canonical_sr": "Uskoro se vraćam.", "topic_id": topic}).json()
    started = api_client.post("/api/sessions/start", json={"topic_id": topic}).json()
    exercise_id = started["exercise"]["id"]
    checked = api_client.post("/api/attempts", json={"exercise_id": exercise_id, "transcript_sr": "Uskoro se vraćam."})
    assert checked.status_code == 201
    count_before = db_session.scalar(select(func.count()).select_from(Attempt))
    assert api_client.delete(f"/api/topics/{topic}").status_code == 204
    assert api_client.get("/api/custom-phrases").json() == []
    assert api_client.get("/api/review-phrases/summary").json()["phrase_count"] == 0
    assert db_session.get(ReviewPhrase, phrase["id"]) is None
    assert db_session.get(TopicPreset, topic) is None
    assert db_session.scalar(select(func.count()).select_from(Attempt)) == count_before
    late = api_client.post("/api/attempts", json={"exercise_id": exercise_id, "transcript_sr": "Uskoro se vraćam."})
    assert late.status_code == 409
    assert late.json()["detail"]["code"] == "custom_content_deleted"
    assert api_client.post(f"/api/sessions/{started['session']['id']}/next-exercise").status_code == 409
    assert api_client.get("/api/custom-phrases").json() == []


def test_foreign_delete_list_and_preparation_are_owner_scoped(api_client: TestClient, db_session: Session) -> None:
    owner = app.dependency_overrides[get_current_user]()
    topic = api_client.post("/api/topics", json={"title_ru": "Личная тема"}).json()["id"]
    phrase = create_custom_phrase(api_client, {"source_ru": "Я скоро вернусь.", "canonical_sr": "Uskoro se vraćam.", "topic_id": topic}).json()
    receipt = db_session.scalar(select(PhrasePreparationReceipt))
    other = User(id="custom-other", email="custom-other@example.invalid", role="user", access_tier="free")
    db_session.add(other); db_session.flush()
    app.dependency_overrides[get_current_user] = lambda: other
    other_topic = api_client.post("/api/topics", json={"title_ru": "Другая личная тема"}).json()["id"]
    assert api_client.get("/api/custom-phrases").json() == []
    assert api_client.delete(f"/api/custom-phrases/{phrase['id']}").status_code == 404
    assert api_client.delete(f"/api/topics/{topic}").status_code == 404
    foreign = api_client.post("/api/review-phrases", json={"preparation_id": receipt.id, "topic_id": other_topic})
    assert foreign.status_code == 409
    app.dependency_overrides[get_current_user] = lambda: owner
    assert len(api_client.get("/api/custom-phrases").json()) == 1


def test_global_150_limit_also_covers_legacy_extra_topics(api_client: TestClient, db_session: Session) -> None:
    owner = app.dependency_overrides[get_current_user]()
    topics = [api_client.post("/api/topics", json={"title_ru": f"Моя тема {i}"}).json()["id"] for i in range(5)]
    for topic_index, topic in enumerate(topics):
        db_session.add_all([ReviewPhrase(user_id=owner.id, topic_id=topic, source_ru=f"Фраза {topic_index} {i}", source_normalized=f"фраза {topic_index} {i}", intended_sr_variants_json=["Moja fraza."]) for i in range(30)])
    # Old data is preserved, but cannot be used to exceed the new total quota.
    db_session.add(TopicPreset(id="legacy-custom", owner_user_id=owner.id, title_ru="Старая тема", description_ru="", is_custom=True))
    db_session.flush()
    response = create_custom_phrase(api_client, {"source_ru": "Дополнительная личная фраза", "canonical_sr": "Moja nova fraza.", "topic_id": "legacy-custom"})
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "custom_total_phrase_limit"
    assert len(api_client.get("/api/custom-phrases").json()) == 150


def test_delete_during_analysis_cannot_recreate_phrase(api_client: TestClient, db_session: Session, monkeypatch) -> None:
    from app.services.answer_analyzer import AnswerAnalyzer
    from app.services.review_service import ReviewService
    owner = app.dependency_overrides[get_current_user]()
    topic = api_client.post("/api/topics", json={"title_ru": "Моя тема"}).json()["id"]
    phrase = create_custom_phrase(api_client, {"source_ru": "Я скоро вернусь.", "canonical_sr": "Uskoro se vraćam.", "topic_id": topic}).json()
    started = api_client.post("/api/sessions/start", json={"review_phrase_id": phrase["id"]}).json()
    analyze = AnswerAnalyzer.analyze
    def delete_then_analyze(self, **kwargs):
        ReviewService(db_session, FakeAIProvider(), owner.id).delete_custom_phrase(phrase["id"])
        db_session.commit()
        return analyze(self, **kwargs)
    monkeypatch.setattr(AnswerAnalyzer, "analyze", delete_then_analyze)
    result = api_client.post("/api/attempts", json={"exercise_id": started["exercise"]["id"], "transcript_sr": "Uskoro se vraćam."})
    assert result.status_code == 409
    assert result.json()["detail"]["code"] == "custom_content_deleted"
    assert db_session.get(ReviewPhrase, phrase["id"]) is None
    assert api_client.post(f"/api/sessions/{started['session']['id']}/next-exercise").status_code == 409


def test_delete_from_carousel_keeps_other_phrases_and_rejects_stale_answer(api_client: TestClient) -> None:
    topic = api_client.post("/api/topics", json={"title_ru": "Моя тема"}).json()["id"]
    phrases = [create_custom_phrase(api_client, {"source_ru": source, "canonical_sr": canonical, "topic_id": topic}).json()
               for source, canonical in [("Я скоро вернусь.", "Uskoro se vraćam."), ("Я задержусь на десять минут.", "Kasniću deset minuta.")]]
    started = api_client.post("/api/sessions/start", json={"review_mode": True}).json()
    selected = next(phrase for phrase in phrases if phrase["source_ru"] == started["exercise"]["source_ru"])
    assert api_client.delete(f"/api/custom-phrases/{selected['id']}").status_code == 204
    stale = api_client.post("/api/attempts", json={"exercise_id": started["exercise"]["id"], "transcript_sr": selected["canonical_sr"]})
    assert stale.status_code == 409
    next_exercise = api_client.post(f"/api/sessions/{started['session']['id']}/next-exercise")
    assert next_exercise.status_code == 201
    assert next_exercise.json()["source_ru"] != selected["source_ru"]


def test_native_origin_can_preflight_delete(api_client: TestClient) -> None:
    response = api_client.options("/api/custom-phrases/test", headers={
        "Origin": "http://localhost", "Access-Control-Request-Method": "DELETE",
        "Access-Control-Request-Headers": "authorization",
    })
    assert response.status_code == 200
    assert "DELETE" in response.headers["access-control-allow-methods"]
