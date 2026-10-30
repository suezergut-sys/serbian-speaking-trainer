from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models import User
from app.schemas.payments import PaymentChoice, PaymentDecision, PaymentReport
from app.services.auth_service import AuthenticatedIdentity, LEGACY_USER_ID, UserService
from app.services.payments import PaymentService
from tests.test_payments import configured, report_data


def test_web_stays_free_until_android_claim_and_web_then_sees_premium(api_client, db_session):
    assert api_client.get('/api/auth/me').json()['access_tier'] == 'free'
    assert api_client.get('/api/auth/me').json()['daily_usage']['limit'] == 20
    other = User(id='other-user', email='other@example.invalid', role='user', access_tier='free')
    db_session.add(other)
    db_session.commit()
    response = api_client.post('/api/auth/me/android-premium', json={'platform': 'android'})
    assert response.status_code == 200
    assert response.headers['cache-control'] == 'no-store'
    assert response.json()['access_tier'] == 'premium'
    assert response.json()['daily_usage']['limit'] == 100
    first = db_session.get(User, LEGACY_USER_ID).android_premium_granted_at
    assert first is not None
    db_session.commit()
    assert api_client.post('/api/auth/me/android-premium', json={'platform': 'android'}).status_code == 200
    assert db_session.get(User, LEGACY_USER_ID).android_premium_granted_at.replace(tzinfo=timezone.utc) == first.replace(tzinfo=timezone.utc)
    # Normal web read and a later identity sync cannot remove the persisted benefit.
    assert api_client.get('/api/auth/me').json()['access_tier'] == 'premium'
    user = UserService(db_session).sync(AuthenticatedIdentity(LEGACY_USER_ID, 'learner@example.com', None, None))
    assert user.access_tier == 'premium'
    assert other.access_tier == 'free' and other.android_premium_granted_at is None


def test_new_android_account_gets_permanent_premium(db_session):
    service = UserService(db_session)
    user = service.sync(AuthenticatedIdentity('11111111-1111-1111-1111-111111111111', 'native@example.invalid', None, None))
    assert user.access_tier == 'free'
    service.grant_android_premium(user)
    db_session.commit()
    db_session.expire_all()
    assert service.current_response(db_session.get(User, user.id)).access_tier == 'premium'


@pytest.mark.parametrize('body', [{}, {'platform': 'web'}, {'platform': 'android', 'user_id': 'other'}])
def test_claim_validates_payload(api_client, body):
    assert api_client.post('/api/auth/me/android-premium', json=body).status_code == 422
    assert api_client.get('/api/auth/me').json()['access_tier'] == 'free'


def test_claim_requires_authentication():
    with TestClient(app) as client:
        assert client.post('/api/auth/me/android-premium', json={'platform': 'android'}).status_code == 401


@pytest.mark.parametrize('status', ['rejected', 'cancelled', 'confirmed'])
def test_web_payment_decision_preserves_android_grant(db_session, status):
    user = db_session.get(User, LEGACY_USER_ID)
    payments = PaymentService(db_session, configured())
    payment = payments.create(user, PaymentChoice(country='russia', method='sbp'))
    db_session.flush()
    payments.report(user, payment.id, PaymentReport.model_validate(report_data()))
    assert payment.provisional_granted_at is not None
    UserService(db_session).grant_android_premium(user)
    db_session.commit()
    admin = User(id='admin-test', email='admin@example.invalid', role='admin', access_tier='free', registered_at=datetime.now(timezone.utc))
    db_session.add(admin)
    db_session.commit()
    payments.decide(admin, payment.id, PaymentDecision(status=status))
    db_session.commit()
    assert user.access_tier == 'premium'
    assert user.android_premium_granted_at is not None
    assert payment.status == status
