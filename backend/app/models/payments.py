from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.entities import new_id, utc_now


class PaymentRequest(Base):
    __tablename__ = "payment_requests"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    active_user_id: Mapped[str | None] = mapped_column(String(36), unique=True)
    country: Mapped[str] = mapped_column(String(20))
    method: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(24), default="awaiting_payment")
    details: Mapped[dict] = mapped_column(JSON)
    activation: Mapped[dict] = mapped_column(JSON)
    provisional_granted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reported_amount: Mapped[str | None] = mapped_column(String(20))
    transaction_id: Mapped[str | None] = mapped_column(String(200))
    reviewed_by: Mapped[str | None] = mapped_column(String(36))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    __table_args__ = (
        CheckConstraint("country IN ('russia','serbia','other')", name="ck_payment_country"),
        CheckConstraint("method IN ('sbp','alta','paypal')", name="ck_payment_method"),
        CheckConstraint("status IN ('awaiting_payment','awaiting_review','confirmed','rejected','cancelled')", name="ck_payment_status"),
        CheckConstraint("(status IN ('awaiting_payment','awaiting_review') AND active_user_id = user_id AND active_user_id IS NOT NULL) OR (status IN ('confirmed','rejected','cancelled') AND active_user_id IS NULL)", name="ck_payment_active"),
    )
