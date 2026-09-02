"""Pure budget name / cap / currency validation + near-cap classification (Story 6.3).

No FastAPI / SQLAlchemy imports (AD-1). Mirrors `domain/cards.py`'s shape.
"""

from __future__ import annotations

import re
from decimal import Decimal
from typing import Literal

from domain.errors import (
    InvalidBudgetCapError,
    InvalidBudgetCurrencyError,
    InvalidBudgetNameError,
)
from domain.line_types import (
    LINE_TYPE_CLASSIFIED_PURCHASE_REVERSAL,
    LINE_TYPE_INTEREST,
    LINE_TYPE_OTHER,
    LINE_TYPE_PAYMENT,
    LINE_TYPE_PURCHASE,
)

BUDGET_NAME_MAX_LENGTH = 100

# Line types a ledger entry may be manually attributed to a budget under —
# broader than settle.INCLUDED_LINE_TYPES (which stays purchase-only for
# member-to-member split math). Budgets track spend, not just shared
# purchases, so interest/other/payment lines are also assignable.
BUDGET_ASSIGNABLE_LINE_TYPES = frozenset(
    {
        LINE_TYPE_PURCHASE,
        LINE_TYPE_CLASSIFIED_PURCHASE_REVERSAL,
        LINE_TYPE_INTEREST,
        LINE_TYPE_OTHER,
        LINE_TYPE_PAYMENT,
    }
)

# v1 FX scope is USD+CRC only (project-context) — a budget in any other
# currency would have no FX story if 6.5 ever needs to reconcile it against
# ledger CRC. Reject anything else here rather than accepting an arbitrary
# ISO 4217 shape match.
SUPPORTED_BUDGET_CURRENCIES = frozenset({"CRC", "USD"})

_CURRENCY_SHAPE = re.compile(r"^[A-Z]{3}$")

# Judgment call, not a spec citation — checked PRD FR-48/FR-49, epics.md
# Stories 6.3/6.4, ARCHITECTURE-SPINE AD-29, and the sprint-change-proposal;
# none define a numeric near-cap threshold, only that "near-cap state is
# visible." 90% of cap is this story's documented design decision so a
# reviewer or Story 6.5 author can change it in one place later.
NEAR_CAP_RATIO = Decimal("0.9")

BudgetState = Literal["ok", "near", "over"]


def validate_budget_name(raw: str) -> str:
    """Trim and validate a user-visible budget name.

    Returns the normalized name. Raises InvalidBudgetNameError when empty
    or whitespace-only after trim, or when longer than BUDGET_NAME_MAX_LENGTH.
    """
    if raw is None:
        raise InvalidBudgetNameError()
    name = raw.strip()
    if not name:
        raise InvalidBudgetNameError()
    if len(name) > BUDGET_NAME_MAX_LENGTH:
        raise InvalidBudgetNameError(
            f"Budget name must be at most {BUDGET_NAME_MAX_LENGTH} characters."
        )
    return name


def _currency_quantum(currency_exponent: int) -> Decimal:
    if currency_exponent < 0:
        raise InvalidBudgetCapError("Currency exponent cannot be negative.")
    return Decimal("1").scaleb(-currency_exponent)


def validate_budget_cap(raw: str, *, currency_exponent: int = 2) -> Decimal:
    """Parse + validate a budget cap. Never uses float() (AD-5)."""
    if raw is None:
        raise InvalidBudgetCapError()
    try:
        amount = Decimal(str(raw))
    except Exception as exc:
        raise InvalidBudgetCapError("Cap must be an exact decimal value.") from exc
    if not amount.is_finite():
        raise InvalidBudgetCapError("Cap must be a finite decimal value.")
    if amount <= 0:
        raise InvalidBudgetCapError("Cap must be greater than zero.")
    quantum = _currency_quantum(currency_exponent)
    try:
        quantized = amount.quantize(quantum)
    except Exception as exc:
        raise InvalidBudgetCapError("Cap must be an exact decimal value.") from exc
    if amount != quantized:
        raise InvalidBudgetCapError("Cap may not exceed the currency minor unit.")
    return amount


def validate_budget_currency(raw: str) -> str:
    """3-letter uppercase ISO 4217 shape check, narrowed to this codebase's v1 FX scope."""
    if raw is None:
        raise InvalidBudgetCurrencyError()
    if not _CURRENCY_SHAPE.match(raw):
        raise InvalidBudgetCurrencyError("Currency must be a 3-letter uppercase code.")
    if raw not in SUPPORTED_BUDGET_CURRENCIES:
        raise InvalidBudgetCurrencyError(f"Currency {raw!r} is not supported.")
    return raw


def classify_budget_state(spent: Decimal, cap: Decimal) -> BudgetState:
    """Pure near-cap classification. `cap` is always > 0 (validated at creation) —
    no zero-division guard here; this function trusts its caller's prior validation."""
    if spent >= cap:
        return "over"
    if spent >= cap * NEAR_CAP_RATIO:
        return "near"
    return "ok"
