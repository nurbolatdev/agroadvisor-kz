from ml.registry import load_registry

REGISTRY = load_registry()


def test_classes_lists_registry_crops_and_active_classes(client):
    response = client.get("/classes")

    assert response.status_code == 200
    body = response.json()
    assert body["version"] == REGISTRY.version
    assert [c["code"] for c in body["crops"]] == [c.code for c in REGISTRY.crops]
    assert [c["code"] for c in body["classes"]] == [c.code for c in REGISTRY.active()]


def test_classes_includes_unknown_without_crop(client):
    classes = {c["code"]: c for c in client.get("/classes").json()["classes"]}

    assert classes["unknown"]["crop"] is None
    assert classes["tomato__late_blight"]["crop"] == "tomato"


def test_classes_items_carry_names_in_three_languages_and_added_in(client):
    body = client.get("/classes").json()

    for item in (*body["crops"], *body["classes"]):
        assert set(item["names"]) == {"ru", "kk", "en"}
    assert all(isinstance(c["added_in"], int) for c in body["classes"])


def test_classes_works_without_a_loaded_model(client):
    assert client.get("/health").status_code == 503
    assert client.get("/classes").status_code == 200
