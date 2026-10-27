import json
from decimal import Decimal

from app.config import Settings


def test_nested_sbp_amount_override_preserves_private_payment_details(monkeypatch):
    original = {"activation": {"ru": "Тестовые условия", "en": "Test terms"}, "methods": {
        "sbp": {"amount": "5000.00", "currency": "RUB", "recipient": "Synthetic recipient",
                "phone": "+70000000000", "bank": "Synthetic bank", "instructions": {"ru": "Инструкция", "en": "Instructions"}},
        "paypal": {"amount": "5.00", "currency": "EUR", "paypal": "synthetic@example.invalid"}}}
    monkeypatch.setenv("MANUAL_PAYMENTS", json.dumps(original))
    monkeypatch.delenv("MANUAL_PAYMENTS__METHODS__SBP__AMOUNT", raising=False)
    baseline = Settings(_env_file=None).manual_payments
    assert baseline.methods["sbp"].amount == Decimal("5000.00")
    monkeypatch.setenv("MANUAL_PAYMENTS__METHODS__SBP__AMOUNT", "500.00")
    updated = Settings(_env_file=None).manual_payments
    assert updated.methods["sbp"].amount == Decimal("500.00")
    assert updated.model_dump(exclude={"methods": {"sbp": {"amount"}}}) == baseline.model_dump(exclude={"methods": {"sbp": {"amount"}}})
