import hashlib
import http.server
import io
import os
import threading
import zipfile

import pytest

from ml import fetch_sources
from ml.build_dataset import check_file

DATA = os.urandom(3_000_000)


class Handler(http.server.BaseHTTPRequestHandler):
    """Serves ``files`` and understands Range, like Zenodo or Mendeley do."""

    files: dict[str, bytes] = {}
    honour_range = True

    def do_GET(self):
        data = self.files[self.path]
        header = self.headers.get("Range")
        if header and self.honour_range:
            first, _, last = header.split("=")[1].partition("-")
            start, end = int(first), int(last) if last else len(data) - 1
            if start >= len(data):
                self.send_response(416)
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            body = data[start : end + 1]
            self.send_response(206)
            self.send_header("Content-Range", f"bytes {start}-{start + len(body) - 1}/{len(data)}")
        else:
            body = data
            self.send_response(200)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


@pytest.fixture
def server():
    Handler.files = {"/file": DATA}
    Handler.honour_range = True
    httpd = http.server.HTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{httpd.server_port}"
    httpd.shutdown()


def test_a_partial_download_continues_from_where_it_stopped(server, tmp_path):
    target = tmp_path / "a.zip"
    target.write_bytes(DATA[:1_200_000])
    fetch_sources.download(f"{server}/file", target)
    assert target.read_bytes() == DATA


def test_a_server_that_ignores_range_restarts_the_download(server, tmp_path):
    Handler.honour_range = False
    target = tmp_path / "a.zip"
    target.write_bytes(DATA[:1_200_000])
    fetch_sources.download(f"{server}/file", target)
    assert target.read_bytes() == DATA  # not 4.2 MB: the part was not kept


def test_a_finished_download_is_left_alone(server, tmp_path):
    target = tmp_path / "a.zip"
    target.write_bytes(DATA)
    fetch_sources.download(f"{server}/file", target)
    assert target.read_bytes() == DATA


def make_zip(compression):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression) as z:
        z.writestr("pre/Maize/healthy/a.jpg", b"a" * 5000)
        z.writestr("pre/Maize/leaf blight/b.jpg", b"b" * 5000)
        z.writestr("pre/Augmented/Maize/healthy/c.jpg", b"c" * 5000)
        z.writestr("pre/Tomato/healthy/d.jpg", os.urandom(3000))
        z.writestr("pre/Cassava/healthy/e.jpg", b"e" * 5000)
    return buffer.getvalue()


@pytest.mark.parametrize("compression", [zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED])
def test_only_the_wanted_folders_are_read_out_of_a_remote_zip(server, tmp_path, compression):
    Handler.files = {"/z": make_zip(compression)}
    count = fetch_sources.fetch_zip_subset(f"{server}/z", tmp_path, "pre/", ["Maize/", "Tomato/"])
    assert count == 3
    found = sorted(str(p.relative_to(tmp_path)) for p in tmp_path.rglob("*.jpg"))
    assert found == ["Maize/healthy/a.jpg", "Maize/leaf blight/b.jpg", "Tomato/healthy/d.jpg"]
    assert (tmp_path / "Maize/healthy/a.jpg").read_bytes() == b"a" * 5000
    assert "Cassava" not in (tmp_path / "manifest.csv").read_text()
    assert fetch_sources.fetch_zip_subset(f"{server}/z", tmp_path, "pre/", ["Maize/"]) == 2  # again


def test_archives_are_verified_against_the_checksums(server, tmp_path, monkeypatch):
    monkeypatch.setitem(fetch_sources.ARCHIVES, "demo", {"a.bin": f"{server}/file"})
    good = hashlib.sha256(DATA).hexdigest()
    fetch_sources.fetch_archives("demo", tmp_path, {"a.bin": good})
    assert (tmp_path / "a.bin").read_bytes() == DATA
    with pytest.raises(ValueError, match="checksum mismatch"):
        fetch_sources.fetch_archives("demo", tmp_path, {"a.bin": "0" * 64})


def test_check_file_knows_sha256_and_md5(tmp_path):
    path = tmp_path / "x"
    path.write_bytes(b"abc")
    assert check_file(path, hashlib.sha256(b"abc").hexdigest())
    assert check_file(path, "md5:" + hashlib.md5(b"abc").hexdigest())
    assert not check_file(path, "md5:" + "0" * 32)
    assert not check_file(path, "0" * 64)


def test_fieldplant_needs_the_key_in_the_environment(monkeypatch, tmp_path):
    monkeypatch.delenv("ROBOFLOW_API_KEY", raising=False)
    with pytest.raises(SystemExit, match="ROBOFLOW_API_KEY"):
        fetch_sources.fetch_fieldplant(tmp_path)
