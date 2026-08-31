"""Domain unit tests for spend-by-origin aggregation (Story 6.2, FR-47)."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from uuid import UUID, uuid4

from domain.spend_by_origin import OriginSpendGroup, compute_spend_by_origin


@dataclass(frozen=True, slots=True)
class FakeEntry:
    line_type: str
    origin_kind: str | None
    origin_card_id: UUID | None
    amount_crc: Decimal


def test_empty_entries_yield_empty_tuple() -> None:
    assert compute_spend_by_origin([]) == ()


def test_single_card() -> None:
    card_id = uuid4()
    entries = [
        FakeEntry("purchase", "card", card_id, Decimal("100.00")),
        FakeEntry("purchase", "card", card_id, Decimal("50.00")),
    ]

    groups = compute_spend_by_origin(entries)

    assert groups == (OriginSpendGroup(kind="card", card_id=card_id, total_crc=Decimal("150.00")),)


def test_multiple_cards_sorted_descending() -> None:
    card_a = uuid4()
    card_b = uuid4()
    entries = [
        FakeEntry("purchase", "card", card_a, Decimal("50.00")),
        FakeEntry("purchase", "card", card_b, Decimal("200.00")),
    ]

    groups = compute_spend_by_origin(entries)

    assert groups == (
        OriginSpendGroup(kind="card", card_id=card_b, total_crc=Decimal("200.00")),
        OriginSpendGroup(kind="card", card_id=card_a, total_crc=Decimal("50.00")),
    )


def test_cash_origin() -> None:
    entries = [FakeEntry("purchase", "cash", None, Decimal("30.00"))]

    groups = compute_spend_by_origin(entries)

    assert groups == (OriginSpendGroup(kind="cash", card_id=None, total_crc=Decimal("30.00")),)


def test_blank_origin_none_kind() -> None:
    entries = [FakeEntry("purchase", None, None, Decimal("15.00"))]

    groups = compute_spend_by_origin(entries)

    assert groups == (OriginSpendGroup(kind="blank", card_id=None, total_crc=Decimal("15.00")),)


def test_blank_origin_card_kind_without_card_id_never_crashes() -> None:
    entries = [FakeEntry("purchase", "card", None, Decimal("15.00"))]

    groups = compute_spend_by_origin(entries)

    assert groups == (OriginSpendGroup(kind="blank", card_id=None, total_crc=Decimal("15.00")),)


def test_mix_of_all_four_origins_sorted_by_total_descending() -> None:
    card_a = uuid4()
    card_b = uuid4()
    entries = [
        FakeEntry("purchase", "card", card_a, Decimal("10.00")),
        FakeEntry("purchase", "card", card_b, Decimal("40.00")),
        FakeEntry("purchase", "cash", None, Decimal("25.00")),
        FakeEntry("purchase", None, None, Decimal("5.00")),
    ]

    groups = compute_spend_by_origin(entries)

    assert [g.total_crc for g in groups] == [
        Decimal("40.00"),
        Decimal("25.00"),
        Decimal("10.00"),
        Decimal("5.00"),
    ]
    assert groups[0].kind == "card" and groups[0].card_id == card_b
    assert groups[1].kind == "cash"
    assert groups[2].kind == "card" and groups[2].card_id == card_a
    assert groups[3].kind == "blank"


def test_reversal_reduces_card_total() -> None:
    card_id = uuid4()
    entries = [
        FakeEntry("purchase", "card", card_id, Decimal("100.00")),
        FakeEntry("classified_purchase_reversal", "card", card_id, Decimal("-30.00")),
    ]

    groups = compute_spend_by_origin(entries)

    assert groups == (OriginSpendGroup(kind="card", card_id=card_id, total_crc=Decimal("70.00")),)


def test_full_offset_reversal_still_appears_at_zero() -> None:
    card_id = uuid4()
    entries = [
        FakeEntry("purchase", "card", card_id, Decimal("100.00")),
        FakeEntry("classified_purchase_reversal", "card", card_id, Decimal("-100.00")),
    ]

    groups = compute_spend_by_origin(entries)

    assert groups == (OriginSpendGroup(kind="card", card_id=card_id, total_crc=Decimal("0")),)


def test_non_included_line_type_excluded_from_every_total() -> None:
    card_id = uuid4()
    entries = [
        FakeEntry("purchase", "card", card_id, Decimal("100.00")),
        FakeEntry("payment", "card", card_id, Decimal("100.00")),
        FakeEntry("fee", "cash", None, Decimal("5.00")),
    ]

    groups = compute_spend_by_origin(entries)

    assert groups == (OriginSpendGroup(kind="card", card_id=card_id, total_crc=Decimal("100.00")),)


def test_tiebreak_between_equal_totals_is_deterministic() -> None:
    # Explicit UUIDs so ordering is deterministic across runs.
    card_a = UUID("00000000-0000-0000-0000-000000000001")
    card_b = UUID("00000000-0000-0000-0000-000000000002")
    entries = [
        FakeEntry("purchase", "card", card_b, Decimal("50.00")),
        FakeEntry("purchase", "card", card_a, Decimal("50.00")),
    ]

    groups = compute_spend_by_origin(entries)

    assert [g.card_id for g in groups] == [card_a, card_b]
