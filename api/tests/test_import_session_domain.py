"""Domain validation tests for import-session PDF upload guard (Story 4.6)
and Bulk-commit eligibility gate (Story 4.7, Task 1.3)."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

import pytest
from domain.errors import (
    ImportSessionAlreadyCommittedError,
    ImportSessionDiscardedError,
    InvalidCanonicalLineError,
    NoCleanStatementsToCommitError,
    UnsupportedFileTypeError,
)
from domain.import_session import (
    validate_bulk_candidate_row,
    validate_bulk_commit_eligible,
    validate_pdf_upload,
)


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


# --- Story 4.7 review finding: validate_bulk_candidate_row ------------------------


def test_validate_bulk_candidate_row_accepts_well_formed_row() -> None:
    validate_bulk_candidate_row(amount=Decimal("12.34"), normalized_description="Coffee shop")


def test_validate_bulk_candidate_row_accepts_zero_amount() -> None:
    """MaterializeFxService already treats zero-amount lines as a pass-through."""
    validate_bulk_candidate_row(amount=Decimal("0"), normalized_description="Zero")


def test_validate_bulk_candidate_row_accepts_negative_amount() -> None:
    """payment/credit_note line types legitimately credit the balance."""
    validate_bulk_candidate_row(amount=Decimal("-60000.00"), normalized_description="Payment")


def test_validate_bulk_candidate_row_rejects_amount_over_max() -> None:
    with pytest.raises(InvalidCanonicalLineError):
        validate_bulk_candidate_row(
            amount=Decimal("100000000000000.00"), normalized_description="Too big"
        )


def test_validate_bulk_candidate_row_rejects_amount_under_negative_max() -> None:
    with pytest.raises(InvalidCanonicalLineError):
        validate_bulk_candidate_row(
            amount=Decimal("-100000000000000.00"), normalized_description="Too big credit"
        )


def test_validate_bulk_candidate_row_rejects_more_than_two_decimal_places() -> None:
    with pytest.raises(InvalidCanonicalLineError):
        validate_bulk_candidate_row(amount=Decimal("12.345"), normalized_description="Fractional")


def test_validate_bulk_candidate_row_rejects_empty_description() -> None:
    with pytest.raises(InvalidCanonicalLineError):
        validate_bulk_candidate_row(amount=Decimal("10.00"), normalized_description="   ")


def test_validate_bulk_candidate_row_rejects_description_over_max_length() -> None:
    with pytest.raises(InvalidCanonicalLineError):
        validate_bulk_candidate_row(amount=Decimal("10.00"), normalized_description="x" * 501)
