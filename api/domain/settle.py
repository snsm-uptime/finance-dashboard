"""Settle-up balance computation from per-transaction shares and payer info (Story 3.4).

Pure domain logic: no FastAPI / SQLAlchemy. Money uses Decimal only.

Settle-up is computed, not recorded. For each ledger entry with line_type in
(purchase, classified_purchase_reversal) and a nonzero amount_crc, allocations
are computed dynamically from split overrides + list defaults, then balances
are aggregated. Negative amounts (refunds / reversals) use the absolute value
for share math and invert the resulting balances.

Balance polarity: positive = member is owed CRC; negative = member owes CRC.
Invariant: sum of all balances should equal 0 (balanced system).
"""

from __future__ import annotations

from collections.abc import Callable, Iterable
from dataclasses import dataclass
from decimal import Decimal
from uuid import UUID

from domain.line_types import LINE_TYPE_CLASSIFIED_PURCHASE_REVERSAL, LINE_TYPE_PURCHASE

INCLUDED_LINE_TYPES = frozenset({LINE_TYPE_PURCHASE, LINE_TYPE_CLASSIFIED_PURCHASE_REVERSAL})


@dataclass(frozen=True, slots=True)
class LedgerEntryRecord:
    """Ledger entry with payer, materialized CRC amount, currency, and line type.

    amount_crc is FX-materialized at commit (Story 3.5 / AD-7) — settle-up always
    reads it directly and never re-derives balances from the original currency.
    """

    id: UUID
    list_id: UUID
    amount_crc: Decimal
    currency: str
    payer_id: UUID
    line_type: str
    receipt_id: UUID | None = None


@dataclass(frozen=True, slots=True)
class ListMemberView:
    """List member with user_id and optional alias."""

    user_id: UUID
    alias: str | None


@dataclass(frozen=True, slots=True)
class ShareAllocation:
    """Allocated share for a member."""

    member_id: UUID
    amount: Decimal
    currency: str


def compute_settle_balance_for_list_members(
    ledger_entries: Iterable[LedgerEntryRecord],
    list_members: Iterable[ListMemberView],
    list_owner_id: UUID,
    compute_allocations_fn: Callable,
    get_split_override_fn: Callable,
    get_list_default_split_fn: Callable,
    default_mode: str = "even",
    currency_exponent: int = 2,
) -> dict[UUID, Decimal]:
    """Compute settle-up balances from ledger entries grouped by member.

    Args:
        ledger_entries: List of ledger entry records to process.
        list_members: List of current list members.
        list_owner_id: UUID of the list creator (remainder sink for percentages).
        compute_allocations_fn: Callable to compute share allocations
            (signature: compute_share_allocations(...) -> AllocationResult).
        get_split_override_fn: Callable to fetch split override for receipt_id
            (signature: get_split_override(receipt_id) -> SplitOverrideModel | None).
        get_list_default_split_fn: Callable to fetch list default split config
            (signature: get_list_default_split(list_id) -> StoredDefaultSplit | None).
        currency_exponent: Currency exponent for precision (default 2 for CRC).

    Returns:
        dict[UUID, Decimal] mapping member UUID → net CRC balance.
        Positive = member is owed CRC; negative = member owes CRC out.

    Raises:
        Logs warning if sum of balances deviates from 0 (indicates data bug).
    """
    member_list = list(list_members)
    member_ids = [m.user_id for m in member_list]

    balance_dict: dict[UUID, Decimal] = {mid: Decimal("0") for mid in member_ids}

    for entry in ledger_entries:
        if entry.line_type not in INCLUDED_LINE_TYPES:
            continue

        payer_id = entry.payer_id
        # Always the materialized CRC amount — never re-call BCCR here (AC #2, AD-21).
        raw_amount = entry.amount_crc
        if raw_amount == 0:
            continue
        # Purchases/refunds and classified reversals can be signed (statement credits).
        # Share allocation requires a positive total; apply the same polarity after.
        sign = Decimal("1") if raw_amount > 0 else Decimal("-1")
        split_total = abs(raw_amount)

        receipt_override = None
        if entry.receipt_id:
            split_override = get_split_override_fn(entry.receipt_id)
            if split_override:
                receipt_override = split_override

        allocations = compute_allocations_fn(
            total=split_total,
            currency=entry.currency,
            item_override=None,
            receipt_override=receipt_override,
            list_default_mode=default_mode,
            list_default_shares=get_list_default_split_fn(entry.list_id),
            member_ids=member_ids,
            creator_user_id=list_owner_id,
            currency_exponent=currency_exponent,
        )

        payer_share = None
        for allocation in allocations.allocations:
            if allocation.member_id == payer_id:
                payer_share = allocation.amount * sign
                break

        if payer_share is not None:
            balance_dict[payer_id] += raw_amount - payer_share
            for allocation in allocations.allocations:
                if allocation.member_id != payer_id:
                    balance_dict[allocation.member_id] -= allocation.amount * sign
        else:
            balance_dict[payer_id] += raw_amount
            for allocation in allocations.allocations:
                balance_dict[allocation.member_id] -= allocation.amount * sign

    total = sum(balance_dict.values(), Decimal("0"))
    if total != Decimal("0"):
        import logging

        logger = logging.getLogger(__name__)
        logger.warning(f"Settle-up invariant violated: sum of balances = {total} (expected 0)")

    return balance_dict
