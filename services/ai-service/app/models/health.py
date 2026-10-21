from typing import Literal

from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: Literal["ok", "model_not_loaded"]
    model_version: str | None
    classes_version: int | None
