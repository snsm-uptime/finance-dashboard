"""Standing list default split + AD-6 percentage allocation (FR-9 / AD-6).

Pure domain: no FastAPI / SQLAlchemy. Money uses Decimal only.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from decimal import ROUND_DOWN, Decimal
from uuid import UUID

from domain.errors import InvalidDefaultSplitError

MODE_EVEN = "even"
MODE_PERCENTAGE = "percentage"
ALLOWED_MODES = frozenset({MODE_EVEN, MODE_PERCENTAGE})
HUNDRED = Decimal("100")
PERCENT_QUANTUM = Decimal("0.01")


def even_percentage_shares(member_ids: Iterable[UUID]) -> dict[UUID, Decimal]:
    """Equal percentage shares among current members that sum to exactly 100."""
    members = list(dict.fromkeys(member_ids))  # stable unique order
    if not members:
        raise InvalidDefaultSplitError("A list must have at least one member.")
    n = len(members)
    base = (HUNDRED / Decimal(n)).quantize(PERCENT_QUANTUM, rounding=ROUND_DOWN)
    shares = {mid: base for mid in members}
    leftover = HUNDRED - sum(shares.values(), Decimal("0"))
    # Deterministic: leftover percent units go to the first member in iteration order.
    shares[members[0]] = shares[members[0]] + leftover
    return shares


def validate_percentage_shares(
    member_ids: Iterable[UUID],
    shares: Mapping[UUID, Decimal | str],
) -> dict[UUID, Decimal]:
    """Require exact coverage of current members and sum == 100 (no float).

    Percentages are quantized to ``PERCENT_QUANTUM`` (2 dp) so they round-trip
    through ``Numeric(12, 4)`` without silently failing on later reads.
    """
    members = set(member_ids)
    if not members:
        raise InvalidDefaultSplitError("A list must have at least one member.")

    normalized: dict[UUID, Decimal] = {}
    for raw_id, raw_pct in shares.items():
        user_id = raw_id if isinstance(raw_id, UUID) else UUID(str(raw_id))
        try:
            pct = raw_pct if isinstance(raw_pct, Decimal) else Decimal(str(raw_pct))
        except Exception as exc:
            raise InvalidDefaultSplitError("Percentages must be exact decimal values.") from exc
        if pct < 0:
            raise InvalidDefaultSplitError("Percentages cannot be negative.")
        quantized = pct.quantize(PERCENT_QUANTUM)
        if quantized != pct:
            raise InvalidDefaultSplitError(
                "Percentages may have at most two decimal places."
            )
        normalized[user_id] = quantized

    if set(normalized.keys()) != members:
        raise InvalidDefaultSplitError(
            "Percentage shares must cover exactly the current list members."
        )

    total = sum(normalized.values(), Decimal("0"))
    if total != HUNDRED:
        raise InvalidDefaultSplitError("Percentages must sum to exactly 100.")
    return normalized


def resolve_effective_default(
    stored_mode: str,
    stored_shares: Mapping[UUID, Decimal] | None,
    member_ids: Iterable[UUID],
) -> tuple[str, dict[UUID, Decimal]]:
    """Return effective mode + shares; fall back to even when % map is invalid.

    Documented default (not spine law): membership add/remove that breaks a
    stored percentage map → even until the owner re-saves.
    """
    members = list(dict.fromkeys(member_ids))
    mode = stored_mode if stored_mode in ALLOWED_MODES else MODE_EVEN

    if mode == MODE_PERCENTAGE and stored_shares is not None:
        try:
            return MODE_PERCENTAGE, validate_percentage_shares(members, stored_shares)
        except InvalidDefaultSplitError:
            pass

    return MODE_EVEN, even_percentage_shares(members)


def allocate_percentage_shares(
    total: Decimal | str,
    shares: Mapping[UUID, Decimal | str],
    creator_user_id: UUID,
    *,
    currency_exponent: int = 2,
) -> dict[UUID, Decimal]:
    """Floor each percentage share of total; leftover minor units → list creator (AD-6).

    Share maps must pass ``validate_percentage_shares`` (exact 100%, non-negative).
    """
    amount = total if isinstance(total, Decimal) else Decimal(str(total))
    if amount < 0:
        raise InvalidDefaultSplitError("Amount cannot be negative.")
    if currency_exponent < 0:
        raise InvalidDefaultSplitError("Currency exponent cannot be negative.")

    member_ids = [
        (raw_id if isinstance(raw_id, UUID) else UUID(str(raw_id))) for raw_id in shares
    ]
    normalized = validate_percentage_shares(member_ids, shares)
    if creator_user_id not in normalized:
        raise InvalidDefaultSplitError("List creator must be included in the share map.")

    quantum = Decimal("1").scaleb(-currency_exponent)
    floored: dict[UUID, Decimal] = {}
    for user_id, pct in normalized.items():
        part = (amount * pct / HUNDRED).quantize(quantum, rounding=ROUND_DOWN)
        floored[user_id] = part

    leftover = amount - sum(floored.values(), Decimal("0"))
    floored[creator_user_id] = floored[creator_user_id] + leftover
    return floored


def allocate_even_shares(
    total: Decimal | str,
    member_ids: Iterable[UUID],
    creator_user_id: UUID,
    *,
    currency_exponent: int = 2,
) -> dict[UUID, Decimal]:
    """Equal floor division among members; leftover minor units → list creator (AD-6)."""
    members = list(dict.fromkeys(member_ids))
    if not members:
        raise InvalidDefaultSplitError("A list must have at least one member.")
    if creator_user_id not in members:
        raise InvalidDefaultSplitError("List creator must be a current member.")

    amount = total if isinstance(total, Decimal) else Decimal(str(total))
    if amount < 0:
        raise InvalidDefaultSplitError("Amount cannot be negative.")
    if currency_exponent < 0:
        raise InvalidDefaultSplitError("Currency exponent cannot be negative.")

    quantum = Decimal("1").scaleb(-currency_exponent)
    base = (amount / Decimal(len(members))).quantize(quantum, rounding=ROUND_DOWN)
    floored = {mid: base for mid in members}
    leftover = amount - sum(floored.values(), Decimal("0"))
    floored[creator_user_id] = floored[creator_user_id] + leftover
    return floored
