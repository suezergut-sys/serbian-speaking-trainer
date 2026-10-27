from pathlib import Path
import re

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.misc_phrases import MISC_PHRASES
from app.db.seed import seed_catalog
from app.db.session import create_database_engine
from app.models import TopicPhrase
from app.services.hint_alignment import aligned_word_hints


def test_misc_catalog_is_substantial_and_uses_conversational_expressions():
    assert len(MISC_PHRASES) == 50
    assert len({p["canonical_sr"] for p in MISC_PHRASES}) == 50
    for phrase in MISC_PHRASES:
        assert len(phrase["canonical_sr"].split()) >= 7
        for translation in phrase["hints_en"].values():
            assert not re.search(r"[А-Яа-яЁё]", translation)
    assert "of" not in MISC_PHRASES[0]["hints_en"]
    assert MISC_PHRASES[7]["hints_en"]["i'll let you know"] == "javiću ti"
    assert MISC_PHRASES[21]["hints_en"]["lunch"] == "ručka"
    combined = " ".join(p["canonical_sr"] for p in MISC_PHRASES)
    for expression in ("Svejedno mi je", "Nemam pojma", "Nema veze", "Ma daj", "Nema šanse", "Čujemo se", "Sve po starom"):
        assert expression.casefold() in combined.casefold()


@pytest.mark.parametrize("language", ["ru", "en"])
def test_misc_session_uses_persisted_bilingual_catalog_without_ai(api_client, db_session, language):
    response = api_client.post("/api/sessions/start", json={"topic_id": "misc", "length": 50}, headers={"X-Interface-Language": language})
    assert response.status_code == 201
    exercise = response.json()["exercise"]
    phrase = next(p for p in MISC_PHRASES if p["source_ru"] == exercise["source_ru"])
    assert phrase["canonical_sr"]
    assert exercise["word_hints"]
    assert aligned_word_hints(phrase[f"source_{language}"], phrase["canonical_sr"], exercise["word_hints"]) == exercise["word_hints"]


def test_position_migration_seed_repeat_and_safe_downgrade(tmp_path):
    root = Path(__file__).resolve().parents[1]
    config = Config(str(root / "alembic.ini"))
    config.set_main_option("script_location", str(root / "alembic"))
    config.config_file_name = None
    engine = create_database_engine(f"sqlite+pysqlite:///{(tmp_path / 'misc.db').as_posix()}")
    try:
        with engine.begin() as connection:
            config.attributes["connection"] = connection
            command.upgrade(config, "head")
            command.upgrade(config, "head")
            command.downgrade(config, "2e89c4f8a7b2")
            command.upgrade(config, "head")
            with Session(bind=connection) as session:
                assert seed_catalog(session) == (50, 8, 210)
                session.flush()
                assert seed_catalog(session) == (0, 0, 0)
                assert len(session.scalars(select(TopicPhrase).where(TopicPhrase.topic_id == "misc")).all()) == 50
                session.commit()
            with pytest.raises(RuntimeError, match="No learner data was deleted"):
                command.downgrade(config, "2e89c4f8a7b2")
            assert connection.exec_driver_sql("SELECT COUNT(*) FROM topic_phrases WHERE topic_id='misc'").scalar() == 50
    finally:
        engine.dispose()
