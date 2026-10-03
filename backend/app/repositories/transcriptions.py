from sqlalchemy.orm import Session
from app.models import TranscriptionReceipt


class TranscriptionReceiptRepository:
    def __init__(self, db: Session, user_id: str):
        self.db, self.user_id = db, user_id

    def add(self, exercise_id: str, raw: str, changes: list[dict], policy: str) -> TranscriptionReceipt:
        receipt = TranscriptionReceipt(user_id=self.user_id, exercise_id=exercise_id,
            raw_text=raw, changes_json=changes, policy_version=policy)
        self.db.add(receipt)
        self.db.flush()
        return receipt

    def get_owned(self, receipt_id: str, exercise_id: str) -> TranscriptionReceipt | None:
        receipt = self.db.get(TranscriptionReceipt, receipt_id)
        if receipt and receipt.user_id == self.user_id and receipt.exercise_id == exercise_id:
            return receipt
        return None
