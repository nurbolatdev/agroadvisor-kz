import time
from typing import Annotated

from fastapi import APIRouter, File, Form, Request, UploadFile

from app.core.errors import ApiError
from app.models.predict import ErrorResponse, PredictResponse
from app.services.image import decode_image, read_upload
from app.services.predict import Thresholds, decide
from app.services.quality import QualityLimits, check_quality

router = APIRouter()

BYTES_IN_MB = 1024 * 1024


@router.post(
    "/predict",
    response_model=PredictResponse,
    responses={
        400: {"model": ErrorResponse, "description": "invalid_image or unknown_crop"},
        422: {"model": ErrorResponse, "description": "low_quality"},
        503: {"model": ErrorResponse, "description": "model_not_loaded"},
    },
)
def predict(
    request: Request,
    image: Annotated[UploadFile | None, File()] = None,
    crop: Annotated[str | None, Form()] = None,
) -> PredictResponse:
    state = request.app.state
    settings, registry = state.settings, state.registry

    # Step 1: validate the request. Crop is checked first because it is the cheaper check.
    if crop is None or not registry.for_crop(crop):
        raise ApiError(400, "unknown_crop", f"Crop is missing or not supported: {crop!r}")
    data = read_upload(image, settings.max_image_mb * BYTES_IN_MB)
    photo = decode_image(data, settings.max_image_pixels)

    started = time.perf_counter()
    # Step 2: quality check; the model is not called for a bad photo.
    check_quality(
        photo,
        QualityLimits(
            min_side=settings.min_image_side,
            min_brightness=settings.min_brightness,
            min_sharpness=settings.min_sharpness,
        ),
    )
    # Step 3: the model.
    predictor = state.predictor
    if predictor is None:
        raise ApiError(503, "model_not_loaded", "The model is not loaded")
    probs = predictor.predict(photo)
    # Steps 4-5: crop mismatch, masking, thresholds.
    decision = decide(
        probs,
        crop,
        registry,
        Thresholds(
            ok=settings.ok_threshold,
            low=settings.low_threshold,
            crop_mismatch=settings.crop_mismatch_threshold,
        ),
    )
    inference_ms = round((time.perf_counter() - started) * 1000)

    return PredictResponse(
        status=decision.status,
        crop=crop,
        top1=decision.top1,
        top3=decision.top3,
        detected_crop=decision.detected_crop,
        model_version=predictor.model_version,
        classes_version=registry.version,
        inference_ms=inference_ms,
    )
