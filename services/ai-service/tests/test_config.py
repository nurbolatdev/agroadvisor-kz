import pytest
from pydantic import ValidationError

from app.core.config import SERVICE_DIR, Settings


def test_defaults_point_inside_service(monkeypatch):
    monkeypatch.delenv("AI_DEVICE", raising=False)
    settings = Settings(_env_file=None)

    assert settings.classes_path == SERVICE_DIR / "ml" / "classes.yaml"
    assert settings.weights_dir == SERVICE_DIR / "ml" / "weights"
    assert settings.device == "auto"
    assert settings.max_image_mb == 10


def test_reads_env_variables(monkeypatch):
    monkeypatch.setenv("AI_DEVICE", "cpu")
    monkeypatch.setenv("AI_MAX_IMAGE_MB", "5")

    settings = Settings(_env_file=None)

    assert settings.device == "cpu"
    assert settings.max_image_mb == 5


def test_threshold_defaults_match_contract():
    settings = Settings(_env_file=None)

    assert settings.ok_threshold == 0.70
    assert settings.low_threshold == 0.40
    assert settings.crop_mismatch_threshold == 0.70


def test_rejects_low_threshold_not_below_ok(monkeypatch):
    monkeypatch.setenv("AI_LOW_THRESHOLD", "0.8")

    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_rejects_unknown_model_kind(monkeypatch):
    monkeypatch.setenv("AI_MODEL_KIND", "effnet")

    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_rejects_unknown_device(monkeypatch):
    monkeypatch.setenv("AI_DEVICE", "tpu")

    with pytest.raises(ValidationError):
        Settings(_env_file=None)
