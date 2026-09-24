import logging
from time import perf_counter

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.audio_upload_middleware import AudioUploadBodyLimitMiddleware
from app.api.attempts import router as attempts_router
from app.api.auth import router as auth_router
from app.api.health import router as health_router
from app.api.sessions import router as sessions_router
from app.api.statistics import router as statistics_router
from app.api.topics import router as topics_router
from app.api.transcriptions import router as transcriptions_router
from app.api.review import router as review_router
from app.config import get_settings

settings = get_settings()
performance_logger = logging.getLogger("app.performance")

app = FastAPI(title="Serbian Speaking Trainer API", version="1.4.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost", "https://localhost", "capacitor://localhost"],
    allow_origin_regex=settings.cors_allowed_origin_regex,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
    expose_headers=["Server-Timing"],
)
app.add_middleware(AudioUploadBodyLimitMiddleware)


@app.middleware("http")
async def record_request_timing(request: Request, call_next):
    started = perf_counter()
    response = await call_next(request)
    total_ms = (perf_counter() - started) * 1000
    auth_ms = getattr(request.state, "auth_ms", 0.0)
    sync_ms = getattr(request.state, "user_sync_ms", 0.0)
    response.headers["Server-Timing"] = (
        f"total;dur={total_ms:.1f}, auth;dur={auth_ms:.1f}, user_sync;dur={sync_ms:.1f}"
    )
    route = request.scope.get("route")
    path = getattr(route, "path", "")
    if path in {"/api/sessions/start", "/api/exercises/{exercise_id}/word-hints", "/api/topics", "/api/statistics/monthly"}:
        performance_logger.info(
            "request_timing path=%s total_ms=%.1f auth_ms=%.1f user_sync_ms=%.1f",
            path, total_ms, auth_ms, sync_ms,
        )
    return response

app.include_router(health_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(transcriptions_router, prefix="/api")
app.include_router(attempts_router, prefix="/api")
app.include_router(topics_router, prefix="/api")
app.include_router(sessions_router, prefix="/api")
app.include_router(review_router, prefix="/api")
app.include_router(statistics_router, prefix="/api")
