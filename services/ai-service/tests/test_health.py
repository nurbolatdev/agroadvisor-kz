def test_health_without_model_returns_503(client):
    response = client.get("/health")

    assert response.status_code == 503
    assert response.json() == {
        "status": "model_not_loaded",
        "model_version": None,
        "classes_version": 1,
    }


def test_health_with_model_returns_ok(app, client):
    app.state.model_version = "effnet-b0-v1"
    app.state.classes_version = 1

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "model_version": "effnet-b0-v1",
        "classes_version": 1,
    }
