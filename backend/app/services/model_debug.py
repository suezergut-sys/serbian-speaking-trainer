"""Opt-in, request-scoped diagnostics. Never accept an audio payload here."""
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from datetime import datetime, timezone
from time import perf_counter
from sqlalchemy import Engine
from sqlalchemy.orm import Session
from app.config import Settings
from app.models import User
from app.repositories.model_debug import ModelDebugRepository
from app.schemas.model_debug import DebugPayload


def can_debug(user: User, settings: Settings) -> bool:
    return user.role == "admin" and user.email.casefold() == settings.debug_admin_email.strip().casefold()


@dataclass
class DebugContext:
    user_id: str
    engine: Engine


debug_context: ContextVar[DebugContext | None] = ContextVar("model_debug", default=None)


def _clean(value, secret: str | None):
    if isinstance(value, dict):
        return {str(k): ("[REDACTED]" if str(k).casefold() in {
            "audio", "input_audio", "output_audio", "audio_data", "file", "api_key", "authorization", "access_token", "refresh_token", "headers"
        } else _clean(v, secret)) for k, v in value.items()}
    if isinstance(value, list):
        return [_clean(v, secret) for v in value]
    if isinstance(value, str) and secret:
        return value.replace(secret, "[REDACTED]")
    return value


class DebugCapture:
    def __init__(self, operation: str, model: str, request: dict, secret: str | None):
        self.context = debug_context.get()
        self.generation = None
        self.operation, self.model, self.secret = operation, model, secret
        self.response = None
        self.request = None
        if self.context:
            try:
                with Session(self.context.engine) as db:
                    setting = ModelDebugRepository(db, self.context.user_id).setting()
                    if setting and setting.enabled:
                        self.generation = setting.generation
                if self.generation is not None:
                    self.request = DebugPayload(data=_clean(request, secret)).data
            except Exception:
                self.generation = None  # Diagnostics must not break learning.
        self.started_at = datetime.now(timezone.utc)
        self.started = perf_counter()

    @property
    def enabled(self) -> bool:
        return self.generation is not None

    def raw_received(self, raw, *, text_request: bool = False):
        """Capture before SDK schema parsing, including invalid model output."""
        if not self.enabled:
            return
        try:
            http = raw.http_response
            if text_request:
                import json
                self.request = DebugPayload(data=_clean(json.loads(http.request.content), self.secret)).data
            try:
                body = http.json()
            except ValueError:
                body = http.text
            self.received({"status_code": http.status_code, "body": body, "sdk_retries": raw.retries_taken})
        except Exception:
            self.response = {"diagnostic_error": "raw_response_serialization_failed"}

    def received(self, response):
        try:
            self._received(response)
        except Exception:
            self.response = {"diagnostic_error": "response_serialization_failed"}

    def _received(self, response):
        if self.generation is None:
            return
        if isinstance(response, dict):
            data = response
        elif hasattr(response, "model_dump"):
            data = response.model_dump(mode="json")
        else:
            # Mock providers only; production SDK responses are Pydantic models.
            data = {"text": getattr(response, "text", None)}
            parsed = getattr(response, "output_parsed", None)
            if parsed is not None:
                data["output_parsed"] = parsed.model_dump(mode="json") if hasattr(parsed, "model_dump") else parsed
        self.response = DebugPayload(data=_clean(data, self.secret)).data

    def finish(self, error: Exception | None):
        completed_at = datetime.now(timezone.utc)
        duration_ms = (perf_counter() - self.started) * 1000
        if self.generation is None or self.context is None:
            return
        try:
            error_json = None if error is None else DebugPayload(data=_clean({
                "type": type(error).__name__, "status_code": getattr(error, "status_code", None),
                "body": getattr(error, "body", None),
            }, self.secret)).data
            with Session(self.context.engine) as db:
                ModelDebugRepository(db, self.context.user_id).append(self.generation, dict(
                    operation=self.operation, model=self.model, started_at=self.started_at,
                    completed_at=completed_at, duration_ms=duration_ms,
                    request_json=self.request, response_json=self.response, error_json=error_json))
                db.commit()
        except Exception:
            pass  # No payload/credentials in application logs even on DB failure.


@contextmanager
def capture_model_call(operation: str, model: str, request: dict, secret: str | None = None):
    capture = DebugCapture(operation, model, request, secret)
    failure = None
    try:
        yield capture
    except Exception as exc:
        failure = exc
        raise
    finally:
        capture.finish(failure)
