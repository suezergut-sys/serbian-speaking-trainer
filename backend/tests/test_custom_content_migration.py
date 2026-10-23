from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect

from app.db.session import create_database_engine


def test_preparation_migration_upgrade_twice_downgrade_and_reupgrade(tmp_path):
    root = Path(__file__).resolve().parents[1]
    config = Config(str(root / "alembic.ini"))
    config.set_main_option("script_location", str(root / "alembic"))
    config.config_file_name = None
    engine = create_database_engine(f"sqlite+pysqlite:///{(tmp_path / 'migration.db').as_posix()}")
    try:
        with engine.begin() as connection:
            config.attributes["connection"] = connection
            command.upgrade(config, "84bc27e9a101")
            users = connection.exec_driver_sql("SELECT id FROM users").all()
            command.upgrade(config, "head")
            command.upgrade(config, "head")
            assert "phrase_preparation_receipts" in inspect(connection).get_table_names()
            assert {index["name"] for index in inspect(connection).get_indexes("phrase_preparation_receipts")} == {
                "ix_phrase_preparation_receipts_user_id", "ix_phrase_preparation_receipts_expires_at",
            }
            command.downgrade(config, "84bc27e9a101")
            assert "phrase_preparation_receipts" not in inspect(connection).get_table_names()
            assert connection.exec_driver_sql("SELECT id FROM users").all() == users
            command.upgrade(config, "head")
    finally:
        engine.dispose()
