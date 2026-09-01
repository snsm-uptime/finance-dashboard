"""Domain unit tests for budget attribution matching + spend computation (Story 6.5)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from uuid import UUID, uuid4

import pytest
from domain.budget_attribution import (
    BUDGET_RULE_MATCH_TEXT_MAX_LENGTH,
    compute_attributed_entries,
    compute_budget_spent,
    matches_rule,
    validate_rule_match_text,
)
from domain.errors import InvalidBudgetRuleMatchTextError


@dataclass(frozen=True, slots=True)
class FakeEntry:
    id: UUID
    normalized_description: str | None
    line_type: str
    posted_date: date
    amount_crc: Decimal
    budget_id: UUID | None


class TestMatchesRule:
    def test_case_insensitive_substring(self):
        assert matches_rule("SUPER 24 STA ANA", "super") is True

    def test_substring_not_full_match_required(self):
        assert matches_rule("AUTOMERCADO SANTA ANA", "mercado") is True

    def test_no_match(self):
        assert matches_rule("AUTOMERCADO", "walmart") is False

    def test_none_description_never_matches(self):
        assert matches_rule(None, "super") is False


class TestValidateRuleMatchText:
    def test_blank_rejected(self):
        with pytest.raises(InvalidBudgetRuleMatchTextError):
            validate_rule_match_text("")

    def test_whitespace_only_rejected(self):
        with pytest.raises(InvalidBudgetRuleMatchTextError):
            validate_rule_match_text("   ")

    def test_exactly_max_length_accepted(self):
        text = "x" * BUDGET_RULE_MATCH_TEXT_MAX_LENGTH
        assert validate_rule_match_text(text) == text

    def test_over_max_length_rejected(self):
        with pytest.raises(InvalidBudgetRuleMatchTextError):
            validate_rule_match_text("x" * (BUDGET_RULE_MATCH_TEXT_MAX_LENGTH + 1))

    def test_trims(self):
        assert validate_rule_match_text("  super  ") == "super"


class TestComputeAttributedEntries:
    def test_manual_match_only(self):
        budget_id = uuid4()
        entry = FakeEntry(
            uuid4(), "AUTOMERCADO", "purchase", date(2026, 1, 1), Decimal("10"), budget_id
        )

        result = compute_attributed_entries([entry], budget_id=budget_id, rule_texts=[])

        assert result == (entry,)

    def test_rule_match_only(self):
        budget_id = uuid4()
        entry = FakeEntry(uuid4(), "SUPER 24", "purchase", date(2026, 1, 1), Decimal("10"), None)

        result = compute_attributed_entries([entry], budget_id=budget_id, rule_texts=["super"])

        assert result == (entry,)

    def test_manual_assigned_to_another_budget_excluded_even_if_rule_matches(self):
        budget_a = uuid4()
        budget_b = uuid4()
        entry = FakeEntry(
            uuid4(), "SUPER 24", "purchase", date(2026, 1, 1), Decimal("10"), budget_a
        )

        result = compute_attributed_entries([entry], budget_id=budget_b, rule_texts=["super"])

        assert result == ()

    def test_non_included_line_type_excluded_even_with_budget_id_set(self):
        budget_id = uuid4()
        entry = FakeEntry(
            uuid4(), "SUPER 24", "payment", date(2026, 1, 1), Decimal("10"), budget_id
        )

        result = compute_attributed_entries([entry], budget_id=budget_id, rule_texts=["super"])

        assert result == ()

    def test_non_included_line_type_excluded_from_rule_match(self):
        budget_id = uuid4()
        entry = FakeEntry(uuid4(), "SUPER 24", "fee", date(2026, 1, 1), Decimal("10"), None)

        result = compute_attributed_entries([entry], budget_id=budget_id, rule_texts=["super"])

        assert result == ()

    def test_newest_first_ordering(self):
        budget_id = uuid4()
        older = FakeEntry(uuid4(), "x", "purchase", date(2026, 1, 1), Decimal("1"), budget_id)
        newer = FakeEntry(uuid4(), "x", "purchase", date(2026, 2, 1), Decimal("1"), budget_id)

        result = compute_attributed_entries([older, newer], budget_id=budget_id, rule_texts=[])

        assert result == (newer, older)

    def test_unassigned_non_matching_entry_excluded(self):
        budget_id = uuid4()
        entry = FakeEntry(uuid4(), "WALMART", "purchase", date(2026, 1, 1), Decimal("10"), None)

        result = compute_attributed_entries([entry], budget_id=budget_id, rule_texts=["super"])

        assert result == ()


class TestComputeBudgetSpent:
    """compute_budget_spent is currency-agnostic by design — the CRC-only
    gate (AC #8) is a currency check on `BudgetRecord.currency` and lives
    entirely in `application.budgets._compute_spent_and_history`, which
    calls this function only for CRC budgets and returns Decimal("0")
    without calling it at all for USD budgets. There is no currency
    concept at this layer to test; the gate itself is covered by
    `test_usd_budget_stays_zero_regardless_of_assignments_and_rules` in
    `test_budgets_integration.py`."""

    def test_empty_is_zero(self):
        assert compute_budget_spent(()) == Decimal("0")

    def test_sums_amounts(self):
        entries = (
            FakeEntry(uuid4(), "x", "purchase", date(2026, 1, 1), Decimal("10.50"), uuid4()),
            FakeEntry(uuid4(), "x", "purchase", date(2026, 1, 2), Decimal("5.25"), uuid4()),
        )

        assert compute_budget_spent(entries) == Decimal("15.75")
