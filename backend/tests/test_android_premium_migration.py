from pathlib import Path

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
