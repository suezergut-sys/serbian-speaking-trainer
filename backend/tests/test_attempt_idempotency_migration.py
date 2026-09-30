from datetime import datetime, timezone
import os
from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import MetaData, Table, event, inspect, select
from sqlalchemy.engine import make_url

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


def test_reservation_migration_preserves_completed_request_on_roundtrip(tmp_path: Path) -> None:
    backend_root = Path(__file__).resolve().parents[1]
    config = Config(str(backend_root / "alembic.ini"))
    config.set_main_option("script_location", str(backend_root / "alembic"))
    config.config_file_name = None
    engine = create_database_engine(f"sqlite+pysqlite:///{(tmp_path / 'reservation-migration.db').as_posix()}")
    try:
        with engine.begin() as connection:
            config.attributes["connection"] = connection
            command.upgrade(config, "c7d91a2e5b60")
            now = datetime.now(timezone.utc)
            connection.exec_driver_sql(
                "INSERT INTO training_sessions (id, user_id, started_at, level, normalized_topic_json, status) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                ("session", "00000000-0000-0000-0000-000000000001", now, "A2", "{}", "active"),
            )
            connection.exec_driver_sql(
                "INSERT INTO exercises (id, session_id, source_ru, target_hints_json, targeted_skill_ids, "
                "generation_meta_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                ("exercise", "session", "Тест", "{}", "[]", "{}", now),
            )
            connection.exec_driver_sql(
                "INSERT INTO attempts (id, exercise_id, transcript_sr, timings_json, hinted_words_json, "
                "analysis_json, overall_score, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                ("attempt", "exercise", "Test", "{}", "[]", "{}", 0.5, now),
            )
            connection.exec_driver_sql(
                "INSERT INTO attempt_requests (user_id, client_request_id, payload_hash, attempt_id, response_json) "
                "VALUES (?, ?, ?, ?, ?)",
                ("00000000-0000-0000-0000-000000000001", "request", "hash", "attempt", "{}"),
            )
            for revision in ("head", "c7d91a2e5b60", "head"):
                if revision == "c7d91a2e5b60":
                    command.downgrade(config, revision)
                else:
                    command.upgrade(config, revision)
                row = connection.exec_driver_sql(
                    "SELECT attempt_id, response_json FROM attempt_requests WHERE client_request_id = 'request'"
                ).one()
                assert row == ("attempt", "{}")
                assert connection.exec_driver_sql("PRAGMA foreign_key_check").all() == []
    finally:
        engine.dispose()


def test_postgres_reservation_migration_preserves_history() -> None:
    raw = os.environ.get("TEST_POSTGRES_URL")
    if not raw:
        pytest.skip("isolated PostgreSQL test database is unavailable")
    url = make_url(raw)
    if url.host not in {"localhost", "127.0.0.1", "::1"} or url.port != 55432 or url.database != "serbotalk_concurrency_test":
        pytest.fail("TEST_POSTGRES_URL must point to the isolated loopback test database")
    schema = f"test_migration_{uuid4().hex}"
    backend_root = Path(__file__).resolve().parents[1]
    config = Config(str(backend_root / "alembic.ini"))
    config.set_main_option("script_location", str(backend_root / "alembic"))
    config.config_file_name = None
    engine = create_database_engine(raw)
    with engine.begin() as connection:
        assert connection.exec_driver_sql("SELECT current_database()").scalar() == "serbotalk_concurrency_test"
        connection.exec_driver_sql(f"CREATE SCHEMA {schema}")

    @event.listens_for(engine, "connect")
    def use_test_schema(connection, _record):
        cursor = connection.cursor()
        cursor.execute(f"SET search_path TO {schema}")
        cursor.close()

    engine.dispose()
    try:
        with engine.begin() as connection:
            config.attributes["connection"] = connection
            command.upgrade(config, "c7d91a2e5b60")
            now = datetime.now(timezone.utc)
            connection.exec_driver_sql(
                "INSERT INTO training_sessions (id, user_id, started_at, level, normalized_topic_json, status) "
                "VALUES (%s, %s, %s, %s, %s, %s)",
                ("session", "00000000-0000-0000-0000-000000000001", now, "A2", "{}", "active"),
            )
            connection.exec_driver_sql(
                "INSERT INTO exercises (id, session_id, source_ru, target_hints_json, targeted_skill_ids, "
                "generation_meta_json, created_at) VALUES (%s, %s, %s, %s, %s, %s, %s)",
                ("exercise", "session", "Тест", "{}", "[]", "{}", now),
            )
            connection.exec_driver_sql(
                "INSERT INTO attempts (id, exercise_id, transcript_sr, timings_json, hinted_words_json, "
                "analysis_json, overall_score, created_at) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
                ("attempt", "exercise", "Test", "{}", "[]", "{}", 0.5, now),
            )
            connection.exec_driver_sql(
                "INSERT INTO attempt_requests (user_id, client_request_id, payload_hash, attempt_id, response_json) "
                "VALUES (%s, %s, %s, %s, %s)",
                ("00000000-0000-0000-0000-000000000001", "request", "hash", "attempt", "{}"),
            )
            for revision in ("head", "c7d91a2e5b60", "head"):
                if revision == "c7d91a2e5b60":
                    command.downgrade(config, revision)
                else:
                    command.upgrade(config, revision)
                assert connection.exec_driver_sql(
                    "SELECT attempt_id, response_json FROM attempt_requests WHERE client_request_id = 'request'"
                ).one()[0] == "attempt"
                assert connection.exec_driver_sql("SELECT count(*) FROM attempts").scalar() == 1
    finally:
        engine.dispose()
        cleanup = create_database_engine(raw)
        try:
            with cleanup.begin() as connection:
                connection.exec_driver_sql(f"DROP SCHEMA {schema} CASCADE")
        finally:
            cleanup.dispose()
