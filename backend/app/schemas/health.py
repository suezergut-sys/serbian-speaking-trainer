from typing import Literal

from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    service: Literal["serbian-speaking-trainer"] = "serbian-speaking-trainer"

