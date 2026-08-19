"""Domain tests for the per-expense viewer lens (stated share + CRC net)."""

from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

from domain.expense_lens import (
    POLARITY_OWE,
    POLARITY_OWED,
    POLARITY_ZERO,
    SHARE_ABSOLUTE,
    SHARE_PERCENTAGE,
    build_viewer_expense_lens,
    stated_viewer_share,
    viewer_net,
)
from domain.splits import (
    KIND_ABSOLUTE_AMOUNTS,
    KIND_PERCENTAGE,
    ShareAllocation,
    SplitSpec,
    compute_share_allocations,
)


def _alloc(member_id, amount: str, currency: str = "CRC") -> ShareAllocation:
    return ShareAllocation(member_id=member_id, amount=Decimal(amount), currency=currency)


def test_payer_ten_percent_of_1000_is_owed_900() -> None:
    payer, friend = uuid4(), uuid4()
    members = [payer, friend]
    override = SplitSpec(
        kind=KIND_PERCENTAGE,
        percentages={payer: Decimal("10.00"), friend: Decimal("90.00")},
    )
    result = compute_share_allocations(
        Decimal("1000.00"),
        "CRC",
        item_override=override,
        receipt_override=None,
        list_default_mode="even",
        list_default_shares=None,
        member_ids=members,
        creator_user_id=payer,
    )
    lens = build_viewer_expense_lens(
        viewer_id=payer,
        payer_id=payer,
        amount_crc=Decimal("1000.00"),
        allocations=result.allocations,
        override=override,
        list_default_mode="even",
        list_default_shares=None,
        member_ids=members,
    )
    assert lens is not None
    assert lens.share_kind == SHARE_PERCENTAGE
    assert lens.share_value == Decimal("10.00")
    assert lens.net_crc == Decimal("900.00")
    assert lens.net_polarity == POLARITY_OWED


def test_non_payer_absolute_400_of_1000_owes_400() -> None:
    payer, viewer = uuid4(), uuid4()
    members = [payer, viewer]
    override = SplitSpec(
        kind=KIND_ABSOLUTE_AMOUNTS,
        amounts={payer: Decimal("600.00"), viewer: Decimal("400.00")},
    )
    result = compute_share_allocations(
        Decimal("1000.00"),
        "CRC",
        item_override=override,
        receipt_override=None,
        list_default_mode="even",
        list_default_shares=None,
        member_ids=members,
        creator_user_id=payer,
    )
    lens = build_viewer_expense_lens(
        viewer_id=viewer,
        payer_id=payer,
        amount_crc=Decimal("1000.00"),
        allocations=result.allocations,
        override=override,
        list_default_mode="even",
        list_default_shares=None,
        member_ids=members,
    )
    assert lens is not None
    assert lens.share_kind == SHARE_ABSOLUTE
    assert lens.share_value == Decimal("400.00")
    assert lens.net_crc == Decimal("400.00")
    assert lens.net_polarity == POLARITY_OWE


def test_even_default_two_members_half() -> None:
    payer, friend = uuid4(), uuid4()
    members = [payer, friend]
    result = compute_share_allocations(
        Decimal("1000.00"),
        "CRC",
        item_override=None,
        receipt_override=None,
        list_default_mode="even",
        list_default_shares=None,
        member_ids=members,
        creator_user_id=payer,
    )
    payer_lens = build_viewer_expense_lens(
        viewer_id=payer,
        payer_id=payer,
        amount_crc=Decimal("1000.00"),
        allocations=result.allocations,
        override=None,
        list_default_mode="even",
        list_default_shares=None,
        member_ids=members,
    )
    friend_lens = build_viewer_expense_lens(
        viewer_id=friend,
        payer_id=payer,
        amount_crc=Decimal("1000.00"),
        allocations=result.allocations,
        override=None,
        list_default_mode="even",
        list_default_shares=None,
        member_ids=members,
    )
    assert payer_lens is not None
    assert payer_lens.share_kind == SHARE_PERCENTAGE
    assert payer_lens.share_value == Decimal("50.00")
    assert payer_lens.net_crc == Decimal("500.00")
    assert payer_lens.net_polarity == POLARITY_OWED
    assert friend_lens is not None
    assert friend_lens.share_value == Decimal("50.00")
    assert friend_lens.net_crc == Decimal("500.00")
    assert friend_lens.net_polarity == POLARITY_OWE


def test_net_zero_when_payer_share_equals_total() -> None:
    payer = uuid4()
    net, polarity = viewer_net(
        amount_crc=Decimal("1000.00"),
        viewer_share_crc=Decimal("1000.00"),
        viewer_is_payer=True,
    )
    assert net == Decimal("0")
    assert polarity == POLARITY_ZERO
    stated = stated_viewer_share(
        viewer_id=payer,
        override=None,
        list_default_mode="even",
        list_default_shares=None,
        member_ids=[payer],
    )
    assert stated == (SHARE_PERCENTAGE, Decimal("100.00"))


def test_stated_share_is_spec_percent_not_allocated_ratio() -> None:
    """Remainder cents must not rewrite a 10% stated share."""
    payer, friend = uuid4(), uuid4()
    override = SplitSpec(
        kind=KIND_PERCENTAGE,
        percentages={payer: Decimal("10.00"), friend: Decimal("90.00")},
    )
    stated = stated_viewer_share(
        viewer_id=payer,
        override=override,
        list_default_mode="even",
        list_default_shares=None,
        member_ids=[payer, friend],
    )
    assert stated == (SHARE_PERCENTAGE, Decimal("10.00"))


def test_lens_none_when_viewer_missing_from_allocations() -> None:
    payer, friend, stranger = uuid4(), uuid4(), uuid4()
    allocations = (
        _alloc(payer, "500.00"),
        _alloc(friend, "500.00"),
    )
    lens = build_viewer_expense_lens(
        viewer_id=stranger,
        payer_id=payer,
        amount_crc=Decimal("1000.00"),
        allocations=allocations,
        override=None,
        list_default_mode="even",
        list_default_shares=None,
        member_ids=[payer, friend],
    )
    assert lens is None
