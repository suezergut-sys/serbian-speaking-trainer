from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import User
from app.models.payments import PaymentRequest


class PaymentRepository:
    def __init__(self, db: Session):
        self.db = db

    def get(self, payment_id: str) -> PaymentRequest | None:
        return self.db.scalar(select(PaymentRequest).where(PaymentRequest.id == payment_id).execution_options(populate_existing=True))

    def active(self, user_id: str) -> PaymentRequest | None:
        return self.db.scalar(select(PaymentRequest).where(PaymentRequest.active_user_id == user_id).execution_options(populate_existing=True))

    def mine(self, user_id: str) -> list[PaymentRequest]:
        return list(self.db.scalars(select(PaymentRequest).where(PaymentRequest.user_id == user_id).order_by(PaymentRequest.created_at.desc(), PaymentRequest.id).limit(20)))

    def admin_list(self, offset: int) -> list[tuple[PaymentRequest, User]]:
        return list(self.db.execute(select(PaymentRequest, User).join(User, User.id == PaymentRequest.user_id).order_by(PaymentRequest.created_at.desc(), PaymentRequest.id).offset(offset).limit(50)))

    def add(self, payment: PaymentRequest) -> PaymentRequest:
        self.db.add(payment)
        self.db.flush()
        return payment
