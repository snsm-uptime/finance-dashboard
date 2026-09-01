"""Unit tests for budget name/cap/currency validation + near-cap classification (Story 6.3)."""

from decimal import Decimal

import pytest
from domain.budgets import (
    NEAR_CAP_RATIO,
    classify_budget_state,
    validate_budget_cap,
    validate_budget_currency,
    validate_budget_name,
)
from domain.errors import (
    InvalidBudgetCapError,
    InvalidBudgetCurrencyError,
    InvalidBudgetNameError,
)


class TestValidateBudgetName:
    def test_blank_rejected(self):
        with pytest.raises(InvalidBudgetNameError):
            validate_budget_name("")

    def test_whitespace_only_rejected(self):
        with pytest.raises(InvalidBudgetNameError):
            validate_budget_name("   ")

    def test_over_length_rejected(self):
        with pytest.raises(InvalidBudgetNameError):
            validate_budget_name("x" * 101)

    def test_trims_and_accepts(self):
        assert validate_budget_name("  Groceries  ") == "Groceries"


class TestValidateBudgetCap:
    def test_zero_rejected(self):
        with pytest.raises(InvalidBudgetCapError):
            validate_budget_cap("0")

    def test_negative_rejected(self):
        with pytest.raises(InvalidBudgetCapError):
            validate_budget_cap("-10")

    def test_non_numeric_rejected(self):
        with pytest.raises(InvalidBudgetCapError):
            validate_budget_cap("not-a-number")

    def test_too_many_decimals_for_exponent_2_rejected(self):
        with pytest.raises(InvalidBudgetCapError):
            validate_budget_cap("10.999", currency_exponent=2)

    def test_two_decimals_for_exponent_2_accepted(self):
        assert validate_budget_cap("10.99", currency_exponent=2) == Decimal("10.99")

    def test_returns_decimal_never_float(self):
        result = validate_budget_cap("100")
        assert isinstance(result, Decimal)


class TestValidateBudgetCurrency:
    def test_lowercase_rejected_no_case_folding(self):
        with pytest.raises(InvalidBudgetCurrencyError):
            validate_budget_currency("usd")

    def test_unsupported_currency_rejected(self):
        with pytest.raises(InvalidBudgetCurrencyError):
            validate_budget_currency("EUR")

    def test_crc_accepted(self):
        assert validate_budget_currency("CRC") == "CRC"

    def test_usd_accepted(self):
        assert validate_budget_currency("USD") == "USD"


class TestClassifyBudgetState:
    def test_zero_spent_is_ok(self):
        assert classify_budget_state(Decimal("0"), Decimal("100")) == "ok"

    def test_just_under_near_threshold_is_ok(self):
        cap = Decimal("100")
        threshold = cap * NEAR_CAP_RATIO
        assert classify_budget_state(threshold - Decimal("0.01"), cap) == "ok"

    def test_at_near_threshold_is_near_boundary_inclusive(self):
        cap = Decimal("100")
        threshold = cap * NEAR_CAP_RATIO
        assert classify_budget_state(threshold, cap) == "near"

    def test_between_near_threshold_and_cap_is_near(self):
        cap = Decimal("100")
        assert classify_budget_state(Decimal("95"), cap) == "near"

    def test_at_cap_is_over(self):
        cap = Decimal("100")
        assert classify_budget_state(cap, cap) == "over"

    def test_over_cap_is_over(self):
        cap = Decimal("100")
        assert classify_budget_state(Decimal("150"), cap) == "over"
