from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.models import User
from app.models.payments import PaymentRequest
from app.repositories.payments import PaymentRepository
from app.repositories.users import UserRepository
from app.schemas.payments import PaymentChoice, PaymentConfig, PaymentDecision, PaymentReport
from app.services.notifications import notify_after_commit

COUNTRY_METHODS = {"russia": ["sbp", "paypal"], "serbia": ["alta", "paypal"], "other": ["paypal"]}


class PaymentError(Exception):
    def __init__(self, code: str, status: int = 409):
        self.code, self.status = code, status


class PaymentService:
    def __init__(self, db: Session, config: PaymentConfig, settings: Settings | None = None):
        self.db, self.config = db, config
        self.settings = settings or get_settings()
        self.repo = PaymentRepository(db)
        self.users = UserRepository(db)

    def method_config(self, method: str, currency: str | None = None):
        item = self.config.methods.get(method)
        if method == "alta" and currency and (not item or item.currency != currency):
            alternative = self.config.alta_alternative
            return alternative if alternative and alternative.currency == currency else None
        return item if item and (not currency or item.currency == currency) else None

    def available(self, method: str, currency: str | None = None) -> bool:
        item = self.method_config(method, currency)
        activation = self.config.activation
        if not item or not activation or not all(text.strip() for text in (activation.ru, activation.en, item.recipient, item.instructions.ru, item.instructions.en)) or not item.amount or not item.currency:
            return False
        if method == "sbp":
            return item.currency == "RUB" and bool(item.phone and item.phone.strip() and item.bank and item.bank.strip())
        if method == "alta":
            return bool(item.account and item.account.strip() and item.bank_details and item.bank_details.strip())
        return item.currency == "EUR" and item.amount == 5 and bool((item.paypal and item.paypal.strip()) or item.paypal_url)

    def options(self) -> dict:
        return {"activation": self.config.activation, "countries": COUNTRY_METHODS,
                "methods": {key: {"available": self.available(key) or (key == "alta" and any(self.available(key, c) for c in ("EUR", "RSD"))),
                    "currencies": [c for c in ("EUR", "RSD", "RUB") if self.available(key, c)]} for key in ("sbp", "alta", "paypal")}}

    def create(self, user: User, choice: PaymentChoice) -> PaymentRequest:
        locked = self.users.lock(user.id)
        if locked.access_tier == "premium":
            raise PaymentError("already_premium")
        active = self.repo.active(user.id)
        if active and active.country == choice.country and active.method == choice.method and (not choice.currency or active.details["currency"] == choice.currency):
            return active
        if active and active.status == "awaiting_review":
            raise PaymentError("awaiting_review")
        if choice.method not in COUNTRY_METHODS[choice.country] or not self.available(choice.method, choice.currency):
            raise PaymentError("method_unavailable")
        if active:
            active.status, active.active_user_id = "cancelled", None
            self.db.flush()
        return self.repo.add(PaymentRequest(user_id=user.id, active_user_id=user.id,
            country=choice.country, method=choice.method, status="awaiting_payment",
            details=self.method_config(choice.method, choice.currency).model_dump(mode="json"),
            activation=self.config.activation.model_dump()))

    def owned_locked(self, user: User, payment_id: str) -> PaymentRequest:
        self.users.lock(user.id)
        payment = self.repo.get(payment_id)
        if not payment or payment.user_id != user.id:
            raise PaymentError("payment_not_found", 404)
        return payment

    def report(self, user: User, payment_id: str, report: PaymentReport) -> PaymentRequest:
        payment = self.owned_locked(user, payment_id)
        if payment.status in {"awaiting_review", "confirmed"}:
            return payment
        if payment.status != "awaiting_payment":
            raise PaymentError("invalid_payment_state")
        payment.status = "awaiting_review"
        payment.paid_at, payment.reported_amount = report.paid_at, str(report.amount)
        payment.transaction_id = report.transaction_id
        if user.access_tier == "free":
            user.access_tier, user.premium_payment_id = "premium", payment.id
            payment.provisional_granted_at = datetime.now(timezone.utc)
        self.db.flush()
        country = {"russia": "Россия", "serbia": "Сербия", "other": "Другая страна"}[payment.country]
        method = {"sbp": "СБП", "alta": "ALTA Banka", "paypal": "PayPal"}[payment.method]
        access = "Premium включён сразу" if payment.provisional_granted_at else "Premium уже был активен"
        notify_after_commit(self.db, self.settings, user.email,
            f"сообщил об оплате Premium в SerboTalk.\n"
            f"Заявка: {payment.id}\nСтрана: {country}\nСпособ: {method}\n"
            f"К оплате: {payment.details['amount']} {payment.details['currency']}\n"
            f"Пользователь указал: {payment.reported_amount} {payment.details['currency']}\n"
            f"{access}; заявка ожидает проверки.\n"
            "Поступление денег ещё не подтверждено.\nПроверить заявку: https://serbotalk.app/app")
        return payment

    def cancel(self, user: User, payment_id: str) -> PaymentRequest:
        payment = self.owned_locked(user, payment_id)
        if payment.status == "cancelled":
            return payment
        if payment.status != "awaiting_payment":
            raise PaymentError("invalid_payment_state")
        payment.status, payment.active_user_id = "cancelled", None
        self.db.flush()
        return payment

    def decide(self, admin: User, payment_id: str, decision: PaymentDecision) -> PaymentRequest:
        if admin.role != "admin":
            raise PaymentError("admin_required", 403)
        payment = self.repo.get(payment_id)
        if not payment:
            raise PaymentError("payment_not_found", 404)
        owner = self.users.lock(payment.user_id)
        payment = self.repo.get(payment_id)
        if payment.status == decision.status:
            return payment
        if payment.status != "awaiting_review" and not (payment.status == "awaiting_payment" and decision.status == "cancelled"):
            raise PaymentError("invalid_payment_state")
        payment.status, payment.active_user_id = decision.status, None
        payment.reviewed_by, payment.reviewed_at = admin.id, datetime.now(timezone.utc)
        if decision.status == "confirmed":
            if owner.access_tier == "free" or owner.premium_payment_id == payment.id:
                owner.access_tier, owner.premium_payment_id = "premium", payment.id
        elif payment.provisional_granted_at and owner.premium_payment_id == payment.id and owner.android_premium_granted_at is None:
            owner.access_tier, owner.premium_payment_id = "free", None
        self.db.flush()
        return payment
