from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

SERVICE_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    """Service settings, read from AI_* environment variables and .env."""

    model_config = SettingsConfigDict(env_prefix="AI_", env_file=".env", extra="ignore")

    classes_path: Path = SERVICE_DIR / "ml" / "classes.yaml"
    weights_dir: Path = SERVICE_DIR / "ml" / "weights"
    device: Literal["auto", "cpu", "cuda", "mps"] = "auto"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"

    # Model. "placeholder" is a fake model for wiring and tests, not a real classifier.
    model_kind: Literal["placeholder"] = "placeholder"
    # Fail startup if the model cannot be loaded (otherwise /health and /predict answer 503).
    require_model: bool = False

    # Upload limits
    max_image_mb: int = Field(default=10, ge=1)
    max_image_pixels: int = Field(default=50_000_000, ge=1)

    # Photo quality (preliminary, to be tuned on field photos)
    min_image_side: int = Field(default=224, ge=1)  # px, shorter side
    min_brightness: float = Field(default=40.0, ge=0, le=255)  # mean luminance, 0-255
    min_sharpness: float = Field(default=50.0, ge=0)  # Laplacian variance at 512 px

    # Status thresholds (preliminary, finalized after calibration)
    ok_threshold: float = Field(default=0.70, gt=0, le=1)
    low_threshold: float = Field(default=0.40, gt=0, le=1)
    crop_mismatch_threshold: float = Field(default=0.70, gt=0, le=1)

    @model_validator(mode="after")
    def _check_thresholds(self) -> "Settings":
        if self.low_threshold >= self.ok_threshold:
            raise ValueError("low_threshold must be below ok_threshold")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
