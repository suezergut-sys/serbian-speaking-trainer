from pathlib import Path
from alembic import command
from alembic.config import Config
from sqlalchemy import inspect
from app.db.session import create_database_engine


def test_receipt_table_roundtrip(tmp_path):
    root = Path(__file__).resolve().parents[1]
    config = Config(str(root / "alembic.ini"))
    config.set_main_option("script_location", str(root / "alembic"))
    config.config_file_name = None
    engine = create_database_engine(f"sqlite+pysqlite:///{(tmp_path / 'migration.db').as_posix()}")
    try:
        with engine.begin() as connection:
            config.attributes["connection"] = connection
            command.upgrade(config, "e926b83f4d10")
            users_before = connection.exec_driver_sql("SELECT id FROM users").all()
            command.upgrade(config, "head")
            command.upgrade(config, "head")
            assert "transcription_receipts" in inspect(connection).get_table_names()
            assert not any("audio" in c["name"] for c in inspect(connection).get_columns("transcription_receipts"))
            command.downgrade(config, "e926b83f4d10")
            assert "transcription_receipts" not in inspect(connection).get_table_names()
            assert connection.exec_driver_sql("SELECT id FROM users").all() == users_before
            command.upgrade(config, "head")
    finally:
        engine.dispose()
