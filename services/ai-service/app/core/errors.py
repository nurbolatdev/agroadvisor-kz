from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.models.predict import ErrorResponse


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
