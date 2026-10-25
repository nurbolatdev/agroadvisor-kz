from pydantic import BaseModel


class CropItem(BaseModel):
    code: str
    names: dict[str, str]


class ClassItem(BaseModel):
    code: str
    crop: str | None
    names: dict[str, str]
    added_in: int


class ClassesResponse(BaseModel):
    version: int
    crops: list[CropItem]
    classes: list[ClassItem]
