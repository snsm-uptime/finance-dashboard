"""Domain validation tests for import-session PDF upload guard (Story 4.6)
and Bulk-commit eligibility gate (Story 4.7, Task 1.3)."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

import pytest
from domain.errors import (
    ImportSessionDiscardedError,
    InvalidCanonicalLineError,
    NoCleanStatementsToCommitError,
    UnsupportedFileTypeError,
)
from domain.import_session import (
    ROW_STATUS_COMMITTED,
    ROW_STATUS_DELETED,
    ROW_STATUS_EXCLUDED_ZERO_AMOUNT,
    ROW_STATUS_PENDING,
    ROW_STATUSES,
    UNDO_ACTION_ASSIGN,
    UNDO_ACTION_DELETE,
    UNDO_ACTIONS,
    compute_pdf_content_hash,
    normalize_row_description,
    row_is_zero_amount,
    select_landing_list_id,
    session_needs_source_pdf,
    statement_has_pending_rows,
    statement_is_fully_resolved,
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


def test_validate_bulk_commit_eligible_accepts_staged_with_committed_sibling() -> None:
    """Amended AD-4: an all-zero statement may already be committed at create
    time while siblings are still staged — that mix is Bulk-eligible."""
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


# --- Story 4.10 Task 1: row status, zero-amount, fully-resolved --------------------


def test_row_status_constants_include_excluded_zero_amount_at_twenty_chars() -> None:
    assert ROW_STATUS_EXCLUDED_ZERO_AMOUNT == "excluded_zero_amount"
    assert len(ROW_STATUS_EXCLUDED_ZERO_AMOUNT) == 20
    assert ROW_STATUSES == frozenset(
        {
            ROW_STATUS_PENDING,
            ROW_STATUS_COMMITTED,
            ROW_STATUS_DELETED,
            ROW_STATUS_EXCLUDED_ZERO_AMOUNT,
        }
    )


def test_row_is_zero_amount_exact_zero_only() -> None:
    assert row_is_zero_amount(Decimal("0")) is True
    assert row_is_zero_amount(Decimal("0.00")) is True
    assert row_is_zero_amount(Decimal("0.01")) is False
    assert row_is_zero_amount(Decimal("-60000.00")) is False


def test_statement_is_fully_resolved_true_for_all_committed() -> None:
    assert statement_is_fully_resolved([ROW_STATUS_COMMITTED, ROW_STATUS_COMMITTED]) is True


def test_statement_is_fully_resolved_true_for_all_deleted() -> None:
    assert statement_is_fully_resolved([ROW_STATUS_DELETED, ROW_STATUS_DELETED]) is True


def test_statement_is_fully_resolved_true_for_all_excluded() -> None:
    assert statement_is_fully_resolved([ROW_STATUS_EXCLUDED_ZERO_AMOUNT]) is True


def test_statement_is_fully_resolved_true_for_committed_and_deleted_mix() -> None:
    assert statement_is_fully_resolved([ROW_STATUS_COMMITTED, ROW_STATUS_DELETED]) is True


def test_statement_is_fully_resolved_false_if_any_non_excluded_pending() -> None:
    assert (
        statement_is_fully_resolved(
            [ROW_STATUS_COMMITTED, ROW_STATUS_PENDING, ROW_STATUS_EXCLUDED_ZERO_AMOUNT]
        )
        is False
    )


def test_statement_is_fully_resolved_ignores_excluded_when_others_resolved() -> None:
    assert (
        statement_is_fully_resolved(
            [ROW_STATUS_COMMITTED, ROW_STATUS_EXCLUDED_ZERO_AMOUNT, ROW_STATUS_DELETED]
        )
        is True
    )


def test_session_needs_source_pdf_while_staged_or_failed() -> None:
    assert session_needs_source_pdf(["staged"]) is True
    assert session_needs_source_pdf(["failed"]) is True
    assert session_needs_source_pdf(["committed", "failed"]) is True
    assert session_needs_source_pdf(["committed", "staged"]) is True


def test_session_needs_source_pdf_false_when_all_committed_or_skipped() -> None:
    assert session_needs_source_pdf(["committed"]) is False
    assert session_needs_source_pdf(["skipped"]) is False
    assert session_needs_source_pdf(["committed", "skipped"]) is False
    assert session_needs_source_pdf([]) is False


def test_undo_action_constants_are_the_only_two_actions() -> None:
    assert UNDO_ACTIONS == {UNDO_ACTION_ASSIGN, UNDO_ACTION_DELETE}
    assert (UNDO_ACTION_ASSIGN, UNDO_ACTION_DELETE) == ("assign", "delete")


def test_statement_has_pending_rows_true_when_any_row_pending() -> None:
    assert statement_has_pending_rows([ROW_STATUS_COMMITTED, ROW_STATUS_PENDING]) is True


def test_statement_has_pending_rows_false_when_none_pending() -> None:
    assert statement_has_pending_rows([ROW_STATUS_COMMITTED, ROW_STATUS_DELETED]) is False
    assert statement_has_pending_rows([ROW_STATUS_EXCLUDED_ZERO_AMOUNT]) is False
    assert statement_has_pending_rows([]) is False


def test_normalize_row_description_trims_surrounding_whitespace() -> None:
    assert normalize_row_description("  Grocery store  ") == "Grocery store"


def test_normalize_row_description_rejects_blank() -> None:
    with pytest.raises(InvalidCanonicalLineError):
        normalize_row_description("   ")


def test_normalize_row_description_rejects_over_max_length() -> None:
    with pytest.raises(InvalidCanonicalLineError):
        normalize_row_description("x" * 501)


def test_normalize_row_description_measures_length_after_trimming() -> None:
    assert normalize_row_description(" " + "x" * 500 + " ") == "x" * 500


# --- Story 4.12 Task 1.3: landing list selection (AC #6) ---

_LIST_A = UUID("00000000-0000-4000-8000-00000000000a")
_LIST_B = UUID("00000000-0000-4000-8000-00000000000b")
_LIST_C = UUID("00000000-0000-4000-8000-00000000000c")


def _at(minute: int) -> datetime:
    return datetime(2026, 8, 23, 12, minute, tzinfo=UTC)


def test_select_landing_list_id_returns_none_for_no_imported_rows() -> None:
    """A session that imported nothing new — everything deleted, or every row a
    duplicate — has no honest landing target, so the caller stays put rather
    than guessing (AC #6)."""
    assert select_landing_list_id([]) is None


def test_select_landing_list_id_picks_the_list_with_the_most_rows() -> None:
    resolved = [
        (_LIST_A, _at(1)),
        (_LIST_B, _at(2)),
        (_LIST_B, _at(3)),
    ]
    assert select_landing_list_id(resolved) == _LIST_B


def test_select_landing_list_id_breaks_a_count_tie_on_latest_resolution() -> None:
    """Equal counts → the list the user was working in most recently wins;
    that is where they expect to land."""
    resolved = [
        (_LIST_A, _at(1)),
        (_LIST_A, _at(2)),
        (_LIST_B, _at(3)),
        (_LIST_B, _at(9)),
    ]
    assert select_landing_list_id(resolved) == _LIST_B


def test_select_landing_list_id_breaks_a_full_tie_on_lowest_id() -> None:
    """Same count *and* same latest resolution: fall through to the lowest id
    so the answer is deterministic rather than dict-order dependent."""
    resolved = [
        (_LIST_C, _at(5)),
        (_LIST_A, _at(5)),
    ]
    assert select_landing_list_id(resolved) == _LIST_A


def test_select_landing_list_id_is_order_independent() -> None:
    forward = [(_LIST_A, _at(1)), (_LIST_B, _at(2)), (_LIST_B, _at(3))]
    assert select_landing_list_id(forward) == select_landing_list_id(list(reversed(forward)))


def test_select_landing_list_id_single_row_returns_that_list() -> None:
    assert select_landing_list_id([(_LIST_A, _at(1))]) == _LIST_A


# --- Story 4.16 Task 1.2: compute_pdf_content_hash ---


def test_compute_pdf_content_hash_same_bytes_same_hash() -> None:
    content = b"%PDF-1.4\nsome statement bytes"
    assert compute_pdf_content_hash(content) == compute_pdf_content_hash(content)


def test_compute_pdf_content_hash_different_bytes_different_hash() -> None:
    assert compute_pdf_content_hash(b"%PDF-1.4\nfile a") != compute_pdf_content_hash(
        b"%PDF-1.4\nfile b"
    )


def test_compute_pdf_content_hash_is_sha256_hexdigest() -> None:
    import hashlib

    content = b"%PDF-1.4\nsome statement bytes"
    assert compute_pdf_content_hash(content) == hashlib.sha256(content).hexdigest()
    assert len(compute_pdf_content_hash(content)) == 64
