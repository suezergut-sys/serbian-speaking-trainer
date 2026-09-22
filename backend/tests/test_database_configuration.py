from sqlalchemy.pool import NullPool

from app.db.session import create_database_engine, normalized_database_url


def test_plain_postgres_url_uses_psycopg_driver() -> None:
    url = normalized_database_url("postgresql://user:password@example.com:6543/postgres?sslmode=require")

    assert url.drivername == "postgresql+psycopg"
    assert url.query["sslmode"] == "require"


def test_postgres_engine_uses_no_local_connection_pool() -> None:
    engine = create_database_engine("postgresql://user:password@example.com:6543/postgres?sslmode=require")

    assert isinstance(engine.pool, NullPool)
    assert engine.dialect.name == "postgresql"
    engine.dispose()
