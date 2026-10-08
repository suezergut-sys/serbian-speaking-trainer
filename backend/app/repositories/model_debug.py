from sqlalchemy import case, delete, update
from sqlalchemy.orm import Session
from app.models import ModelDebugLog, ModelDebugSetting


class ModelDebugRepository:
    def __init__(self, db: Session, user_id: str):
        self.db, self.user_id = db, user_id

    def setting(self):
        return self.db.get(ModelDebugSetting, self.user_id)

    def change(self, enabled: bool):
        # Create disabled state once; conflict-safe on both supported databases.
        from sqlalchemy.dialects.sqlite import insert as sqlite_insert
        from sqlalchemy.dialects.postgresql import insert as pg_insert
        insert = pg_insert if self.db.get_bind().dialect.name == "postgresql" else sqlite_insert
        self.db.execute(insert(ModelDebugSetting).values(user_id=self.user_id, enabled=False, generation=0)
                        .on_conflict_do_nothing(index_elements=["user_id"]))
        self.db.execute(update(ModelDebugSetting).where(ModelDebugSetting.user_id == self.user_id)
                        .values(enabled=enabled, generation=(case(
                            (ModelDebugSetting.enabled.is_(False), ModelDebugSetting.generation + 1),
                            else_=ModelDebugSetting.generation,
                        ) if enabled else ModelDebugSetting.generation + 1)))
        if not enabled:
            self.db.execute(delete(ModelDebugLog).where(ModelDebugLog.user_id == self.user_id))

    def append(self, generation: int, fields: dict):
        # Lock the same row as disable. Late calls cannot resurrect deleted logs,
        # including after an off/on cycle or across backend instances.
        result = self.db.execute(update(ModelDebugSetting).where(
            ModelDebugSetting.user_id == self.user_id,
            ModelDebugSetting.enabled.is_(True), ModelDebugSetting.generation == generation,
        ).values(generation=generation))
        if result.rowcount == 1:
            self.db.add(ModelDebugLog(user_id=self.user_id, **fields))
