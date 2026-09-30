from datetime import datetime, timezone
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import MetaData, Table, inspect, select

from app.db.session import create_database_engine


def test_idempotency_migration_upgrade_downgrade_roundtrip(tmp_path: Path) -> None:
    backend_root = Path(__file__).resolve().parents[1]
    config = Config(str(backend_root / "alembic.ini"))
    config.set_main_option("script_location", str(backend_root / "alembic"))
    # env.py must not replace pytest/application logging during an in-process migration.
    config.config_file_name = None
    engine = create_database_engine(f"sqlite+pysqlite:///{(tmp_path / 'migration.db').as_posix()}")
    try:
        with engine.begin() as connection:
            config.attributes["connection"] = connection
            command.upgrade(config, "f19a8d6c2b40")
            metadata = MetaData()
            sessions = Table("training_sessions", metadata, autoload_with=connection)
            exercises = Table("exercises", metadata, autoload_with=connection)
            attempts = Table("attempts", metadata, autoload_with=connection)
            errors = Table("error_events", metadata, autoload_with=connection)
            now = datetime.now(timezone.utc)
            connection.execute(sessions.insert().values(
                id="session", user_id="00000000-0000-0000-0000-000000000001",
                started_at=now, level="A2", normalized_topic_json={}, status="active",
            ))
            connection.execute(exercises.insert().values(
                id="exercise", session_id="session", source_ru="Тест",
                target_hints_json={}, targeted_skill_ids=[], generation_meta_json={}, created_at=now,
            ))
            connection.execute(attempts.insert().values(
                id="attempt", exercise_id="exercise", transcript_sr="Test",
                timings_json={}, hinted_words_json=[], analysis_json={}, overall_score=0.5, created_at=now,
            ))
            connection.execute(errors.insert().values(
                id="error", attempt_id="attempt", type="grammar", severity=0.5,
                confidence=1.0, evidence_json={"evidence": "Test"},
            ))
            history = {table.name: connection.execute(select(table)).all() for table in (sessions, exercises, attempts, errors)}

            def assert_history_preserved() -> None:
                assert connection.exec_driver_sql("PRAGMA foreign_keys").scalar() == 1
                for table in (sessions, exercises, attempts, errors):
                    assert connection.execute(select(table)).all() == history[table.name]
                assert connection.exec_driver_sql("PRAGMA foreign_key_check").all() == []

            command.upgrade(config, "head")
            assert_history_preserved()
            assert "attempt_requests" in inspect(connection).get_table_names()
            assert "client_request_id" in {column["name"] for column in inspect(connection).get_columns("exercises")}

            command.downgrade(config, "f19a8d6c2b40")
            assert_history_preserved()
            assert "attempt_requests" not in inspect(connection).get_table_names()
            assert "client_request_id" not in {column["name"] for column in inspect(connection).get_columns("exercises")}

            command.upgrade(config, "head")
            assert_history_preserved()
            assert "attempt_requests" in inspect(connection).get_table_names()
    finally:
        engine.dispose()
