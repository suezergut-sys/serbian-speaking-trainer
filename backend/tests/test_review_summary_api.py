import os
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.db.base import Base
from app.db.session import create_database_engine
from app.main import app
from app.models import ReviewPhrase, TopicPreset, User
from app.services.review_service import ReviewService
from tests.fakes import FakeAIProvider


def test_review_summary_matches_full_list_after_due_activation_and_is_tenant_scoped(
    api_client: TestClient,
    db_session: Session,
) -> None:
    other_user = User(
        id="22222222-2222-2222-2222-222222222222",
        email="other-review@example.com",
        role="user",
        access_tier="free",
    )
    db_session.add(other_user)
    db_session.flush()
    current_user_id = "00000000-0000-0000-0000-000000000001"
    own_topic = TopicPreset(
        id="own-review-topic", owner_user_id=current_user_id, title_ru="Своя тема",
        description_ru="Описание", intents_json=[], vocabulary_json=[],
    )
    foreign_topic = TopicPreset(
        id="foreign-review-topic", owner_user_id=other_user.id, title_ru="Чужая тема",
        description_ru="Описание", intents_json=[], vocabulary_json=[],
    )
    db_session.add_all([own_topic, foreign_topic])
    db_session.flush()

    now = datetime.now(timezone.utc)
    phrases = [
        ReviewPhrase(
            source_ru=f"Фраза {number}", source_normalized=f"фраза {number}",
            intended_sr_variants_json=[f"Rečenica {number}"],
            topic_id="cafe" if number % 2 == 0 else own_topic.id,
        )
        for number in range(120)
    ]
    phrases[0].topic_id = foreign_topic.id
    due = ReviewPhrase(
        source_ru="Пора повторить", source_normalized="пора повторить",
        intended_sr_variants_json=["Vreme je za ponavljanje"],
        status="mastered", perfect_streak=3, learning_errors=2,
        next_review_at=now - timedelta(days=1), topic_id="cafe",
    )
    future = ReviewPhrase(
        source_ru="Повторить позже", source_normalized="повторить позже",
        intended_sr_variants_json=["Ponoviti kasnije"],
        status="mastered", next_review_at=now + timedelta(days=1),
    )
    foreign_phrase = ReviewPhrase(
        user_id=other_user.id, source_ru="Чужая фраза", source_normalized="чужая фраза",
        intended_sr_variants_json=["Tuđa rečenica"], topic_id=foreign_topic.id,
    )
    db_session.add_all([*phrases, due, future, foreign_phrase])
    db_session.flush()

    sql: list[str] = []

    def capture_sql(_connection, _cursor, statement, _parameters, _context, _executemany) -> None:
        sql.append(statement)

    assert db_session.bind is not None
    event.listen(db_session.bind, "before_cursor_execute", capture_sql)
    try:
        summary = api_client.get("/api/review-phrases/summary")
        summary_sql = [statement for statement in sql if "review_phrases" in statement]
        sql.clear()
        full_list = api_client.get("/api/review-phrases")
        list_sql = [statement for statement in sql if "review_phrases" in statement]
    finally:
        event.remove(db_session.bind, "before_cursor_execute", capture_sql)

    assert summary.status_code == 200
    assert summary.json() == {"phrase_count": 121}
    assert full_list.status_code == 200
    items = full_list.json()
    assert len(items) == summary.json()["phrase_count"]
    assert len(list_sql) <= 3  # due lookup plus one joined list query, independent of row count
    assert len(summary_sql) <= 3  # due lookup/update plus one aggregate COUNT
    assert any("count(" in statement.lower() for statement in summary_sql)
    assert any("join topic_presets" in statement.lower() for statement in list_sql)
    assert len(summary.content) < len(full_list.content)
    by_source = {item["source_ru"]: item for item in items}
    assert by_source["Фраза 0"]["topic_title"] is None
    assert by_source["Фраза 1"]["topic_title"] == "Своя тема"
    assert by_source["Фраза 2"]["topic_title"] == "Кафе"
    assert by_source["Пора повторить"]["status"] == "active"
    assert "Повторить позже" not in by_source
    assert "Чужая фраза" not in by_source
    db_session.refresh(due)
    assert due.perfect_streak == 0
    assert due.learning_errors == 0
    assert due.next_review_at is None

    original_user = app.dependency_overrides[get_current_user]
    app.dependency_overrides[get_current_user] = lambda: other_user
    try:
        assert api_client.get("/api/review-phrases/summary").json() == {"phrase_count": 1}
        foreign_list = api_client.get("/api/review-phrases").json()
        assert len(foreign_list) == 1
        assert foreign_list[0]["id"] == foreign_phrase.id
        assert foreign_list[0]["topic_title"] == "Чужая тема"
    finally:
        app.dependency_overrides[get_current_user] = original_user


def test_review_summary_and_visible_titles_on_isolated_postgres() -> None:
    raw = os.environ.get("TEST_POSTGRES_URL")
    if not raw:
        pytest.skip("isolated PostgreSQL test database is unavailable")
    url = make_url(raw)
    if url.host not in {"localhost", "127.0.0.1", "::1"} or url.port != 55432 or url.database != "serbotalk_concurrency_test":
        pytest.fail("TEST_POSTGRES_URL must point to the isolated loopback test database")

    schema = f"test_review_{uuid4().hex}"
    engine = create_database_engine(raw)
    with engine.begin() as db:
        assert db.exec_driver_sql("SELECT current_database()").scalar() == "serbotalk_concurrency_test"
        db.exec_driver_sql(f"CREATE SCHEMA {schema}")

    @event.listens_for(engine, "connect")
    def use_test_schema(connection, _record):
        cursor = connection.cursor()
        cursor.execute(f"SET search_path TO {schema}")
        cursor.close()

    engine.dispose()
    try:
        Base.metadata.create_all(engine)
        first_id = str(uuid4())
        second_id = str(uuid4())
        with Session(engine) as db:
            db.add_all([
                User(id=first_id, email=f"{first_id}@example.test"),
                User(id=second_id, email=f"{second_id}@example.test"),
            ])
            db.flush()
            db.add_all([
                TopicPreset(
                    id="shared", title_ru="Общая тема", description_ru="Описание",
                    intents_json=[], vocabulary_json=[],
                ),
                TopicPreset(
                    id="first-owned", owner_user_id=first_id, title_ru="Своя тема",
                    description_ru="Описание", intents_json=[], vocabulary_json=[],
                ),
                TopicPreset(
                    id="second-owned", owner_user_id=second_id, title_ru="Чужая тема",
                    description_ru="Описание", intents_json=[], vocabulary_json=[],
                ),
            ])
            db.flush()
            now = datetime.now(timezone.utc)
            due = ReviewPhrase(
                user_id=first_id, source_ru="Срок повторения", source_normalized="срок повторения",
                intended_sr_variants_json=["Ponavljanje"], topic_id="shared",
                status="mastered", perfect_streak=3, learning_errors=2,
                next_review_at=now - timedelta(days=1),
            )
            db.add_all([
                ReviewPhrase(
                    user_id=first_id, source_ru="Общая", source_normalized="общая",
                    intended_sr_variants_json=["Zajednička"], topic_id="shared",
                ),
                ReviewPhrase(
                    user_id=first_id, source_ru="Своя", source_normalized="своя",
                    intended_sr_variants_json=["Moja"], topic_id="first-owned",
                ),
                ReviewPhrase(
                    user_id=first_id, source_ru="Скрытая", source_normalized="скрытая",
                    intended_sr_variants_json=["Skrivena"], topic_id="second-owned",
                ),
                due,
                ReviewPhrase(
                    user_id=first_id, source_ru="Будущая", source_normalized="будущая",
                    intended_sr_variants_json=["Kasnije"], status="mastered",
                    next_review_at=now + timedelta(days=1),
                ),
                ReviewPhrase(
                    user_id=second_id, source_ru="Чужая", source_normalized="чужая",
                    intended_sr_variants_json=["Tuđa"], topic_id="second-owned",
                ),
            ])
            db.flush()
            due_id = due.id
            db.commit()

        with Session(engine) as db:
            first = ReviewService(db, FakeAIProvider(), first_id)
            assert first.summary().phrase_count == 4
            items = first.list_phrases()
            assert len(items) == 4
            by_source = {item.source_ru: item for item in items}
            assert by_source["Общая"].topic_title == "Общая тема"
            assert by_source["Своя"].topic_title == "Своя тема"
            assert by_source["Скрытая"].topic_title is None
            assert by_source["Срок повторения"].status == "active"
            assert "Будущая" not in by_source
            assert "Чужая" not in by_source
            stored_due = db.get(ReviewPhrase, due_id)
            assert stored_due is not None
            assert stored_due.perfect_streak == 0
            assert stored_due.learning_errors == 0
            assert stored_due.next_review_at is None
            second = ReviewService(db, FakeAIProvider(), second_id)
            assert second.summary().phrase_count == 1
            second_items = second.list_phrases()
            assert len(second_items) == 1
            assert second_items[0].topic_title == "Чужая тема"
    finally:
        engine.dispose()
        cleanup = create_database_engine(raw)
        try:
            with cleanup.begin() as db:
                db.exec_driver_sql(f"DROP SCHEMA {schema} CASCADE")
        finally:
            cleanup.dispose()
