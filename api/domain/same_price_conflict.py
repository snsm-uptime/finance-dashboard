"""Same-price conflict domain rules (Story 5.5, AD-10) — pure, no I/O (AD-1)."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from domain.errors import (
    SamePriceConflictConfirmRequiredError,
    SamePriceConflictInvalidResolutionError,
)

DEFAULT_SAME_PRICE_WINDOW_DAYS = 3

CONFLICT_RESOLUTION_MANUAL_SURVIVOR = "manual_survivor"
CONFLICT_RESOLUTION_PARSED_SURVIVOR = "parsed_survivor"
CONFLICT_RESOLUTION_NOT_SAME_EXPENSE = "not_same_expense"

VALID_RESOLUTIONS = frozenset(
    {
        CONFLICT_RESOLUTION_MANUAL_SURVIVOR,
        CONFLICT_RESOLUTION_PARSED_SURVIVOR,
        CONFLICT_RESOLUTION_NOT_SAME_EXPENSE,
    }
)


def is_same_price(
    a_amount: Decimal, a_currency: str, b_amount: Decimal, b_currency: str
) -> bool:
    """Exact equality, no tolerance (AC #2) — amount AND currency must match."""
    return a_amount == b_amount and a_currency == b_currency


def within_window(
    parsed_posted_date: date, manual_posted_date: date, window_days: int
) -> bool:
    """Inclusive both directions (±window_days), calendar dates already
    normalized to America/Costa_Rica by the caller — no timezone math here."""
    delta_days = abs((parsed_posted_date - manual_posted_date).days)
    return delta_days <= window_days


def validate_resolution_confirm(resolution: str, *, confirmed: bool) -> None:
    """The "harder confirm" of AC #6 — `not_same_expense` requires an
    explicit `confirmed=True` from the caller. Raise otherwise so the API
    can't be called with the escape path defaulted true. Also rejects any
    value outside the three known constants — an unrecognized resolution
    must not silently resolve a conflict with nothing deleted and no
    confirm required."""
    if resolution not in VALID_RESOLUTIONS:
        raise SamePriceConflictInvalidResolutionError()
    if resolution == CONFLICT_RESOLUTION_NOT_SAME_EXPENSE and not confirmed:
        raise SamePriceConflictConfirmRequiredError()
