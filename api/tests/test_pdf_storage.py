"""FilesystemPdfStorage.read confinement (Story 5.1)."""

from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from adapters.storage.pdf_storage import FilesystemPdfStorage


def test_read_returns_bytes_inside_volume(tmp_path: Path) -> None:
    storage = FilesystemPdfStorage(base_dir=str(tmp_path))
    path = storage.save(user_id=uuid4(), filename="x.pdf", content=b"%PDF-1.4\n")
    assert storage.read(path) == b"%PDF-1.4\n"


def test_read_rejects_path_outside_volume(tmp_path: Path) -> None:
    storage = FilesystemPdfStorage(base_dir=str(tmp_path / "volume"))
    (tmp_path / "volume").mkdir()
    outsider = tmp_path / "secret.pdf"
    outsider.write_bytes(b"%PDF-secret")
    assert storage.read(str(outsider)) is None


def test_read_missing_file_returns_none(tmp_path: Path) -> None:
    storage = FilesystemPdfStorage(base_dir=str(tmp_path))
    assert storage.read(str(tmp_path / "nope.pdf")) is None
