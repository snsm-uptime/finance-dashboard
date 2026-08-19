"""Filesystem-backed PdfStorage adapter (Story 4.6, AD-3).

Writes to the operator PDF volume — outside the repo, path-reference-only in
Postgres. Never trusts the client-supplied filename for the on-disk path
(path/filename injection); the original filename is not needed downstream.
"""

from __future__ import annotations

from pathlib import Path
from uuid import UUID, uuid4


class FilesystemPdfStorage:
    """Implements application.ports.PdfStorage (structural, no explicit base)."""

    def __init__(self, base_dir: str) -> None:
        self._base_dir = Path(base_dir)

    def save(self, *, user_id: UUID, filename: str, content: bytes) -> str:
        user_dir = self._base_dir / str(user_id)
        user_dir.mkdir(parents=True, exist_ok=True)
        path = user_dir / f"{uuid4()}.pdf"
        path.write_bytes(content)
        return str(path)

    def delete(self, path: str) -> None:
        Path(path).unlink(missing_ok=True)
