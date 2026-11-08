import hashlib
import json
import urllib.error

import pytest

from ml import fetch_weights
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


def http_error(code):
    return urllib.error.HTTPError("http://x", code, "err", {}, None)


class Flaky:
    """Replaces _download_once: fails with the given errors, then writes the content."""

    def __init__(self, errors):
        self.errors = list(errors)
        self.calls = 0

    def __call__(self, url, target):
        self.calls += 1
        if self.errors:
            raise self.errors.pop(0)
        target.write_bytes(b"ok")


@pytest.fixture
def no_sleep(monkeypatch):
    pauses = []
    monkeypatch.setattr(fetch_weights.time, "sleep", pauses.append)
    return pauses


def test_download_retries_on_5xx_and_network_errors(monkeypatch, tmp_path, no_sleep):
    flaky = Flaky([http_error(504), TimeoutError("read timed out"), urllib.error.URLError("reset")])
    monkeypatch.setattr(fetch_weights, "_download_once", flaky)
    fetch_weights._download("http://x/model.pt", tmp_path / "f")
    assert flaky.calls == 4
    assert no_sleep == [5, 15, 45]
    assert (tmp_path / "f").read_bytes() == b"ok"


def test_download_gives_up_after_the_last_attempt(monkeypatch, tmp_path, no_sleep):
    flaky = Flaky([http_error(504)] * 10)
    monkeypatch.setattr(fetch_weights, "_download_once", flaky)
    with pytest.raises(urllib.error.HTTPError):
        fetch_weights._download("http://x/model.pt", tmp_path / "f")
    assert flaky.calls == 4


def test_download_does_not_retry_a_4xx(monkeypatch, tmp_path, no_sleep):
    flaky = Flaky([http_error(404)])
    monkeypatch.setattr(fetch_weights, "_download_once", flaky)
    with pytest.raises(urllib.error.HTTPError):
        fetch_weights._download("http://x/model.pt", tmp_path / "f")
    assert flaky.calls == 1
    assert no_sleep == []


def test_fetch_rejects_a_file_with_a_wrong_hash(tmp_path):
    with pytest.raises(ValueError, match="model.pt"):
        fetch(make_release(tmp_path, tamper=True), tmp_path / "out")
    assert not (tmp_path / "out" / "model.pt").exists()
    assert not list((tmp_path / "out").glob("*.part"))
