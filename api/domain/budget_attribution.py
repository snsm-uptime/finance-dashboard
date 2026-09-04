"""Budget attribution — manual assignment + rule matching (Story 6.5, FR-49).

Pure domain logic: no FastAPI / SQLAlchemy (AD-1). Money uses Decimal only.
Attribution is computed at read time: `compute_attributed_entries` scans a
list's ledger entries against a budget's rule texts on every call — there is
no write-path/commit-pipeline change (see story Dev Notes). Filters on
`BUDGET_ASSIGNABLE_LINE_TYPES` from `domain.budgets` — broader than the
purchase/reversal-only filter `domain.settle`/`domain.spend_by_origin` use for
member-to-member split math, since budgets also track interest/other/payment.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Protocol
from uuid import UUID

from domain.budgets import BUDGET_ASSIGNABLE_LINE_TYPES
from domain.errors import InvalidBudgetRuleMatchTextError

BUDGET_RULE_MATCH_TEXT_MAX_LENGTH = 100


def validate_rule_match_text(raw: str) -> str:
    """Trim and validate a rule's match text.

    Returns the normalized text. Raises InvalidBudgetRuleMatchTextError when
    empty or whitespace-only after trim, or when longer than
    BUDGET_RULE_MATCH_TEXT_MAX_LENGTH.
    """
    if raw is None:
        raise InvalidBudgetRuleMatchTextError()
    text = raw.strip()
    if not text:
        raise InvalidBudgetRuleMatchTextError()
    if len(text) > BUDGET_RULE_MATCH_TEXT_MAX_LENGTH:
        raise InvalidBudgetRuleMatchTextError(
            f"Rule text must be at most {BUDGET_RULE_MATCH_TEXT_MAX_LENGTH} characters."
        )
    return text


def matches_rule(normalized_description: str | None, match_text: str) -> bool:
    """Case-insensitive substring match. `match_text` is assumed already
    validated/trimmed by the caller."""
    if normalized_description is None:
        return False
    return match_text.lower() in normalized_description.lower()


class HasAttributionFields(Protocol):
    id: UUID
    normalized_description: str | None
    line_type: str
    posted_date: date
    amount_crc: Decimal
    budget_id: UUID | None


def _newest_first_key(entry: HasAttributionFields) -> tuple[date, str]:
    return (entry.posted_date, str(entry.id))


def compute_attributed_entries(
    entries: list[HasAttributionFields],
    *,
    budget_id: UUID,
    rule_texts: list[str],
    period_start: date | None = None,
    period_end: date | None = None,
) -> tuple[HasAttributionFields, ...]:
    """Entries attributed to `budget_id`, manual assignment or rule match.

    Manual assignment always wins over a rule match: only entries whose
    `budget_id is None` are eligible for rule matching, so a line manually
    assigned elsewhere is never re-captured (AC #6). Filters to
    `line_type in BUDGET_ASSIGNABLE_LINE_TYPES` first (AC #9). Sorted
    newest-first by `(posted_date, id)`.

    `period_start`/`period_end` are an optional inclusive date-range gate
    (Story 7.5, AC #2) — each bound independently optional. Applied at this
    single choke point (not as a pre-filter on `entries`) so `attributed_via`
    semantics stay correct for lines that are in-period-but-rule-matching vs.
    genuinely out-of-period.
    """
    attributed = [
        entry
        for entry in entries
        if entry.line_type in BUDGET_ASSIGNABLE_LINE_TYPES
        and (period_start is None or entry.posted_date >= period_start)
        and (period_end is None or entry.posted_date <= period_end)
        and (
            entry.budget_id == budget_id
            or (
                entry.budget_id is None
                and any(matches_rule(entry.normalized_description, rt) for rt in rule_texts)
            )
        )
    ]
    attributed.sort(key=_newest_first_key, reverse=True)
    return tuple(attributed)


def compute_budget_spent(attributed: tuple[HasAttributionFields, ...]) -> Decimal:
    """Sum `amount_crc` over already-attributed entries. CRC-only gate lives
    in the application layer (AC #8) — this function has one call site there."""
    return sum((e.amount_crc for e in attributed), Decimal("0"))
