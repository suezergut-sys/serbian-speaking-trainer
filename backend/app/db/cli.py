import argparse
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.config import BACKEND_ROOT, get_settings
from app.db.seed import seed_catalog
from app.db.session import engine, session_scope

CLOUD_RELEASE_LOCK_ID = 7_323_914_787_421_629_147

def alembic_config() -> Config:
    working_directory = Path.cwd()
    migration_root = (
        working_directory
        if (working_directory / "alembic.ini").is_file()
        else BACKEND_ROOT
    )
    config = Config(migration_root / "alembic.ini")
    config.set_main_option("script_location", str(migration_root / "alembic"))
    return config


def seed() -> None:
    if engine.dialect.name == "postgresql":
        with engine.connect() as connection:
            connection.execute(
                text("SELECT pg_advisory_lock(:lock_id)"),
                {"lock_id": CLOUD_RELEASE_LOCK_ID},
            )
            connection.commit()
            try:
                config = alembic_config()
                config.attributes["connection"] = connection
                command.upgrade(config, "head")
                with Session(bind=connection, autoflush=False, expire_on_commit=False) as session:
                    skills_added, topics_added, phrases_added = seed_catalog(session)
                    session.commit()
            finally:
                if connection.in_transaction():
                    connection.rollback()
                connection.execute(
                    text("SELECT pg_advisory_unlock(:lock_id)"),
                    {"lock_id": CLOUD_RELEASE_LOCK_ID},
                )
                connection.commit()
    else:
        command.upgrade(alembic_config(), "head")
        with session_scope() as session:
            skills_added, topics_added, phrases_added = seed_catalog(session)
    print(
        f"Seed complete: {skills_added} skills, {topics_added} topics, "
        f"{phrases_added} topic phrases added."
    )


def reset(confirmed: bool) -> None:
    if not confirmed:
        raise SystemExit("Refusing to reset without --yes")
    url = make_url(get_settings().database_url)
    if url.drivername != "sqlite" or not url.database or url.database == ":memory:":
        raise SystemExit("Reset is supported only for a file-based SQLite development database.")
    db_path = Path(url.database)
    if not db_path.is_absolute():
        db_path = BACKEND_ROOT / db_path
    db_path = db_path.resolve()
    allowed_root = (BACKEND_ROOT / "data").resolve()
    if allowed_root not in db_path.parents:
        raise SystemExit(f"Refusing to delete database outside {allowed_root}")
    if db_path.exists():
        db_path.unlink()
    seed()


def main() -> None:
    parser = argparse.ArgumentParser(description="Development database commands")
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("seed")
    reset_parser = subparsers.add_parser("reset")
    reset_parser.add_argument("--yes", action="store_true")
    args = parser.parse_args()
    if args.command == "seed":
        seed()
    else:
        reset(args.yes)


if __name__ == "__main__":
    main()
