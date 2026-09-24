from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class SupabaseUserPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(min_length=36, max_length=36)
    email: str = Field(min_length=3, max_length=320, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    email_confirmed_at: datetime | None = None
    user_metadata: dict[str, object] = Field(default_factory=dict)


class SupabaseClaimsPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")

    sub: str = Field(min_length=36, max_length=36)
    email: str = Field(min_length=3, max_length=320, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    app_metadata: dict[str, object] = Field(default_factory=dict)
    user_metadata: dict[str, object] = Field(default_factory=dict)
    is_anonymous: bool = False


class DailyUsageResponse(BaseModel):
    used: int
    limit: int | None
    remaining: int | None
    resets_at: datetime


class CurrentUserResponse(BaseModel):
    id: str
    email: str
    display_name: str | None
    avatar_url: str | None
    role: str
    access_tier: str
    registered_at: datetime
    last_active_at: datetime
    daily_usage: DailyUsageResponse


class AdminUserResponse(BaseModel):
    id: str
    email: str
    display_name: str | None
    role: str
    access_tier: str
    registered_at: datetime
    last_active_at: datetime
    phrases_today: int
