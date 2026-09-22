from fastapi import FastAPI
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

app = FastAPI(title="Serbian Speaking Trainer API", version="1.4.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost", "https://localhost", "capacitor://localhost"],
    allow_origin_regex=settings.cors_allowed_origin_regex,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)
app.add_middleware(AudioUploadBodyLimitMiddleware)
app.include_router(health_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(transcriptions_router, prefix="/api")
app.include_router(attempts_router, prefix="/api")
app.include_router(topics_router, prefix="/api")
app.include_router(sessions_router, prefix="/api")
app.include_router(review_router, prefix="/api")
app.include_router(statistics_router, prefix="/api")
