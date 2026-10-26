from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Literal
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field, AwareDatetime, field_validator

Country = Literal["russia", "serbia", "other"]
Method = Literal["sbp", "alta", "paypal"]
Status = Literal["awaiting_payment", "awaiting_review", "confirmed", "rejected", "cancelled"]


class LocalizedText(BaseModel):
    ru: str = Field(default="", max_length=2000)
    en: str = Field(default="", max_length=2000)


class PaymentMethodConfig(BaseModel):
    amount: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    currency: Literal["RUB", "RSD", "EUR"] | None = None
    recipient: str = Field(default="", max_length=300)
    phone: str | None = Field(default=None, max_length=80)
    bank: str | None = Field(default=None, max_length=300)
    account: str | None = Field(default=None, max_length=300)
    bank_details: str | None = Field(default=None, max_length=2000)
    paypal: str | None = Field(default=None, max_length=320)
    paypal_url: str | None = Field(default=None, max_length=1000)
    instructions: LocalizedText = Field(default_factory=LocalizedText)

    @field_validator("paypal_url")
    @classmethod
    def safe_paypal_url(cls, value: str | None) -> str | None:
        if value is not None:
            url = urlparse(value)
            if url.scheme != "https" or url.hostname not in {"paypal.me", "www.paypal.me", "paypal.com", "www.paypal.com"} or url.username or url.password:
                raise ValueError("Use an HTTPS PayPal URL")
        return value


class PaymentConfig(BaseModel):
    activation: LocalizedText | None = None
    methods: dict[Method, PaymentMethodConfig] = Field(default_factory=dict)
    alta_alternative: PaymentMethodConfig | None = None


class PaymentChoice(BaseModel):
    country: Country
    method: Method
    currency: Literal["RUB", "RSD", "EUR"] | None = None


class PaymentReport(BaseModel):
    paid_at: AwareDatetime
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    transaction_id: str | None = Field(default=None, max_length=200)

    @field_validator("paid_at")
    @classmethod
    def not_future(cls, value: datetime) -> datetime:
        if value > datetime.now(timezone.utc) + timedelta(minutes=10):
            raise ValueError("Payment time cannot be in the future")
        return value.astimezone(timezone.utc)


class PaymentDecision(BaseModel):
    status: Literal["confirmed", "rejected", "cancelled"]


class PaymentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    user_id: str
    country: Country
    method: Method
    status: Status
    details: PaymentMethodConfig
    activation: LocalizedText
    provisional_granted_at: datetime | None
    created_at: datetime
    paid_at: datetime | None
    reported_amount: str | None
    transaction_id: str | None
    reviewed_by: str | None
    reviewed_at: datetime | None

    @field_validator("created_at", "paid_at", "reviewed_at", "provisional_granted_at")
    @classmethod
    def utc_for_sqlite(cls, value: datetime | None) -> datetime | None:
        # SQLite drops timezone metadata; all stored payment timestamps use UTC.
        return value.replace(tzinfo=timezone.utc) if value and value.tzinfo is None else value


class AdminPaymentResponse(PaymentResponse):
    email: str
    display_name: str | None
