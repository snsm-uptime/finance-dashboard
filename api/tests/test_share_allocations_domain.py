"""Domain TDD for item/receipt share allocations (Story 2.6) — AD-15 red→green."""

from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

import pytest
from domain.default_split import MODE_EVEN, MODE_PERCENTAGE
from domain.errors import InvalidSplitOverrideError
from domain.splits import (
    KIND_ABSOLUTE_AMOUNTS,
    KIND_PERCENTAGE,
    KIND_WHOLE_ASSIGNEE,
    RESOLVED_ITEM,
    RESOLVED_LIST_DEFAULT,
    RESOLVED_RECEIPT,
    SplitSpec,
    allocate_from_spec,
    compute_share_allocations,
    parse_split_spec,
    resolve_override_source,
)


def test_no_override_uses_even_list_default() -> None:
    creator, a, b = uuid4(), uuid4(), uuid4()
    result = compute_share_allocations(
        Decimal("100.00"),
        "CRC",
        item_override=None,
        receipt_override=None,
        list_default_mode=MODE_EVEN,
        list_default_shares=None,
        member_ids=[creator, a, b],
        creator_user_id=creator,
    )
    assert result.resolved_from == RESOLVED_LIST_DEFAULT
    amounts = {row.member_id: row.amount for row in result.allocations}
    assert sum(amounts.values(), Decimal("0")) == Decimal("100.00")
    assert amounts[creator] == Decimal("33.34")
    assert amounts[a] == Decimal("33.33")
    assert amounts[b] == Decimal("33.33")


def test_no_override_uses_standing_percentage_list_default() -> None:
    creator, a = uuid4(), uuid4()
    result = compute_share_allocations(
        Decimal("10.00"),
        "USD",
        item_override=None,
        receipt_override=None,
        list_default_mode=MODE_PERCENTAGE,
        list_default_shares={creator: Decimal("60.00"), a: Decimal("40.00")},
        member_ids=[creator, a],
        creator_user_id=creator,
    )
    assert result.resolved_from == RESOLVED_LIST_DEFAULT
    amounts = {row.member_id: row.amount for row in result.allocations}
    assert amounts[creator] == Decimal("6.00")
    assert amounts[a] == Decimal("4.00")


def test_whole_assignee_gives_100_percent() -> None:
    creator, a = uuid4(), uuid4()
    spec = SplitSpec(kind=KIND_WHOLE_ASSIGNEE, assignee_id=a)
    alloc = allocate_from_spec(
        Decimal("42.50"),
        "CRC",
        spec,
        member_ids=[creator, a],
        creator_user_id=creator,
    )
    amounts = {row.member_id: row.amount for row in alloc}
    assert amounts[a] == Decimal("42.50")
    assert amounts[creator] == Decimal("0.00")


def test_absolute_amounts_accepted_when_sum_equals_total() -> None:
    creator, a = uuid4(), uuid4()
    spec = SplitSpec(
        kind=KIND_ABSOLUTE_AMOUNTS,
        amounts={creator: Decimal("7.25"), a: Decimal("2.75")},
    )
    alloc = allocate_from_spec(
        Decimal("10.00"),
        "CRC",
        spec,
        member_ids=[creator, a],
        creator_user_id=creator,
    )
    amounts = {row.member_id: row.amount for row in alloc}
    assert amounts == {creator: Decimal("7.25"), a: Decimal("2.75")}


def test_absolute_amounts_reject_sum_mismatch() -> None:
    creator, a = uuid4(), uuid4()
    with pytest.raises(InvalidSplitOverrideError):
        allocate_from_spec(
            Decimal("10.00"),
            "CRC",
            SplitSpec(
                kind=KIND_ABSOLUTE_AMOUNTS,
                amounts={creator: Decimal("6.00"), a: Decimal("3.00")},
            ),
            member_ids=[creator, a],
            creator_user_id=creator,
        )


def test_percentage_override_uses_shared_ad6_helper() -> None:
    creator, m2, m3 = uuid4(), uuid4(), uuid4()
    spec = SplitSpec(
        kind=KIND_PERCENTAGE,
        percentages={
            creator: Decimal("33.33"),
            m2: Decimal("33.33"),
            m3: Decimal("33.34"),
        },
    )
    alloc = allocate_from_spec(
        Decimal("10.00"),
        "CRC",
        spec,
        member_ids=[creator, m2, m3],
        creator_user_id=creator,
    )
    amounts = {row.member_id: row.amount for row in alloc}
    assert sum(amounts.values(), Decimal("0")) == Decimal("10.00")
    assert amounts[m2] == Decimal("3.33")
    assert amounts[m3] == Decimal("3.33")
    assert amounts[creator] == Decimal("3.34")


def test_percentage_override_rejects_not_100() -> None:
    creator, a = uuid4(), uuid4()
    with pytest.raises(InvalidSplitOverrideError):
        parse_split_spec(
            kind=KIND_PERCENTAGE,
            percentages={creator: "60.00", a: "30.00"},
            member_ids=[creator, a],
        )


def test_resolution_order_item_over_receipt_over_list_default() -> None:
    creator, a = uuid4(), uuid4()
    item = SplitSpec(kind=KIND_WHOLE_ASSIGNEE, assignee_id=a)
    receipt = SplitSpec(
        kind=KIND_ABSOLUTE_AMOUNTS,
        amounts={creator: Decimal("1.00"), a: Decimal("9.00")},
    )
    source, spec = resolve_override_source(item_override=item, receipt_override=receipt)
    assert source == RESOLVED_ITEM
    assert spec == item

    source, spec = resolve_override_source(item_override=None, receipt_override=receipt)
    assert source == RESOLVED_RECEIPT
    assert spec == receipt

    source, spec = resolve_override_source(item_override=None, receipt_override=None)
    assert source == RESOLVED_LIST_DEFAULT
    assert spec is None


def test_item_override_wins_when_computing_allocations() -> None:
    creator, a = uuid4(), uuid4()
    result = compute_share_allocations(
        Decimal("10.00"),
        "CRC",
        item_override=SplitSpec(kind=KIND_WHOLE_ASSIGNEE, assignee_id=a),
        receipt_override=SplitSpec(
            kind=KIND_ABSOLUTE_AMOUNTS,
            amounts={creator: Decimal("9.00"), a: Decimal("1.00")},
        ),
        list_default_mode=MODE_EVEN,
        list_default_shares=None,
        member_ids=[creator, a],
        creator_user_id=creator,
    )
    assert result.resolved_from == RESOLVED_ITEM
    amounts = {row.member_id: row.amount for row in result.allocations}
    assert amounts[a] == Decimal("10.00")
    assert amounts[creator] == Decimal("0.00")


def test_receipt_override_used_when_no_item_override() -> None:
    creator, a = uuid4(), uuid4()
    result = compute_share_allocations(
        Decimal("10.00"),
        "CRC",
        item_override=None,
        receipt_override=SplitSpec(kind=KIND_WHOLE_ASSIGNEE, assignee_id=creator),
        list_default_mode=MODE_EVEN,
        list_default_shares=None,
        member_ids=[creator, a],
        creator_user_id=creator,
    )
    assert result.resolved_from == RESOLVED_RECEIPT
    amounts = {row.member_id: row.amount for row in result.allocations}
    assert amounts[creator] == Decimal("10.00")


def test_rejects_empty_members_creator_missing_and_non_positive_total() -> None:
    creator, a = uuid4(), uuid4()
    with pytest.raises(InvalidSplitOverrideError):
        compute_share_allocations(
            Decimal("10.00"),
            "CRC",
            item_override=None,
            receipt_override=None,
            list_default_mode=MODE_EVEN,
            list_default_shares=None,
            member_ids=[],
            creator_user_id=creator,
        )
    with pytest.raises(InvalidSplitOverrideError):
        compute_share_allocations(
            Decimal("10.00"),
            "CRC",
            item_override=None,
            receipt_override=None,
            list_default_mode=MODE_EVEN,
            list_default_shares=None,
            member_ids=[a],
            creator_user_id=creator,
        )
    with pytest.raises(InvalidSplitOverrideError):
        compute_share_allocations(
            Decimal("0.00"),
            "CRC",
            item_override=None,
            receipt_override=None,
            list_default_mode=MODE_EVEN,
            list_default_shares=None,
            member_ids=[creator],
            creator_user_id=creator,
        )
    with pytest.raises(InvalidSplitOverrideError):
        compute_share_allocations(
            Decimal("-1.00"),
            "CRC",
            item_override=None,
            receipt_override=None,
            list_default_mode=MODE_EVEN,
            list_default_shares=None,
            member_ids=[creator],
            creator_user_id=creator,
        )


def test_whole_assignee_must_be_current_member() -> None:
    creator, outsider = uuid4(), uuid4()
    with pytest.raises(InvalidSplitOverrideError):
        parse_split_spec(
            kind=KIND_WHOLE_ASSIGNEE,
            assignee_id=outsider,
            member_ids=[creator],
        )


def test_stale_override_rejects_when_membership_diverges() -> None:
    creator, a, b = uuid4(), uuid4(), uuid4()
    with pytest.raises(InvalidSplitOverrideError):
        allocate_from_spec(
            Decimal("10.00"),
            "CRC",
            SplitSpec(kind=KIND_WHOLE_ASSIGNEE, assignee_id=a),
            member_ids=[creator, b],
            creator_user_id=creator,
        )
    with pytest.raises(InvalidSplitOverrideError):
        allocate_from_spec(
            Decimal("10.00"),
            "CRC",
            SplitSpec(
                kind=KIND_ABSOLUTE_AMOUNTS,
                amounts={creator: Decimal("6.00"), a: Decimal("4.00")},
            ),
            member_ids=[creator, b],
            creator_user_id=creator,
        )
    with pytest.raises(InvalidSplitOverrideError):
        allocate_from_spec(
            Decimal("10.00"),
            "CRC",
            SplitSpec(
                kind=KIND_PERCENTAGE,
                percentages={creator: Decimal("60.00"), a: Decimal("40.00")},
            ),
            member_ids=[creator, a, b],
            creator_user_id=creator,
        )


def test_absolute_rejects_sub_minor_unit_precision() -> None:
    creator, a = uuid4(), uuid4()
    with pytest.raises(InvalidSplitOverrideError):
        parse_split_spec(
            kind=KIND_ABSOLUTE_AMOUNTS,
            amounts={creator: "5.005", a: "4.995"},
            member_ids=[creator, a],
        )


def test_non_finite_decimal_rejected() -> None:
    creator, a = uuid4(), uuid4()
    with pytest.raises(InvalidSplitOverrideError):
        parse_split_spec(
            kind=KIND_PERCENTAGE,
            percentages={creator: "NaN", a: "NaN"},
            member_ids=[creator, a],
        )


def test_n_member_list_never_hardcodes_two_party() -> None:
    creator = uuid4()
    others = [uuid4() for _ in range(4)]
    members = [creator, *others]
    result = compute_share_allocations(
        Decimal("100.00"),
        "CRC",
        item_override=None,
        receipt_override=None,
        list_default_mode=MODE_EVEN,
        list_default_shares=None,
        member_ids=members,
        creator_user_id=creator,
    )
    amounts = {row.member_id: row.amount for row in result.allocations}
    assert len(amounts) == 5
    assert sum(amounts.values(), Decimal("0")) == Decimal("100.00")
