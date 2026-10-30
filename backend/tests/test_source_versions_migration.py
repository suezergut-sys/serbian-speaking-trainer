from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect
from app.db.session import create_database_engine


def test_bilingual_migration_preserves_original_canonical_and_progress(tmp_path):
    root = Path(__file__).resolve().parents[1]
    config = Config(str(root / 'alembic.ini'))
    config.set_main_option('script_location', str(root / 'alembic'))
    config.config_file_name = None
    engine = create_database_engine(f"sqlite:///{(tmp_path / 'bilingual.db').as_posix()}")
    with engine.begin() as connection:
        config.attributes['connection'] = connection
        command.upgrade(config, '8fd7172bc955')
        connection.exec_driver_sql("INSERT INTO users (id,email,role,access_tier,registered_at,last_active_at) VALUES ('bilingual','bilingual@example.invalid','user','premium',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)")
        connection.exec_driver_sql("INSERT INTO review_phrases (id,user_id,source_ru,source_normalized,intended_sr_variants_json,word_hints_json,targeted_skill_keys_json,best_score,attempts,perfect_streak,incorrect_attempts,learning_errors,mastery_count,interval_days,status,created_at,updated_at) VALUES ('p','bilingual','Original phrase','original phrase','[\"Izvorna fraza.\"]','[]','[]',0.9,7,1,2,2,1,3,'active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)")
        before = connection.exec_driver_sql("SELECT source_ru,intended_sr_variants_json,attempts,best_score,status FROM review_phrases WHERE id='p'").one()
        command.upgrade(config, 'head')
        command.upgrade(config, 'head')
        assert connection.exec_driver_sql("SELECT source_versions_json FROM review_phrases WHERE id='p'").scalar() == '{}'
        assert connection.exec_driver_sql("SELECT source_ru,intended_sr_variants_json,attempts,best_score,status FROM review_phrases WHERE id='p'").one() == before
        command.downgrade(config, '8fd7172bc955')
        assert 'source_versions_json' not in {column['name'] for column in inspect(connection).get_columns('review_phrases')}
        assert connection.exec_driver_sql("SELECT source_ru,intended_sr_variants_json,attempts,best_score,status FROM review_phrases WHERE id='p'").one() == before
    engine.dispose()
