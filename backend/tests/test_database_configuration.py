from sqlalchemy.pool import QueuePool

from app.db.session import create_database_engine, normalized_database_url


def test_plain_postgres_url_uses_psycopg_driver() -> None:
    url = normalized_database_url("postgresql://user:password@example.com:6543/postgres?sslmode=require")

    assert url.drivername == "postgresql+psycopg"
    assert url.query["sslmode"] == "require"


def test_postgres_engine_reuses_a_small_number_of_connections() -> None:
    engine = create_database_engine("postgresql://user:password@example.com:6543/postgres?sslmode=require")

    assert isinstance(engine.pool, QueuePool)
    assert engine.pool.size() == 1
    assert engine.pool._max_overflow == 2
    assert engine.pool._pre_ping is True
    assert engine.dialect.name == "postgresql"
    engine.dispose()
