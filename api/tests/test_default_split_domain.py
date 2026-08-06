"""Domain tests for standing default split + AD-6 allocation (Story 2.5) — TDD."""

from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

import pytest
from domain.default_split import (
    MODE_EVEN,
    MODE_PERCENTAGE,
    allocate_even_shares,
    allocate_percentage_shares,
    even_percentage_shares,
    resolve_effective_default,
    validate_percentage_shares,
)
from domain.errors import InvalidDefaultSplitError


def test_even_shares_one_member_is_100() -> None:
    a = uuid4()
    assert even_percentage_shares([a]) == {a: Decimal("100.00")}


def test_even_shares_two_members_50_50() -> None:
    a, b = uuid4(), uuid4()
    assert even_percentage_shares([a, b]) == {a: Decimal("50.00"), b: Decimal("50.00")}


def test_even_shares_three_members_sum_to_100() -> None:
    a, b, c = uuid4(), uuid4(), uuid4()
    shares = even_percentage_shares([a, b, c])
    assert sum(shares.values(), Decimal("0")) == Decimal("100")
    assert len(shares) == 3


def test_validate_percentage_accepts_exact_100() -> None:
    a, b = uuid4(), uuid4()
    out = validate_percentage_shares([a, b], {a: Decimal("60.00"), b: Decimal("40.00")})
    assert out[a] == Decimal("60.00")
    assert out[b] == Decimal("40.00")


def test_validate_percentage_rejects_under_and_over() -> None:
    a, b = uuid4(), uuid4()
    with pytest.raises(InvalidDefaultSplitError):
        validate_percentage_shares([a, b], {a: "60.00", b: "30.00"})
    with pytest.raises(InvalidDefaultSplitError):
        validate_percentage_shares([a, b], {a: "60.00", b: "50.00"})


def test_validate_percentage_rejects_missing_or_extra_member() -> None:
    a, b, c = uuid4(), uuid4(), uuid4()
    with pytest.raises(InvalidDefaultSplitError):
        validate_percentage_shares([a, b], {a: "100.00"})
    with pytest.raises(InvalidDefaultSplitError):
        validate_percentage_shares([a, b], {a: "50.00", b: "50.00", c: "0.00"})


def test_resolve_falls_back_to_even_when_membership_breaks_percentage() -> None:
    a, b, c = uuid4(), uuid4(), uuid4()
    stored = {a: Decimal("60.00"), b: Decimal("40.00")}
    mode, shares = resolve_effective_default(MODE_PERCENTAGE, stored, [a, b, c])
    assert mode == MODE_EVEN
    assert sum(shares.values(), Decimal("0")) == Decimal("100")
    assert set(shares) == {a, b, c}


def test_resolve_keeps_percentage_when_members_match() -> None:
    a, b = uuid4(), uuid4()
    stored = {a: Decimal("60.00"), b: Decimal("40.00")}
    mode, shares = resolve_effective_default(MODE_PERCENTAGE, stored, [a, b])
    assert mode == MODE_PERCENTAGE
    assert shares == stored


def test_allocate_percentage_remainder_to_creator() -> None:
    creator, m2, m3 = uuid4(), uuid4(), uuid4()
    shares = {
        creator: Decimal("33.33"),
        m2: Decimal("33.33"),
        m3: Decimal("33.34"),
    }
    alloc = allocate_percentage_shares(Decimal("10.00"), shares, creator, currency_exponent=2)
    assert sum(alloc.values(), Decimal("0")) == Decimal("10.00")
    # Floors leave 0.01; AD-6 assigns leftover to creator.
    assert alloc[m2] == Decimal("3.33")
    assert alloc[m3] == Decimal("3.33")
    assert alloc[creator] == Decimal("3.34")


def test_allocate_even_remainder_to_creator() -> None:
    creator, m2, m3 = uuid4(), uuid4(), uuid4()
    alloc = allocate_even_shares(Decimal("100.00"), [creator, m2, m3], creator)
    assert sum(alloc.values(), Decimal("0")) == Decimal("100.00")
    assert alloc[m2] == Decimal("33.33")
    assert alloc[m3] == Decimal("33.33")
    assert alloc[creator] == Decimal("33.34")


def test_allocate_rejects_creator_not_in_map() -> None:
    a, b = uuid4(), uuid4()
    with pytest.raises(InvalidDefaultSplitError):
        allocate_percentage_shares(
            Decimal("10.00"),
            {a: Decimal("50.00"), b: Decimal("50.00")},
            uuid4(),
        )
