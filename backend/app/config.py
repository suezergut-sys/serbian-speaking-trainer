from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_ROOT.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = "development"
    database_url: str = "sqlite:///./data/serbian_trainer.db"
    cors_allowed_origin_regex: str = (
        r"https://serbian-speaking-trainer(?:-[a-z0-9-]+)?\.vercel\.app"
    )
    default_level: str = "A2"
    default_session_length: int = Field(default=20, ge=1, le=100)
    auto_next: bool = True

    openai_api_key: str | None = None
    openai_realtime_model: str | None = None
    openai_text_model: str | None = None
    openai_transcribe_model: str | None = None
    openai_timeout_seconds: float = Field(default=20, gt=0, le=120)
    openai_max_retries: int = Field(default=2, ge=0, le=5)
    max_audio_bytes: int = Field(default=1_000_000, ge=10_000, le=1_000_000)

    mastery_consolidating_threshold: float = Field(default=0.65, ge=0, le=1)
    mastery_mastered_threshold: float = Field(default=0.85, ge=0, le=1)
    long_reaction_ms: int = Field(default=2500, ge=0)
    long_internal_pause_ms: int = Field(default=1500, ge=0)

    vad_mode: str = "server_vad"
    vad_threshold: float = Field(default=0.5, ge=0, le=1)
    vad_silence_ms: int = Field(default=700, ge=0)


@lru_cache
def get_settings() -> Settings:
    return Settings()
