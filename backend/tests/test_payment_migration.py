from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import inspect

from app.db.session import create_database_engine


def test_payment_migration_repeat_upgrade_and_guard_downgrade(tmp_path):
    root = Path(__file__).resolve().parents[1]
    config = Config(str(root / "alembic.ini"))
    config.set_main_option("script_location", str(root / "alembic"))
    config.config_file_name = None
    engine = create_database_engine(f"sqlite:///{(tmp_path / 'migration.db').as_posix()}")
    try:
        with engine.begin() as connection:
            config.attributes["connection"] = connection
            command.upgrade(config, "head")
            command.upgrade(config, "head")
            assert "payment_requests" in inspect(connection).get_table_names()
            command.downgrade(config, "6ccb82f56983")
            assert "payment_requests" not in inspect(connection).get_table_names()
            command.upgrade(config, "head")
            connection.exec_driver_sql("INSERT INTO users (id,email,role,access_tier,registered_at,last_active_at) VALUES ('payer','payer@example.invalid','user','free',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)")
            connection.exec_driver_sql("INSERT INTO payment_requests (id,user_id,active_user_id,country,method,status,details,activation,created_at) VALUES ('synthetic','payer','payer','russia','sbp','awaiting_payment','{}','{}',CURRENT_TIMESTAMP)")
            with pytest.raises(RuntimeError, match="Cannot discard"):
                command.downgrade(config, "6ccb82f56983")
    finally:
        engine.dispose()
