"""Dataset source config loader — reads ml/data_sources.yaml and maps source folders to classes."""

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

import yaml

from ml.registry import UNKNOWN, Registry

DEFAULT_PATH = Path(__file__).resolve().parent / "data_sources.yaml"
KINDS = ("lab", "field", "other")
ALL_FOLDERS = "*"

Kind = Literal["lab", "field", "other"]


class SourceConfigError(ValueError):
    pass


def normalize(folder: str) -> str:
    """'Brown Rust', 'brown-rust' and 'brown_rust_test' all become 'brown_rust'."""
    name = re.sub(r"[\s\-]+", "_", folder.strip().lower())
    return name.removesuffix("_test")


@dataclass(frozen=True)
class Source:
    name: str
    kind: Kind
    license: str
    url: str
    download: dict[str, Any]
    classes: dict[str, str]
    unknown: frozenset[str]
    exclude: frozenset[str]
    unknown_limit: int | None

    def label(self, folder: str) -> str | None:
        """Class code for a source folder, or None if the folder is not used."""
        key = normalize(folder)
        if key in self.exclude:
            return None
        if key in self.classes:
            return self.classes[key]
        if ALL_FOLDERS in self.unknown or key in self.unknown:
            return UNKNOWN
        return None


def load_sources(registry: Registry, path: Path = DEFAULT_PATH) -> list[Source]:
    data = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
    sources = [_parse(name, raw) for name, raw in data["sources"].items()]
    active = {c.code for c in registry.active()}
    for source in sources:
        for folder, code in source.classes.items():
            if code not in active:
                raise SourceConfigError(f"{source.name}/{folder}: {code!r} is not an active class")
    return sources


def coverage(sources: list[Source], registry: Registry) -> dict[str, list[str]]:
    """Active class code -> names of sources that provide it."""
    result: dict[str, list[str]] = {c.code: [] for c in registry.active()}
    for source in sources:
        provided = set(source.classes.values()) | ({UNKNOWN} if source.unknown else set())
        for code in provided:
            result[code].append(source.name)
    return result


def _parse(name: str, raw: dict[str, Any]) -> Source:
    if raw.get("kind") not in KINDS:
        raise SourceConfigError(f"{name}: kind must be one of {KINDS}")
    classes: dict[str, str] = {}
    for folder, code in (raw.get("classes") or {}).items():
        key = normalize(folder)
        if key in classes:
            raise SourceConfigError(f"{name}: folder {folder!r} is listed twice")
        classes[key] = code
    unknown = frozenset(f if f == ALL_FOLDERS else normalize(f) for f in raw.get("unknown") or [])
    if unknown & classes.keys():
        raise SourceConfigError(f"{name}: folders both in classes and unknown")
    if unknown and not raw.get("unknown_limit"):
        raise SourceConfigError(f"{name}: unknown folders need unknown_limit")
    return Source(
        name=name,
        kind=raw["kind"],
        license=raw["license"],
        url=raw["url"],
        download=raw["download"],
        classes=classes,
        unknown=unknown,
        exclude=frozenset(normalize(f) for f in raw.get("exclude") or []),
        unknown_limit=raw.get("unknown_limit"),
    )
