"""Domain validation tests for import-session PDF upload guard (Story 4.6)
and Bulk-commit eligibility gate (Story 4.7, Task 1.3)."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from domain.errors import (
    ImportSessionAlreadyCommittedError,
    ImportSessionDiscardedError,
    NoCleanStatementsToCommitError,
    UnsupportedFileTypeError,
)
from domain.import_session import validate_bulk_commit_eligible, validate_pdf_upload


def test_validate_pdf_upload_accepts_valid_pdf_magic_header() -> None:
    validate_pdf_upload("statement.pdf", b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n1 0 obj")


def test_validate_pdf_upload_rejects_empty_bytes() -> None:
    with pytest.raises(UnsupportedFileTypeError):
        validate_pdf_upload("statement.pdf", b"")


def test_validate_pdf_upload_rejects_zip_content() -> None:
    with pytest.raises(UnsupportedFileTypeError):
        validate_pdf_upload("statement.pdf", b"PK\x03\x04rest of a zip file")


def test_validate_pdf_upload_rejects_plain_text_content() -> None:
    with pytest.raises(UnsupportedFileTypeError):
        validate_pdf_upload("statement.pdf", b"this is not a pdf at all")


def test_validate_pdf_upload_is_content_based_not_extension_based() -> None:
    """A .pdf filename does not save non-PDF bytes — the check is content-only."""
    with pytest.raises(UnsupportedFileTypeError):
        validate_pdf_upload("statement.pdf", b"not actually a pdf")


# --- Story 4.7 Task 1.3: validate_bulk_commit_eligible ----------------------------


def test_validate_bulk_commit_eligible_accepts_session_with_staged_statement() -> None:
    validate_bulk_commit_eligible(discarded_at=None, statement_statuses=["staged", "failed"])


def test_validate_bulk_commit_eligible_rejects_discarded_session() -> None:
    with pytest.raises(ImportSessionDiscardedError):
        validate_bulk_commit_eligible(discarded_at=datetime.now(UTC), statement_statuses=["staged"])


def test_validate_bulk_commit_eligible_rejects_already_committed_session() -> None:
    """No double-commit (AD-4) — even one committed statement blocks a second Bulk pass."""
    with pytest.raises(ImportSessionAlreadyCommittedError):
        validate_bulk_commit_eligible(discarded_at=None, statement_statuses=["committed", "staged"])


def test_validate_bulk_commit_eligible_rejects_all_failed_statements() -> None:
    """AC #4: a failed-parse statement is excluded, never silently committed —
    a session with nothing but failed statements has nothing to commit."""
    with pytest.raises(NoCleanStatementsToCommitError):
        validate_bulk_commit_eligible(discarded_at=None, statement_statuses=["failed", "failed"])


def test_validate_bulk_commit_eligible_rejects_empty_session() -> None:
    with pytest.raises(NoCleanStatementsToCommitError):
        validate_bulk_commit_eligible(discarded_at=None, statement_statuses=[])
