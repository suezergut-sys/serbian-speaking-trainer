from __future__ import annotations

import threading
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from app.db.base import Base
from app.db.session import create_database_engine
from app.models import Attempt, Exercise, TrainingSession, User
from app.schemas import CreateAttemptRequest
from app.services.attempt_service import AttemptService
from app.services.exercise_generator import ExerciseGenerator
from app.services.session_service import SessionCompletedError
from tests.fakes import FakeAIProvider


@pytest.mark.parametrize(
    ("first_request_id", "second_request_id"),
    [(None, None), (str(uuid4()), str(uuid4()))],
    ids=["legacy-without-request-ids", "distinct-request-ids"],
)
def test_concurrent_attempts_cannot_cross_session_length_boundary(
    tmp_path: Path,
    first_request_id: str | None,
    second_request_id: str | None,
) -> None:
    """Serialize quota/session checks on SQLite for old and idempotent clients."""
    engine = create_database_engine(f"sqlite+pysqlite:///{(tmp_path / 'attempt-race.db').as_posix()}")
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, expire_on_commit=False)
    user_id = str(uuid4())
    exercise_ids = [str(uuid4()), str(uuid4())]
    try:
        with sessions.begin() as db:
            db.add(User(id=user_id, email="race@example.test", role="user", access_tier="free"))
            db.flush()
            db.add(TrainingSession(
                id="short-session",
                user_id=user_id,
                normalized_topic_json={"session_length": 1},
                status="active",
            ))
            db.flush()
            db.add_all([
                Exercise(
                    id=exercise_id,
                    session_id="short-session",
                    source_ru=f"Фраза {index}",
                    target_hints_json={
                        "canonical_sr": "Dobar dan.",
                        "intended_sr_variants": ["Dobar dan."],
                    },
                    targeted_skill_ids=[],
                    generation_meta_json={"targeted_skill_keys": []},
                )
                for index, exercise_id in enumerate(exercise_ids, start=1)
            ])

        # Both workers reach this barrier before either enters the quota/session
        # lock. The first transaction then stays open after accepting its attempt.
        before_lock = threading.Barrier(2)
        first_accepted = threading.Event()
        release_first = threading.Event()
        second_entered = threading.Event()
        second_finished = threading.Event()
        outcomes: dict[str, object] = {}
        ai = FakeAIProvider(available=False)

        def submit(name: str, exercise_id: str, request_id: str | None) -> None:
            try:
                before_lock.wait(timeout=3)
                with Session(engine, expire_on_commit=False) as db:
                    user = db.get(User, user_id)
                    assert user is not None
                    if name == "second":
                        assert first_accepted.wait(timeout=3)
                        second_entered.set()
                    request = CreateAttemptRequest(
                        exercise_id=exercise_id,
                        client_request_id=request_id,
                        transcript_sr="Dobar dan.",
                    )
                    response = AttemptService(db, ai, user).create(request)
                    if name == "first":
                        outcomes[name] = response
                        first_accepted.set()
                        assert release_first.wait(timeout=5)
                    db.commit()
                    outcomes[name] = response
            except Exception as exc:  # surfaced in the main test thread
                outcomes[name] = exc
                if name == "first":
                    first_accepted.set()
                if name == "second":
                    second_finished.set()
            else:
                if name == "second":
                    second_finished.set()

        first = threading.Thread(
            target=submit,
            args=("first", exercise_ids[0], first_request_id),
            daemon=True,
        )
        second = threading.Thread(
            target=submit,
            args=("second", exercise_ids[1], second_request_id),
            daemon=True,
        )
        first.start()
        second.start()
        try:
            assert first_accepted.wait(timeout=4), "first attempt did not reach the held transaction"
            assert second_entered.wait(timeout=4), "second worker did not start its attempt"
            assert not second_finished.wait(timeout=0.25), (
                "second attempt completed before the first transaction committed"
            )
        finally:
            release_first.set()
            first.join(timeout=6)
            second.join(timeout=6)

        assert not first.is_alive(), "first worker did not finish"
        assert not second.is_alive(), "second worker did not finish"
        assert not isinstance(outcomes.get("first"), Exception), outcomes.get("first")
        assert isinstance(outcomes.get("second"), SessionCompletedError), outcomes.get("second")
        assert ai.analysis_calls == 0

        with sessions() as db:
            count = db.scalar(select(func.count()).select_from(Attempt))
            training_session = db.get(TrainingSession, "short-session")
            assert count == 1
            assert training_session is not None
            assert training_session.status == "completed"
    finally:
        engine.dispose()


@pytest.mark.parametrize("next_request_id", [None, uuid4()], ids=["legacy", "request-id"])
def test_next_exercise_waits_for_final_attempt_commit(
    tmp_path: Path,
    next_request_id: UUID | None,
) -> None:
    """A concurrent next request cannot create an exercise after completion."""
    engine = create_database_engine(f"sqlite+pysqlite:///{(tmp_path / 'next-race.db').as_posix()}")
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, expire_on_commit=False)
    user_id = str(uuid4())
    session_id = str(uuid4())
    exercise_id = str(uuid4())
    try:
        with sessions.begin() as db:
            db.add(User(id=user_id, email="next-race@example.test", role="user", access_tier="free"))
            db.flush()
            db.add(TrainingSession(
                id=session_id,
                user_id=user_id,
                normalized_topic_json={
                    "session_length": 1,
                    "topic": {
                        "id": "general",
                        "source": "general",
                        "title_ru": "Общая тема",
                        "description_ru": "Повседневная практика.",
                        "normalized_prompt_context": "Повседневная практика.",
                    },
                },
                status="active",
            ))
            db.flush()
            db.add(Exercise(
                id=exercise_id,
                session_id=session_id,
                source_ru="Добрый день.",
                target_hints_json={
                    "canonical_sr": "Dobar dan.",
                    "intended_sr_variants": ["Dobar dan."],
                },
                targeted_skill_ids=[],
                generation_meta_json={"targeted_skill_keys": []},
            ))

        accepted = threading.Event()
        release_attempt = threading.Event()
        next_entered = threading.Event()
        next_finished = threading.Event()
        outcomes: dict[str, object] = {}
        ai = FakeAIProvider(available=False)

        def submit_final_attempt() -> None:
            try:
                with sessions() as db:
                    user = db.get(User, user_id)
                    assert user is not None
                    response = AttemptService(db, ai, user).create(CreateAttemptRequest(
                        exercise_id=exercise_id,
                        transcript_sr="Dobar dan.",
                    ))
                    accepted.set()
                    assert release_attempt.wait(timeout=5)
                    db.commit()
                    outcomes["attempt"] = response
            except Exception as exc:
                outcomes["attempt"] = exc
                accepted.set()

        def request_next() -> None:
            try:
                with sessions() as db:
                    next_entered.set()
                    outcomes["next"] = ExerciseGenerator(db, ai, user_id).generate_next(
                        session_id, next_request_id,
                    )
                    db.commit()
            except Exception as exc:
                outcomes["next"] = exc
            finally:
                next_finished.set()

        attempt_worker = threading.Thread(target=submit_final_attempt, daemon=True)
        next_worker = threading.Thread(target=request_next, daemon=True)
        attempt_worker.start()
        try:
            assert accepted.wait(timeout=4), "final attempt was not accepted"
            assert "attempt" not in outcomes, outcomes.get("attempt")
            next_worker.start()
            assert next_entered.wait(timeout=4), "next request did not start"
            assert not next_finished.wait(timeout=0.25), (
                "next request finished before the final attempt committed"
            )
        finally:
            release_attempt.set()
            attempt_worker.join(timeout=6)
            if next_worker.ident is not None:
                next_worker.join(timeout=6)

        assert not attempt_worker.is_alive(), "attempt worker did not finish"
        assert not next_worker.is_alive(), "next worker did not finish"
        assert not isinstance(outcomes.get("attempt"), Exception), outcomes.get("attempt")
        assert isinstance(outcomes.get("next"), SessionCompletedError), outcomes.get("next")
        assert ai.exercise_calls == 0
        with sessions() as db:
            assert db.scalar(select(func.count()).select_from(Exercise)) == 1
            training_session = db.get(TrainingSession, session_id)
            assert training_session is not None
            assert training_session.status == "completed"
    finally:
        engine.dispose()
