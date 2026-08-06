"""Item/receipt split overrides + share-allocation resolution (FR-10 / AD-6).

Pure domain: no FastAPI / SQLAlchemy. Money uses Decimal only.

Resolution order (single function path via ``resolve_override_source`` /
``compute_share_allocations``):

  item_override → else receipt_override → else list_default

Percentage and list-default even/percentage allocation reuse
``domain.default_split`` helpers (Story 2.5) — remainder → list creator.
Absolute overrides never use remainder logic (exact sum or reject).

Receipt totals: explicit amount on the receipt subject (not derived from
child line sums in this stub — documented for Stories 3.2 / 4.x).

Receipt ``absolute_amounts`` overrides apply only when allocating the receipt
subject; when allocating a child item they are ignored (fall through).
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from decimal import Decimal
from uuid import UUID

from domain.default_split import (
    MODE_EVEN,
    allocate_even_shares,
    allocate_percentage_shares,
    resolve_effective_default,
    validate_percentage_shares,
)
from domain.errors import InvalidDefaultSplitError, InvalidSplitOverrideError

KIND_WHOLE_ASSIGNEE = "whole_assignee"
KIND_ABSOLUTE_AMOUNTS = "absolute_amounts"
KIND_PERCENTAGE = "percentage"
ALLOWED_OVERRIDE_KINDS = frozenset({KIND_WHOLE_ASSIGNEE, KIND_ABSOLUTE_AMOUNTS, KIND_PERCENTAGE})

SUBJECT_ITEM = "item"
SUBJECT_RECEIPT = "receipt"
ALLOWED_SUBJECT_KINDS = frozenset({SUBJECT_ITEM, SUBJECT_RECEIPT})

RESOLVED_ITEM = "item"
RESOLVED_RECEIPT = "receipt"
RESOLVED_LIST_DEFAULT = "list_default"


@dataclass(frozen=True, slots=True)
class SplitSpec:
    """Override configuration (not computed cents)."""

    kind: str
    assignee_id: UUID | None = None
    amounts: dict[UUID, Decimal] | None = None
    percentages: dict[UUID, Decimal] | None = None


@dataclass(frozen=True, slots=True)
class ShareAllocation:
    member_id: UUID
    amount: Decimal
    currency: str


@dataclass(frozen=True, slots=True)
class AllocationResult:
    allocations: tuple[ShareAllocation, ...]
    resolved_from: str


def _as_decimal(value: Decimal | str, *, label: str) -> Decimal:
    try:
        amount = value if isinstance(value, Decimal) else Decimal(str(value))
    except Exception as exc:
        raise InvalidSplitOverrideError(f"{label} must be exact decimal values.") from exc
    if not amount.is_finite():
        raise InvalidSplitOverrideError(f"{label} must be finite decimal values.")
    return amount


def _as_uuid(value: UUID | str) -> UUID:
    return value if isinstance(value, UUID) else UUID(str(value))


def _member_set(member_ids: Iterable[UUID]) -> list[UUID]:
    members = list(dict.fromkeys(member_ids))
    if not members:
        raise InvalidSplitOverrideError("A list must have at least one member.")
    return members


def _require_positive_total(total: Decimal | str) -> Decimal:
    amount = _as_decimal(total, label="Amount")
    if amount <= 0:
        raise InvalidSplitOverrideError("Amount must be greater than zero.")
    return amount


def _currency_quantum(currency_exponent: int) -> Decimal:
    if currency_exponent < 0:
        raise InvalidSplitOverrideError("Currency exponent cannot be negative.")
    return Decimal("1").scaleb(-currency_exponent)


def _allocations_tuple(
    by_member: Mapping[UUID, Decimal],
    *,
    members: list[UUID],
    amount: Decimal,
    currency_code: str,
) -> tuple[ShareAllocation, ...]:
    ordered = sorted(members, key=lambda uid: str(uid))
    try:
        rows = tuple(
            ShareAllocation(member_id=mid, amount=by_member[mid], currency=currency_code)
            for mid in ordered
        )
    except KeyError as exc:
        raise InvalidSplitOverrideError("Override no longer matches current list members.") from exc
    if sum((row.amount for row in rows), Decimal("0")) != amount:
        raise InvalidSplitOverrideError(
            "Share allocations must sum exactly to the line or receipt total."
        )
    return rows


def parse_split_spec(
    *,
    kind: str,
    member_ids: Iterable[UUID],
    assignee_id: UUID | str | None = None,
    amounts: Mapping[UUID | str, Decimal | str] | None = None,
    percentages: Mapping[UUID | str, Decimal | str] | None = None,
    currency_exponent: int = 2,
) -> SplitSpec:
    """Validate an override payload against current membership."""
    members = _member_set(member_ids)
    member_set = set(members)
    normalized_kind = kind.strip().lower()
    if normalized_kind not in ALLOWED_OVERRIDE_KINDS:
        raise InvalidSplitOverrideError(
            "Split override kind must be whole_assignee, absolute_amounts, or percentage."
        )

    if normalized_kind == KIND_WHOLE_ASSIGNEE:
        if assignee_id is None:
            raise InvalidSplitOverrideError("whole_assignee requires assignee_id.")
        assignee = _as_uuid(assignee_id)
        if assignee not in member_set:
            raise InvalidSplitOverrideError("Assignee must be a current list member.")
        return SplitSpec(kind=KIND_WHOLE_ASSIGNEE, assignee_id=assignee)

    if normalized_kind == KIND_ABSOLUTE_AMOUNTS:
        if not amounts:
            raise InvalidSplitOverrideError("absolute_amounts requires amounts.")
        quantum = _currency_quantum(currency_exponent)
        normalized: dict[UUID, Decimal] = {}
        for raw_id, raw_amt in amounts.items():
            user_id = _as_uuid(raw_id)
            if user_id not in member_set:
                raise InvalidSplitOverrideError("Amount map may only include current list members.")
            amt = _as_decimal(raw_amt, label="Amounts")
            if amt < 0:
                raise InvalidSplitOverrideError("Amounts cannot be negative.")
            if amt != amt.quantize(quantum):
                raise InvalidSplitOverrideError("Amounts may not exceed the currency minor unit.")
            normalized[user_id] = amt
        return SplitSpec(kind=KIND_ABSOLUTE_AMOUNTS, amounts=normalized)

    # percentage
    if not percentages:
        raise InvalidSplitOverrideError("percentage requires percentages.")
    # Reject non-finite percentage strings before validate helper.
    cleaned: dict[UUID, Decimal] = {}
    for raw_id, raw_pct in percentages.items():
        cleaned[_as_uuid(raw_id)] = _as_decimal(raw_pct, label="Percentages")
    try:
        validated = validate_percentage_shares(members, cleaned)
    except InvalidDefaultSplitError as exc:
        raise InvalidSplitOverrideError(str(exc)) from exc
    return SplitSpec(kind=KIND_PERCENTAGE, percentages=validated)


def resolve_override_source(
    *,
    item_override: SplitSpec | None,
    receipt_override: SplitSpec | None,
) -> tuple[str, SplitSpec | None]:
    """item_override → else receipt_override → else list_default."""
    if item_override is not None:
        return RESOLVED_ITEM, item_override
    if receipt_override is not None:
        return RESOLVED_RECEIPT, receipt_override
    return RESOLVED_LIST_DEFAULT, None


def allocate_from_spec(
    total: Decimal | str,
    currency: str,
    spec: SplitSpec,
    *,
    member_ids: Iterable[UUID],
    creator_user_id: UUID,
    currency_exponent: int = 2,
) -> tuple[ShareAllocation, ...]:
    """Allocate ``total`` according to override spec; re-validates current membership."""
    members = _member_set(member_ids)
    if creator_user_id not in members:
        raise InvalidSplitOverrideError("List creator must be a current member.")
    amount = _require_positive_total(total)
    currency_code = currency.strip().upper()
    if len(currency_code) != 3:
        raise InvalidSplitOverrideError("Currency must be a 3-letter ISO 4217 code.")

    # Fail loud when a stored override no longer matches current membership.
    fresh = parse_split_spec(
        kind=spec.kind,
        member_ids=members,
        assignee_id=spec.assignee_id,
        amounts=spec.amounts,
        percentages=spec.percentages,
        currency_exponent=currency_exponent,
    )

    if fresh.kind == KIND_WHOLE_ASSIGNEE:
        assert fresh.assignee_id is not None
        by_member = {mid: Decimal("0") for mid in members}
        by_member[fresh.assignee_id] = amount
    elif fresh.kind == KIND_ABSOLUTE_AMOUNTS:
        assert fresh.amounts is not None
        provided_sum = sum(fresh.amounts.values(), Decimal("0"))
        if provided_sum != amount:
            raise InvalidSplitOverrideError(
                "Absolute amounts must sum exactly to the line or receipt total."
            )
        by_member = {mid: Decimal("0") for mid in members}
        by_member.update(fresh.amounts)
    elif fresh.kind == KIND_PERCENTAGE:
        assert fresh.percentages is not None
        try:
            by_member = allocate_percentage_shares(
                amount,
                fresh.percentages,
                creator_user_id,
                currency_exponent=currency_exponent,
            )
        except InvalidDefaultSplitError as exc:
            raise InvalidSplitOverrideError(str(exc)) from exc
    else:
        raise InvalidSplitOverrideError(f"Unknown split kind: {fresh.kind}")

    return _allocations_tuple(
        by_member, members=members, amount=amount, currency_code=currency_code
    )


def compute_share_allocations(
    total: Decimal | str,
    currency: str,
    *,
    item_override: SplitSpec | None,
    receipt_override: SplitSpec | None,
    list_default_mode: str,
    list_default_shares: Mapping[UUID, Decimal] | None,
    member_ids: Iterable[UUID],
    creator_user_id: UUID,
    currency_exponent: int = 2,
) -> AllocationResult:
    """Resolve override chain and allocate shares (stable output for Epic 3)."""
    members = _member_set(member_ids)
    if creator_user_id not in members:
        raise InvalidSplitOverrideError("List creator must be a current member.")
    amount = _require_positive_total(total)
    currency_code = currency.strip().upper()
    if len(currency_code) != 3:
        raise InvalidSplitOverrideError("Currency must be a 3-letter ISO 4217 code.")

    resolved_from, override = resolve_override_source(
        item_override=item_override,
        receipt_override=receipt_override,
    )
    if override is not None:
        allocations = allocate_from_spec(
            amount,
            currency_code,
            override,
            member_ids=members,
            creator_user_id=creator_user_id,
            currency_exponent=currency_exponent,
        )
        return AllocationResult(allocations=allocations, resolved_from=resolved_from)

    mode, shares = resolve_effective_default(list_default_mode, list_default_shares, members)
    try:
        if mode == MODE_EVEN:
            by_member = allocate_even_shares(
                amount,
                members,
                creator_user_id,
                currency_exponent=currency_exponent,
            )
        else:
            by_member = allocate_percentage_shares(
                amount,
                shares,
                creator_user_id,
                currency_exponent=currency_exponent,
            )
    except InvalidDefaultSplitError as exc:
        raise InvalidSplitOverrideError(str(exc)) from exc

    allocations = _allocations_tuple(
        by_member, members=members, amount=amount, currency_code=currency_code
    )
    return AllocationResult(
        allocations=allocations,
        resolved_from=RESOLVED_LIST_DEFAULT,
    )
