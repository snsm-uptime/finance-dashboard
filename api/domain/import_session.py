"""Import Session / Statement pure rules (Story 4.6, AC #1/#2/#3/#4).

Pure domain: no FastAPI / SQLAlchemy / pdfplumber imports (AD-1).
"""

from __future__ import annotations

from collections.abc import Sequence
from decimal import Decimal

from domain.errors import (
    ImportSessionAlreadyCommittedError,
    ImportSessionDiscardedError,
    ImportStatementNotAvailableError,
    InvalidCanonicalLineError,
    NoCleanStatementsToCommitError,
    UnsupportedFileTypeError,
)
from domain.expenses import AMOUNT_MAX, CRC_AMOUNT_QUANTUM, DESCRIPTION_MAX_LENGTH

PDF_MAGIC_HEADER = b"%PDF-"

STATEMENT_STATUS_STAGED = "staged"
STATEMENT_STATUS_FAILED = "failed"
STATEMENT_STATUS_COMMITTED = "committed"
STATEMENT_STATUS_SKIPPED = "skipped"
STATEMENT_STATUSES = frozenset(
    {
        STATEMENT_STATUS_STAGED,
        STATEMENT_STATUS_FAILED,
        STATEMENT_STATUS_COMMITTED,
        STATEMENT_STATUS_SKIPPED,
    }
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


def validate_individual_accept_eligible(
    *, discarded_at: object | None, statement_status: str
) -> None:
    """Per-statement accept gate (Story 4.8, AC #6). Unlike Bulk's
    session-wide `validate_bulk_commit_eligible`, Individual review commits
    one statement at a time — possibly to different lists — so eligibility
    is checked per statement, not per session. Only a `staged` (clean-parse)
    statement is acceptable: `failed` has no comparison UI yet (Epic 5),
    `committed`/`skipped` are already resolved.
    """
    if discarded_at is not None:
        raise ImportSessionDiscardedError()
    if statement_status != STATEMENT_STATUS_STAGED:
        raise ImportStatementNotAvailableError()


def validate_individual_skip_eligible(
    *, discarded_at: object | None, statement_status: str
) -> None:
    """Per-statement skip gate (Story 4.8, FR-18). A `failed` statement CAN
    be skipped — that's how review moves past it until Epic 5's comparison
    UI exists. `committed`/already-`skipped` cannot be skipped again."""
    if discarded_at is not None:
        raise ImportSessionDiscardedError()
    if statement_status not in (STATEMENT_STATUS_STAGED, STATEMENT_STATUS_FAILED):
        raise ImportStatementNotAvailableError()


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


_PDF_RETAIN_STATUSES = frozenset({STATEMENT_STATUS_STAGED, STATEMENT_STATUS_FAILED})


def session_needs_source_pdf(statement_statuses: Sequence[str]) -> bool:
    """True while review/comparison still needs the uploaded PDF (AD-3).

    Retain for staged (still reviewing) or failed (Epic 5 comparison).
    Committed and skipped statements are done — the ledger (or skip) is
    the source of truth, so the file can go.
    """
    return any(status in _PDF_RETAIN_STATUSES for status in statement_statuses)
