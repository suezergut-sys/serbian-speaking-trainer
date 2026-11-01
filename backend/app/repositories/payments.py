import secrets

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import User
from app.models.payments import PaymentRequest


PAYMENT_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"


def new_payment_code() -> str:
    return "".join(secrets.choice(PAYMENT_CODE_ALPHABET) for _ in range(6))


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
        # Existing IDs remain valid; newly issued references are easier to type.
        # A savepoint handles concurrent primary-key collisions without rolling
        # back the caller's transaction (including cancellation of an old request).
        connection = self.db.connection()
        if connection.dialect.name == "sqlite" and not connection.connection.driver_connection.in_transaction:
            # sqlite3 legacy transaction control does not BEGIN for a SELECT;
            # otherwise RELEASE SAVEPOINT could commit outside the outer unit of work.
            connection.exec_driver_sql("BEGIN")
        for _ in range(10):
            payment.id = new_payment_code()
            try:
                with self.db.begin_nested():
                    self.db.add(payment)
                    self.db.flush()
                return payment
            except IntegrityError:
                if self.get(payment.id) is None:
                    raise
        raise RuntimeError("Could not allocate a unique payment code")
