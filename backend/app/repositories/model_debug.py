from datetime import datetime, timezone
from sqlalchemy import case, delete, select, update
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
            self.clear_expired_audio()
            # Bound retained audio even when debug stays enabled for a long time.
            old = select(ModelDebugLog.id).where(ModelDebugLog.user_id == self.user_id,
                ModelDebugLog.audio_expires_at.is_not(None)).order_by(ModelDebugLog.started_at.desc()).offset(19 if fields.get("audio_payload") else 20)
            self.db.execute(update(ModelDebugLog).where(ModelDebugLog.id.in_(old)).values(
                audio_payload=None, audio_content_type=None, audio_expires_at=None))
            self.db.add(ModelDebugLog(user_id=self.user_id, **fields))

    def clear_expired_audio(self):
        self.db.execute(update(ModelDebugLog).where(ModelDebugLog.user_id == self.user_id,
            ModelDebugLog.audio_expires_at <= datetime.now(timezone.utc)).values(
                audio_payload=None, audio_content_type=None, audio_expires_at=None).execution_options(synchronize_session="fetch"))

    def audio(self, log_id: str):
        self.clear_expired_audio()
        return self.db.scalar(select(ModelDebugLog).where(ModelDebugLog.id == log_id,
            ModelDebugLog.user_id == self.user_id, ModelDebugLog.audio_expires_at > datetime.now(timezone.utc)))
