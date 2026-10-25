from fastapi import APIRouter

from app.core.errors import ApiError


def _raising_router() -> APIRouter:
    router = APIRouter()

    @router.get("/_boom")
    def boom():
        raise ApiError(400, "invalid_image", "No image was uploaded", reason="missing")

    @router.get("/_boom_no_reason")
    def boom_no_reason():
        raise ApiError(400, "unknown_crop", "Crop is not supported")

    return router


def test_api_error_body_has_error_reason_and_message(app, client):
    app.include_router(_raising_router())

    response = client.get("/_boom")

    assert response.status_code == 400
    assert response.json() == {
        "error": "invalid_image",
        "reason": "missing",
        "message": "No image was uploaded",
    }


def test_image_sent_as_text_field_uses_contract_error_format(client):
    response = client.post("/predict", data={"crop": "tomato", "image": "hello"})

    assert response.status_code == 400
    assert response.json() == {
        "error": "invalid_image",
        "reason": "missing",
        "message": "The image field must be a file",
    }


def test_api_error_without_reason_has_null_reason(app, client):
    app.include_router(_raising_router())

    response = client.get("/_boom_no_reason")

    assert response.json() == {
        "error": "unknown_crop",
        "reason": None,
        "message": "Crop is not supported",
    }
