"""Item/receipt split override use-cases (Story 2.6 / FR-10) — no UI."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Protocol
from uuid import UUID

from domain.errors import ListNotFoundError, SplitOverrideNotFoundError, SubjectNotFoundError
from domain.splits import (
    ALLOWED_SUBJECT_KINDS,
    KIND_ABSOLUTE_AMOUNTS,
    KIND_PERCENTAGE,
    KIND_WHOLE_ASSIGNEE,
    SUBJECT_ITEM,
    SUBJECT_RECEIPT,
    AllocationResult,
    ShareAllocation,
    SplitSpec,
    allocate_from_spec,
    compute_share_allocations,
    parse_split_spec,
)

from application.list_access import (
    AuthorizeListAccessCommand,
    AuthorizeListAccessService,
)
from application.lists import ListRecord, StoredDefaultSplit


@dataclass(frozen=True, slots=True)
class AllocatableSubject:
    id: UUID
    list_id: UUID
    amount: Decimal
    currency: str
    receipt_id: UUID | None = None


@dataclass(frozen=True, slots=True)
class StoredSplitOverride:
    list_id: UUID
    subject_kind: str
    subject_id: UUID
    kind: str
    assignee_id: UUID | None
    amounts: dict[UUID, Decimal] | None
    percentages: dict[UUID, Decimal] | None
    set_by_user_id: UUID


@dataclass(frozen=True, slots=True)
class SplitOverrideView:
    list_id: UUID
    subject_kind: str
    subject_id: UUID
    kind: str
    assignee_id: UUID | None
    amounts: dict[UUID, Decimal] | None
    percentages: dict[UUID, Decimal] | None
    set_by_user_id: UUID


class SplitRepository(Protocol):
    def get_list(self, list_id: UUID) -> ListRecord | None: ...

    def list_member_ids(self, list_id: UUID) -> list[UUID]: ...

    def get_stored_default_split(self, list_id: UUID) -> StoredDefaultSplit | None: ...

    def get_membership(self, list_id: UUID, user_id: UUID): ...

    def get_list_with_grant(self, grant, list_id: UUID) -> ListRecord: ...

    def get_ledger_entry(self, list_id: UUID, entry_id: UUID) -> AllocatableSubject | None: ...

    def get_receipt(self, list_id: UUID, receipt_id: UUID) -> AllocatableSubject | None: ...

    def get_split_override(
        self, list_id: UUID, subject_kind: str, subject_id: UUID
    ) -> StoredSplitOverride | None: ...

    def upsert_split_override(
        self,
        *,
        list_id: UUID,
        subject_kind: str,
        subject_id: UUID,
        kind: str,
        payload: dict,
        set_by_user_id: UUID,
    ) -> StoredSplitOverride: ...

    def delete_split_override(self, list_id: UUID, subject_kind: str, subject_id: UUID) -> bool: ...


@dataclass(frozen=True, slots=True)
class SetSplitOverrideCommand:
    actor_user_id: UUID
    list_id: UUID
    subject_kind: str
    subject_id: UUID
    kind: str
    assignee_id: UUID | None = None
    amounts: dict[UUID, Decimal] | None = None
    percentages: dict[UUID, Decimal] | None = None


@dataclass(frozen=True, slots=True)
class ClearSplitOverrideCommand:
    actor_user_id: UUID
    list_id: UUID
    subject_kind: str
    subject_id: UUID


@dataclass(frozen=True, slots=True)
class GetSplitOverrideCommand:
    actor_user_id: UUID
    list_id: UUID
    subject_kind: str
    subject_id: UUID


@dataclass(frozen=True, slots=True)
class ComputeShareAllocationsCommand:
    actor_user_id: UUID
    list_id: UUID
    subject_kind: str
    subject_id: UUID


def _normalize_subject_kind(raw: str) -> str:
    kind = raw.strip().lower()
    if kind not in ALLOWED_SUBJECT_KINDS:
        raise SubjectNotFoundError()
    return kind


def _spec_from_stored(stored: StoredSplitOverride) -> SplitSpec:
    return SplitSpec(
        kind=stored.kind,
        assignee_id=stored.assignee_id,
        amounts=stored.amounts,
        percentages=stored.percentages,
    )


def load_item_override_specs(
    repo: SplitRepository,
    *,
    list_id: UUID,
    subject_id: UUID,
    receipt_id: UUID | None,
) -> tuple[SplitSpec | None, SplitSpec | None]:
    """Item → receipt override chain used by 2.6 allocations (no ACL)."""
    item_override: SplitSpec | None = None
    receipt_override: SplitSpec | None = None
    stored_item = repo.get_split_override(list_id, SUBJECT_ITEM, subject_id)
    if stored_item is not None:
        item_override = _spec_from_stored(stored_item)
    if receipt_id is not None:
        stored_receipt = repo.get_split_override(list_id, SUBJECT_RECEIPT, receipt_id)
        if stored_receipt is not None:
            candidate = _spec_from_stored(stored_receipt)
            # Absolute receipt totals cannot apply to child line amounts
            # (decision A — fall through toward list_default for items).
            if candidate.kind != KIND_ABSOLUTE_AMOUNTS:
                receipt_override = candidate
    return item_override, receipt_override


def _view_from_stored(stored: StoredSplitOverride) -> SplitOverrideView:
    return SplitOverrideView(
        list_id=stored.list_id,
        subject_kind=stored.subject_kind,
        subject_id=stored.subject_id,
        kind=stored.kind,
        assignee_id=stored.assignee_id,
        amounts=stored.amounts,
        percentages=stored.percentages,
        set_by_user_id=stored.set_by_user_id,
    )


def _payload_from_spec(spec: SplitSpec) -> dict:
    if spec.kind == KIND_WHOLE_ASSIGNEE:
        assert spec.assignee_id is not None
        return {"assignee_id": str(spec.assignee_id)}
    if spec.kind == KIND_ABSOLUTE_AMOUNTS:
        assert spec.amounts is not None
        return {"amounts": {str(k): format(v, "f") for k, v in spec.amounts.items()}}
    assert spec.percentages is not None
    return {"percentages": {str(k): format(v, "f") for k, v in spec.percentages.items()}}


def _load_subject(
    repo: SplitRepository, list_id: UUID, subject_kind: str, subject_id: UUID
) -> AllocatableSubject:
    if subject_kind == SUBJECT_ITEM:
        subject = repo.get_ledger_entry(list_id, subject_id)
    else:
        subject = repo.get_receipt(list_id, subject_id)
    if subject is None:
        raise SubjectNotFoundError()
    return subject


class SetSplitOverrideService:
    """Any list member may set overrides (FR-10) — authorize set_split_override."""

    def __init__(self, repo: SplitRepository) -> None:
        self._repo = repo

    def execute(self, command: SetSplitOverrideCommand) -> SplitOverrideView:
        AuthorizeListAccessService(self._repo).execute(
            AuthorizeListAccessCommand(
                acting_user_id=command.actor_user_id,
                list_id=command.list_id,
                action="set_split_override",
            )
        )
        subject_kind = _normalize_subject_kind(command.subject_kind)
        subject = _load_subject(self._repo, command.list_id, subject_kind, command.subject_id)
        lst = self._repo.get_list(command.list_id)
        if lst is None:
            raise ListNotFoundError()
        members = self._repo.list_member_ids(command.list_id)
        spec = parse_split_spec(
            kind=command.kind,
            member_ids=members,
            assignee_id=command.assignee_id,
            amounts=command.amounts,
            percentages=command.percentages,
        )
        # Absolute sums must match subject total at write time (fail loud).
        if spec.kind == KIND_ABSOLUTE_AMOUNTS:
            allocate_from_spec(
                subject.amount,
                subject.currency,
                spec,
                member_ids=members,
                creator_user_id=lst.owner_id,
            )

        stored = self._repo.upsert_split_override(
            list_id=command.list_id,
            subject_kind=subject_kind,
            subject_id=command.subject_id,
            kind=spec.kind,
            payload=_payload_from_spec(spec),
            set_by_user_id=command.actor_user_id,
        )
        return _view_from_stored(stored)


class ClearSplitOverrideService:
    def __init__(self, repo: SplitRepository) -> None:
        self._repo = repo

    def execute(self, command: ClearSplitOverrideCommand) -> None:
        AuthorizeListAccessService(self._repo).execute(
            AuthorizeListAccessCommand(
                acting_user_id=command.actor_user_id,
                list_id=command.list_id,
                action="set_split_override",
            )
        )
        subject_kind = _normalize_subject_kind(command.subject_kind)
        _load_subject(self._repo, command.list_id, subject_kind, command.subject_id)
        self._repo.delete_split_override(command.list_id, subject_kind, command.subject_id)


class GetSplitOverrideService:
    """Member-readable override config — authorize read_ledger."""

    def __init__(self, repo: SplitRepository) -> None:
        self._repo = repo

    def execute(self, command: GetSplitOverrideCommand) -> SplitOverrideView:
        AuthorizeListAccessService(self._repo).execute(
            AuthorizeListAccessCommand(
                acting_user_id=command.actor_user_id,
                list_id=command.list_id,
                action="read_ledger",
            )
        )
        subject_kind = _normalize_subject_kind(command.subject_kind)
        _load_subject(self._repo, command.list_id, subject_kind, command.subject_id)
        stored = self._repo.get_split_override(command.list_id, subject_kind, command.subject_id)
        if stored is None:
            raise SplitOverrideNotFoundError()
        return _view_from_stored(stored)


class ComputeShareAllocationsService:
    """Resolve item → receipt → list_default and allocate (member read)."""

    def __init__(self, repo: SplitRepository) -> None:
        self._repo = repo

    def execute(self, command: ComputeShareAllocationsCommand) -> AllocationResult:
        AuthorizeListAccessService(self._repo).execute(
            AuthorizeListAccessCommand(
                acting_user_id=command.actor_user_id,
                list_id=command.list_id,
                action="read_ledger",
            )
        )
        subject_kind = _normalize_subject_kind(command.subject_kind)
        subject = _load_subject(self._repo, command.list_id, subject_kind, command.subject_id)
        lst = self._repo.get_list(command.list_id)
        if lst is None:
            raise ListNotFoundError()

        members = self._repo.list_member_ids(command.list_id)
        stored_default = self._repo.get_stored_default_split(command.list_id)
        if subject_kind == SUBJECT_ITEM:
            item_override, receipt_override = load_item_override_specs(
                self._repo,
                list_id=command.list_id,
                subject_id=command.subject_id,
                receipt_id=subject.receipt_id,
            )
        else:
            item_override = None
            receipt_override = None
            stored_receipt = self._repo.get_split_override(
                command.list_id, SUBJECT_RECEIPT, command.subject_id
            )
            if stored_receipt is not None:
                receipt_override = _spec_from_stored(stored_receipt)

        return compute_share_allocations(
            subject.amount,
            subject.currency,
            item_override=item_override,
            receipt_override=receipt_override,
            list_default_mode=(stored_default.mode if stored_default is not None else "even"),
            list_default_shares=(stored_default.shares if stored_default is not None else None),
            member_ids=members,
            creator_user_id=lst.owner_id,
        )


__all__ = [
    "AllocatableSubject",
    "AllocationResult",
    "ClearSplitOverrideCommand",
    "ClearSplitOverrideService",
    "ComputeShareAllocationsCommand",
    "ComputeShareAllocationsService",
    "GetSplitOverrideCommand",
    "GetSplitOverrideService",
    "SetSplitOverrideCommand",
    "SetSplitOverrideService",
    "ShareAllocation",
    "SplitOverrideView",
    "StoredSplitOverride",
    "KIND_ABSOLUTE_AMOUNTS",
    "KIND_PERCENTAGE",
    "KIND_WHOLE_ASSIGNEE",
    "load_item_override_specs",
]
