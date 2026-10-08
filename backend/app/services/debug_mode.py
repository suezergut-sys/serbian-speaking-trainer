from sqlalchemy.orm import Session
from app.repositories.model_debug import ModelDebugRepository
from app.schemas.model_debug import DebugMode


class DebugModeService:
    def __init__(self, db: Session, user_id: str):
        self.db = db
        self.repository = ModelDebugRepository(db, user_id)

    def read(self) -> DebugMode:
        setting = self.repository.setting()
        return DebugMode(enabled=bool(setting and setting.enabled))

    def change(self, enabled: bool) -> DebugMode:
        self.repository.change(enabled)
        self.db.commit()
        return DebugMode(enabled=enabled)
