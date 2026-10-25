import pytest
from fastapi.testclient import TestClient

import app.main as main_module
from app.core.config import Settings
from app.services.model import ModelLoadError


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
    }


def test_failed_model_load_keeps_service_up_with_503(app, monkeypatch, caplog):
    monkeypatch.setattr(main_module, "load_model", failing_loader)

    with caplog.at_level("ERROR"), TestClient(app) as client:
        response = client.get("/health")

    assert response.status_code == 503
    assert response.json() == {
        "status": "model_not_loaded",
        "model_version": None,
        "classes_version": 1,
    }
    assert "weights are corrupted" in caplog.text


def test_failed_model_load_stops_startup_when_model_is_required(app, monkeypatch):
    monkeypatch.setattr(main_module, "load_model", failing_loader)
    app.state.settings = Settings(_env_file=None, require_model=True)

    with pytest.raises(ModelLoadError, match="weights are corrupted"), TestClient(app):
        pass
