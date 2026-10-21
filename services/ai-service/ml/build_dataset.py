"""Download dataset sources and build ml/datasets/v<registry version>/<class code>/.

Usage (from services/ai-service):
    python -m ml.build_dataset                  # download everything and build
    python -m ml.build_dataset --skip-download  # rebuild from already downloaded sources
    python -m ml.build_dataset --sources plantdoc,caltech101

Output: one folder per class code, manifest.csv (one row per image) and report.md.
"""

import argparse
import csv
import hashlib
import os
import random
import shutil
import subprocess
import tarfile
import zipfile
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path

import httpx
from PIL import Image

from ml.data_sources import Source, load_sources
from ml.registry import UNKNOWN, Registry, load_registry

DATASETS_DIR = Path(__file__).resolve().parent / "datasets"
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
MIN_PER_CLASS = 100
SEED = 42
KAGGLE_DOWNLOAD = "https://www.kaggle.com/api/v1/datasets/download/{ref}"
DONE_MARKER = ".download-complete"
DOWNLOAD_ATTEMPTS = 50
GIT_ATTEMPTS = 5


@dataclass(frozen=True)
class Item:
    path: Path
    code: str
    source: Source
    original: str
    md5: str


# Download


def download(source: Source, raw_dir: Path) -> Path:
    target = raw_dir / source.name
    if (target / DONE_MARKER).exists():
        print(f"[{source.name}] already downloaded")
        return target
    kind = source.download["type"]
    print(f"[{source.name}] downloading ({kind})")
    if kind == "git":
        _download_git(source.download, target)
    elif kind == "kaggle":
        _download_archive(KAGGLE_DOWNLOAD.format(ref=source.download["ref"]), target, None, True)
    elif kind == "url":
        _download_archive(source.download["url"], target, source.download.get("md5"), False)
    else:
        raise ValueError(f"{source.name}: unknown download type {kind!r}")
    (target / DONE_MARKER).touch()
    return target


def _download_git(spec: dict, target: Path) -> None:
    """Partial clone, then check out one class folder at a time.

    Fetching a whole large folder in one request times out on GitHub, so each
    subfolder is added separately and retried; a rerun continues where it stopped.
    """
    git = ["git", "-C", str(target)]
    if not (target / ".git").exists():
        clone = ["git", "clone", "--depth", "1", "--filter=blob:none", "--sparse", spec["repo"]]
        subprocess.run([*clone, str(target)], check=True)
    for path in spec["paths"]:
        tree = [*git, "ls-tree", "-d", "--name-only", "HEAD", f"{path}/"]
        folders = subprocess.run(tree, check=True, capture_output=True, text=True).stdout.split(
            "\n"
        )
        for i, folder in enumerate(f for f in folders if f):
            print(f"  [{i + 1}/{len(folders) - 1}] {folder}")
            for attempt in range(1, GIT_ATTEMPTS + 1):
                if subprocess.run([*git, "sparse-checkout", "add", folder]).returncode == 0:
                    break
                print(f"  retry {attempt}/{GIT_ATTEMPTS}")
            else:
                raise RuntimeError(f"could not fetch {folder} — run the script again to continue")


def _kaggle_headers() -> dict[str, str]:
    token = os.environ.get("KAGGLE_API_TOKEN")
    token_file = Path("~/.kaggle/access_token").expanduser()
    if not token and token_file.exists():
        token = token_file.read_text(encoding="utf-8").strip()
    return {"Authorization": f"Bearer {token}"} if token else {}


def _download_archive(url: str, target: Path, md5: str | None, kaggle: bool) -> None:
    target.mkdir(parents=True, exist_ok=True)
    archive = target.with_suffix(".zip")
    headers = _kaggle_headers() if kaggle else {}
    for attempt in range(1, DOWNLOAD_ATTEMPTS + 1):
        try:
            _fetch_resumable(url, archive, headers)
            break
        except httpx.TransportError as e:
            print(f"\n  connection lost ({e}), attempt {attempt}/{DOWNLOAD_ATTEMPTS}")
            if attempt == DOWNLOAD_ATTEMPTS:
                raise
    if md5 and _md5(archive) != md5:
        archive.unlink()
        raise ValueError(f"md5 mismatch for {url}, archive removed — run again")
    _extract(archive, target)
    archive.unlink()


def _fetch_resumable(url: str, archive: Path, headers: dict[str, str]) -> None:
    """Download into archive, continuing from its current size if the server supports it."""
    done = archive.stat().st_size if archive.exists() else 0
    request_headers = {**headers, "Range": f"bytes={done}-"} if done else headers
    with httpx.stream("GET", url, headers=request_headers, follow_redirects=True, timeout=30) as r:
        if r.status_code == 416:  # already complete
            return
        r.raise_for_status()
        if r.status_code != 206:
            done = 0
        total = done + int(r.headers.get("content-length", 0))
        with archive.open("ab" if done else "wb") as f:
            for chunk in r.iter_bytes(1 << 20):
                f.write(chunk)
                done += len(chunk)
                print(f"\r  {done >> 20} / {total >> 20} MB", end="", flush=True)
    print()


def _md5(path: Path) -> str:
    digest = hashlib.md5()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _extract(archive: Path, target: Path) -> None:
    with zipfile.ZipFile(archive) as z:
        z.extractall(target, members=[m for m in z.namelist() if not _is_junk(Path(m))])
    # Some archives (Caltech-101) contain nested tarballs
    for nested in list(target.rglob("*.tar.gz")) + list(target.rglob("*.tgz")):
        with tarfile.open(nested) as t:
            t.extractall(nested.parent, filter="data")
        nested.unlink()


def _is_junk(path: Path) -> bool:
    """Git internals and macOS archive metadata (__MACOSX, ._ files)."""
    return ".git" in path.parts or "__MACOSX" in path.parts or path.name.startswith("._")


# Build


def collect(source: Source, source_dir: Path, rng: random.Random) -> list[Item]:
    labeled: list[tuple[Path, str]] = []
    for path in sorted(source_dir.rglob("*")):
        if path.suffix.lower() not in IMAGE_EXTENSIONS or _is_junk(path):
            continue
        code = source.label(path.parent.name)
        if code:
            labeled.append((path, code))
    known = [x for x in labeled if x[1] != UNKNOWN]
    unknown = [x for x in labeled if x[1] == UNKNOWN]
    if source.unknown_limit and len(unknown) > source.unknown_limit:
        unknown = sorted(rng.sample(unknown, source.unknown_limit))
    items = []
    for path, code in known + unknown:
        if not _is_readable(path):
            print(f"  skip unreadable {path}")
            continue
        md5 = hashlib.md5(path.read_bytes()).hexdigest()
        items.append(Item(path, code, source, str(path.relative_to(source_dir)), md5))
    return items


def _is_readable(path: Path) -> bool:
    try:
        with Image.open(path) as img:
            img.verify()
        return True
    except Exception:
        return False


def build(items: list[Item], registry: Registry, out_dir: Path) -> list[dict]:
    if out_dir.exists():
        shutil.rmtree(out_dir)
    seen: dict[str, str] = {}
    rows = []
    stats = Counter()
    for item in items:
        if item.md5 in seen:
            stats["conflicts" if seen[item.md5] != item.code else "duplicates"] += 1
            continue
        seen[item.md5] = item.code
        name = f"{item.source.name}__{item.md5[:16]}{item.path.suffix.lower()}"
        dest = out_dir / item.code / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        try:
            os.link(item.path, dest)
        except OSError:
            shutil.copy2(item.path, dest)
        rows.append(
            {
                "file": f"{item.code}/{name}",
                "class": item.code,
                "crop": registry.get(item.code).crop or "",
                "source": item.source.name,
                "kind": item.source.kind,
                "original": item.original,
                "md5": item.md5,
            }
        )
    print(f"skipped exact duplicates: {stats['duplicates']}, label conflicts: {stats['conflicts']}")
    with (out_dir / "manifest.csv").open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    return rows


def report(rows: list[dict], registry: Registry) -> str:
    counts: dict[str, Counter] = defaultdict(Counter)
    for row in rows:
        counts[row["class"]][row["kind"]] += 1
    lines = [
        f"Registry v{registry.version}, {len(rows)} images.",
        "",
        "| Class | Lab | Field | Other | Total | Note |",
        "| --- | ---: | ---: | ---: | ---: | --- |",
    ]
    for c in registry.active():
        n = counts[c.code]
        total = sum(n.values())
        notes = []
        if total < MIN_PER_CLASS:
            notes.append(f"below {MIN_PER_CLASS}")
        if total and c.code != UNKNOWN and not n["field"]:
            notes.append("lab only")
        cells = [f"`{c.code}`", n["lab"], n["field"], n["other"], total, ", ".join(notes)]
        lines.append("| " + " | ".join(str(x) for x in cells) + " |")
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawTextHelpFormatter
    )
    parser.add_argument("--sources", help="comma-separated source names (default: all)")
    parser.add_argument("--skip-download", action="store_true")
    parser.add_argument("--raw-dir", type=Path, default=DATASETS_DIR / "raw")
    parser.add_argument("--out-dir", type=Path)
    args = parser.parse_args()

    registry = load_registry()
    sources = load_sources(registry)
    if args.sources:
        wanted = set(args.sources.split(","))
        sources = [s for s in sources if s.name in wanted]
    out_dir = args.out_dir or DATASETS_DIR / f"v{registry.version}"
    rng = random.Random(SEED)

    items: list[Item] = []
    for source in sources:
        source_dir = args.raw_dir / source.name
        if not args.skip_download:
            download(source, args.raw_dir)
        found = collect(source, source_dir, rng)
        print(f"[{source.name}] {len(found)} images")
        items.extend(found)

    rows = build(items, registry, out_dir)
    text = report(rows, registry)
    (out_dir / "report.md").write_text(text, encoding="utf-8")
    print(text)


if __name__ == "__main__":
    main()
