from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

SERVICE_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    """Service settings, read from AI_* environment variables and .env."""

    model_config = SettingsConfigDict(env_prefix="AI_", env_file=".env", extra="ignore")

    classes_path: Path = SERVICE_DIR / "ml" / "classes.yaml"
    weights_dir: Path = SERVICE_DIR / "ml" / "weights"
    device: Literal["auto", "cpu", "cuda", "mps"] = "auto"
    max_image_mb: int = 10
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"


@lru_cache
def get_settings() -> Settings:
    return Settings()
