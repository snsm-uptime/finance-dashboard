"""Domain unit tests for same-price conflict rules (Story 5.5)."""

from datetime import date
from decimal import Decimal

import pytest
from domain.errors import (
    SamePriceConflictConfirmRequiredError,
    SamePriceConflictInvalidResolutionError,
)
from domain.same_price_conflict import (
    CONFLICT_RESOLUTION_MANUAL_SURVIVOR,
    CONFLICT_RESOLUTION_NOT_SAME_EXPENSE,
    DEFAULT_SAME_PRICE_WINDOW_DAYS,
    is_same_price,
    validate_resolution_confirm,
    within_window,
)


class TestIsSamePrice:
    def test_equal_amount_and_currency_is_same_price(self) -> None:
        assert is_same_price(Decimal("12.34"), "CRC", Decimal("12.34"), "CRC") is True

    def test_equal_amount_different_currency_is_not_same_price(self) -> None:
        assert is_same_price(Decimal("12.34"), "USD", Decimal("12.34"), "CRC") is False

    def test_different_amount_same_currency_is_not_same_price(self) -> None:
        assert is_same_price(Decimal("12.34"), "CRC", Decimal("12.35"), "CRC") is False


class TestWithinWindow:
    def test_exactly_default_window_days_inclusive_is_within(self) -> None:
        parsed = date(2026, 8, 10)
        manual = date(2026, 8, 10 - DEFAULT_SAME_PRICE_WINDOW_DAYS)
        assert within_window(parsed, manual, DEFAULT_SAME_PRICE_WINDOW_DAYS) is True

    def test_exactly_window_days_forward_is_within(self) -> None:
        parsed = date(2026, 8, 10)
        manual = date(2026, 8, 10 + DEFAULT_SAME_PRICE_WINDOW_DAYS)
        assert within_window(parsed, manual, DEFAULT_SAME_PRICE_WINDOW_DAYS) is True

    def test_one_day_beyond_window_is_excluded(self) -> None:
        parsed = date(2026, 8, 10)
        manual = date(2026, 8, 10 - DEFAULT_SAME_PRICE_WINDOW_DAYS - 1)
        assert within_window(parsed, manual, DEFAULT_SAME_PRICE_WINDOW_DAYS) is False

    def test_same_date_is_within(self) -> None:
        d = date(2026, 8, 10)
        assert within_window(d, d, DEFAULT_SAME_PRICE_WINDOW_DAYS) is True


class TestValidateResolutionConfirm:
    def test_not_same_expense_without_confirm_raises(self) -> None:
        with pytest.raises(SamePriceConflictConfirmRequiredError):
            validate_resolution_confirm(CONFLICT_RESOLUTION_NOT_SAME_EXPENSE, confirmed=False)

    def test_not_same_expense_with_confirm_passes(self) -> None:
        validate_resolution_confirm(CONFLICT_RESOLUTION_NOT_SAME_EXPENSE, confirmed=True)

    def test_survivor_resolutions_never_require_confirm(self) -> None:
        validate_resolution_confirm(CONFLICT_RESOLUTION_MANUAL_SURVIVOR, confirmed=False)

    def test_unrecognized_resolution_raises_regardless_of_confirmed(self) -> None:
        with pytest.raises(SamePriceConflictInvalidResolutionError):
            validate_resolution_confirm("bogus", confirmed=True)
