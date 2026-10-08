from pydantic import BaseModel, ConfigDict, Field, JsonValue


class DebugMode(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool = Field(strict=True)


class DebugPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    data: dict[str, JsonValue]
