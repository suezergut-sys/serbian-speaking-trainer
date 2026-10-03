from __future__ import annotations

import sys
import time
from pathlib import Path

import jwt
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, text

from testlab import (
    EMAIL,
    ISSUER,
    USER_ID,
    Credentials,
    create_auth_app,
    create_deterministic_analysis_provider,
    ensure_local_configuration,
    bootstrap_testlab_database,
    _alembic,
)


def credentials() -> Credentials:
    return Credentials(email=EMAIL, password="test-only-password-that-is-never-logged", jwt_secret="test-only-signing-secret-that-is-long-enough")


def backend_model_metadata():
    backend = Path(__file__).resolve().parents[2] / "backend"
    if str(backend) not in sys.path:
        sys.path.insert(0, str(backend))
    from app.db.base import Base
    from app.models import entities as _entities  # noqa: F401
    del _entities
    return Base.metadata


def alembic_revision(engine) -> str:
    with engine.connect() as connection:
        return connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one()


def test_password_auth_returns_supabase_session_and_refresh_rotates() -> None:
    with TestClient(create_auth_app(credentials())) as client:
        session = client.post("/auth/v1/token?grant_type=password", json={"email": EMAIL, "password": credentials().password})
        assert session.status_code == 200
        payload = session.json()
        assert payload["user"]["id"] == USER_ID
        assert payload["user"]["email_confirmed_at"]
        assert payload["expires_in"] > 0
        assert client.get("/auth/v1/user", headers={"Authorization": f"Bearer {payload['access_token']}"}).status_code == 200
        assert client.post("/auth/v1/logout", headers={"Authorization": f"Bearer {payload['access_token']}"}).status_code == 204
        assert client.get("/auth/v1/user", headers={"Authorization": f"Bearer {payload['access_token']}"}).status_code == 401

        refreshed = client.post("/auth/v1/token?grant_type=refresh_token", json={"refresh_token": payload["refresh_token"]})
        assert refreshed.status_code == 200
        assert refreshed.json()["refresh_token"] != payload["refresh_token"]
        assert client.post("/auth/v1/token?grant_type=refresh_token", json={"refresh_token": payload["refresh_token"]}).status_code == 400


def test_expired_refresh_token_is_rejected(monkeypatch) -> None:
    now = [int(time.time())]
    monkeypatch.setattr("testlab.time.time", lambda: now[0])
    with TestClient(create_auth_app(credentials())) as client:
        session = client.post("/auth/v1/token?grant_type=password", json={"email": EMAIL, "password": credentials().password})
        assert session.status_code == 200
        refresh_token = session.json()["refresh_token"]
        now[0] += 31 * 24 * 60 * 60
        expired = client.post("/auth/v1/token?grant_type=refresh_token", json={"refresh_token": refresh_token})
        assert expired.status_code == 400
        assert expired.json()["error_code"] == "refresh_token_not_found"


def test_invalid_credentials_tampered_and_expired_tokens_fail_without_secrets(caplog, monkeypatch) -> None:
    secret = credentials().password
    with TestClient(create_auth_app(credentials())) as client:
        rejected = client.post("/auth/v1/token?grant_type=password", json={"email": EMAIL, "password": "wrong"})
        assert rejected.status_code == 400
        assert secret not in rejected.text

        good = client.post("/auth/v1/token?grant_type=password", json={"email": EMAIL, "password": secret}).json()["access_token"]
        tampered = good[:-1] + ("a" if good[-1] != "a" else "b")
        assert client.get("/auth/v1/user", headers={"Authorization": f"Bearer {tampered}"}).status_code == 401

        expired = jwt.encode({"iss": ISSUER, "aud": "authenticated", "sub": USER_ID, "iat": int(time.time()) - 100, "exp": int(time.time()) - 1}, credentials().jwt_secret, algorithm="HS256")
        assert client.get("/auth/v1/user", headers={"Authorization": f"Bearer {expired}"}).status_code == 401

        monkeypatch.setattr("testlab.TOKEN_SECONDS", -1)
        issued_expired = client.post("/auth/v1/token?grant_type=password", json={"email": EMAIL, "password": secret}).json()["access_token"]
        assert client.get("/auth/v1/user", headers={"Authorization": f"Bearer {issued_expired}"}).status_code == 401
    assert secret not in caplog.text


def test_configuration_rejects_production_auth_and_database_urls() -> None:
    database = "sqlite:///../artifacts/testlab/testlab.sqlite3"
    ensure_local_configuration("http://127.0.0.1:8766", database)
    for auth_url, db_url in (
        ("https://production.example", database),
        ("http://127.0.0.1:8766", "postgresql://production/db"),
        ("http://127.0.0.1:8766", "sqlite:///backend/data/serbian_trainer.db"),
    ):
        try:
            ensure_local_configuration(auth_url, db_url)
        except ValueError:
            pass
        else:
            raise AssertionError("unsafe testlab endpoint was accepted")


def test_fresh_testlab_database_is_initialized_by_alembic(tmp_path) -> None:
    engine = create_engine(f"sqlite:///{(tmp_path / 'fresh.sqlite3').as_posix()}")
    try:
        bootstrap_testlab_database(engine)
        metadata = backend_model_metadata()
        inspector = inspect(engine)
        assert set(inspector.get_table_names()) - {"alembic_version"} == set(metadata.tables)
        for table in metadata.sorted_tables:
            assert {column["name"] for column in inspector.get_columns(table.name)} == {
                column.name for column in table.columns
            }
        from alembic.script import ScriptDirectory
        from app.db.cli import alembic_config
        assert alembic_revision(engine) == ScriptDirectory.from_config(alembic_config()).get_current_head()
    finally:
        engine.dispose()


def test_current_unstamped_create_all_shape_is_stamped_without_rebuilding(tmp_path) -> None:
    engine = create_engine(f"sqlite:///{(tmp_path / 'current.sqlite3').as_posix()}")
    metadata = backend_model_metadata()
    try:
        metadata.create_all(engine)
        with engine.begin() as connection:
            connection.execute(text(
                "INSERT INTO users (id, email, role, access_tier, registered_at, last_active_at) "
                "VALUES ('history-user', 'history@example.invalid', 'user', 'free', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
            ))
        bootstrap_testlab_database(engine)
        assert alembic_revision(engine) == "f31a7b901c22"
        with engine.connect() as connection:
            assert connection.execute(text("SELECT email FROM users WHERE id='history-user'")).scalar_one() == "history@example.invalid"
    finally:
        engine.dispose()


def test_predecessor_testlab_schema_upgrades_and_preserves_history(tmp_path) -> None:
    engine = create_engine(f"sqlite:///{(tmp_path / 'predecessor.sqlite3').as_posix()}")
    try:
        _alembic(engine, "upgrade", "c7d91a2e5b60")
        with engine.begin() as connection:
            connection.execute(text(
                "INSERT INTO attempt_requests (user_id, client_request_id, payload_hash) "
                "VALUES ('00000000-0000-0000-0000-000000000001', 'request-preserved', 'hash-preserved')"
            ))
        bootstrap_testlab_database(engine)
        assert alembic_revision(engine) == "f31a7b901c22"
        with engine.connect() as connection:
            row = connection.execute(text(
                "SELECT client_request_id, payload_hash, fencing_token FROM attempt_requests "
                "WHERE client_request_id='request-preserved'"
            )).one()
        assert tuple(row) == ("request-preserved", "hash-preserved", 1)
    finally:
        engine.dispose()


def test_unknown_testlab_database_schema_is_refused_unchanged(tmp_path) -> None:
    engine = create_engine(f"sqlite:///{(tmp_path / 'unknown.sqlite3').as_posix()}")
    try:
        with engine.begin() as connection:
            connection.execute(text("CREATE TABLE unexpected_user_data (id TEXT PRIMARY KEY, value TEXT)"))
            connection.execute(text("INSERT INTO unexpected_user_data VALUES ('keep', 'unchanged')"))
        try:
            bootstrap_testlab_database(engine)
        except RuntimeError as exc:
            assert "unknown testlab SQLite schema" in str(exc)
        else:
            raise AssertionError("unknown database schema was accepted")
        with engine.connect() as connection:
            assert connection.execute(text("SELECT value FROM unexpected_user_data WHERE id='keep'")).scalar_one() == "unchanged"
        assert inspect(engine).get_table_names() == ["unexpected_user_data"]
    finally:
        engine.dispose()


def test_auth_cors_allows_local_app_and_rejects_untrusted_origin() -> None:
    with TestClient(create_auth_app(credentials())) as client:
        allowed = client.options(
            "/auth/v1/token?grant_type=password",
            headers={
                "Origin": "http://127.0.0.1:5178",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "authorization, apikey, content-type, x-client-info",
            },
        )
        assert allowed.status_code == 200
        assert allowed.headers["access-control-allow-origin"] == "http://127.0.0.1:5178"

        blocked = client.options(
            "/auth/v1/token?grant_type=password",
            headers={
                "Origin": "https://attacker.example",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        assert blocked.status_code == 400
        assert "access-control-allow-origin" not in blocked.headers


def test_malformed_and_non_object_token_bodies_return_safe_client_errors() -> None:
    with TestClient(create_auth_app(credentials())) as client:
        malformed = client.post(
            "/auth/v1/token?grant_type=password",
            content="{",
            headers={"Content-Type": "application/json"},
        )
        non_object = client.post("/auth/v1/token?grant_type=password", json=[])
        assert malformed.status_code == non_object.status_code == 400
        assert malformed.json()["error_code"] == non_object.json()["error_code"] == "invalid_request"


def test_deterministic_analysis_uses_schema_and_catalog_skills_through_real_analyzer() -> None:
    provider = create_deterministic_analysis_provider()
    assert provider.is_available
    result = provider.analyze_answer(
        source_ru="Тестовый ответ",
        transcript_sr="Izvinite, možete li da mi pomognete?",
        canonical_sr="Radim kao računovođa u maloj firmi.",
        intended_sr_variants=["Radim kao računovođa u maloj firmi."],
        target_skills=[{"key": "grammar.present"}, {"key": "unknown.generated.skill"}],
        timings={},
    )
    assert result.verdict == "correct"
    assert [item.skill_key for item in result.demonstrated_skills] == ["grammar.present"]
    assert result.issues == []
    assert "синтетические" in result.detailed_feedback_ru

    from app.config import Settings
    from app.schemas import CreateAttemptRequest
    from app.services.answer_analyzer import AnswerAnalyzer

    transcript = "Izvinite, možete li da mi pomognete?"
    checked = AnswerAnalyzer(provider, Settings(
        app_env="testlab", database_url="sqlite:///:memory:", supabase_url="http://127.0.0.1:8766",
        supabase_publishable_key="sb_publishable_testlab_local_only", admin_emails="",
    )).analyze(
        source_ru="Тестовый ответ",
        transcript_sr=transcript,
        intended_sr_variants=["Radim kao računovođa u maloj firmi."],
        target_skills=[{"key": "grammar.present"}],
        timing=CreateAttemptRequest(exercise_id="test", transcript_sr=transcript),
        canonical_sr="Radim kao računovođa u maloj firmi.",
    )
    assert checked.verdict == "correct"
    assert checked.corrected_sr == "Radim kao računovođa u maloj firmi."
    assert [item.skill_key for item in checked.demonstrated_skills] == ["grammar.present"]
