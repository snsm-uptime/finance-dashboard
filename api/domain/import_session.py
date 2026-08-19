"""Import Session / Statement pure rules (Story 4.6, AC #1/#2/#3/#4).

Pure domain: no FastAPI / SQLAlchemy / pdfplumber imports (AD-1).
"""

from __future__ import annotations

from collections.abc import Sequence
from decimal import Decimal

from domain.errors import (
    ImportSessionAlreadyCommittedError,
    ImportSessionDiscardedError,
    InvalidCanonicalLineError,
    NoCleanStatementsToCommitError,
    UnsupportedFileTypeError,
)
from domain.expenses import AMOUNT_MAX, CRC_AMOUNT_QUANTUM, DESCRIPTION_MAX_LENGTH

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


def validate_bulk_candidate_row(*, amount: Decimal, normalized_description: str) -> None:
    """Money/data-integrity gate for a Bulk-committed candidate row (Story
    4.7 review finding).

    Bulk-imported rows reuse `ManualExpenseDraft` (Story 3.2's shape) but
    build it directly from adapter-emitted `CanonicalLine` fields, bypassing
    `validate_manual_expense`'s checks. Unlike a hand expense, a statement
    row is legitimately negative (`payment`/`credit_note` line types credit
    the balance) or zero (`MaterializeFxService` already treats zero-amount
    lines as a documented pass-through) — so this only bounds magnitude and
    decimal precision, plus the description-length invariant, both of which
    Story 3.2 established for the same `ledger_entries` table.
    """
    if not amount.is_finite() or abs(amount) > AMOUNT_MAX:
        raise InvalidCanonicalLineError(f"Statement row amount out of bounds: {amount!r}.")
    if amount.quantize(CRC_AMOUNT_QUANTUM) != amount:
        raise InvalidCanonicalLineError(
            f"Statement row amount must have at most two decimal places: {amount!r}."
        )
    if not normalized_description.strip():
        raise InvalidCanonicalLineError("Statement row description is empty.")
    if len(normalized_description) > DESCRIPTION_MAX_LENGTH:
        raise InvalidCanonicalLineError(
            f"Statement row description exceeds {DESCRIPTION_MAX_LENGTH} characters."
        )
