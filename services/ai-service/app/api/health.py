from fastapi import APIRouter, Request, Response, status

from app.models.health import HealthResponse

router = APIRouter()


@router.get(
    "/health",
    response_model=HealthResponse,
    responses={503: {"model": HealthResponse, "description": "model_not_loaded"}},
)
def health(request: Request, response: Response) -> HealthResponse:
    model_version = request.app.state.model_version
    if model_version is None:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return HealthResponse(
        status="ok" if model_version else "model_not_loaded",
        model_version=model_version,
        classes_version=request.app.state.classes_version,
    )
