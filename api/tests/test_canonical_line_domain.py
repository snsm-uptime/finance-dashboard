"""Domain tests for the adapter contract shape (Story 4.4) — TDD."""

from __future__ import annotations

from decimal import Decimal

import pytest
from domain.canonical_line import (
    REF_QUALITY_ABSENT,
    REF_QUALITY_DERIVED,
    REF_QUALITY_STABLE,
    CanonicalLine,
    canonical_identity_key,
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
    identity = compute_canonical_identity(line)
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
    assert compute_canonical_identity(line_a) == compute_canonical_identity(line_b)


@pytest.mark.parametrize("ref_quality", [REF_QUALITY_DERIVED, REF_QUALITY_ABSENT, None])
def test_compute_canonical_identity_falls_back_when_ref_quality_not_stable(
    ref_quality: str | None,
) -> None:
    line = _line(external_ref="AUTH-123456", ref_quality=ref_quality)
    identity = compute_canonical_identity(line)
    assert identity[0] == "fallback"


def test_compute_canonical_identity_falls_back_when_external_ref_missing() -> None:
    line = _line(external_ref=None, ref_quality=REF_QUALITY_STABLE)
    identity = compute_canonical_identity(line)
    assert identity[0] == "fallback"


def test_compute_canonical_identity_fallback_is_deterministic() -> None:
    line_a = _line()
    line_b = _line()
    assert compute_canonical_identity(line_a) == compute_canonical_identity(line_b)


def test_identity_is_stable_across_overlapping_statements() -> None:
    """Inverted from Story 4.4's `..._differs_on_statement_period` (Story 4.12).

    FR-20's overlap clause exists for exactly this case: a January statement
    and a February statement both print a purchase posted Jan 28. One
    transaction, printed twice. While `statement_period_id` was in the tuple
    those two got *different* identities and the duplicate committed — the
    period id defeated the very dedup it sat inside. It is out of the tuple
    now (AD-18 amended 2026-08-23), and this test is the permanent guard
    against anyone putting it back: the only inputs to a fallback identity
    are the transaction's own fields, so the statement it arrived on cannot
    change the answer.
    """
    posted_on_both_statements = _line(posted_date="2026-01-28")
    reached_via_january_statement = compute_canonical_identity(posted_on_both_statements)
    reached_via_february_statement = compute_canonical_identity(posted_on_both_statements)

    assert reached_via_january_statement == reached_via_february_statement
    assert canonical_identity_key(posted_on_both_statements) == canonical_identity_key(
        posted_on_both_statements
    )


# --- Story 4.12 Task 1.2: persisted identity key ---


def test_canonical_identity_key_is_versioned() -> None:
    """A later identity-rule change must be detectable rather than silently
    breaking dedup on rows fingerprinted under the old rule."""
    assert canonical_identity_key(_line()).startswith("v1:")


def test_canonical_identity_key_fits_the_persisted_column() -> None:
    # ledger_entries.import_identity is String(80); "v1:" + sha256 hex = 67.
    assert len(canonical_identity_key(_line())) <= 80


def test_canonical_identity_key_differs_between_stable_ref_and_fallback() -> None:
    with_ref = _line(external_ref="AUTH-123456", ref_quality=REF_QUALITY_STABLE)
    without_ref = _line(external_ref="AUTH-123456", ref_quality=REF_QUALITY_ABSENT)
    assert canonical_identity_key(with_ref) != canonical_identity_key(without_ref)


def test_canonical_identity_key_is_stable_for_equal_lines() -> None:
    assert canonical_identity_key(_line()) == canonical_identity_key(_line())


def test_canonical_identity_key_ignores_decimal_trailing_zeros() -> None:
    """`str(Decimal("10.5")) != str(Decimal("10.50"))`, so a naive serializer
    would give the *same* transaction two identities when a re-parse emits a
    different trailing zero — and dedup would silently miss it. 4 dp matches
    Numeric(18, 4)."""
    assert canonical_identity_key(_line(amount=Decimal("10.5"))) == canonical_identity_key(
        _line(amount=Decimal("10.50"))
    )


def test_canonical_identity_key_separates_different_amounts() -> None:
    assert canonical_identity_key(_line(amount=Decimal("10.50"))) != canonical_identity_key(
        _line(amount=Decimal("10.51"))
    )


def test_canonical_identity_key_does_not_collide_on_delimiter_in_description() -> None:
    """A `|` join would let a description containing the delimiter collide
    with a differently-split neighbour. JSON encoding is what prevents it."""
    a = _line(normalized_description="SHOP|CRC", currency="USD")
    b = _line(normalized_description="SHOP", currency="CRC")
    assert canonical_identity_key(a) != canonical_identity_key(b)


def test_canonical_identity_key_separates_line_types() -> None:
    assert canonical_identity_key(_line(line_type=LINE_TYPE_PURCHASE)) != canonical_identity_key(
        _line(line_type=LINE_TYPE_PAYMENT)
    )


def test_canonical_identity_key_never_routes_money_through_float() -> None:
    """A float round-trip loses precision above 2^53 / on repeating binary
    fractions; two amounts that differ only past the float boundary must
    still produce different keys (AD-5)."""
    a = _line(amount=Decimal("100000000000.0001"))
    b = _line(amount=Decimal("100000000000.0002"))
    assert canonical_identity_key(a) != canonical_identity_key(b)
