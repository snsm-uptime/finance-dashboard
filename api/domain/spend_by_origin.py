"""Spend-by-origin aggregation for the solo-list hero (Story 6.2, FR-47).

Pure domain logic: no FastAPI / SQLAlchemy. Money uses Decimal only. Reuses
`INCLUDED_LINE_TYPES` from `domain.settle` — the same purchase/reversal
line-type filter settle-up already uses, so this must not drift from it.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Literal, Protocol
from uuid import UUID

from domain.settle import INCLUDED_LINE_TYPES


class HasOriginAndLineType(Protocol):
    line_type: str
    origin_kind: str | None
    origin_card_id: UUID | None
    amount_crc: Decimal


@dataclass(frozen=True, slots=True)
class OriginSpendGroup:
    kind: Literal["card", "cash", "blank"]
    card_id: UUID | None
    total_crc: Decimal


def compute_spend_by_origin(
    entries: list[HasOriginAndLineType],
) -> tuple[OriginSpendGroup, ...]:
    """Sum `amount_crc` per origin (card / cash / blank) for spend-included lines.

    Signed sum — a `classified_purchase_reversal`'s negative amount reduces
    that origin's total ("spend", not "|purchases|"). Rows whose `line_type`
    is not in `INCLUDED_LINE_TYPES` are skipped entirely. A group whose total
    nets to exactly zero is still included (it had activity this period);
    only origins with zero matching entries are absent. Output is sorted by
    `total_crc` descending, tiebroken by `(kind, card_id)` for determinism.
    """
    totals: dict[tuple[str, UUID | None], Decimal] = {}

    for entry in entries:
        if entry.line_type not in INCLUDED_LINE_TYPES:
            continue

        if entry.origin_kind == "card" and entry.origin_card_id is not None:
            key: tuple[str, UUID | None] = ("card", entry.origin_card_id)
        elif entry.origin_kind == "cash":
            key = ("cash", None)
        else:
            key = ("blank", None)

        totals[key] = totals.get(key, Decimal("0")) + entry.amount_crc

    def sort_key(item: tuple[tuple[str, UUID | None], Decimal]) -> tuple[Decimal, str, str]:
        (kind, card_id), total = item
        return (-total, kind, str(card_id) if card_id is not None else "")

    ordered = sorted(totals.items(), key=sort_key)

    return tuple(
        OriginSpendGroup(kind=kind, card_id=card_id, total_crc=total)
        for (kind, card_id), total in ordered
    )
