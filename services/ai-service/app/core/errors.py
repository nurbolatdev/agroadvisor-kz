import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.models.predict import ErrorResponse
from app.services.model import ModelOutputError

logger = logging.getLogger(__name__)


class ApiError(Exception):
    """An error with a stable machine-readable body: {error, reason, message}."""

    def __init__(self, status_code: int, error: str, message: str, reason: str | None = None):
        super().__init__(message)
        self.status_code = status_code
        self.body = ErrorResponse(error=error, reason=reason, message=message)


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    def handle_api_error(_: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content=exc.body.model_dump())

    @app.exception_handler(ModelOutputError)
    def handle_model_output_error(_: Request, exc: ModelOutputError) -> JSONResponse:
        # A model fault is not the client's fault: fixed message, details only in the log.
        logger.error("Model output does not match the registry: %s", exc)
        error = ApiError(500, "internal_error", "The model returned an invalid result")
        return JSONResponse(status_code=error.status_code, content=error.body.model_dump())

    @app.exception_handler(RequestValidationError)
    def handle_validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        # Keep the contract's error format for malformed requests, e.g. "image" sent as text.
        fields = {str(e["loc"][1]) for e in exc.errors() if len(e["loc"]) > 1}
        if "image" in fields:
            error = ApiError(400, "invalid_image", "The image field must be a file", "missing")
        else:
            error = ApiError(400, "unknown_crop", "Crop is missing or not supported")
        return JSONResponse(status_code=error.status_code, content=error.body.model_dump())
