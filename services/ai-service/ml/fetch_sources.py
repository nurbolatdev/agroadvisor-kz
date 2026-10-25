"""Fetch the sources of dataset v2 that the build only unpacks (``download: type: local``).

    python -m ml.fetch_sources pldd-up          # three zips from Mendeley Data, checksums checked
    python -m ml.fetch_sources plantseg         # Zenodo, MD5 checked
    python -m ml.fetch_sources johninnes-wheat  # Zenodo, MD5 checked
    python -m ml.fetch_sources plantwild        # Hugging Face (no published checksum)
    python -m ml.fetch_sources ccmt             # only the raw photos of maize and tomato
    python -m ml.fetch_sources tom2024          # only the labeled photos of maize and tomato
    ROBOFLOW_API_KEY=... python -m ml.fetch_sources fieldplant

Files go to ``ml/datasets/raw/<source>/`` (``--dest`` changes the parent folder). A download that
stopped continues from where it was (HTTP Range) when the command is run again. The Mendeley zips
of CCMT and TOM2024 also hold augmented copies of every photo: only the folders the build uses are
read out of the zip, with range requests, so the augmented photos are never downloaded.
"""

import argparse
import csv
import io
import json
import os
import struct
import sys
import time
import zipfile
import zlib
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx

from ml.build_dataset import check_file

RAW_DIR = Path(__file__).resolve().parent / "datasets" / "raw"
ATTEMPTS = 200
MENDELEY_FILES = "https://data.mendeley.com/public-files/datasets/3j4nfkvp2n/files"
ARCHIVES: dict[str, dict[str, str]] = {
    "pldd-up": {
        "EB.zip": f"{MENDELEY_FILES}/5717ac85-cf61-461d-bf70-e1e5af2f2c53/file_downloaded",
        "LB.zip": f"{MENDELEY_FILES}/35ff7712-865c-41bf-96b1-d25d84af7b95/file_downloaded",
        "Healthy.zip": f"{MENDELEY_FILES}/d4ce2acf-3af8-416e-90bc-bb834ba9da66/file_downloaded",
    },
    "plantseg": {"plantseg.zip": "https://zenodo.org/api/records/17719108/files/plantseg.zip/content"},
    "johninnes-wheat": {
        "Long 2023 Plant Path 999 photos.zip": "https://zenodo.org/api/records/7573133/files/"
        "Long%202023%20Plant%20Path%20999%20photos.zip/content"
    },
    "plantwild": {
        "plantwild.zip": "https://huggingface.co/datasets/uqtwei2/PlantWild/resolve/main/plantwild.zip"
    },
}
# Mendeley dataset id, the path prefix removed from the files, the folders that are read
MENDELEY_SUBSETS: dict[str, tuple[str, str, list[str]]] = {
    "ccmt": (
        "bwh3zbpkpv",
        "Dataset for Crop Pest and Disease Detection/Raw Data/CCMT Dataset/",
        ["Maize/", "Tomato/"],
    ),
    "tom2024": (
        "3d4yg89rtr",
        "TOM2024/CATEGORY A/CATA-English/",
        ["maize_diseases/", "tomato_diseases/"],
    ),
}
ROBOFLOW = ("plant-disease-detection", "fieldplant")


def _total_size(response: httpx.Response, have: int) -> int | None:
    content_range = response.headers.get("content-range")
    if content_range:
        return int(content_range.rsplit("/", 1)[1])
    if response.status_code == 200 and "content-length" in response.headers:
        return int(response.headers["content-length"])
    return None


def download(url: str, target: Path, attempts: int = ATTEMPTS) -> None:
    """Resumable download: a partial file continues with an HTTP Range request.

    The server must answer 206 to a ranged request; if it answers 200 (it ignored the range) the
    partial file is discarded and the download starts over, so the file is never corrupted by
    appending a whole archive to a part. A dropped connection is retried. The total size comes
    from the response, so a finished file is recognised and a short one is never accepted.
    """
    target.parent.mkdir(parents=True, exist_ok=True)
    total: int | None = None
    for attempt in range(1, attempts + 1):
        have = target.stat().st_size if target.exists() else 0
        if total is not None and have == total:
            return
        headers = {"Range": f"bytes={have}-"} if have else {}
        try:
            with httpx.stream(
                "GET", url, headers=headers, follow_redirects=True, timeout=60
            ) as response:
                if response.status_code == 416:  # nothing left to fetch
                    return
                response.raise_for_status()
                if have and response.status_code != 206:
                    print("the server ignored the Range header: starting over", flush=True)
                    have = 0
                total = _total_size(response, have)
                with target.open("ab" if have else "wb") as f:
                    for chunk in response.iter_bytes(1 << 20):
                        f.write(chunk)
        except httpx.HTTPError as error:
            print(f"{type(error).__name__}, retry {attempt}", flush=True)
            time.sleep(min(60, 2 * attempt))
            continue
        if total is None or target.stat().st_size == total:
            return
    raise RuntimeError(f"{url}: not finished, run the command again to continue")


def fetch_archives(name: str, dest: Path, checksums: dict[str, str] | None = None) -> None:
    for filename, url in ARCHIVES[name].items():
        print(f"[{name}] {filename}", flush=True)
        download(url, dest / filename)
        expected = (checksums or {}).get(filename)
        if expected and not check_file(dest / filename, expected):
            raise ValueError(f"{dest / filename}: checksum mismatch, delete it and run again")


class RangeFile(io.RawIOBase):
    """A read-only seekable view of a remote file, read with range requests."""

    def __init__(self, url: str) -> None:
        self.url, self.position = url, 0
        response = self._request(0, 0)
        self.size = int(response.headers["content-range"].rsplit("/", 1)[1])

    def _request(self, start: int, end: int) -> httpx.Response:
        for attempt in range(1, 9):
            try:
                response = httpx.get(
                    self.url,
                    headers={"Range": f"bytes={start}-{end}"},
                    follow_redirects=True,
                    timeout=60,
                )
                response.raise_for_status()
                return response
            except httpx.HTTPError:
                time.sleep(2 * attempt)
        raise RuntimeError(f"range {start}-{end} of {self.url} failed")

    def seekable(self) -> bool:
        return True

    def readable(self) -> bool:
        return True

    def tell(self) -> int:
        return self.position

    def seek(self, offset: int, whence: int = 0) -> int:
        self.position = {0: offset, 1: self.position + offset, 2: self.size + offset}[whence]
        return self.position

    def readinto(self, buffer) -> int:
        end = min(self.position + len(buffer), self.size) - 1
        if end < self.position:
            return 0
        data = self._request(self.position, end).content
        buffer[: len(data)] = data
        self.position += len(data)
        return len(data)


def fetch_zip_subset(url: str, dest: Path, strip: str, includes: list[str]) -> int:
    """Write only the files of a remote zip whose path starts with ``strip + include``.

    The photos land in ``dest/<path without strip>``; files that are already there with the right
    size are skipped, so a second run continues. Every file is checked against its CRC.
    """
    remote = RangeFile(url)
    prefixes = tuple(strip + include for include in includes)
    infos = [
        i
        for i in zipfile.ZipFile(remote).infolist()
        if not i.is_dir() and i.filename.startswith(prefixes)
    ]
    print(f"{len(infos)} files, {sum(i.file_size for i in infos) / 1e6:.0f} MB", flush=True)

    def fetch(info: zipfile.ZipInfo) -> tuple[str, int, int]:
        target = dest / info.filename.removeprefix(strip)
        relative = str(target.relative_to(dest))
        if target.exists() and target.stat().st_size == info.file_size:
            return relative, info.file_size, info.CRC
        name_length = len(info.filename.encode("utf-8"))
        reach = info.header_offset + 30 + name_length + 1024 + info.compress_size
        end = min(reach, remote.size - 1)
        block = remote._request(info.header_offset, end).content
        if block[:4] != b"PK\x03\x04":
            raise ValueError(f"{info.filename}: not a zip entry at the expected offset")
        name_len, extra_len = struct.unpack("<HH", block[26:30])
        start = 30 + name_len + extra_len
        data = block[start : start + info.compress_size]
        raw = data if info.compress_type == 0 else zlib.decompress(data, -15)
        if zlib.crc32(raw) != info.CRC:
            raise ValueError(f"CRC mismatch: {info.filename}")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(raw)
        return relative, info.file_size, info.CRC

    with ThreadPoolExecutor(16) as pool:
        rows = list(pool.map(fetch, infos))
    with (dest / "manifest.csv").open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["file", "size", "crc32"])
        writer.writerows(rows)
    return len(rows)


def fetch_mendeley_subset(name: str, dest: Path) -> int:
    dataset, strip, includes = MENDELEY_SUBSETS[name]
    return fetch_zip_subset(
        f"https://data.mendeley.com/public-api/zip/{dataset}/download/1", dest, strip, includes
    )


def fetch_fieldplant(dest: Path, version: int | None = None) -> None:
    """FieldPlant as a COCO export of the Roboflow copy that links to the authors' paper.

    The API key is read from ROBOFLOW_API_KEY; it is never printed or saved.
    """
    key = os.environ.get("ROBOFLOW_API_KEY")
    if not key:
        sys.exit("ROBOFLOW_API_KEY is not set")
    workspace, project = ROBOFLOW

    def api(path: str) -> dict:
        response = httpx.get(f"https://api.roboflow.com/{path}", params={"api_key": key})
        if response.status_code != 200:  # the URL holds the key, so it is not echoed
            sys.exit(f"Roboflow API error {response.status_code} for /{path}")
        return response.json()

    versions = api(f"{workspace}/{project}").get("versions", [])
    numbers = {int(str(v["id"]).split("/")[-1]): v for v in versions}
    if version is None:
        plain = [n for n, v in numbers.items() if not (v.get("augmentation") or {})]
        version = max(plain or numbers)
    print(f"[fieldplant] version {version}", flush=True)
    link = api(f"{workspace}/{project}/{version}/coco").get("export", {}).get("link")
    if not link:
        sys.exit("no export link yet: the export may still be generating, try again in a minute")
    archive = dest / f"fieldplant-coco-v{version}.zip"
    download(link, archive)
    with zipfile.ZipFile(archive) as z:
        z.extractall(dest / "coco")
    for annotations in sorted((dest / "coco").rglob("_annotations.coco.json")):
        data = json.loads(annotations.read_text(encoding="utf-8"))
        photos, boxes = len(data["images"]), len(data["annotations"])
        print(f"{annotations.parent.name}: {photos} photos, {boxes} boxes")


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawTextHelpFormatter
    )
    parser.add_argument("source", choices=[*ARCHIVES, *MENDELEY_SUBSETS, "fieldplant"])
    parser.add_argument("--dest", type=Path, default=RAW_DIR, help="parent folder of the source")
    parser.add_argument("--version", type=int, help="fieldplant: Roboflow dataset version")
    args = parser.parse_args()
    dest = args.dest / args.source
    if args.source in ARCHIVES:
        from ml.data_sources import load_sources
        from ml.registry import load_registry

        sources = {s.name: s for s in load_sources(load_registry())}
        fetch_archives(args.source, dest, sources[args.source].download.get("checksums"))
    elif args.source in MENDELEY_SUBSETS:
        print(f"{fetch_mendeley_subset(args.source, dest)} files in {dest}")
    else:
        fetch_fieldplant(dest, args.version)


if __name__ == "__main__":
    main()
