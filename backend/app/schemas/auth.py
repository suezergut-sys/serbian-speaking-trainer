from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, SecretStr


class ReviewLoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: str = Field(min_length=1, max_length=100)
    password: SecretStr = Field(min_length=1, max_length=1024)


class ReviewLoginResponse(BaseModel):
    access_token: str = Field(min_length=1)
    refresh_token: str = Field(min_length=1)


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


class UserPreferences(BaseModel):
    model_config = ConfigDict(extra="forbid")

    assistance_enabled: bool = Field(strict=True)


class AndroidPremiumClaim(BaseModel):
    model_config = ConfigDict(extra="forbid")
    platform: Literal["android"]


class CurrentUserResponse(BaseModel):
    can_debug_models: bool = False
    assistance_enabled: bool = False
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
    daily_limit: int | None
