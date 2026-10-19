from datetime import datetime, time, timedelta, timezone
from uuid import uuid4

from app.api.dependencies import get_current_user
from app.main import app
from app.models import Attempt, Exercise, User
from app.repositories.training import AttemptRepository
from app.services.auth_service import LEGACY_USER_ID


def submit(client, db, **extra):
    session = client.post('/api/sessions', json={'topic_id': 'cafe'}).json()
    exercise = client.post(f"/api/sessions/{session['id']}/next-exercise").json()
    stored = db.get(Exercise, exercise['id'])
    payload = {'exercise_id': stored.id, 'transcript_sr': stored.target_hints_json['canonical_sr'], **extra}
    response = client.post('/api/attempts', json=payload)
    assert response.status_code == 201, response.text
    return payload, response.json()


def test_first_success_survives_replay_and_later_session(api_client, db_session):
    payload, first = submit(api_client, db_session, client_request_id=str(uuid4()))
    assert first['first_success_today'] is True
    assert api_client.post('/api/attempts', json=payload).json() == first
    _, second = submit(api_client, db_session)
    assert second['overall_score'] == 1
    assert second['first_success_today'] is False


def test_previous_day_and_other_account_do_not_consume_first_success(api_client, db_session):
    _, old = submit(api_client, db_session)
    db_session.get(Attempt, old['id']).created_at = datetime.now(timezone.utc) - timedelta(days=1)
    db_session.commit()
    _, today = submit(api_client, db_session)
    assert today['first_success_today'] is True
    other = User(id=str(uuid4()), email='other-rewards@example.test', role='user', access_tier='premium')
    db_session.add(other)
    db_session.commit()
    app.dependency_overrides[get_current_user] = lambda: other
    _, other_first = submit(api_client, db_session)
    assert other_first['first_success_today'] is True


def test_near_perfect_does_not_consume_reward_and_utc_bounds_are_half_open(api_client, db_session):
    _, first = submit(api_client, db_session)
    stored = db_session.get(Attempt, first['id'])
    start = datetime.combine(datetime.now(timezone.utc).date(), time.min, tzinfo=timezone.utc)
    end = start + timedelta(days=1)
    repo = AttemptRepository(db_session, LEGACY_USER_ID)
    stored.overall_score = .999
    db_session.flush()
    assert not repo.has_perfect_between(start, end)
    _, next_success = submit(api_client, db_session)
    assert next_success['first_success_today'] is True
    second = db_session.get(Attempt, next_success['id'])
    second.created_at = end
    db_session.flush()
    assert not repo.has_perfect_between(start, end)
    second.created_at = start
    db_session.flush()
    assert repo.has_perfect_between(start, end)


def test_concurrent_successes_award_daily_start_once(tmp_path):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    from sqlalchemy.orm import Session
    from app.db.base import Base
    from app.db.session import create_database_engine
    from app.models import TrainingSession
    from app.schemas import CreateAttemptRequest
    from app.services.attempt_service import AttemptService
    from tests.fakes import FakeAIProvider

    engine = create_database_engine(f"sqlite+pysqlite:///{(tmp_path / 'reward-race.db').as_posix()}")
    Base.metadata.create_all(engine)
    user_id = str(uuid4())
    ids = [str(uuid4()), str(uuid4())]
    try:
        with Session(engine) as db:
            db.add(User(id=user_id, email='reward-race@example.test', role='user', access_tier='premium'))
            db.flush()
            db.add(TrainingSession(id='reward-session', user_id=user_id, status='active', normalized_topic_json={'session_length': 20}))
            db.flush()
            for exercise_id in ids:
                db.add(Exercise(id=exercise_id, session_id='reward-session', source_ru='Добрый день.', target_hints_json={'canonical_sr': 'Dobar dan.'}, targeted_skill_ids=[], generation_meta_json={'targeted_skill_keys': []}))
            db.commit()
        barrier = Barrier(2)

        def check(exercise_id):
            with Session(engine) as db:
                user = db.get(User, user_id)
                barrier.wait(timeout=5)
                return AttemptService(db, FakeAIProvider(), user).create(CreateAttemptRequest(exercise_id=exercise_id, transcript_sr='Dobar dan.')).first_success_today

        with ThreadPoolExecutor(max_workers=2) as pool:
            assert sorted(pool.map(check, ids)) == [False, True]
    finally:
        engine.dispose()
