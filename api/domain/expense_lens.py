"""Viewer-facing share + net for a single expense (receipt-row lens).

Stated share is read from the winning 2.6 spec — never reverse-engineered
from allocated cents. Net CRC uses allocated CRC + payer, matching settle.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from decimal import Decimal
from uuid import UUID

from domain.default_split import MODE_EVEN, even_percentage_shares, resolve_effective_default
from domain.splits import (
    KIND_ABSOLUTE_AMOUNTS,
    KIND_PERCENTAGE,
    KIND_WHOLE_ASSIGNEE,
    ShareAllocation,
    SplitSpec,
)

POLARITY_OWE = "owe"
POLARITY_OWED = "owed"
POLARITY_ZERO = "zero"
SHARE_PERCENTAGE = "percentage"
SHARE_ABSOLUTE = "absolute"


@dataclass(frozen=True, slots=True)
class ViewerExpenseLens:
    share_kind: str
    share_value: Decimal
    net_crc: Decimal
    net_polarity: str


def stated_viewer_share(
    *,
    viewer_id: UUID,
    override: SplitSpec | None,
    list_default_mode: str,
    list_default_shares: Mapping[UUID, Decimal] | None,
    member_ids: Iterable[UUID],
) -> tuple[str, Decimal] | None:
    """Return (kind, value) from the winning spec for ``viewer_id``."""
    members = list(dict.fromkeys(member_ids))
    if viewer_id not in members:
        return None
    if override is not None:
        if override.kind == KIND_ABSOLUTE_AMOUNTS:
            amounts = override.amounts or {}
            return (SHARE_ABSOLUTE, amounts.get(viewer_id, Decimal("0")))
        if override.kind == KIND_WHOLE_ASSIGNEE:
            pct = Decimal("100") if override.assignee_id == viewer_id else Decimal("0")
            return (SHARE_PERCENTAGE, pct)
        if override.kind == KIND_PERCENTAGE:
            percentages = override.percentages or {}
            if viewer_id not in percentages:
                return None
            return (SHARE_PERCENTAGE, percentages[viewer_id])
        return None
    mode, shares = resolve_effective_default(list_default_mode, list_default_shares, members)
    if mode == MODE_EVEN:
        even = even_percentage_shares(members)
        pct = even.get(viewer_id)
        return (SHARE_PERCENTAGE, pct) if pct is not None else None
    pct = shares.get(viewer_id)
    return (SHARE_PERCENTAGE, pct) if pct is not None else None


def viewer_net(
    *,
    amount_crc: Decimal,
    viewer_share_crc: Decimal,
    viewer_is_payer: bool,
) -> tuple[Decimal, str]:
    """Unsigned CRC net + polarity. Payer: amount − share; else −share."""
    signed = (amount_crc - viewer_share_crc) if viewer_is_payer else -viewer_share_crc
    if signed > 0:
        return (signed, POLARITY_OWED)
    if signed < 0:
        return (-signed, POLARITY_OWE)
    return (Decimal("0"), POLARITY_ZERO)


def build_viewer_expense_lens(
    *,
    viewer_id: UUID,
    payer_id: UUID,
    amount_crc: Decimal,
    allocations: tuple[ShareAllocation, ...],
    override: SplitSpec | None,
    list_default_mode: str,
    list_default_shares: Mapping[UUID, Decimal] | None,
    member_ids: Iterable[UUID],
) -> ViewerExpenseLens | None:
    stated = stated_viewer_share(
        viewer_id=viewer_id,
        override=override,
        list_default_mode=list_default_mode,
        list_default_shares=list_default_shares,
        member_ids=member_ids,
    )
    if stated is None:
        return None
    share_kind, share_value = stated
    share_crc = next((row.amount for row in allocations if row.member_id == viewer_id), None)
    if share_crc is None:
        return None
    net_crc, polarity = viewer_net(
        amount_crc=amount_crc,
        viewer_share_crc=share_crc,
        viewer_is_payer=viewer_id == payer_id,
    )
    return ViewerExpenseLens(
        share_kind=share_kind,
        share_value=share_value,
        net_crc=net_crc,
        net_polarity=polarity,
    )
