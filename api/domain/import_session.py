"""Import Session / Statement pure rules (Story 4.6, AC #1/#2/#3/#4).

Pure domain: no FastAPI / SQLAlchemy / pdfplumber imports (AD-1).
"""

from __future__ import annotations

from domain.errors import UnsupportedFileTypeError

PDF_MAGIC_HEADER = b"%PDF-"

STATEMENT_STATUS_STAGED = "staged"
STATEMENT_STATUS_FAILED = "failed"
STATEMENT_STATUSES = frozenset({STATEMENT_STATUS_STAGED, STATEMENT_STATUS_FAILED})


def validate_pdf_upload(filename: str, content: bytes) -> None:
    """Guard an upload is actually a PDF before it touches storage or the pipeline.

    Content-based only — filename and client-supplied Content-Type are both
    spoofable, so neither is trusted here (Task 1.1).
    """
    if not content.startswith(PDF_MAGIC_HEADER):
        raise UnsupportedFileTypeError()
