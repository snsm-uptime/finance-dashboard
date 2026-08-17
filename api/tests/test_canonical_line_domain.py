"""Domain tests for the adapter contract shape (Story 4.4) — TDD."""

from __future__ import annotations

from decimal import Decimal

import pytest
from domain.canonical_line import (
    REF_QUALITY_ABSENT,
    REF_QUALITY_DERIVED,
    REF_QUALITY_STABLE,
    CanonicalLine,
    compute_canonical_identity,
    normalize_dual_column_amount,
    validate_canonical_line,
)
from domain.errors import InvalidCanonicalLineError
from domain.line_types import (
    LINE_TYPE_FEE,
    LINE_TYPE_PAYMENT,
    LINE_TYPE_PURCHASE,
    LINE_TYPES,
)


def _line(**overrides: object) -> CanonicalLine:
    defaults: dict[str, object] = {
        "posted_date": "2026-01-05",
        "amount": Decimal("100.00"),
        "currency": "CRC",
        "product_id": "bac_credit",
        "line_type": LINE_TYPE_PURCHASE,
        "normalized_description": "SUPERMERCADO",
    }
    defaults.update(overrides)
    return CanonicalLine(**defaults)  # type: ignore[arg-type]


def test_line_types_contains_all_ten_prd_named_types() -> None:
    assert LINE_TYPES == {
        "purchase",
        "payment",
        "interest",
        "fee",
        "voluntary_service",
        "credit_note",
        "installment_schedule",
        "balance_forward",
        "other",
        "classified_purchase_reversal",
    }


@pytest.mark.parametrize("line_type", [LINE_TYPE_PURCHASE, LINE_TYPE_PAYMENT, LINE_TYPE_FEE])
def test_validate_canonical_line_accepts_valid_lines(line_type: str) -> None:
    validate_canonical_line(_line(line_type=line_type))


def test_validate_canonical_line_rejects_unknown_line_type() -> None:
    with pytest.raises(InvalidCanonicalLineError):
        validate_canonical_line(_line(line_type="not_a_real_type"))


def test_validate_canonical_line_rejects_unknown_ref_quality() -> None:
    with pytest.raises(InvalidCanonicalLineError):
        validate_canonical_line(_line(ref_quality="mystery"))


@pytest.mark.parametrize("currency", ["crc", "C", "CRCX", "1RC"])
def test_validate_canonical_line_rejects_malformed_currency(currency: str) -> None:
    with pytest.raises(InvalidCanonicalLineError):
        validate_canonical_line(_line(currency=currency))


# --- Task 2: dual-column amount normalization (AC #4) ---


def test_normalize_dual_column_amount_prefers_nonzero_crc() -> None:
    assert normalize_dual_column_amount(Decimal("100.00"), Decimal("0")) == (
        "CRC",
        Decimal("100.00"),
    )


def test_normalize_dual_column_amount_prefers_nonzero_usd() -> None:
    assert normalize_dual_column_amount(Decimal("0"), Decimal("50.00")) == (
        "USD",
        Decimal("50.00"),
    )


def test_normalize_dual_column_amount_prefers_crc_when_both_nonzero() -> None:
    """Must-cover edge (project-context.md): both nonzero → CRC."""
    assert normalize_dual_column_amount(Decimal("100.00"), Decimal("50.00")) == (
        "CRC",
        Decimal("100.00"),
    )


def test_normalize_dual_column_amount_both_zero_returns_crc_zero() -> None:
    result = normalize_dual_column_amount(Decimal("0"), Decimal("0"))
    assert result == ("CRC", Decimal("0"))
    currency, amount = result
    assert isinstance(amount, Decimal)


def test_normalize_dual_column_amount_never_returns_float() -> None:
    _, amount = normalize_dual_column_amount(Decimal("1.23"), Decimal("4.56"))
    assert isinstance(amount, Decimal)
    assert not isinstance(amount, float)


# --- Task 3: canonical identity computation (AC #5, AD-18) ---


def test_compute_canonical_identity_uses_stable_ref_when_present() -> None:
    line = _line(external_ref="AUTH-123456", ref_quality=REF_QUALITY_STABLE)
    identity = compute_canonical_identity(line, statement_period_id="2026-01")
    assert identity == ("ref", "AUTH-123456")


def test_compute_canonical_identity_stable_ref_independent_of_other_fields() -> None:
    line_a = _line(
        external_ref="AUTH-123456",
        ref_quality=REF_QUALITY_STABLE,
        amount=Decimal("1.00"),
        posted_date="2026-01-01",
    )
    line_b = _line(
        external_ref="AUTH-123456",
        ref_quality=REF_QUALITY_STABLE,
        amount=Decimal("999.99"),
        posted_date="2026-06-30",
    )
    assert compute_canonical_identity(
        line_a, statement_period_id="2026-01"
    ) == compute_canonical_identity(line_b, statement_period_id="2026-06")


@pytest.mark.parametrize("ref_quality", [REF_QUALITY_DERIVED, REF_QUALITY_ABSENT, None])
def test_compute_canonical_identity_falls_back_when_ref_quality_not_stable(
    ref_quality: str | None,
) -> None:
    line = _line(external_ref="AUTH-123456", ref_quality=ref_quality)
    identity = compute_canonical_identity(line, statement_period_id="2026-01")
    assert identity[0] == "fallback"


def test_compute_canonical_identity_falls_back_when_external_ref_missing() -> None:
    line = _line(external_ref=None, ref_quality=REF_QUALITY_STABLE)
    identity = compute_canonical_identity(line, statement_period_id="2026-01")
    assert identity[0] == "fallback"


def test_compute_canonical_identity_fallback_is_deterministic() -> None:
    line_a = _line()
    line_b = _line()
    assert compute_canonical_identity(
        line_a, statement_period_id="2026-01"
    ) == compute_canonical_identity(line_b, statement_period_id="2026-01")


def test_compute_canonical_identity_fallback_differs_on_statement_period() -> None:
    line = _line()
    identity_a = compute_canonical_identity(line, statement_period_id="2026-01")
    identity_b = compute_canonical_identity(line, statement_period_id="2026-02")
    assert identity_a != identity_b
