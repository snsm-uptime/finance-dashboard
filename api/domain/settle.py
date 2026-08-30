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
        get_split_override_fn: Callable to fetch item/receipt split overrides for
            an entry (signature: get_split_override(entry_id, receipt_id) ->
            tuple[SplitSpec | None, SplitSpec | None] of (item_override, receipt_override)).
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

        item_override, receipt_override = get_split_override_fn(entry.id, entry.receipt_id)

        allocations = compute_allocations_fn(
            total=split_total,
            currency=entry.currency,
            item_override=item_override,
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


def compute_pairwise_settle_balances(
    ledger_entries: Iterable[LedgerEntryRecord],
    list_members: Iterable[ListMemberView],
    list_owner_id: UUID,
    compute_allocations_fn: Callable,
    get_split_override_fn: Callable,
    get_list_default_split_fn: Callable,
    default_mode: str = "even",
    currency_exponent: int = 2,
) -> dict[tuple[UUID, UUID], Decimal]:
    """Compute directional pairwise settle-up edges between list members.

    Mirrors `compute_settle_balance_for_list_members`'s entry-iteration loop
    (same line-type filter, same sign/reversal handling, same allocation call)
    but accumulates per-counterparty edges instead of a single per-member
    balance. Edge key `(A, B)` means "B owes A" (positive = A is owed),
    matching the polarity convention of the existing per-member function.

    Edges are not netted against their reverse direction here — call
    `net_pairwise_edges` to collapse `(A, B)` and `(B, A)` into one signed
    value per unordered pair.
    """
    member_list = list(list_members)
    member_ids = [m.user_id for m in member_list]

    edges: dict[tuple[UUID, UUID], Decimal] = {}

    for entry in ledger_entries:
        if entry.line_type not in INCLUDED_LINE_TYPES:
            continue

        payer_id = entry.payer_id
        raw_amount = entry.amount_crc
        if raw_amount == 0:
            continue
        sign = Decimal("1") if raw_amount > 0 else Decimal("-1")
        split_total = abs(raw_amount)

        item_override, receipt_override = get_split_override_fn(entry.id, entry.receipt_id)

        allocations = compute_allocations_fn(
            total=split_total,
            currency=entry.currency,
            item_override=item_override,
            receipt_override=receipt_override,
            list_default_mode=default_mode,
            list_default_shares=get_list_default_split_fn(entry.list_id),
            member_ids=member_ids,
            creator_user_id=list_owner_id,
            currency_exponent=currency_exponent,
        )

        for allocation in allocations.allocations:
            if allocation.member_id == payer_id:
                continue
            key = (payer_id, allocation.member_id)
            edges[key] = edges.get(key, Decimal("0")) + allocation.amount * sign

    return edges


def net_pairwise_edges(
    edges: dict[tuple[UUID, UUID], Decimal],
) -> dict[tuple[UUID, UUID], Decimal]:
    """Collapse directional edges into one signed value per unordered pair.

    Canonical key ordering is the lexicographically smaller UUID first. The
    resulting value at `(X, Y)` (X < Y) is positive when Y owes X, negative
    when X owes Y — a member appears on only one side of a pair once nets
    are collapsed this way.
    """
    pairs: set[tuple[UUID, UUID]] = set()
    for a, b in edges:
        pairs.add((a, b) if str(a) < str(b) else (b, a))

    net: dict[tuple[UUID, UUID], Decimal] = {}
    for x, y in pairs:
        forward = edges.get((x, y), Decimal("0"))
        backward = edges.get((y, x), Decimal("0"))
        value = forward - backward
        if value != Decimal("0"):
            net[(x, y)] = value

    return net


@dataclass(frozen=True, slots=True)
class SuggestedTransfer:
    """A single suggested transfer produced by `simplify_group_transfers`."""

    from_member_id: UUID
    to_member_id: UUID
    amount_crc: Decimal


def simplify_group_transfers(
    net_balances: dict[UUID, Decimal],
    currency_exponent: int = 2,
) -> list[SuggestedTransfer]:
    """Reduce list-wide net balances to a minimal-transaction transfer plan.

    Classic "settle up with minimum transactions" greedy reduction: repeatedly
    match the largest current creditor with the largest current debtor,
    transfer the smaller magnitude, and reduce both. Pure and deterministic
    (ties broken by member UUID). Never invents a transfer between two
    zero-balance members and never produces a zero-amount transfer.
    """
    creditors = [(mid, bal) for mid, bal in net_balances.items() if bal > 0]
    debtors = [(mid, bal) for mid, bal in net_balances.items() if bal < 0]

    def sort_key(item: tuple[UUID, Decimal]) -> tuple[Decimal, str]:
        mid, bal = item
        return (-abs(bal), str(mid))

    creditors.sort(key=sort_key)
    debtors.sort(key=sort_key)

    transfers: list[SuggestedTransfer] = []
    quantum = Decimal(1).scaleb(-currency_exponent)

    while creditors and debtors:
        creditor_id, creditor_bal = creditors[0]
        debtor_id, debtor_bal = debtors[0]

        amount = min(creditor_bal, abs(debtor_bal)).quantize(quantum)
        if amount == 0:
            raise ValueError("net_balances not quantized to currency_exponent")
        transfers.append(
            SuggestedTransfer(
                from_member_id=debtor_id,
                to_member_id=creditor_id,
                amount_crc=amount,
            )
        )

        creditor_bal -= amount
        debtor_bal += amount

        if creditor_bal == 0:
            creditors.pop(0)
        else:
            creditors[0] = (creditor_id, creditor_bal)

        if debtor_bal == 0:
            debtors.pop(0)
        else:
            debtors[0] = (debtor_id, debtor_bal)

        creditors.sort(key=sort_key)
        debtors.sort(key=sort_key)

    return transfers
