"""Manual expense create validation (Story 3.2 / FR-21) — pure domain."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, InvalidOperation
from uuid import UUID

from domain.dates import today_costa_rica_iso
from domain.errors import InvalidManualExpenseError

PROVENANCE_HAND = "hand"
PROVENANCE_PARSER = "parser"
LINE_TYPE_PURCHASE = "purchase"
MANUAL_CURRENCY_CRC = "CRC"
CRC_AMOUNT_QUANTUM = Decimal("0.01")
DESCRIPTION_MAX_LENGTH = 500
# Numeric(18, 4) ceiling; CRC uses 2dp so keep a safe integer-digit bound.
AMOUNT_MAX = Decimal("99999999999999.99")

# Origin (card / Cash / blank) is Story 4.2 — do not add origin_kind / origin_card_id here.


@dataclass(frozen=True, slots=True)
class ManualExpenseDraft:
    """Validated hand LEDGER_ENTRY fields ready for persistence."""

    amount: Decimal
    currency: str
    normalized_description: str
    payer_id: UUID
    provenance: str
    line_type: str
    posted_date: str


def validate_manual_expense(
    *,
    amount: str | Decimal,
    currency: str,
    description: str,
    payer_id: UUID,
    member_ids: list[UUID],
    now: datetime | None = None,
) -> ManualExpenseDraft:
    """Validate a manual (hand) expense create. CRC-only until Story 3.5 FX."""
    cur = (currency or "").strip().upper()
    if cur != MANUAL_CURRENCY_CRC:
        raise InvalidManualExpenseError("Manual expenses support CRC only in this release.")

    try:
        parsed = amount if isinstance(amount, Decimal) else Decimal(str(amount).strip())
    except (InvalidOperation, ValueError) as exc:
        raise InvalidManualExpenseError("Amount must be an exact decimal string.") from exc
    if not parsed.is_finite():
        raise InvalidManualExpenseError("Amount must be a finite decimal value.")
    if parsed <= 0:
        raise InvalidManualExpenseError("Amount must be greater than zero.")
    if parsed > AMOUNT_MAX:
        raise InvalidManualExpenseError("Amount is too large.")
    quantized = parsed.quantize(CRC_AMOUNT_QUANTUM)
    if quantized != parsed:
        raise InvalidManualExpenseError(
            "Amount may have at most two decimal places for CRC."
        )

    normalized = (description or "").strip()
    if not normalized:
        raise InvalidManualExpenseError("Description is required.")
    if len(normalized) > DESCRIPTION_MAX_LENGTH:
        raise InvalidManualExpenseError(
            f"Description must be at most {DESCRIPTION_MAX_LENGTH} characters."
        )
    members = set(member_ids)
    if payer_id not in members:
        raise InvalidManualExpenseError("Payer must be a current list member.")

    return ManualExpenseDraft(
        amount=parsed,
        currency=MANUAL_CURRENCY_CRC,
        normalized_description=normalized,
        payer_id=payer_id,
        provenance=PROVENANCE_HAND,
        line_type=LINE_TYPE_PURCHASE,
        posted_date=today_costa_rica_iso(now),
    )
