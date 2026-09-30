"""Local-only Supabase-compatible auth fixture and isolated backend launcher.

Run from the repository root with the backend virtualenv active:
  python scripts/testing/testlab.py auth
  python scripts/testing/testlab.py api

The fixture is for local acceptance work only. It never stores audio and uses an
isolated SQLite database under artifacts/testlab/.
"""
from __future__ import annotations

import argparse
import hmac
import logging
import os
import secrets
import sys
import time
from pathlib import Path
from typing import Any

import jwt
import uvicorn
from fastapi import FastAPI, Header, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ValidationError

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
ARTIFACTS = ROOT / "artifacts" / "testlab"
ENV_FILE = ROOT / ".env.testlab"
AUTH_HOST, AUTH_PORT = "127.0.0.1", 8766
API_HOST, API_PORT = "127.0.0.1", 8765
USER_ID = "8e56ca7c-c33d-42df-a194-7b8438dcf190"
EMAIL = "testlab@example.invalid"
ISSUER = f"http://127.0.0.1:{AUTH_PORT}/auth/v1"
TOKEN_SECONDS = 900


class Credentials(BaseModel):
    email: str
    password: str
    jwt_secret: str


class TokenRequest(BaseModel):
    email: str | None = None
    password: str | None = None
    refresh_token: str | None = None


def ensure_local_configuration(auth_url: str, database_url: str) -> None:
    """Fail closed unless both auth and database destinations are local-only."""
    if auth_url.rstrip("/") != f"http://127.0.0.1:{AUTH_PORT}":
        raise ValueError("Testlab auth URL must be the fixed local loopback endpoint")
    if not database_url.startswith("sqlite:///"):
        raise ValueError("Testlab database must be an isolated local SQLite file")
    raw_path = database_url.removeprefix("sqlite:///")
    candidate = Path(raw_path)
    if not candidate.is_absolute():
        candidate = BACKEND / candidate
    resolved = candidate.resolve()
    allowed = (ARTIFACTS.resolve() / "testlab.sqlite3")
    if resolved != allowed:
        raise ValueError("Testlab database path must be artifacts/testlab/testlab.sqlite3")


def load_credentials() -> Credentials:
    if not ENV_FILE.is_file():
        raise RuntimeError("Testlab credentials are missing; run the repository testlab setup first")
    values: dict[str, str] = {}
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        key, sep, value = line.partition("=")
        if sep:
            values[key] = value
    creds = Credentials(
        email=values.get("TESTLAB_EMAIL", ""),
        password=values.get("TESTLAB_PASSWORD", ""),
        jwt_secret=values.get("TESTLAB_SIGNING_SECRET", ""),
    )
    if creds.email != EMAIL or len(creds.password) < 30 or len(creds.jwt_secret) < 40:
        raise RuntimeError("Testlab credential file does not meet local fixture requirements")
    return creds


def _user_payload() -> dict[str, Any]:
    return {
        "id": USER_ID,
        "aud": "authenticated",
        "role": "authenticated",
        "email": EMAIL,
        "email_confirmed_at": "2026-01-01T00:00:00Z",
        "phone": "",
        "confirmed_at": "2026-01-01T00:00:00Z",
        "last_sign_in_at": None,
        "app_metadata": {"provider": "email", "providers": ["email"]},
        "user_metadata": {"full_name": "Testlab learner"},
        "identities": [],
        "created_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-01-01T00:00:00Z",
        "is_anonymous": False,
    }


def create_auth_app(credentials: Credentials | None = None) -> FastAPI:
    creds = credentials or load_credentials()
    app = FastAPI(title="Local Testlab Auth", docs_url=None, redoc_url=None)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5178", "http://127.0.0.1:5178", "http://10.0.2.2:5178",
            "http://localhost", "https://localhost", "capacitor://localhost",
        ],
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "apikey", "x-client-info", "x-supabase-api-version"],
        max_age=600,
    )
    refresh: dict[str, int] = {}
    access: dict[str, int] = {}

    def issue() -> dict[str, Any]:
        now = int(time.time())
        claims = {
            "iss": ISSUER, "aud": "authenticated", "sub": USER_ID,
            "email": EMAIL, "email_confirmed_at": "2026-01-01T00:00:00Z",
            "role": "authenticated", "iat": now, "exp": now + TOKEN_SECONDS,
            "app_metadata": {"provider": "email", "providers": ["email"]},
            "user_metadata": {"full_name": "Testlab learner"}, "is_anonymous": False,
        }
        token = jwt.encode(claims, creds.jwt_secret, algorithm="HS256")
        refresh_token = secrets.token_urlsafe(40)
        access[token] = claims["exp"]
        refresh[refresh_token] = now + 30 * 24 * 60 * 60
        return {
            "access_token": token, "token_type": "bearer", "expires_in": TOKEN_SECONDS,
            "expires_at": claims["exp"], "refresh_token": refresh_token,
            "user": _user_payload(),
        }

    @app.post("/auth/v1/token")
    async def token(request: Request, grant_type: str = "") -> JSONResponse:
        try:
            body = TokenRequest.model_validate(await request.json())
        except (ValueError, ValidationError):
            return JSONResponse({"code": 400, "error_code": "invalid_request", "msg": "Invalid request"}, status_code=400)
        if grant_type == "password":
            email = body.email or ""
            password = body.password or ""
            email_ok = hmac.compare_digest(email.casefold().encode(), creds.email.casefold().encode())
            password_ok = hmac.compare_digest(password.encode(), creds.password.encode())
            if not (email_ok and password_ok):
                return JSONResponse({"code": 400, "error_code": "invalid_credentials", "msg": "Invalid login credentials"}, status_code=400)
            return JSONResponse(issue())
        if grant_type == "refresh_token":
            supplied = body.refresh_token or ""
            now = int(time.time())
            expiry = refresh.pop(supplied, None)
            if expiry is None or expiry <= now:
                return JSONResponse({"code": 400, "error_code": "refresh_token_not_found", "msg": "Invalid refresh token"}, status_code=400)
            return JSONResponse(issue())
        return JSONResponse({"code": 400, "error_code": "unsupported_grant_type", "msg": "Unsupported grant type"}, status_code=400)

    @app.get("/auth/v1/user")
    async def get_user(authorization: str | None = Header(default=None)) -> JSONResponse:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Invalid access token")
        raw = authorization[7:]
        exp = access.get(raw)
        if exp is None or exp <= int(time.time()):
            access.pop(raw, None)
            raise HTTPException(status_code=401, detail="Invalid access token")
        try:
            claims = jwt.decode(raw, creds.jwt_secret, algorithms=["HS256"], issuer=ISSUER, audience="authenticated")
            if claims.get("sub") != USER_ID:
                raise jwt.InvalidTokenError("subject mismatch")
        except jwt.InvalidTokenError as exc:
            raise HTTPException(status_code=401, detail="Invalid access token") from exc
        return JSONResponse(_user_payload())

    @app.post("/auth/v1/logout")
    async def logout(authorization: str | None = Header(default=None)) -> Response:
        if authorization and authorization.startswith("Bearer "):
            access.pop(authorization[7:], None)
        return Response(status_code=204)

    return app


def configure_api_environment() -> None:
    database_url = "sqlite:///../artifacts/testlab/testlab.sqlite3"
    ensure_local_configuration("http://127.0.0.1:8766", database_url)
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    # Prevent inherited deployment settings or keys from reaching the backend app.
    for key in ("SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "DATABASE_URL", "APP_ENV", "ADMIN_EMAILS", "FREE_DAILY_PHRASE_LIMIT", "OPENAI_API_KEY"):
        os.environ.pop(key, None)
    os.environ.update({
        "APP_ENV": "testlab", "DATABASE_URL": database_url,
        "SUPABASE_URL": "http://127.0.0.1:8766", "SUPABASE_PUBLISHABLE_KEY": "sb_publishable_testlab_local_only",
        "ADMIN_EMAILS": "", "FREE_DAILY_PHRASE_LIMIT": "1000", "OPENAI_API_KEY": "",
        "AUTH_TIMEOUT_SECONDS": "1", "AUTH_MAX_RETRIES": "0",
        "CORS_ALLOWED_ORIGIN_REGEX": r"^https?://(localhost|127\.0\.0\.1|10\.0\.2\.2)(:5178)?$|^https://localhost$|^capacitor://localhost$",
    })
    # Settings reads project .env; explicit blanks ensure no production secret/provider values leak in.
    sys.path.insert(0, str(BACKEND))


def create_deterministic_analysis_provider():
    """Return a local acceptance analyzer that always passes schema-grounded feedback."""
    if str(BACKEND) not in sys.path:
        sys.path.insert(0, str(BACKEND))
    from app.db.seed import SKILLS
    from app.schemas import AnswerAnalysis, DemonstratedSkill
    from tests.fakes import FakeAIProvider

    known_skill_keys = {item.key for item in SKILLS}

    class DeterministicTestlabAIProvider(FakeAIProvider):
        def __init__(self) -> None:
            super().__init__(available=True)

        def analyze_answer(
            self,
            *,
            source_ru: str,
            transcript_sr: str,
            canonical_sr: str | None,
            intended_sr_variants: list[str],
            target_skills: list[dict[str, str]],
            timings: dict[str, object],
        ) -> AnswerAnalysis:
            del source_ru, timings
            self.analysis_calls += 1
            skill_keys = list(dict.fromkeys(
                item["key"] for item in target_skills
                if item.get("key") in known_skill_keys
            ))
            return AnswerAnalysis(
                verdict="correct",
                semantic_score=1.0,
                grammar_score=1.0,
                lexical_score=1.0,
                naturalness_score=1.0,
                pronunciation_score=None,
                fluency_score=1.0,
                corrected_sr=canonical_sr or transcript_sr,
                short_feedback_ru="Локальный тестовый анализ: ответ принят.",
                detailed_feedback_ru=(
                    "Оценки синтетические и предназначены только для проверки полного цикла; "
                    "языковая корректность ответа не оценивалась."
                ),
                accepted_alternatives=list(dict.fromkeys(intended_sr_variants))[:8],
                issues=[],
                demonstrated_skills=[
                    DemonstratedSkill(skill_key=key, result="strong", confidence=1.0)
                    for key in skill_keys[:12]
                ],
            )

    return DeterministicTestlabAIProvider()


def create_api_app() -> FastAPI:
    configure_api_environment()
    from app.api.dependencies import get_db
    from app.db.base import Base
    from app.db.seed import seed_catalog
    from app.db.session import SessionLocal, engine
    from app.main import app
    from app.services.ai_adapter import get_ai_provider
    from app.services.transcription_adapter import get_transcription_provider
    from app.schemas import TranscriptionResponse

    Base.metadata.create_all(engine)
    with SessionLocal() as session:
        seed_catalog(session)
        session.commit()

    ai = create_deterministic_analysis_provider()
    class LocalFakeTranscriptionProvider:
        @property
        def is_available(self) -> bool:
            return True

        def transcribe(self, *, audio: bytes, filename: str, content_type: str) -> TranscriptionResponse:
            # Accept multipart browser payloads but keep no copy/reference once returned.
            del audio, filename, content_type
            return TranscriptionResponse(text="Radim kao računovođa u maloj firmi.")

    transcription = LocalFakeTranscriptionProvider()

    def db_override():
        with SessionLocal() as session:
            try:
                yield session
                session.commit()
            except Exception:
                session.rollback()
                raise

    app.dependency_overrides[get_db] = db_override
    app.dependency_overrides[get_ai_provider] = lambda: ai
    app.dependency_overrides[get_transcription_provider] = lambda: transcription
    return app


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("auth", "api"))
    args = parser.parse_args()
    logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(message)s")
    if args.mode == "auth":
        load_credentials()
        uvicorn.run(create_auth_app(), host=AUTH_HOST, port=AUTH_PORT, access_log=False, log_level="warning")
    else:
        app = create_api_app()
        uvicorn.run(app, host=API_HOST, port=API_PORT, access_log=False, log_level="warning")


if __name__ == "__main__":
    main()
