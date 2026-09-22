from collections.abc import Generator, Iterator
from contextlib import contextmanager
from pathlib import Path

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.engine import URL, make_url
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool, StaticPool

from app.config import BACKEND_ROOT, get_settings


def normalized_database_url(raw: str) -> URL:
    url = make_url(raw)
    if url.drivername in {"postgres", "postgresql"}:
        url = url.set(drivername="postgresql+psycopg")
    return url


def resolved_database_url() -> str:
    raw = get_settings().database_url
    url = normalized_database_url(raw)
    if url.drivername == "sqlite" and url.database and url.database != ":memory:":
        db_path = Path(url.database)
        if not db_path.is_absolute():
            db_path = BACKEND_ROOT / db_path
        db_path.parent.mkdir(parents=True, exist_ok=True)
        return str(url.set(database=db_path.as_posix()))
    return url.render_as_string(hide_password=False)


def create_database_engine(database_url: str | None = None) -> Engine:
    url = database_url or resolved_database_url()
    parsed_url = normalized_database_url(url)
    is_sqlite = parsed_url.drivername.startswith("sqlite")
    is_postgres = parsed_url.drivername.startswith("postgresql")
    connect_args = {"check_same_thread": False} if is_sqlite else {}
    if is_postgres:
        connect_args = {"prepare_threshold": None}
    engine_options: dict[str, object] = {"connect_args": connect_args}
    if parsed_url.database == ":memory:":
        engine_options["poolclass"] = StaticPool
    elif is_postgres:
        engine_options["poolclass"] = NullPool
    engine = create_engine(parsed_url, **engine_options)
    if is_sqlite:
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
