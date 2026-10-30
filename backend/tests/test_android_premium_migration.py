from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import inspect

from app.db.session import create_database_engine


def test_android_premium_upgrade_repeat_and_downgrade_preserve_access(tmp_path):
    root = Path(__file__).resolve().parents[1]
    config = Config(str(root / 'alembic.ini'))
    config.set_main_option('script_location', str(root / 'alembic'))
    config.config_file_name = None
    engine = create_database_engine(f"sqlite:///{(tmp_path / 'android.db').as_posix()}")
    with engine.begin() as connection:
        config.attributes['connection'] = connection
        command.upgrade(config, '7db9f01a2201')
        connection.exec_driver_sql("INSERT INTO users (id,email,role,access_tier,registered_at,last_active_at) VALUES ('u','u@example.invalid','user','premium',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)")
        command.upgrade(config, '8fd7172bc955')
        command.upgrade(config, '8fd7172bc955')
        assert connection.exec_driver_sql("SELECT android_premium_granted_at FROM users WHERE id='u'").scalar() is None
        connection.exec_driver_sql("UPDATE users SET android_premium_granted_at=CURRENT_TIMESTAMP WHERE id='u'")
        command.downgrade(config, '7db9f01a2201')
        assert 'android_premium_granted_at' not in {c['name'] for c in inspect(connection).get_columns('users')}
        assert connection.exec_driver_sql("SELECT access_tier FROM users WHERE id='u'").scalar() == 'premium'
        command.upgrade(config, '8fd7172bc955')
    engine.dispose()


def test_downgrade_cannot_remove_active_deleted_identity_guards(tmp_path):
    root = Path(__file__).resolve().parents[1]
    config = Config(str(root / 'alembic.ini'))
    config.set_main_option('script_location', str(root / 'alembic'))
    config.config_file_name = None
    engine = create_database_engine(f"sqlite:///{(tmp_path / 'guard.db').as_posix()}")
    with engine.begin() as connection:
        config.attributes['connection'] = connection
        command.upgrade(config, '8fd7172bc955')
        connection.exec_driver_sql("INSERT INTO deleted_account_markers VALUES (?, datetime('now', '+30 days'))", ('a' * 64,))
        with pytest.raises(RuntimeError, match='active deleted-account token guards'):
            command.downgrade(config, '7db9f01a2201')
        assert connection.exec_driver_sql('SELECT version_num FROM alembic_version').scalar() == '8fd7172bc955'
        assert 'android_premium_granted_at' in {c['name'] for c in inspect(connection).get_columns('users')}
        connection.exec_driver_sql("UPDATE deleted_account_markers SET expires_at=datetime('now', '-1 day')")
        command.downgrade(config, '7db9f01a2201')
        assert 'deleted_account_markers' not in inspect(connection).get_table_names()
    engine.dispose()
