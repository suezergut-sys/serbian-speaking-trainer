"""Operator-only account erasure after confirming an email request.

No public delete endpoint or client-visible provider secret is introduced.
"""
from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session

from app.repositories.account_deletion import AccountDeletionRepository, identity_hash
from app.repositories.users import UserRepository


def reject_deleted_identity(db: Session, user_id: str) -> None:
    if AccountDeletionRepository(db).blocked(user_id, datetime.now(timezone.utc)):
        raise PermissionError('Account deletion is in progress or complete')


class AccountDeletionService:
    def __init__(self, db: Session):
        self.db = db

    def erase(self, user_id: str, confirmed_email: str, remove_identity: Callable[[str, str], None]) -> bool:
        user = UserRepository(self.db).lock(user_id)
        if user is None:
            return False
        if user.role == 'admin' or user.email.casefold() != confirmed_email.strip().casefold():
            raise PermissionError('Refusing an unconfirmed or administrator account deletion')
        now = datetime.now(timezone.utc)
        repo = AccountDeletionRepository(self.db)
        repo.block(user_id, now, now + timedelta(days=30))
        # Persist before contacting Auth: stale signed access tokens cannot recreate
        # or access the account if provider removal fails or the operator retries.
        self.db.commit()
        remove_identity(user_id, confirmed_email)
        user = UserRepository(self.db).lock(user_id)
        if user is not None:
            repo.erase_user(user_id)
        self.db.commit()
        return True
