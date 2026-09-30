from __future__ import annotations

import threading
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import event, func, select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.base import Base
from app.db.session import create_database_engine
from app.models import Attempt, AttemptRequest, Exercise, LearnerSkill, Skill, TrainingSession, User
from app.repositories import TrainingSessionRepository
from app.schemas import AnswerAnalysis, CreateAttemptRequest
from app.services.attempt_service import AttemptInProgressError, AttemptService, DailyLimitExceededError
from app.services.exercise_generator import ExerciseGenerator
from app.services.session_service import SessionPendingError
from tests.fakes import FakeAIProvider


class HeldAI(FakeAIProvider):
    def __init__(self) -> None:
        super().__init__(available=True, analysis_result=AnswerAnalysis(
            verdict="mostly_correct", semantic_score=0.8, grammar_score=0.8,
            lexical_score=0.8, naturalness_score=0.8, fluency_score=1,
            corrected_sr="Dobar dan.", short_feedback_ru="Почти верно.",
            detailed_feedback_ru="Проверьте ответ.", issues=[],
        ))
        self.entered = threading.Event()
        self.release = threading.Event()

    def analyze_answer(self, **kwargs):
        self.entered.set()
        assert self.release.wait(timeout=8)
        return super().analyze_answer(**kwargs)


def _setup(engine, *, length: int = 1) -> tuple[str, list[str]]:
    user_id = str(uuid4())
    exercises = [str(uuid4()), str(uuid4())]
    with Session(engine) as db:
        db.add(User(id=user_id, email=f"{user_id}@example.test", role="user", access_tier="free"))
        db.flush()
        db.add(TrainingSession(id="session", user_id=user_id,
                               normalized_topic_json={"session_length": length}, status="active"))
        db.flush()
        for exercise_id in exercises:
            db.add(Exercise(
                id=exercise_id, session_id="session", source_ru="Привет.",
                target_hints_json={"canonical_sr": "Dobar dan.", "intended_sr_variants": ["Dobar dan."]},
                targeted_skill_ids=[], generation_meta_json={"targeted_skill_keys": []},
            ))
        db.commit()
    return user_id, exercises


@pytest.fixture(params=["sqlite", "postgres"])
def database_engine(request, tmp_path: Path):
    if request.param == "sqlite":
        engine = create_database_engine(f"sqlite+pysqlite:///{(tmp_path / 'race.db').as_posix()}")
        Base.metadata.create_all(engine)
        try:
            yield engine
        finally:
            engine.dispose()
        return

    raw = os.environ.get("TEST_POSTGRES_URL")
    if not raw:
        pytest.skip("isolated PostgreSQL test database is unavailable")
    url = make_url(raw)
    if url.host not in {"localhost", "127.0.0.1", "::1"} or url.port != 55432 or url.database != "serbotalk_concurrency_test":
        pytest.fail("TEST_POSTGRES_URL must point to the isolated loopback test database")
    schema = f"test_attempt_{uuid4().hex}"
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
        yield engine
    finally:
        engine.dispose()
        cleanup = create_database_engine(raw)
        try:
            with cleanup.begin() as db:
                db.exec_driver_sql(f"DROP SCHEMA {schema} CASCADE")
        finally:
            cleanup.dispose()


@pytest.mark.parametrize("request_id", [None, str(uuid4())], ids=["legacy", "idempotent"])
def test_ai_wait_releases_sqlite_writer_and_reserves_slot(database_engine, request_id: str | None) -> None:
    engine = database_engine
    user_id, exercises = _setup(engine)
    ai = HeldAI()
    outcome: dict[str, object] = {}

    def first() -> None:
        try:
            with Session(engine) as db:
                user = db.get(User, user_id)
                assert user is not None
                outcome["first"] = AttemptService(db, ai, user).create(CreateAttemptRequest(
                    exercise_id=exercises[0], transcript_sr="Ne znam.", client_request_id=request_id,
                ))
        except Exception as exc:
            outcome["first"] = exc

    worker = threading.Thread(target=first, daemon=True)
    worker.start()
    try:
        assert ai.entered.wait(timeout=4)
        with Session(engine) as db:
            entry = db.scalar(select(AttemptRequest))
            assert entry is not None and entry.response_json is None
            assert db.scalar(select(func.count()).select_from(Attempt)) == 0
            user = db.get(User, user_id)
            assert user is not None
            with pytest.raises(AttemptInProgressError):
                AttemptService(db, FakeAIProvider(), user).create(CreateAttemptRequest(
                    exercise_id=exercises[1], transcript_sr="Dobar dan.",
                ))
            db.rollback()
            if request_id:
                with pytest.raises(AttemptInProgressError):
                    AttemptService(db, FakeAIProvider(), user).create(CreateAttemptRequest(
                        exercise_id=exercises[0], transcript_sr="Ne znam.", client_request_id=request_id,
                    ))
                db.rollback()
            with pytest.raises(SessionPendingError):
                ExerciseGenerator(db, FakeAIProvider(), user_id).generate_next("session")
            db.rollback()
        with Session(engine) as db:
            db.add(User(id=str(uuid4()), email=f"other-{uuid4()}@example.test"))
            db.commit()
        assert worker.is_alive()
    finally:
        ai.release.set()
        worker.join(timeout=8)
    assert not worker.is_alive()
    assert not isinstance(outcome.get("first"), Exception), outcome.get("first")


def test_inflight_daily_slot_is_retryable_then_actual_limit(database_engine) -> None:
    engine = database_engine
    user_id, exercises = _setup(engine, length=2)
    settings = get_settings()
    old_limit = settings.free_daily_phrase_limit
    settings.free_daily_phrase_limit = 1
    ai = HeldAI()
    outcome: dict[str, object] = {}

    def first() -> None:
        try:
            with Session(engine) as db:
                user = db.get(User, user_id)
                assert user is not None
                outcome["first"] = AttemptService(db, ai, user).create(CreateAttemptRequest(
                    exercise_id=exercises[0], transcript_sr="Ne znam.",
                ))
        except Exception as exc:
            outcome["first"] = exc

    worker = threading.Thread(target=first, daemon=True)
    worker.start()
    try:
        assert ai.entered.wait(timeout=4)
        with Session(engine) as db:
            user = db.get(User, user_id)
            assert user is not None
            with pytest.raises(AttemptInProgressError):
                AttemptService(db, FakeAIProvider(), user).create(CreateAttemptRequest(
                    exercise_id=exercises[1], transcript_sr="Dobar dan.",
                ))
            db.rollback()
        ai.release.set()
        worker.join(timeout=8)
        assert not isinstance(outcome.get("first"), Exception), outcome.get("first")
        with Session(engine) as db:
            user = db.get(User, user_id)
            assert user is not None
            with pytest.raises(DailyLimitExceededError):
                AttemptService(db, FakeAIProvider(), user).create(CreateAttemptRequest(
                    exercise_id=exercises[1], transcript_sr="Dobar dan.",
                ))
    finally:
        ai.release.set()
        worker.join(timeout=8)
        settings.free_daily_phrase_limit = old_limit


def test_expired_lease_retry_fences_old_worker(database_engine) -> None:
    engine = database_engine
    user_id, exercises = _setup(engine)
    request_id = str(uuid4())
    request = CreateAttemptRequest(
        exercise_id=exercises[0], transcript_sr="Dobar dan.", client_request_id=request_id,
    )
    try:
        with Session(engine) as first_db:
            user = first_db.get(User, user_id)
            assert user is not None
            first_service = AttemptService(first_db, FakeAIProvider(), user)
            old_lease = first_service._reserve(request)
            assert not hasattr(old_lease, "analysis")
            with Session(engine) as db:
                entry = db.get(AttemptRequest, (user_id, request_id))
                assert entry is not None
                entry.lease_expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
                db.commit()
            with Session(engine) as second_db:
                second_user = second_db.get(User, user_id)
                assert second_user is not None
                second_service = AttemptService(second_db, FakeAIProvider(), second_user)
                new_lease = second_service._reserve(request)
                assert new_lease.fencing_token == old_lease.fencing_token + 1
                # B fails and releases. C must not reuse A's original token.
                second_service._release(new_lease)
                third_lease = second_service._reserve(request)
                assert third_lease.fencing_token == new_lease.fencing_token + 1
                analysis = second_service.analyzer.analyze(
                    source_ru=third_lease.source_ru, transcript_sr=request.transcript_sr,
                    canonical_sr=third_lease.canonical_sr,
                    intended_sr_variants=third_lease.intended_variants,
                    target_skills=third_lease.target_skills, timing=request,
                )
                with pytest.raises(AttemptInProgressError):
                    first_service._finalize(request, old_lease, analysis)
                first_db.rollback()
                first_service._release(old_lease)
                assert second_db.get(AttemptRequest, (user_id, request_id)) is not None
                result = second_service._finalize(request, third_lease, analysis)
                assert result.daily_usage.used == 1
        with Session(engine) as db:
            assert db.scalar(select(func.count()).select_from(Attempt)) == 1
            assert db.scalar(select(func.count()).select_from(AttemptRequest)) == 1
    finally:
        engine.dispose()


def test_parallel_finalization_serializes_learner_updates(database_engine) -> None:
    engine = database_engine
    user_id, exercises = _setup(engine, length=2)
    skill_id = str(uuid4())
    with Session(engine) as db:
        db.add(Skill(id=skill_id, key="greeting", category="grammar", title_ru="Приветствие",
                     explanation_ru="Проверка приветствия"))
        for exercise_id in exercises:
            item = db.get(Exercise, exercise_id)
            assert item is not None
            item.generation_meta_json = {"targeted_skill_keys": ["greeting"]}
        db.commit()

    barrier = threading.Barrier(2)
    results: list[object] = []

    def submit(exercise_id: str) -> None:
        try:
            with Session(engine) as db:
                user = db.get(User, user_id)
                assert user is not None
                barrier.wait(timeout=5)
                results.append(AttemptService(db, FakeAIProvider(), user).create(CreateAttemptRequest(
                    exercise_id=exercise_id, transcript_sr="Dobar dan.",
                )))
        except Exception as exc:
            results.append(exc)

    workers = [threading.Thread(target=submit, args=(exercise_id,), daemon=True) for exercise_id in exercises]
    for worker in workers:
        worker.start()
    for worker in workers:
        worker.join(timeout=8)
        assert not worker.is_alive()
    assert len(results) == 2
    assert all(not isinstance(result, Exception) for result in results), results
    with Session(engine) as db:
        assert db.scalar(select(func.count()).select_from(Attempt)) == 2
        learner = db.get(LearnerSkill, (user_id, skill_id))
        assert learner is not None and learner.attempts == 2


def test_reservation_uses_time_after_session_lock_across_utc_midnight(database_engine, monkeypatch) -> None:
    engine = database_engine
    user_id, exercises = _setup(engine, length=2)
    settings = get_settings()
    old_limit = settings.free_daily_phrase_limit
    settings.free_daily_phrase_limit = 1
    crossed_midnight = False
    old_lock = TrainingSessionRepository.get_owned_for_update

    def crossing_lock(repository, session_id):
        nonlocal crossed_midnight
        session = old_lock(repository, session_id)
        crossed_midnight = True
        return session

    class Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            value = datetime(2026, 10, 1, 0, 0, 1, tzinfo=timezone.utc) if crossed_midnight else datetime(
                2026, 9, 30, 23, 59, 59, tzinfo=timezone.utc,
            )
            return value.astimezone(tz) if tz else value.replace(tzinfo=None)

    monkeypatch.setattr(TrainingSessionRepository, "get_owned_for_update", crossing_lock)
    monkeypatch.setattr("app.services.attempt_service.datetime", Clock)
    try:
        with Session(engine) as db:
            user = db.get(User, user_id)
            assert user is not None
            AttemptService(db, FakeAIProvider(), user)._reserve(CreateAttemptRequest(
                exercise_id=exercises[0], transcript_sr="Dobar dan.", client_request_id=str(uuid4()),
            ))
        with Session(engine) as db:
            entry = db.scalar(select(AttemptRequest))
            assert entry is not None and entry.reserved_at is not None
            assert entry.reserved_at.date() == datetime(2026, 10, 1).date()
            user = db.get(User, user_id)
            assert user is not None
            with pytest.raises(AttemptInProgressError):
                AttemptService(db, FakeAIProvider(), user)._reserve(CreateAttemptRequest(
                    exercise_id=exercises[1], transcript_sr="Dobar dan.", client_request_id=str(uuid4()),
                ))
    finally:
        settings.free_daily_phrase_limit = old_limit
