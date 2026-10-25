"""HTTP-level tests of POST /predict against docs/api/ai-predict.md."""

import pytest
from fastapi.testclient import TestClient
from images import encode, noise_image
from PIL import Image, ImageEnhance, ImageFilter

from app.core.config import Settings
from ml.registry import UNKNOWN, load_registry

REGISTRY = load_registry()
CODES = [c.code for c in REGISTRY.active()]
RESPONSE_FIELDS = {
    "status",
    "crop",
    "top1",
    "top3",
    "detected_crop",
    "model_version",
    "classes_version",
    "inference_ms",
}


class FakePredictor:
    """Returns fixed probabilities and counts calls."""

    model_version = "fake-test-model"

    def __init__(self, probs: dict[str, float]):
        self.probs = probs
        self.calls = 0

    def predict(self, image):
        self.calls += 1
        return dict(self.probs)


def spread(main: dict[str, float], among: list[str]) -> dict[str, float]:
    """All classes at 0 except `main`; the remaining mass is shared by `among`."""
    probs = dict.fromkeys(CODES, 0.0)
    probs.update(main)
    free = [code for code in among if code not in main]
    for code in free:
        probs[code] = (1.0 - sum(main.values())) / len(free)
    return probs


def crop_codes(crop: str) -> list[str]:
    return [c.code for c in REGISTRY.for_crop(crop)] + [UNKNOWN]


@pytest.fixture
def serve(app):
    """Install a FakePredictor and return it together with a client."""

    def install(probs: dict[str, float]):
        predictor = FakePredictor(probs)
        app.state.predictor = predictor
        app.state.model_version = predictor.model_version
        return predictor, TestClient(app)

    return install


def post(client, image: bytes | None, crop: str | None = "tomato", content_type="image/jpeg"):
    files = {"image": ("leaf.jpg", image, content_type)} if image is not None else None
    data = {"crop": crop} if crop is not None else None
    return client.post("/predict", files=files, data=data)


def error_of(response) -> tuple[int, str, str | None]:
    body = response.json()
    assert set(body) == {"error", "reason", "message"}
    return response.status_code, body["error"], body["reason"]


# --- statuses -------------------------------------------------------------------------------


def test_ok_response_matches_contract(serve):
    main = {"tomato__late_blight": 0.91, "tomato__early_blight": 0.05}
    probs = spread(main, crop_codes("tomato"))
    predictor, client = serve(probs)

    response = post(client, encode(noise_image()))

    assert response.status_code == 200
    body = response.json()
    assert set(body) == RESPONSE_FIELDS
    assert body["status"] == "ok"
    assert body["crop"] == "tomato"
    assert body["top1"] == {"code": "tomato__late_blight", "confidence": 0.91}
    assert [s["code"] for s in body["top3"]][:2] == ["tomato__late_blight", "tomato__early_blight"]
    assert body["detected_crop"] is None
    assert body["model_version"] == "fake-test-model"
    assert body["classes_version"] == REGISTRY.version
    assert isinstance(body["inference_ms"], int)
    assert predictor.calls == 1


def test_low_confidence_response(serve):
    probs = spread({"wheat__leaf_rust": 0.56, "wheat__stripe_rust": 0.31}, crop_codes("wheat"))
    _, client = serve(probs)

    body = post(client, encode(noise_image()), crop="wheat").json()

    assert body["status"] == "low_confidence"
    assert body["top1"]["code"] == "wheat__leaf_rust"
    assert len(body["top3"]) == 3


def test_unknown_response(serve):
    probs = spread({UNKNOWN: 0.62, "potato__early_blight": 0.21}, crop_codes("potato"))
    _, client = serve(probs)

    body = post(client, encode(noise_image()), crop="potato").json()

    assert body["status"] == "unknown"
    assert body["top1"] == {"code": UNKNOWN, "confidence": 0.62}
    assert UNKNOWN not in [s["code"] for s in body["top3"]]


def test_crop_mismatch_response(serve):
    probs = spread({"tomato__late_blight": 0.80}, CODES)
    _, client = serve(probs)

    body = post(client, encode(noise_image()), crop="potato").json()

    assert body["status"] == "crop_mismatch"
    assert body["detected_crop"] == "tomato"
    assert body["crop"] == "potato"
    assert all(s["code"].startswith("potato__") for s in body["top3"])
    assert body["top1"] == body["top3"][0]


def test_thresholds_come_from_settings(app, serve):
    probs = spread({"corn__common_rust": 0.60}, crop_codes("corn"))
    _, client = serve(probs)
    assert post(client, encode(noise_image()), crop="corn").json()["status"] == "low_confidence"

    app.state.settings = Settings(_env_file=None, ok_threshold=0.55)

    assert post(client, encode(noise_image()), crop="corn").json()["status"] == "ok"


def test_png_is_accepted(serve):
    _, client = serve(spread({"tomato__late_blight": 0.9}, crop_codes("tomato")))

    response = post(client, encode(noise_image(), "PNG"), content_type="image/png")

    assert response.status_code == 200


# --- request validation (400) ---------------------------------------------------------------


@pytest.mark.parametrize("crop", [None, "", "banana", "unknown", "TOMATO"])
def test_missing_or_unsupported_crop(serve, crop):
    predictor, client = serve(spread({}, crop_codes("tomato")))

    response = post(client, encode(noise_image()), crop=crop)

    assert error_of(response) == (400, "unknown_crop", None)
    assert predictor.calls == 0


def test_missing_image(serve):
    _, client = serve(spread({}, crop_codes("tomato")))

    assert error_of(post(client, None)) == (400, "invalid_image", "missing")
    assert error_of(post(client, b"")) == (400, "invalid_image", "missing")


def test_not_an_image_even_with_image_mime(serve):
    predictor, client = serve(spread({}, crop_codes("tomato")))

    response = post(client, b"just some text, not a picture", content_type="image/jpeg")

    assert error_of(response) == (400, "invalid_image", "unsupported_format")
    assert predictor.calls == 0


def test_unsupported_image_format(serve):
    _, client = serve(spread({}, crop_codes("tomato")))

    response = post(client, encode(noise_image(), "GIF"), content_type="image/gif")

    assert error_of(response) == (400, "invalid_image", "unsupported_format")


def test_valid_image_is_accepted_whatever_mime_the_client_declares(serve):
    _, client = serve(spread({"tomato__late_blight": 0.9}, crop_codes("tomato")))

    response = post(client, encode(noise_image()), content_type="application/octet-stream")

    assert response.status_code == 200


def test_corrupted_image(serve):
    predictor, client = serve(spread({}, crop_codes("tomato")))
    data = encode(noise_image())

    response = post(client, data[: len(data) // 2])

    assert error_of(response) == (400, "invalid_image", "corrupted")
    assert predictor.calls == 0


def test_upload_over_size_limit_is_rejected_by_actual_size(app, serve):
    predictor, client = serve(spread({}, crop_codes("tomato")))
    app.state.settings = Settings(_env_file=None, max_image_mb=1)
    limit = 1024 * 1024

    over = post(client, encode(noise_image()) + b"\0" * limit)
    exactly = post(client, b"\0" * limit)

    assert error_of(over) == (400, "invalid_image", "too_large")
    # Exactly at the limit passes the size check and fails later, as it is not an image.
    assert error_of(exactly) == (400, "invalid_image", "unsupported_format")
    assert predictor.calls == 0


def test_image_sent_as_plain_field(serve):
    _, client = serve(spread({}, crop_codes("tomato")))

    response = client.post("/predict", data={"crop": "tomato", "image": "not a file"})

    assert error_of(response) == (400, "invalid_image", "missing")


# --- quality (422) --------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("photo", "reason"),
    [
        (noise_image((120, 90)), "too_small"),
        (ImageEnhance.Brightness(noise_image()).enhance(0.1), "dark"),
        (noise_image().filter(ImageFilter.GaussianBlur(4)), "blurry"),
        (Image.new("RGB", (400, 300), (90, 140, 60)), "blurry"),
    ],
    ids=["too_small", "dark", "blurry", "flat"],
)
def test_low_quality_photo_never_reaches_the_model(serve, photo, reason):
    predictor, client = serve(spread({}, crop_codes("tomato")))

    response = post(client, encode(photo, "PNG"), content_type="image/png")

    assert error_of(response) == (422, "low_quality", reason)
    assert predictor.calls == 0


# --- model availability (503) ---------------------------------------------------------------


def test_model_not_loaded_returns_503(client):
    response = post(client, encode(noise_image()))

    assert error_of(response) == (503, "model_not_loaded", None)


def test_request_errors_win_over_model_not_loaded(client):
    assert error_of(post(client, encode(noise_image()), crop="banana"))[0] == 400
    assert error_of(post(client, b"junk"))[0] == 400
    blurry = encode(Image.new("RGB", (400, 300), "gray"), "PNG")
    assert error_of(post(client, blurry, content_type="image/png"))[0] == 422


# --- real startup with the placeholder model ------------------------------------------------


def test_placeholder_model_end_to_end_is_deterministic(app):
    with TestClient(app) as client:
        first = post(client, encode(noise_image())).json()
        second = post(client, encode(noise_image())).json()
        other = post(client, encode(noise_image(seed=7))).json()

    assert first["model_version"] == "placeholder-v0"
    for body in (first, second, other):
        assert set(body) == RESPONSE_FIELDS
        body.pop("inference_ms")
    assert first == second
    assert first != other


def test_swagger_and_openapi_describe_the_endpoints(client):
    assert client.get("/docs").status_code == 200
    paths = client.get("/openapi.json").json()["paths"]
    assert {"/predict", "/classes", "/health"} <= set(paths)


def test_swagger_documents_contract_errors_not_fastapi_defaults(client):
    schema = client.get("/openapi.json").json()
    responses = schema["paths"]["/predict"]["post"]["responses"]

    assert set(responses) == {"200", "400", "422", "503"}
    for code in ("400", "422", "503"):
        ref = responses[code]["content"]["application/json"]["schema"]["$ref"]
        assert ref.endswith("/ErrorResponse")
    assert "503" in schema["paths"]["/health"]["get"]["responses"]
