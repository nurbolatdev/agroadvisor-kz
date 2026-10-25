"""Dataset source config loader — reads ml/data_sources.yaml and maps source folders to classes."""

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

import yaml

from ml.registry import UNKNOWN, Registry

DEFAULT_PATH = Path(__file__).resolve().parent / "data_sources.yaml"
KINDS = ("lab", "field", "other")
ROLES = ("train", "bench")
LOADERS = ("folders", "filename", "csv", "coco")
DOWNLOAD_TYPES = ("git", "kaggle", "url", "local")
REQUIRED = ("license", "url", "download")
ALL_FOLDERS = "*"

Kind = Literal["lab", "field", "other"]


class SourceConfigError(ValueError):
    pass


def normalize(folder: str) -> str:
    """'Brown Rust', 'brown-rust' and 'brown_rust_test' all become 'brown_rust'.

    A two-level name keeps its slash: 'Maize/leaf blight' becomes 'maize/leaf_blight'.
    """
    parts = [
        re.sub(r"[\s\-]+", "_", p.strip().lower()).removesuffix("_test") for p in folder.split("/")
    ]
    return "/".join(p for p in parts if p)


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
    role: str = "train"  # bench sources are only used to evaluate, never to train
    # How the class of a photo is found: folders (name of the folder), filename (the name without
    # its trailing number), csv (a metadata table, see ``labels``), coco (leaves are cut out of
    # the photos by their boxes)
    loader: str = "folders"
    limit_per_class: int | None = None  # keep at most N photos per class (seeded)
    labels: dict[str, str] | None = None  # csv loader: file, name, class column and images dir

    def label(self, folder: str) -> str | None:
        """Class code for a source folder ('class' or 'crop/class'), or None if it is not used."""
        key = normalize(folder)
        if key in self.exclude:
            return None
        if key in self.classes:
            return self.classes[key]
        if ALL_FOLDERS in self.unknown or key in self.unknown:
            return UNKNOWN
        return None

    def label_path(self, parts: tuple[str, ...]) -> str | None:
        """Class code for the folders above an image, most specific name first.

        The last two folders are tried together ('maize/healthy') because the same class name
        can repeat under different crops, then the last folder alone ('healthy').
        """
        if len(parts) >= 2:
            two = "/".join(parts[-2:])
            if normalize(two) in self.exclude:
                return None
            code = self.label(two)
            if code:
                return code
        return self.label(parts[-1]) if parts else None


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
    for key in REQUIRED:
        if not raw.get(key):
            raise SourceConfigError(f"{name}: {key} is required")
    if raw["download"].get("type") not in DOWNLOAD_TYPES:
        raise SourceConfigError(f"{name}: download type must be one of {DOWNLOAD_TYPES}")
    if raw["download"]["type"] == "local" and not (
        {"archives", "checksums", "fetch"} & raw["download"].keys()
    ):
        raise SourceConfigError(f"{name}: a local source needs archives, checksums or fetch")
    role = raw.get("role", "train")
    if role not in ROLES:
        raise SourceConfigError(f"{name}: role must be one of {ROLES}")
    loader = raw.get("loader", "folders")
    if loader not in LOADERS:
        raise SourceConfigError(f"{name}: loader must be one of {LOADERS}")
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
    if role == "bench" and unknown:
        raise SourceConfigError(f"{name}: a bench source cannot feed the unknown class")
    labels = raw.get("labels")
    if loader == "csv" and not (labels and {"file", "name", "class"} <= labels.keys()):
        raise SourceConfigError(f"{name}: the csv loader needs labels with file, name and class")
    limit = raw.get("limit_per_class")
    if limit is not None and (not isinstance(limit, int) or limit < 1):
        raise SourceConfigError(f"{name}: limit_per_class must be a positive integer")
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
        role=role,
        loader=loader,
        limit_per_class=limit,
        labels=labels,
    )
