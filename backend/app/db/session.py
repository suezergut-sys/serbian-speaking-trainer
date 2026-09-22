from collections.abc import Generator, Iterator
from contextlib import contextmanager
from pathlib import Path

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import PROJECT_ROOT, get_settings


def resolved_database_url() -> str:
    raw = get_settings().database_url
    url = make_url(raw)
    if url.drivername == "sqlite" and url.database and url.database != ":memory:":
        db_path = Path(url.database)
        if not db_path.is_absolute():
            db_path = PROJECT_ROOT / "backend" / db_path
        db_path.parent.mkdir(parents=True, exist_ok=True)
        return str(url.set(database=db_path.as_posix()))
    return raw


def create_database_engine(database_url: str | None = None) -> Engine:
    url = database_url or resolved_database_url()
    connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    engine_options = {"connect_args": connect_args}
    if url.endswith(":memory:"):
        engine_options["poolclass"] = StaticPool
    engine = create_engine(url, **engine_options)
    if url.startswith("sqlite"):
        @event.listens_for(engine, "connect")
        def enable_foreign_keys(dbapi_connection, _connection_record) -> None:  # type: ignore[no-untyped-def]
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()
    return engine


engine = create_database_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    with SessionLocal() as session:
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise


@contextmanager
def session_scope() -> Iterator[Session]:
    with SessionLocal() as session:
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
