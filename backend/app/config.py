from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict
from app.schemas.transcription_settings import TranscriptionModelOption
from app.schemas.payments import PaymentConfig

BACKEND_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_ROOT.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env",
        env_file_encoding="utf-8",
        env_nested_delimiter="__",
        extra="ignore",
    )

    app_env: str = "development"
    manual_payments: PaymentConfig = Field(default_factory=PaymentConfig)
    database_url: str = "sqlite:///./data/serbian_trainer.db"
    cors_allowed_origin_regex: str = (
        r"https://serbian-speaking-trainer(?:-[a-z0-9-]+)?\.vercel\.app"
    )
    default_level: str = "A2"
    default_session_length: int = Field(default=20, ge=1, le=100)
    auto_next: bool = True
    supabase_url: str | None = None
    supabase_publishable_key: str | None = None
    review_login_username: str = "serbotalkreview"
    review_login_email: str | None = None
    admin_emails: str = "suezergut@gmail.com"
    debug_admin_email: str = "suezergut@gmail.com"
    free_daily_phrase_limit: int = Field(default=20, ge=1, le=1000)
    premium_daily_phrase_limit: int = Field(default=100, ge=1, le=1000)
    auth_timeout_seconds: float = Field(default=5, gt=0, le=30)
    auth_max_retries: int = Field(default=1, ge=0, le=3)

    telegram_bot_token: SecretStr | None = Field(default=None, repr=False)
    telegram_chat_id: str | None = None
    telegram_timeout_seconds: float = Field(default=3, gt=0, le=10)

    openai_api_key: str | None = None
    openai_realtime_model: str | None = None
    openai_text_model: str | None = None
    openai_transcribe_model: str | None = None
    openai_transcribe_models: list[TranscriptionModelOption] = Field(default_factory=list)
    openai_transcribe_language_parameter: Literal["languages", "language"] = "languages"
    openai_timeout_seconds: float = Field(default=20, gt=0, le=120)
    openai_max_retries: int = Field(default=2, ge=0, le=5)
    openai_assistance_timeout_seconds: float = Field(default=6, gt=0, le=12)
    openai_assistance_max_retries: int = Field(default=0, ge=0, le=1)
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
