import logging
from uuid import UUID, uuid4
from fastapi.exceptions import ResponseValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi.exception_handlers import http_exception_handler
from app.services.failure_diagnostics import DiagnosticFailure
from sqlalchemy.exc import SQLAlchemyError
from app.services.failure_diagnostics import diagnostic_context, diagnostic, record_failure
from app.api.payments import router as payments_router
from time import perf_counter

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.responses import JSONResponse
from app.api.dependencies import model_debug_context
from app.api.model_debug import router as model_debug_router
from fastapi.middleware.cors import CORSMiddleware

from app.audio_upload_middleware import AudioUploadBodyLimitMiddleware
from app.api.attempts import router as attempts_router
from app.api.auth import router as auth_router
from app.api.feedback import router as feedback_router
from app.api.health import router as health_router
from app.api.sessions import router as sessions_router
from app.api.statistics import router as statistics_router
from app.api.topics import router as topics_router
from app.api.transcriptions import router as transcriptions_router
from app.api.review import router as review_router
from app.config import get_settings
from app.request_metrics import start_request_metrics, stop_request_metrics
from app.services.interface_language import interface_language, parse_interface_language
from app.services.custom_content_policy import CustomContentError
from app.services.source_versions import SourceLanguageUnavailableError

settings = get_settings()
performance_logger = logging.getLogger("app.performance")
performance_logger.setLevel(logging.INFO)

app = FastAPI(title="Serbian Speaking Trainer API", version="1.4.0")

@app.exception_handler(SourceLanguageUnavailableError)
async def source_language_unavailable(_request: Request, _exc: SourceLanguageUnavailableError):
    return JSONResponse({"detail": {"code": "source_language_unavailable", "retryable": True}}, status_code=503)


@app.exception_handler(CustomContentError)
async def custom_content_error(_request: Request, exc: CustomContentError):
    return JSONResponse({"detail": {"code": exc.code}}, status_code=exc.status)


@app.exception_handler(RequestValidationError)
async def safe_review_login_validation(request: Request, exc: RequestValidationError):
    if request.url.path == "/api/auth/review-login":
        # FastAPI's default validation response includes input values.
        return JSONResponse({"detail": "Invalid sign-in request"}, status_code=422, headers={"Cache-Control": "no-store"})
    return await request_validation_exception_handler(request, exc)

@app.exception_handler(StarletteHTTPException)
async def classified_http_failure(request: Request, exc: StarletteHTTPException):
    if isinstance(exc.detail, dict) and "failure" in exc.detail:
        response = await http_exception_handler(request, exc)
        response.headers["Cache-Control"] = "no-store"
        return response
    cause = exc.__cause__ or exc.__context__
    for _ in range(5):
        if isinstance(cause, DiagnosticFailure):
            record_failure(cause.failure)
            detail = dict(exc.detail) if isinstance(exc.detail, dict) else {"message": "The operation could not be completed."}
            detail.update(failure=cause.failure.model_dump(mode="json"), retryable=cause.failure.retryable)
            return JSONResponse({"detail": detail}, status_code=exc.status_code, headers={**(exc.headers or {}), "Cache-Control": "no-store"})
        if cause is None:
            break
        cause = cause.__cause__ or cause.__context__
    return await http_exception_handler(request, exc)


def failure_response(request: Request, *, stage: str, reason: str):
    failure = diagnostic("response_return", stage, reason, retryable=stage == "persistence").model_copy(update={"diagnostic_id": getattr(request.state, "diagnostic_id", str(uuid4()))})
    record_failure(failure)
    return JSONResponse({"detail": {"code": "result_return_failed", "message": "The server could not return the result.",
                                    "retryable": failure.retryable, "failure": failure.model_dump(mode="json")}},
                        status_code=500, headers={"X-Request-ID": failure.diagnostic_id, "Cache-Control": "no-store"})


@app.exception_handler(ResponseValidationError)
async def response_validation_failed(request: Request, _exc: ResponseValidationError):
    return failure_response(request, stage="serialization", reason="serialization_failed")


@app.exception_handler(SQLAlchemyError)
async def persistence_failed(request: Request, _exc: SQLAlchemyError):
    return failure_response(request, stage="persistence", reason="persistence_failed")


@app.exception_handler(DiagnosticFailure)
async def service_failed(request: Request, exc: DiagnosticFailure):
    failure = exc.failure.model_copy(update={"diagnostic_id": getattr(request.state, "diagnostic_id", exc.failure.diagnostic_id)})
    record_failure(failure)
    return JSONResponse({"detail": {"code": "operation_unavailable", "message": "The operation could not be completed.",
                                    "retryable": failure.retryable, "failure": failure.model_dump(mode="json")}}, status_code=503, headers={"Cache-Control": "no-store"})


@app.exception_handler(Exception)
async def unhandled_return_failed(request: Request, _exc: Exception):
    return failure_response(request, stage="server_return", reason="server_return_failed")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost", "https://localhost", "capacitor://localhost"],
    allow_origin_regex=settings.cors_allowed_origin_regex,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Interface-Language", "X-Request-ID"],
    expose_headers=["Server-Timing", "X-Request-ID"],
)
app.add_middleware(AudioUploadBodyLimitMiddleware)


@app.middleware("http")
async def record_request_timing(request: Request, call_next):
    started = perf_counter()
    try:
        request_id = str(UUID(request.headers.get("X-Request-ID", "")))
    except ValueError:
        request_id = str(uuid4())
    request.state.diagnostic_id = request_id
    diagnostic_token = diagnostic_context.set(request_id)
    metrics, token = start_request_metrics()
    language_token = interface_language.set(parse_interface_language(request.headers.get("X-Interface-Language", "ru")))
    try:
        response = await call_next(request)
    finally:
        stop_request_metrics(token)
        interface_language.reset(language_token)
        diagnostic_context.reset(diagnostic_token)
    total_ms = (perf_counter() - started) * 1000
    auth_ms = getattr(request.state, "auth_ms", 0.0)
    sync_ms = getattr(request.state, "user_sync_ms", 0.0)
    response.headers["X-Request-ID"] = request_id
    response.headers["Server-Timing"] = (
        f"total;dur={total_ms:.1f}, auth;dur={auth_ms:.1f}, user_sync;dur={sync_ms:.1f}, "
        f"db;dur={metrics.db_ms:.1f}, db_queries;desc=\"{metrics.db_queries}\", "
        f"ai;dur={metrics.ai_ms:.1f}, ai_calls;desc=\"{metrics.ai_calls}\""
    )
    path = request.url.path
    if path.startswith("/api/exercises/") and path.endswith("/word-hints"):
        path = "/api/exercises/{exercise_id}/word-hints"
    if path in {"/api/sessions/start", "/api/exercises/{exercise_id}/word-hints", "/api/topics", "/api/statistics/monthly"}:
        performance_logger.info(
            "request_timing path=%s total_ms=%.1f auth_ms=%.1f user_sync_ms=%.1f "
            "db_ms=%.1f db_queries=%d ai_ms=%.1f ai_calls=%d",
            path, total_ms, auth_ms, sync_ms,
            metrics.db_ms, metrics.db_queries, metrics.ai_ms, metrics.ai_calls,
        )
    return response

app.include_router(feedback_router, prefix="/api")
app.include_router(payments_router, prefix="/api")
app.include_router(health_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(model_debug_router, prefix="/api")
app.include_router(transcriptions_router, prefix="/api", dependencies=[Depends(model_debug_context)])
app.include_router(attempts_router, prefix="/api", dependencies=[Depends(model_debug_context)])
app.include_router(topics_router, prefix="/api", dependencies=[Depends(model_debug_context)])
app.include_router(sessions_router, prefix="/api", dependencies=[Depends(model_debug_context)])
app.include_router(review_router, prefix="/api", dependencies=[Depends(model_debug_context)])
app.include_router(statistics_router, prefix="/api")
