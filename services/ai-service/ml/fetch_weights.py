"""Download a published model from its GitHub Release and check its checksums.

    python -m ml.fetch_weights effnet-b0-v1

The release ``model-<version>`` holds ``model.pt``, ``class_index.json`` and ``model_card.json``.
The card carries the SHA-256 of the other two files; a file that does not match is deleted.
"""

import argparse
import hashlib
import json
import ssl
import urllib.request
from pathlib import Path

import certifi

ML_DIR = Path(__file__).resolve().parent
RELEASE_URL = "https://github.com/nurbolatdev/agroadvisor-kz/releases/download/model-{version}"
CARD_HASHES = {"model.pt": "checkpoint_sha256", "class_index.json": "class_index_sha256"}


def _download(url: str, target: Path) -> None:
    context = ssl.create_default_context(cafile=certifi.where())
    with (
        urllib.request.urlopen(url, context=context, timeout=60) as response,
        target.open("wb") as out,
    ):
        while chunk := response.read(1 << 20):
            out.write(chunk)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        while chunk := f.read(1 << 20):
            digest.update(chunk)
    return digest.hexdigest()


def fetch(base_url: str, dest: Path) -> Path:
    """Download the three files into ``dest``; raise ValueError (and keep nothing) on a bad hash."""
    dest.mkdir(parents=True, exist_ok=True)
    _download(f"{base_url}/model_card.json", dest / "model_card.json")
    card = json.loads((dest / "model_card.json").read_text(encoding="utf-8"))
    for name, field in CARD_HASHES.items():
        part = dest / f"{name}.part"
        try:
            _download(f"{base_url}/{name}", part)
            if _sha256(part) != card[field]:
                raise ValueError(f"{name}: SHA-256 does not match model_card.json")
            part.replace(dest / name)
        finally:
            part.unlink(missing_ok=True)
    return dest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("version", help="model version, e.g. effnet-b0-v1")
    parser.add_argument("--dest", type=Path, default=ML_DIR / "weights")
    args = parser.parse_args()
    target = fetch(RELEASE_URL.format(version=args.version), args.dest / args.version)
    print(f"{args.version}: downloaded and verified in {target}")


if __name__ == "__main__":
    main()
