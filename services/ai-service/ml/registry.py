"""Class registry loader — reads ml/classes.yaml, the single source of truth for classes."""

from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import yaml

DEFAULT_PATH = Path(__file__).resolve().parent / "classes.yaml"
LANGUAGES = ("ru", "kk", "en")
STATUSES = ("active", "planned", "deprecated")
UNKNOWN = "unknown"

Status = Literal["active", "planned", "deprecated"]


@dataclass(frozen=True)
class Crop:
    code: str
    names: dict[str, str]


@dataclass(frozen=True)
class DiseaseClass:
    code: str
    crop: str | None
    names: dict[str, str]
    status: Status
    added_in: int


@dataclass(frozen=True)
class Registry:
    version: int
    crops: tuple[Crop, ...]
    classes: tuple[DiseaseClass, ...]

    def active(self) -> list[DiseaseClass]:
        return [c for c in self.classes if c.status == "active"]

    def get(self, code: str) -> DiseaseClass:
        for c in self.classes:
            if c.code == code:
                return c
        raise KeyError(code)

    def for_crop(self, crop: str) -> list[DiseaseClass]:
        """Active classes of one crop, without unknown."""
        return [c for c in self.active() if c.crop == crop]


class RegistryError(ValueError):
    pass


def load_registry(path: Path = DEFAULT_PATH) -> Registry:
    data = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
    crops = tuple(Crop(code=c["code"], names=c["names"]) for c in data["crops"])
    classes = tuple(
        DiseaseClass(
            code=c["code"],
            crop=c["crop"],
            names=c["names"],
            status=c["status"],
            added_in=c["added_in"],
        )
        for c in data["classes"]
    )
    registry = Registry(version=data["version"], crops=crops, classes=classes)
    _validate(registry)
    return registry


def _validate(registry: Registry) -> None:
    crop_codes = {c.code for c in registry.crops}
    seen: set[str] = set()
    for item in (*registry.crops, *registry.classes):
        missing = [lang for lang in LANGUAGES if not item.names.get(lang)]
        if missing:
            raise RegistryError(f"{item.code}: missing names {missing}")
    for c in registry.classes:
        if c.code in seen:
            raise RegistryError(f"duplicate class code: {c.code}")
        seen.add(c.code)
        if c.status not in STATUSES:
            raise RegistryError(f"{c.code}: unknown status {c.status!r}")
        if c.added_in > registry.version:
            raise RegistryError(f"{c.code}: added_in {c.added_in} > version {registry.version}")
        if c.code == UNKNOWN:
            if c.crop is not None:
                raise RegistryError("unknown must have crop: null")
            continue
        if c.crop not in crop_codes:
            raise RegistryError(f"{c.code}: unknown crop {c.crop!r}")
        if not c.code.startswith(f"{c.crop}__"):
            raise RegistryError(f"{c.code}: code must start with '{c.crop}__'")
    if UNKNOWN not in seen:
        raise RegistryError("registry must contain the unknown class")
