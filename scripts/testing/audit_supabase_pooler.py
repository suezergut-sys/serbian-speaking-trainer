"""Bounded application-driver checks through Supavisor, never against public fixtures."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from time import perf_counter
from uuid import uuid4

from sqlalchemy import create_engine, event
from sqlalchemy.engine import URL, make_url

ROOT = Path(__file__).resolve().parents[2]
PROJECT = "oufbnvyortvsblqxebsi"


def validate_url(raw: str) -> URL:
    url = make_url(raw)
    if set(url.query) - {"sslmode"}:
        raise ValueError("Connection query overrides are not allowed")
    if (url.drivername not in {"postgres", "postgresql", "postgresql+psycopg"}
            or not url.host or not url.host.endswith(".pooler.supabase.com")
            or url.port != 6543 or url.database != "postgres"
            or url.username != f"postgres.{PROJECT}" or not url.password):
        raise ValueError("Expected this project's transaction pooler on port 6543")
    return url.set(drivername="postgresql+psycopg").update_query_dict({"sslmode": "require"})


def validate_schema(schema: str) -> str:
    if not re.fullmatch(r"serbotalk_audit_[0-9a-f]{32}", schema):
        raise ValueError("Only a generated audit schema is allowed")
    return schema


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, default=ROOT / "artifacts/testlab/pooler-audit.env")
    parser.add_argument("--isolated-fixtures", action="store_true",
                        help="Create and remove generated private schemas for mock AI concurrency checks")
    args = parser.parse_args()
    values = dict(line.split("=", 1) for line in args.env_file.read_text(encoding="utf8").splitlines()
                  if "=" in line and not line.lstrip().startswith("#"))
    url = validate_url(values.get("DATABASE_URL", ""))
    engine = create_engine(url, connect_args={"prepare_threshold": None, "connect_timeout": 10},
                           pool_size=1, max_overflow=2, pool_timeout=10, pool_pre_ping=True,
                           hide_parameters=True)

    @event.listens_for(engine, "begin")
    def bounded_transaction(connection):
        connection.exec_driver_sql("SET LOCAL statement_timeout = '15s'")
        connection.exec_driver_sql("SET LOCAL lock_timeout = '5s'")

    report = {"project": PROJECT, "transport": "supavisor-transaction-6543", "max_connections": 3,
              "prepared_statements": False, "public_tables_modified": False}
    try:
        def probe(_):
            start = perf_counter()
            with engine.connect() as connection:
                assert connection.exec_driver_sql("SELECT 1").scalar() == 1
            return round((perf_counter() - start) * 1000, 3)
        with ThreadPoolExecutor(max_workers=3) as workers:
            report["parallel_connection_ms"] = list(workers.map(probe, range(3)))
        if args.isolated_fixtures:
            os.environ.update(DATABASE_URL="sqlite:///:memory:", APP_ENV="testlab", OPENAI_API_KEY="",
                              SUPABASE_URL="", SUPABASE_PUBLISHABLE_KEY="", ADMIN_EMAILS="")
            sys.path.insert(0, str(ROOT / "backend"))
            from app.db.base import Base
            from tests.test_attempt_reservations import (
                test_ai_wait_releases_sqlite_writer_and_reserves_slot,
                test_inflight_daily_slot_is_retryable_then_actual_limit,
                test_expired_lease_retry_fences_old_worker,
                test_parallel_finalization_serializes_learner_updates,
            )
            checks = [
                ("legacy-ai-wait", lambda db: test_ai_wait_releases_sqlite_writer_and_reserves_slot(db, None)),
                ("idempotent-ai-wait", lambda db: test_ai_wait_releases_sqlite_writer_and_reserves_slot(db, str(uuid4()))),
                ("quota-reservation", test_inflight_daily_slot_is_retryable_then_actual_limit),
                ("fencing", test_expired_lease_retry_fences_old_worker),
                ("parallel-finalization", test_parallel_finalization_serializes_learner_updates),
            ]
            report["mock_ai_checks"] = []
            for name, check in checks:
                schema = validate_schema("serbotalk_audit_" + uuid4().hex)
                scoped = engine.execution_options(schema_translate_map={None: schema})
                with engine.begin() as connection:
                    connection.exec_driver_sql(f'CREATE SCHEMA "{schema}"')
                try:
                    # Fully qualified SQL survives transaction pooling; SET search_path would not.
                    Base.metadata.create_all(scoped)
                    check(scoped)
                    report["mock_ai_checks"].append(name)
                finally:
                    with engine.begin() as connection:
                        connection.exec_driver_sql(f'DROP SCHEMA "{validate_schema(schema)}" CASCADE')
        print(json.dumps(report))
    finally:
        engine.dispose()


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Connection errors may contain credentials/SQL values; never print their messages.
        print(f"Pooler audit failed: {type(error).__name__}; inspect access/configuration locally", file=sys.stderr)
        raise SystemExit(1)
