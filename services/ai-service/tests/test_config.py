from pathlib import Path

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
    assert settings.low_threshold == 0.25
    assert settings.crop_mismatch_threshold == 0.70
    assert settings.unknown_threshold == 0.5


ENV_EXAMPLE = SERVICE_DIR / ".env.example"


def _example_variables() -> dict[str, str]:
    variables = {}
    for line in ENV_EXAMPLE.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            name, _, value = line.partition("=")
            variables[name.strip()] = value.strip()
    return variables


def _values(settings: Settings) -> dict:
    # A path in the example is relative to the service folder, where the service is started
    return {
        name: SERVICE_DIR / value if isinstance(value, Path) and not value.is_absolute() else value
        for name, value in settings.model_dump().items()
    }


def test_env_example_matches_settings_defaults(monkeypatch):
    for name in _example_variables():
        monkeypatch.delenv(name, raising=False)

    from_example = Settings(_env_file=ENV_EXAMPLE)
    defaults = Settings(_env_file=None)

    assert _values(from_example) == _values(defaults)


def test_env_example_lists_the_calibrated_settings():
    # The thresholds and the model version are what a copied .env most often gets wrong.
    assert {"AI_LOW_THRESHOLD", "AI_UNKNOWN_THRESHOLD", "AI_MODEL_VERSION"} <= set(
        _example_variables()
    )


def test_rejects_low_threshold_not_below_ok(monkeypatch):
    monkeypatch.setenv("AI_LOW_THRESHOLD", "0.8")

    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_rejects_unknown_model_kind(monkeypatch):
    monkeypatch.setenv("AI_MODEL_KIND", "resnet")

    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_rejects_unknown_device(monkeypatch):
    monkeypatch.setenv("AI_DEVICE", "tpu")

    with pytest.raises(ValidationError):
        Settings(_env_file=None)
