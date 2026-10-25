import hashlib
import json

import pytest

from ml.fetch_weights import fetch


def make_release(root, model=b"weights", tamper=False):
    release = root / "release"
    release.mkdir()
    index = b'{"classes": []}'
    card = {
        "checkpoint_sha256": hashlib.sha256(model).hexdigest(),
        "class_index_sha256": hashlib.sha256(index).hexdigest(),
    }
    (release / "model_card.json").write_text(json.dumps(card))
    (release / "class_index.json").write_bytes(index)
    (release / "model.pt").write_bytes(b"tampered" if tamper else model)
    return release.as_uri()


def test_fetch_downloads_and_verifies(tmp_path):
    target = fetch(make_release(tmp_path), tmp_path / "out")
    assert (target / "model.pt").read_bytes() == b"weights"
    assert (target / "class_index.json").exists()
    assert not list(target.glob("*.part"))


def test_fetch_rejects_a_file_with_a_wrong_hash(tmp_path):
    with pytest.raises(ValueError, match="model.pt"):
        fetch(make_release(tmp_path, tamper=True), tmp_path / "out")
    assert not (tmp_path / "out" / "model.pt").exists()
    assert not list((tmp_path / "out").glob("*.part"))
