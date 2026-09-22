import argparse
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy.engine import make_url

from app.config import PROJECT_ROOT, get_settings
from app.db.seed import seed_catalog
from app.db.session import session_scope

BACKEND_ROOT = PROJECT_ROOT / "backend"


def alembic_config() -> Config:
    config = Config(BACKEND_ROOT / "alembic.ini")
    config.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))
    return config


def seed() -> None:
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
