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
# v1 FX scope is USD+CRC only (Story 3.5 / AD-7); other currencies deferred.
MANUAL_SUPPORTED_CURRENCIES = frozenset({"CRC", "USD"})
CRC_AMOUNT_QUANTUM = Decimal("0.01")
DESCRIPTION_MAX_LENGTH = 500
# Numeric(18, 4) ceiling; CRC uses 2dp so keep a safe integer-digit bound.
AMOUNT_MAX = Decimal("99999999999999.99")

ORIGIN_KIND_CARD = "card"
ORIGIN_KIND_CASH = "cash"
ORIGIN_KINDS = frozenset({ORIGIN_KIND_CARD, ORIGIN_KIND_CASH})


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
    origin_kind: str | None = None
    origin_card_id: UUID | None = None


def _validate_origin(
    *, origin_kind: str | None, origin_card_id: UUID | None
) -> tuple[str | None, UUID | None]:
    """Shared origin-shape checks for both create and origin-only update paths."""
    if origin_kind is not None and origin_kind not in ORIGIN_KINDS:
        raise InvalidManualExpenseError("Origin must be an existing card, Cash, or blank.")
    if origin_kind == ORIGIN_KIND_CARD and origin_card_id is None:
        raise InvalidManualExpenseError("Choose a card, or leave origin blank.")
    if origin_kind != ORIGIN_KIND_CARD and origin_card_id is not None:
        raise InvalidManualExpenseError("Cash or blank origin must not carry a card id.")
    return origin_kind, origin_card_id


def validate_origin_update(
    *, origin_kind: str | None, origin_card_id: UUID | None
) -> tuple[str | None, UUID | None]:
    """Validate an origin-only update (existing card / Cash / blank) — no expense shape."""
    return _validate_origin(origin_kind=origin_kind, origin_card_id=origin_card_id)


def validate_manual_expense(
    *,
    amount: str | Decimal,
    currency: str,
    description: str,
    payer_id: UUID,
    member_ids: list[UUID],
    now: datetime | None = None,
    origin_kind: str | None = None,
    origin_card_id: UUID | None = None,
) -> ManualExpenseDraft:
    """Validate a manual (hand) expense create. v1 supports CRC and USD (Story 3.5 FX)."""
    cur = (currency or "").strip().upper()
    if cur not in MANUAL_SUPPORTED_CURRENCIES:
        raise InvalidManualExpenseError(
            f"Manual expenses support {', '.join(sorted(MANUAL_SUPPORTED_CURRENCIES))} only "
            "in this release."
        )

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
        raise InvalidManualExpenseError("Amount may have at most two decimal places.")

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

    validated_origin_kind, validated_origin_card_id = _validate_origin(
        origin_kind=origin_kind, origin_card_id=origin_card_id
    )

    return ManualExpenseDraft(
        amount=parsed,
        currency=cur,
        normalized_description=normalized,
        payer_id=payer_id,
        provenance=PROVENANCE_HAND,
        line_type=LINE_TYPE_PURCHASE,
        posted_date=today_costa_rica_iso(now),
        origin_kind=validated_origin_kind,
        origin_card_id=validated_origin_card_id,
    )
