from fastapi import APIRouter, Request

from app.models.classes import ClassesResponse, ClassItem, CropItem

router = APIRouter()


@router.get("/classes", response_model=ClassesResponse)
def classes(request: Request) -> ClassesResponse:
    registry = request.app.state.registry
    return ClassesResponse(
        version=registry.version,
        crops=[CropItem(code=c.code, names=c.names) for c in registry.crops],
        classes=[
            ClassItem(code=c.code, crop=c.crop, names=c.names, added_in=c.added_in)
            for c in registry.active()
        ],
    )
