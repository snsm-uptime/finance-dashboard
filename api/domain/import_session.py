"""Import Session / Statement pure rules (Story 4.6, AC #1/#2/#3/#4).

Pure domain: no FastAPI / SQLAlchemy / pdfplumber imports (AD-1).
"""

from __future__ import annotations

import hashlib
from collections.abc import Sequence
from datetime import datetime
from decimal import Decimal
from uuid import UUID

from domain.errors import (
    ImportSessionDiscardedError,
    ImportStatementNotFailedError,
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

ROW_STATUS_PENDING = "pending"
ROW_STATUS_COMMITTED = "committed"
ROW_STATUS_DELETED = "deleted"
ROW_STATUS_EXCLUDED_ZERO_AMOUNT = "excluded_zero_amount"
ROW_STATUSES = frozenset(
    {
        ROW_STATUS_PENDING,
        ROW_STATUS_COMMITTED,
        ROW_STATUS_DELETED,
        ROW_STATUS_EXCLUDED_ZERO_AMOUNT,
    }
)

UNDO_ACTION_ASSIGN = "assign"
UNDO_ACTION_DELETE = "delete"
UNDO_ACTIONS = frozenset({UNDO_ACTION_ASSIGN, UNDO_ACTION_DELETE})


def row_is_zero_amount(amount: Decimal) -> bool:
    """Exact zero only — negative payment/credit lines stay reviewable (AC #7)."""
    return amount == 0


def statement_is_fully_resolved(row_statuses: Sequence[str]) -> bool:
    """True iff every non-excluded row has left pending (AC #8).

    Excluded (zero-amount) rows are dropped from consideration entirely
    rather than being treated as "resolved" — that is what AC #8's "excluded
    rows must not block resolution" actually means, and stating it this way
    keeps the rule meaningful instead of collapsing into `all(s != pending)`.

    Vacuous true when every row is excluded (all-zero statement) or the
    sequence is empty.
    """
    reviewable = [status for status in row_statuses if status != ROW_STATUS_EXCLUDED_ZERO_AMOUNT]
    return all(status != ROW_STATUS_PENDING for status in reviewable)


def statement_has_pending_rows(row_statuses: Sequence[str]) -> bool:
    """Mirror of `statement_is_fully_resolved`, used to re-open a statement
    whose rows returned to pending (undo)."""
    return any(status == ROW_STATUS_PENDING for status in row_statuses)


def normalize_row_description(description: str) -> str:
    """Trim and bound a user-supplied row description edit.

    Description-only: amount bounds belong to `validate_bulk_candidate_row`
    and are not in play when only the text changes.
    """
    trimmed = description.strip()
    if not trimmed:
        raise InvalidCanonicalLineError("Statement row description is empty.")
    if len(trimmed) > DESCRIPTION_MAX_LENGTH:
        raise InvalidCanonicalLineError(
            f"Statement row description exceeds {DESCRIPTION_MAX_LENGTH} characters."
        )
    return trimmed


def validate_pdf_upload(filename: str, content: bytes) -> None:
    """Guard an upload is actually a PDF before it touches storage or the pipeline.

    Content-based only — filename and client-supplied Content-Type are both
    spoofable, so neither is trusted here (Task 1.1).
    """
    if not content.startswith(PDF_MAGIC_HEADER):
        raise UnsupportedFileTypeError()


def compute_pdf_content_hash(content: bytes) -> str:
    """SHA-256 of the raw uploaded bytes (Story 4.16, AC #4).

    Exact bytes only — never filename, mtime, or parsed content. Two
    different exports of "the same" statement hash differently; that is a
    4.12 commit-time identity concern, not this one.
    """
    return hashlib.sha256(content).hexdigest()


def validate_bulk_commit_eligible(
    *, discarded_at: object | None, statement_statuses: Sequence[str]
) -> None:
    """Pure Bulk-assignment gate (Story 4.7, amended Story 4.10 / AD-4).

    Confirms the session is available (not discarded) and has at least one
    staged statement to commit. A sibling already `committed` (e.g. an
    all-zero statement flipped at create time) does not block Bulk —
    mixed row status on a statement being committed is ImportRowNotAvailableError
    in the service/repo, not this function.
    """
    if discarded_at is not None:
        raise ImportSessionDiscardedError()
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


def select_landing_list_id(resolved: Sequence[tuple[UUID, datetime]]) -> UUID | None:
    """Which list the user should land on when the session completes (Story
    4.12, AC #6).

    Input is one `(list_id, resolved_at)` pair per **newly imported** ledger
    row — duplicates and deletes are excluded by the caller, because landing
    on a list this session did not actually add anything to would be a lie.

    Ordering: most rows wins; a count tie goes to the list whose most recent
    row resolved latest (that is where the user was last working); a full tie
    goes to the lowest id so the answer is deterministic rather than
    dict-order dependent.

    Empty input → None. A session that imported nothing new has no honest
    landing target and the caller stays put rather than guessing.
    """
    counts: dict[UUID, int] = {}
    latest: dict[UUID, datetime] = {}
    for list_id, resolved_at in resolved:
        counts[list_id] = counts.get(list_id, 0) + 1
        known = latest.get(list_id)
        if known is None or resolved_at > known:
            latest[list_id] = resolved_at
    if not counts:
        return None
    # Two directions in one ordering (count/recency descending, id ascending),
    # so pick the winning (count, recency) pair first and break the remaining
    # tie on the id — rather than fabricating a negatable form of a datetime.
    best = max((counts[list_id], latest[list_id]) for list_id in counts)
    return min(list_id for list_id in counts if (counts[list_id], latest[list_id]) == best)


_PDF_RETAIN_STATUSES = frozenset({STATEMENT_STATUS_STAGED, STATEMENT_STATUS_FAILED})


def session_needs_source_pdf(statement_statuses: Sequence[str]) -> bool:
    """True while review/comparison still needs the uploaded PDF (AD-3).

    Retain for staged (still reviewing) or failed (Epic 5 comparison).
    Committed and skipped statements are done — the ledger (or skip) is
    the source of truth, so the file can go.
    """
    return any(status in _PDF_RETAIN_STATUSES for status in statement_statuses)


def retained_source_pdf_paths(statements: Sequence[tuple[str, str | None]]) -> frozenset[str]:
    """Paths still needed by staged or failed statements (AD-3 refcount)."""
    return frozenset(path for status, path in statements if status in _PDF_RETAIN_STATUSES and path)


def next_status_after_dismiss_failed(status: str) -> str:
    """Durable skip of a parse-failed statement (Story 5.2). Idempotent on skipped."""
    if status == STATEMENT_STATUS_SKIPPED:
        return STATEMENT_STATUS_SKIPPED
    if status != STATEMENT_STATUS_FAILED:
        raise ImportStatementNotFailedError()
    return STATEMENT_STATUS_SKIPPED
