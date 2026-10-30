from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import func, select

from app.models import Attempt, ErrorEvent, Exercise, ModelDebugLog, ModelDebugSetting, PaymentRequest, PhrasePreparationReceipt, ReviewPhrase, TopicPhrase, TopicPreset, TrainingSession, TranscriptionReceipt, User, UserFeedback, WordLearningItem
from app.models.entities import DeletedAccountMarker
from app.services.account_deletion import AccountDeletionService, identity_hash
from app.services.auth_service import AuthenticatedIdentity, UserService


def test_confirmed_disposable_account_purge_cascades_and_stale_identity_cannot_recreate(db_session):
    uid = '11111111-1111-1111-1111-111111111111'
    email = 'disposable@example.invalid'
    user = User(id=uid, email=email, role='user', access_tier='premium', android_premium_granted_at=datetime.now(timezone.utc))
    db_session.add(user)
    db_session.flush()
    rows = [
        TopicPreset(id='private-delete', owner_user_id=uid, title_ru='Личная', description_ru='', is_custom=True),
        TrainingSession(user_id=uid, level='A2'),
        UserFeedback(user_id=uid, content='Synthetic feedback'),
        ReviewPhrase(user_id=uid, source_ru='Привет', source_normalized='привет'),
        WordLearningItem(user_id=uid, source_ru='привет', source_normalized='привет', translation_sr='zdravo'),
        ModelDebugSetting(user_id=uid, enabled=True),
        ModelDebugLog(user_id=uid, operation='synthetic', model='synthetic', started_at=datetime.now(timezone.utc), completed_at=datetime.now(timezone.utc), duration_ms=1, request_json={}, audio_payload=b'synthetic-bytes-only'),
        PaymentRequest(user_id=uid, active_user_id=uid, country='russia', method='sbp', status='awaiting_payment', details={}, activation={}),
    ]
    db_session.add_all(rows)
    db_session.flush()
    training = rows[1]
    exercise = Exercise(session_id=training.id, source_ru='Синтетическая фраза')
    db_session.add(exercise)
    db_session.flush()
    attempt = Attempt(exercise_id=exercise.id, transcript_sr='Sintetički odgovor')
    db_session.add(attempt)
    db_session.flush()
    db_session.add_all([
        ErrorEvent(attempt_id=attempt.id, type='grammar', severity=0.5, confidence=0.5, evidence_json={}),
        TopicPhrase(id='private-phrase-delete', topic_id='private-delete', position=1, source_ru='Привет', canonical_sr='Zdravo'),
        TranscriptionReceipt(user_id=uid, exercise_id=exercise.id, raw_text='Zdravo', changes_json=[], policy_version='synthetic'),
        PhrasePreparationReceipt(user_id=uid, source_ru='Привет', preparation_json={}, expires_at=datetime.now(timezone.utc) + timedelta(minutes=1)),
    ])
    db_session.commit()
    removed = []
    def remove_identity(user_id, confirmed_email):
        # During provider work a previously verified JWT must already be blocked.
        with pytest.raises(PermissionError):
            UserService(db_session).sync(AuthenticatedIdentity(uid, email, None, None))
        removed.append((user_id, confirmed_email))
    assert AccountDeletionService(db_session).erase(uid, email, remove_identity)
    assert removed == [(uid, email)]
    assert db_session.get(User, uid) is None
    for model in (ModelDebugLog, ModelDebugSetting, PaymentRequest, ReviewPhrase, TrainingSession, UserFeedback, WordLearningItem):
        assert db_session.scalar(select(func.count()).select_from(model).where(model.user_id == uid)) == 0
    assert db_session.get(TopicPreset, 'private-delete') is None
    for model in (Attempt, ErrorEvent, Exercise, TopicPhrase, TranscriptionReceipt, PhrasePreparationReceipt):
        assert db_session.scalar(select(func.count()).select_from(model)) == 0
    assert db_session.scalar(select(func.count()).select_from(User)) == 1  # Other account survives.
    assert db_session.get(DeletedAccountMarker, identity_hash(uid)) is not None
    with pytest.raises(PermissionError):
        UserService(db_session).sync(AuthenticatedIdentity(uid, email, None, None))
    assert not AccountDeletionService(db_session).erase(uid, email, remove_identity)
    assert len(removed) == 1


def test_failed_provider_deletion_keeps_data_and_blocks_stale_tokens_for_retry(db_session):
    user = User(id='retry', email='retry@example.invalid', role='user', access_tier='free')
    db_session.add(user)
    db_session.commit()
    def fail(*args):
        raise RuntimeError('synthetic provider unavailable')
    with pytest.raises(RuntimeError):
        AccountDeletionService(db_session).erase(user.id, user.email, fail)
    assert db_session.get(User, user.id) is not None
    with pytest.raises(PermissionError):
        UserService(db_session).sync(AuthenticatedIdentity(user.id, user.email, None, None))
    assert AccountDeletionService(db_session).erase(user.id, user.email, lambda *_args: None)


@pytest.mark.parametrize('role,email', [('user', 'wrong@example.invalid'), ('admin', 'correct@example.invalid')])
def test_deletion_requires_confirmed_owner_and_refuses_administrators(db_session, role, email):
    user = User(id='protected', email='correct@example.invalid', role=role, access_tier='free')
    db_session.add(user)
    db_session.commit()
    with pytest.raises(PermissionError):
        AccountDeletionService(db_session).erase(user.id, email, lambda *_args: pytest.fail('No provider call allowed'))
    assert db_session.get(User, user.id) is not None
    assert db_session.get(DeletedAccountMarker, identity_hash(user.id)) is None
