from typing import Literal

from pydantic import BaseModel


class ClassScore(BaseModel):
    code: str
    confidence: float


class PredictResponse(BaseModel):
    status: Literal["ok", "low_confidence", "unknown", "crop_mismatch"]
    crop: str
    top1: ClassScore
    top3: list[ClassScore]
    detected_crop: str | None
    model_version: str
    classes_version: int
    inference_ms: int


class ErrorResponse(BaseModel):
    error: str
    reason: str | None = None
    message: str
