from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.main import app
from app.models import PaymentRequest, User
from app.schemas.payments import PaymentChoice, PaymentConfig, PaymentDecision, PaymentReport
from app.services.auth_service import LEGACY_USER_ID
from app.services.payments import PaymentService


def configured():
    common = {"recipient": "Synthetic recipient", "instructions": {"ru": "Тестовая инструкция", "en": "Test instruction"}}
    return PaymentConfig.model_validate({"activation": {"ru": "Тестовый срок", "en": "Test timeframe"}, "methods": {
        "sbp": {**common, "amount": "500.00", "currency": "RUB", "phone": "+70000000000", "bank": "Synthetic bank"},
        "alta": {**common, "amount": "600.00", "currency": "RSD", "account": "000-test", "bank_details": "Synthetic bank details"},
        "paypal": {**common, "amount": "5.00", "currency": "EUR", "paypal": "synthetic@example.invalid"},
    }})


@pytest.fixture
def payment_api(api_client):
    app.dependency_overrides[get_settings] = lambda: Settings(_env_file=None, manual_payments=configured())
    yield api_client
    app.dependency_overrides.pop(get_settings, None)


def report_data():
    return {"paid_at": datetime.now(timezone.utc).isoformat(), "amount": "500.00", "transaction_id": "synthetic-id"}


def payment_notification_settings():
    return Settings(_env_file=None, manual_payments=configured(), telegram_bot_token="synthetic-token", telegram_chat_id="test-chat")


def test_payment_report_notifies_only_after_commit_once(db_session, monkeypatch):
    from app.services import notifications
    sent = []
    monkeypatch.setattr(notifications, "send_notification", lambda settings, text: sent.append(text))
    settings = payment_notification_settings()
    service = PaymentService(db_session, settings.manual_payments, settings)
    user = db_session.get(User, LEGACY_USER_ID)
    payment = service.create(user, PaymentChoice(country="russia", method="sbp"))
    db_session.commit()
    assert sent == []  # Merely selecting payment details is not a payment report.
    service.report(user, payment.id, PaymentReport.model_validate({**report_data(), "amount": "499.00"}))
    assert user.access_tier == "premium"
    assert sent == []
    db_session.commit()
    assert len(sent) == 1
    assert user.email in sent[0] and payment.id in sent[0]
    assert "Россия" in sent[0] and "СБП" in sent[0]
    assert "К оплате: 500.00 RUB" in sent[0]
    assert "Пользователь указал: 499.00 RUB" in sent[0]
    assert "Premium включён сразу" in sent[0]
    assert "Поступление денег ещё не подтверждено" in sent[0]
    assert "+70000000000" not in sent[0] and "synthetic-id" not in sent[0]
    service.report(user, payment.id, PaymentReport.model_validate(report_data()))
    db_session.commit()
    user.role = "admin"
    db_session.commit()
    service.decide(user, payment.id, PaymentDecision(status="confirmed"))
    db_session.commit()
    assert len(sent) == 1


def test_payment_notification_rollback_and_retry(db_session, monkeypatch):
    from app.services import notifications
    sent = []
    monkeypatch.setattr(notifications, "send_notification", lambda settings, text: sent.append(text))
    settings = payment_notification_settings()
    service = PaymentService(db_session, settings.manual_payments, settings)
    user = db_session.get(User, LEGACY_USER_ID)
    payment = service.create(user, PaymentChoice(country="russia", method="sbp"))
    db_session.commit()
    service.report(user, payment.id, PaymentReport.model_validate(report_data()))
    db_session.rollback()
    db_session.commit()
    assert sent == []
    assert user.access_tier == "free"
    service.report(user, payment.id, PaymentReport.model_validate(report_data()))
    db_session.commit()
    assert len(sent) == 1 and user.access_tier == "premium"


def test_payment_notification_api_uses_injected_settings(payment_api, db_session, monkeypatch):
    from app.services import notifications
    sent = []
    monkeypatch.setattr(notifications, "send_notification", lambda settings, text: sent.append(text))
    app.dependency_overrides[get_settings] = payment_notification_settings
    created = payment_api.post("/api/payments", json={"country": "serbia", "method": "paypal"}).json()
    response = payment_api.post(f'/api/payments/{created["id"]}/report', json=report_data())
    assert response.status_code == 200
    assert sent == []  # The fixture's DB override leaves the transaction to the test.
    db_session.commit()
    assert len(sent) == 1 and "PayPal" in sent[0] and "EUR" in sent[0]
    assert "000-test" not in sent[0]


def test_failed_telegram_delivery_does_not_undo_payment_or_premium(db_session, monkeypatch):
    from app.services import notifications
    attempts = []
    def fail(settings, text):
        attempts.append(text)
        return False
    monkeypatch.setattr(notifications, "send_notification", fail)
    settings = payment_notification_settings()
    service = PaymentService(db_session, settings.manual_payments, settings)
    user = db_session.get(User, LEGACY_USER_ID)
    payment = service.create(user, PaymentChoice(country="other", method="paypal"))
    service.report(user, payment.id, PaymentReport.model_validate(report_data()))
    db_session.commit()
    assert user.access_tier == "premium" and payment.status == "awaiting_review"
    service.report(user, payment.id, PaymentReport.model_validate(report_data()))
    db_session.commit()
    assert len(attempts) == 1


def test_unconfigured_telegram_does_not_queue_notification(db_session):
    settings = Settings(_env_file=None, manual_payments=configured())
    service = PaymentService(db_session, settings.manual_payments, settings)
    user = db_session.get(User, LEGACY_USER_ID)
    payment = service.create(user, PaymentChoice(country="russia", method="sbp"))
    service.report(user, payment.id, PaymentReport.model_validate(report_data()))
    assert not db_session.info.get("telegram_notifications")
    db_session.commit()
    assert user.access_tier == "premium"


def test_missing_partial_settings_disable_methods(db_session):
    svc = PaymentService(db_session, PaymentConfig())
    assert not any(item["available"] for item in svc.options()["methods"].values())
    config = configured()
    config.activation.en = ""
    assert not PaymentService(db_session, config).available("paypal")
    config = PaymentConfig.model_validate({"activation": {"ru": "Срок", "en": "Time"}, "methods": {"sbp": {"currency": "RUB"}}})
    assert not PaymentService(db_session, config).available("sbp")


def test_matrix_snapshot_switch_and_retries(payment_api, db_session):
    options = payment_api.get("/api/payments/options")
    assert options.headers["cache-control"] == "no-store"
    assert options.json()["countries"] == {"russia": ["sbp"], "serbia": ["paypal"], "other": ["paypal"]}
    assert payment_api.post("/api/payments", json={"country": "other", "method": "sbp"}).status_code == 409
    first = payment_api.post("/api/payments", json={"country": "russia", "method": "sbp"}).json()
    again = payment_api.post("/api/payments", json={"country": "russia", "method": "sbp"}).json()
    assert first["id"] == again["id"]
    second = payment_api.post("/api/payments", json={"country": "serbia", "method": "paypal"}).json()
    assert first["id"] != second["id"]
    assert db_session.get(PaymentRequest, first["id"]).status == "cancelled"
    assert second["details"]["paypal"] == "synthetic@example.invalid"
    config = configured()
    config.methods["paypal"].paypal = "changed@example.invalid"
    app.dependency_overrides[get_settings] = lambda: Settings(_env_file=None, manual_payments=config)
    assert payment_api.get("/api/payments").json()[0]["details"]["paypal"] == "synthetic@example.invalid"


def test_report_grants_provisional_access_and_admin_confirmation_is_idempotent(payment_api, db_session):
    created = payment_api.post("/api/payments", json={"country": "russia", "method": "sbp"}).json()
    path = f'/api/payments/{created["id"]}/report'
    reported = payment_api.post(path, json=report_data())
    assert reported.status_code == 200
    assert reported.json()["status"] == "awaiting_review"
    assert reported.json()["provisional_granted_at"] is not None
    assert db_session.get(User, LEGACY_USER_ID).access_tier == "premium"
    assert payment_api.get("/api/auth/me").json()["access_tier"] == "premium"
    repeated = payment_api.post(path, json={**report_data(), "amount": "999.00"})
    assert repeated.json()["reported_amount"] == "500.00"
    assert payment_api.post("/api/payments", json={"country": "other", "method": "paypal"}).status_code == 409
    assert payment_api.post(f'/api/payments/{created["id"]}/cancel').status_code == 409
    assert payment_api.get("/api/admin/payments").status_code == 403
    assert payment_api.patch(f'/api/admin/payments/{created["id"]}', json={"status": "confirmed"}).status_code == 403
    admin = db_session.get(User, LEGACY_USER_ID)
    admin.role = "admin"
    db_session.commit()
    rows = payment_api.get("/api/admin/payments").json()
    assert rows[0]["email"] == "learner@example.com"
    assert payment_api.get("/api/admin/payments?offset=50").json() == []
    confirmed = payment_api.patch(f'/api/admin/payments/{created["id"]}', json={"status": "confirmed"}).json()
    assert confirmed["status"] == "confirmed"
    assert admin.access_tier == "premium"
    again = payment_api.patch(f'/api/admin/payments/{created["id"]}', json={"status": "confirmed"}).json()
    assert again["reviewed_at"] == confirmed["reviewed_at"]
    assert payment_api.patch(f'/api/admin/payments/{created["id"]}', json={"status": "rejected"}).status_code == 409
    assert payment_api.post(path, json=report_data()).json()["status"] == "confirmed"
    assert db_session.scalar(select(func.count()).select_from(PaymentRequest)) == 1


@pytest.mark.parametrize("status", ["rejected", "cancelled"])
def test_admin_terminal_states_allow_new_request(payment_api, db_session, status):
    user = db_session.get(User, LEGACY_USER_ID)
    user.role = "admin"
    db_session.commit()
    first = payment_api.post("/api/payments", json={"country": "other", "method": "paypal"}).json()
    assert payment_api.patch(f'/api/admin/payments/{first["id"]}', json={"status": "confirmed"}).status_code == 409
    payment_api.post(f'/api/payments/{first["id"]}/report', json=report_data())
    assert payment_api.patch(f'/api/admin/payments/{first["id"]}', json={"status": status}).json()["status"] == status
    assert user.access_tier == "free"
    second = payment_api.post("/api/payments", json={"country": "other", "method": "paypal"}).json()
    assert second["id"] != first["id"]


def test_validation_ownership_and_cancel(payment_api, db_session):
    created = payment_api.post("/api/payments", json={"country": "russia", "method": "sbp"}).json()
    assert payment_api.post(f'/api/payments/{created["id"]}/report', json={**report_data(), "amount": "-1"}).status_code == 422
    assert payment_api.post(f'/api/payments/{created["id"]}/report', json={**report_data(), "paid_at": "2099-01-01T00:00:00Z"}).status_code == 422
    assert payment_api.post(f'/api/payments/{created["id"]}/report', json={**report_data(), "paid_at": "2026-10-26T12:00:00"}).status_code == 422
    other = User(id="other", email="other@example.invalid")
    db_session.add(other)
    db_session.commit()
    from app.api.dependencies import get_current_user
    app.dependency_overrides[get_current_user] = lambda: other
    assert payment_api.get("/api/payments").json() == []
    assert payment_api.post(f'/api/payments/{created["id"]}/report', json=report_data()).status_code == 404
    assert payment_api.post(f'/api/payments/{created["id"]}/cancel').status_code == 404
    app.dependency_overrides[get_current_user] = lambda: db_session.get(User, LEGACY_USER_ID)
    assert payment_api.post(f'/api/payments/{created["id"]}/cancel').json()["status"] == "cancelled"
    assert payment_api.post(f'/api/payments/{created["id"]}/cancel').status_code == 200
    assert payment_api.post(f'/api/payments/{created["id"]}/report', json=report_data()).status_code == 409


def test_offset_report_is_stored_as_utc(payment_api):
    created = payment_api.post("/api/payments", json={"country": "other", "method": "paypal"}).json()
    result = payment_api.post(f'/api/payments/{created["id"]}/report', json={**report_data(), "paid_at": "2026-10-25T15:00:00+03:00"})
    assert result.json()["paid_at"] == "2026-10-25T12:00:00Z"
    assert payment_api.get("/api/payments").json()[0]["paid_at"] == "2026-10-25T12:00:00Z"


@pytest.mark.parametrize("currency", ["EUR", "RSD", "RUB", None])
def test_alta_is_disabled_even_with_configured_accounts(payment_api, currency):
    options = payment_api.get("/api/payments/options").json()
    assert set(options["methods"]) == {"sbp", "paypal"}
    assert all("alta" not in methods for methods in options["countries"].values())
    response = payment_api.post("/api/payments", json={"country": "serbia", "method": "alta", "currency": currency})
    assert response.status_code == 409
    assert response.json()["detail"] == "method_unavailable"


def test_old_alta_history_can_be_reported_without_allowing_recreation(payment_api, db_session):
    config = configured()
    old = PaymentRequest(user_id=LEGACY_USER_ID, active_user_id=LEGACY_USER_ID,
        country="serbia", method="alta", status="awaiting_payment",
        details=config.methods["alta"].model_dump(mode="json"), activation=config.activation.model_dump())
    db_session.add(old)
    db_session.flush()
    assert payment_api.post("/api/payments", json={"country": "serbia", "method": "alta"}).status_code == 409
    assert payment_api.get("/api/payments").json()[0]["id"] == old.id
    assert payment_api.post(f"/api/payments/{old.id}/report", json=report_data()).status_code == 200
    assert db_session.get(User, LEGACY_USER_ID).access_tier == "premium"


@pytest.mark.parametrize("decision", ["confirmed", "rejected", "cancelled"])
def test_immediate_provisional_access_then_admin_decision(db_session, decision):
    svc = PaymentService(db_session, configured())
    user = db_session.get(User, LEGACY_USER_ID)
    payment = svc.create(user, PaymentChoice(country="russia", method="sbp"))
    assert user.access_tier == "free"
    svc.report(user, payment.id, PaymentReport.model_validate(report_data()))
    assert user.access_tier == "premium"
    assert user.premium_payment_id == payment.id
    assert payment.status == "awaiting_review"
    assert payment.provisional_granted_at is not None
    original_grant = payment.provisional_granted_at.replace(tzinfo=timezone.utc)
    svc.report(user, payment.id, PaymentReport.model_validate(report_data()))
    assert payment.provisional_granted_at.replace(tzinfo=timezone.utc) == original_grant
    admin = User(id="admin-test", email="admin-test@example.invalid", role="admin", access_tier="free")
    db_session.add(admin)
    db_session.flush()
    svc.decide(admin, payment.id, PaymentDecision(status=decision))
    assert user.access_tier == ("premium" if decision == "confirmed" else "free")
    assert user.premium_payment_id == (payment.id if decision == "confirmed" else None)
    if decision != "confirmed":
        from app.services.payments import PaymentError
        with pytest.raises(PaymentError):
            svc.report(user, payment.id, PaymentReport.model_validate(report_data()))
        assert user.access_tier == "free"


def test_rejection_does_not_revoke_unrelated_premium(db_session):
    svc = PaymentService(db_session, configured())
    user = db_session.get(User, LEGACY_USER_ID)
    payment = svc.create(user, PaymentChoice(country="russia", method="sbp"))
    svc.report(user, payment.id, PaymentReport.model_validate(report_data()))
    user.access_tier, user.premium_payment_id = "premium", "another-grant"
    db_session.flush()
    admin = User(id="admin-test", email="admin-test@example.invalid", role="admin")
    db_session.add(admin)
    db_session.flush()
    svc.decide(admin, payment.id, PaymentDecision(status="rejected"))
    assert user.access_tier == "premium"
    assert user.premium_payment_id == "another-grant"


@pytest.mark.parametrize("url", ["javascript:alert(1)", "https://paypal.com.evil.invalid/", "http://paypal.com/", "https://user@paypal.com/"])
def test_reject_unsafe_paypal_url(url):
    config = configured().model_dump()
    config["methods"]["paypal"]["paypal_url"] = url
    with pytest.raises(ValidationError):
        PaymentConfig.model_validate(config)


def test_concurrent_create_report_and_confirm(tmp_path, monkeypatch):
    from app.services import notifications
    sent = []
    monkeypatch.setattr(notifications, "send_notification", lambda settings, text: sent.append(text))
    from app.db.base import Base
    from app.db.session import create_database_engine
    engine = create_database_engine(f"sqlite:///{(tmp_path / 'payments.db').as_posix()}")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        db.add_all([User(id="payer", email="payer@example.invalid"), User(id="admin", email="admin@example.invalid", role="admin")])
        db.commit()
    payment_id = None
    try:
        for stage in ("create", "report", "confirm"):
            barrier = Barrier(2)
            def worker():
                with Session(engine) as db:
                    user = db.get(User, "admin" if stage == "confirm" else "payer")
                    barrier.wait(timeout=5)
                    settings = payment_notification_settings()
                    svc = PaymentService(db, settings.manual_payments, settings)
                    if stage == "create":
                        payment = svc.create(user, PaymentChoice(country="russia", method="sbp"))
                    elif stage == "report":
                        payment = svc.report(user, payment_id, PaymentReport.model_validate(report_data()))
                    else:
                        payment = svc.decide(user, payment_id, PaymentDecision(status="confirmed"))
                    result = payment.id, payment.reviewed_at.replace(tzinfo=timezone.utc) if payment.reviewed_at else None
                    db.commit()
                    return result
            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(lambda _: worker(), range(2)))
            assert results[0] == results[1]
            payment_id = results[0][0]
        with Session(engine) as db:
            assert db.scalar(select(func.count()).select_from(PaymentRequest)) == 1
            assert db.get(User, "payer").access_tier == "premium"
        assert len(sent) == 1
    finally:
        engine.dispose()


@pytest.mark.parametrize("country,method", [("russia", "sbp"), ("serbia", "paypal"), ("other", "paypal")])
def test_new_payment_codes_are_six_unambiguous_characters_and_stable(payment_api, country, method):
    from app.repositories.payments import PAYMENT_CODE_ALPHABET
    choice = {"country": country, "method": method}
    created = payment_api.post("/api/payments", json=choice)
    assert created.status_code == 200
    code = created.json()["id"]
    assert len(code) == 6 and set(code) <= set(PAYMENT_CODE_ALPHABET)
    assert payment_api.post("/api/payments", json=choice).json()["id"] == code
    assert payment_api.get("/api/payments").json()[0]["id"] == code
    assert payment_api.post(f"/api/payments/{code}/report", json=report_data()).status_code == 200


def test_payment_code_collision_retries_without_losing_old_request_or_transaction(db_session, monkeypatch):
    from app.repositories import payments
    user = db_session.get(User, LEGACY_USER_ID)
    svc = PaymentService(db_session, configured())
    monkeypatch.setattr(payments, "new_payment_code", lambda: "ABC234")
    first = svc.create(user, PaymentChoice(country="russia", method="sbp"))
    db_session.commit()
    codes = iter(["ABC234", "DEF567"])
    monkeypatch.setattr(payments, "new_payment_code", lambda: next(codes))
    second = svc.create(user, PaymentChoice(country="other", method="paypal"))
    assert second.id == "DEF567" and first.status == "cancelled"
    db_session.rollback()
    assert db_session.get(PaymentRequest, "DEF567") is None
    assert db_session.get(PaymentRequest, "ABC234").status == "awaiting_payment"


def test_new_payment_can_be_rolled_back_before_any_prior_write(db_session):
    svc = PaymentService(db_session, configured())
    payment = svc.create(db_session.get(User, LEGACY_USER_ID), PaymentChoice(country="russia", method="sbp"))
    code = payment.id
    db_session.rollback()
    assert db_session.get(PaymentRequest, code) is None


def test_legacy_uuid_reference_is_preserved_and_reportable(payment_api, db_session):
    code = "f6786379-8046-4b2c-a4a5-84e50dc27211"
    config = configured()
    db_session.add(PaymentRequest(id=code, user_id=LEGACY_USER_ID, active_user_id=LEGACY_USER_ID,
        country="russia", method="sbp", status="awaiting_payment", details=config.methods["sbp"].model_dump(mode="json"), activation=config.activation.model_dump()))
    db_session.flush()
    assert payment_api.post("/api/payments", json={"country": "russia", "method": "sbp"}).json()["id"] == code
    assert payment_api.post(f"/api/payments/{code}/report", json=report_data()).status_code == 200


def test_payment_code_exhaustion_is_bounded_and_rollback_preserves_active_request(db_session, monkeypatch):
    from app.repositories import payments
    user = db_session.get(User, LEGACY_USER_ID)
    svc = PaymentService(db_session, configured())
    monkeypatch.setattr(payments, "new_payment_code", lambda: "ABC234")
    first = svc.create(user, PaymentChoice(country="russia", method="sbp"))
    db_session.commit()
    generated = []
    def occupied():
        generated.append(True)
        return "ABC234"
    monkeypatch.setattr(payments, "new_payment_code", occupied)
    with pytest.raises(RuntimeError, match="unique payment code"):
        svc.create(user, PaymentChoice(country="other", method="paypal"))
    assert len(generated) == 10
    db_session.rollback()
    assert db_session.get(PaymentRequest, first.id).status == "awaiting_payment"


def test_payment_code_retry_does_not_hide_other_integrity_errors(db_session, monkeypatch):
    from sqlalchemy.exc import IntegrityError
    from app.repositories import payments
    generated = []
    def candidate():
        generated.append(True)
        return "ABC234"
    monkeypatch.setattr(payments, "new_payment_code", candidate)
    with pytest.raises(IntegrityError):
        payments.PaymentRepository(db_session).add(PaymentRequest(user_id="missing-user", active_user_id="missing-user",
            country="russia", method="sbp", status="awaiting_payment", details={}, activation={}))
    assert len(generated) == 1
    db_session.rollback()
