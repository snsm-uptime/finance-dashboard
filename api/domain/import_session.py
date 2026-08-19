"""Import Session / Statement pure rules (Story 4.6, AC #1/#2/#3/#4).

Pure domain: no FastAPI / SQLAlchemy / pdfplumber imports (AD-1).
"""

from __future__ import annotations

from collections.abc import Sequence

from domain.errors import (
    ImportSessionAlreadyCommittedError,
    ImportSessionDiscardedError,
    NoCleanStatementsToCommitError,
    UnsupportedFileTypeError,
)

PDF_MAGIC_HEADER = b"%PDF-"

STATEMENT_STATUS_STAGED = "staged"
STATEMENT_STATUS_FAILED = "failed"
STATEMENT_STATUS_COMMITTED = "committed"
STATEMENT_STATUSES = frozenset(
    {STATEMENT_STATUS_STAGED, STATEMENT_STATUS_FAILED, STATEMENT_STATUS_COMMITTED}
)


def validate_pdf_upload(filename: str, content: bytes) -> None:
    """Guard an upload is actually a PDF before it touches storage or the pipeline.

    Content-based only — filename and client-supplied Content-Type are both
    spoofable, so neither is trusted here (Task 1.1).
    """
    if not content.startswith(PDF_MAGIC_HEADER):
        raise UnsupportedFileTypeError()


def validate_bulk_commit_eligible(
    *, discarded_at: object | None, statement_statuses: Sequence[str]
) -> None:
    """Pure Bulk-assignment gate (Story 4.7, Task 1.1, AD-4).

    Confirms the session is available (not discarded), unassigned (no
    statement already committed — no double-commit), and has at least one
    clean-parse statement to commit (AC #4: a failed-parse statement is
    excluded from Bulk's happy path, never silently committed).
    """
    if discarded_at is not None:
        raise ImportSessionDiscardedError()
    if any(status == STATEMENT_STATUS_COMMITTED for status in statement_statuses):
        raise ImportSessionAlreadyCommittedError()
    if not any(status == STATEMENT_STATUS_STAGED for status in statement_statuses):
        raise NoCleanStatementsToCommitError()
