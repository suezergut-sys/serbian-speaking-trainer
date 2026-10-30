from datetime import datetime, timezone
from hashlib import sha256

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.models import User
from app.models.entities import DeletedAccountMarker


def identity_hash(user_id: str) -> str:
    return sha256(user_id.encode('utf-8')).hexdigest()


class AccountDeletionRepository:
    def __init__(self, db: Session):
        self.db = db

    def blocked(self, user_id: str, now: datetime) -> bool:
        marker = self.db.get(DeletedAccountMarker, identity_hash(user_id))
        if marker is None:
            return False
        expiry = marker.expires_at.replace(tzinfo=timezone.utc) if marker.expires_at.tzinfo is None else marker.expires_at
        if expiry > now:
            return True
        self.db.delete(marker)
        return False

    def block(self, user_id: str, now: datetime, expires_at: datetime) -> None:
        self.db.execute(delete(DeletedAccountMarker).where(DeletedAccountMarker.expires_at <= now))
        if self.db.get(DeletedAccountMarker, identity_hash(user_id)) is None:
            self.db.add(DeletedAccountMarker(identity_hash=identity_hash(user_id), expires_at=expires_at))

    def erase_user(self, user_id: str) -> None:
        self.db.execute(delete(User).where(User.id == user_id))
