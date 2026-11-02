import pytest
from fastapi.testclient import TestClient
from weights import write_weights

import app.main as main_module
from app.core.config import Settings
from app.services.model import ModelLoadError, load_model
from ml.registry import load_registry


def failing_loader(settings, registry):
    raise ModelLoadError("weights are corrupted")


def test_startup_loads_placeholder_model(app):
    with TestClient(app) as client:
        response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "model_version": "placeholder-v0",
        "classes_version": 1,
        "calibrated": False,
    }


def test_startup_loads_real_weights_and_reports_calibration(app, tmp_path):
    app.state.settings = write_weights(tmp_path / "m", temperature=2.0)

    with TestClient(app) as client:
        response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["model_version"] == "m"
    assert response.json()["calibrated"] is True


def test_startup_reports_a_model_without_temperature(app, tmp_path):
    app.state.settings = write_weights(tmp_path / "m", temperature=None)

    with TestClient(app) as client:
        response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["calibrated"] is False


def test_failed_model_load_keeps_service_up_with_503(app, monkeypatch, caplog):
    monkeypatch.setattr(main_module, "load_model", failing_loader)

    with caplog.at_level("ERROR"), TestClient(app) as client:
        response = client.get("/health")

    assert response.status_code == 503
    assert response.json() == {
        "status": "model_not_loaded",
        "model_version": None,
        "classes_version": 1,
        "calibrated": None,
    }
    assert "weights are corrupted" in caplog.text


def test_failed_model_load_stops_startup_when_model_is_required(app, monkeypatch):
    monkeypatch.setattr(main_module, "load_model", failing_loader)
    app.state.settings = Settings(_env_file=None, require_model=True)

    with pytest.raises(ModelLoadError, match="weights are corrupted"), TestClient(app):
        pass


def test_placeholder_is_refused_when_the_model_is_required(app):
    app.state.settings = Settings(_env_file=None, require_model=True)

    with pytest.raises(ModelLoadError, match="AI_MODEL_KIND"), TestClient(app):
        pass


def test_load_model_refuses_the_placeholder_when_required():
    settings = Settings(_env_file=None, require_model=True, model_kind="placeholder")

    with pytest.raises(ModelLoadError, match="placeholder"):
        load_model(settings, load_registry())
