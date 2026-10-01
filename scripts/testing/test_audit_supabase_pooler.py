import importlib.util
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location("pooler_audit", Path(__file__).with_name("audit_supabase_pooler.py"))
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


@pytest.mark.parametrize("raw", [
    "sqlite:///:memory:",
    "postgresql://postgres.other:password@aws-1-eu-central-1.pooler.supabase.com:6543/postgres",
    "postgresql://postgres.oufbnvyortvsblqxebsi:password@db.example.com:6543/postgres",
    "postgresql://postgres.oufbnvyortvsblqxebsi:password@aws-1-eu-central-1.pooler.supabase.com:5432/postgres",
])
def test_rejects_other_projects_and_transports(raw):
    with pytest.raises(ValueError):
        audit.validate_url(raw)


def test_target_url_enforces_encryption_and_driver():
    url = audit.validate_url("postgresql://postgres.oufbnvyortvsblqxebsi:password@aws-1-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=disable")
    assert url.drivername == "postgresql+psycopg"
    assert url.query["sslmode"] == "require"


@pytest.mark.parametrize("parameter", ["host", "hostaddr", "port", "user", "password", "dbname", "service", "options"])
def test_rejects_driver_query_overrides(parameter):
    raw = f"postgresql://postgres.oufbnvyortvsblqxebsi:password@aws-1-eu-central-1.pooler.supabase.com:6543/postgres?{parameter}=other"
    with pytest.raises(ValueError, match="overrides"):
        audit.validate_url(raw)


@pytest.mark.parametrize("schema", ["public", "serbotalk_audit_", 'serbotalk_audit_"; DROP SCHEMA public CASCADE;--'])
def test_cleanup_rejects_arbitrary_schema(schema):
    with pytest.raises(ValueError):
        audit.validate_schema(schema)
