from pathlib import Path
import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import inspect
from app.db.session import create_database_engine


def test_title_migration_preserves_old_names_repeat_upgrade_and_safe_downgrade(tmp_path):
    root = Path(__file__).resolve().parents[1]
    config = Config(str(root / "alembic.ini"))
    config.set_main_option("script_location", str(root / "alembic"))
    config.config_file_name = None
    engine = create_database_engine(f"sqlite:///{(tmp_path / 'titles.db').as_posix()}")
    try:
        with engine.begin() as connection:
            config.attributes["connection"] = connection
            command.upgrade(config, "a910bc57d302")
            connection.exec_driver_sql("INSERT INTO topic_presets (id,title_ru,description_ru,intents_json,vocabulary_json,is_custom,enabled) VALUES ('old','Старая тема','','[]','[]',1,1)")
            command.upgrade(config, "head")
            command.upgrade(config, "head")
            assert connection.exec_driver_sql("SELECT title_ru,title_en FROM topic_presets WHERE id='old'").one() == ("Старая тема", None)
            connection.exec_driver_sql("UPDATE topic_presets SET title_en='Old topic' WHERE id='old'")
            with pytest.raises(RuntimeError, match="Cannot discard"):
                command.downgrade(config, "a910bc57d302")
            connection.exec_driver_sql("UPDATE topic_presets SET title_en=NULL WHERE id='old'")
            command.downgrade(config, "a910bc57d302")
            assert "title_en" not in {row["name"] for row in inspect(connection).get_columns("topic_presets")}
            command.upgrade(config, "head")
            assert connection.exec_driver_sql("SELECT title_ru FROM topic_presets WHERE id='old'").scalar() == "Старая тема"
    finally:
        engine.dispose()
