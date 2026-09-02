"""Manual expense create + list use-cases (Story 3.2 / FR-21)."""

from __future__ import annotations

from contextlib import AbstractContextManager
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Protocol
from uuid import UUID, uuid4

from domain.errors import (
    InvalidDefaultSplitError,
    InvalidManualExpenseError,
    InvalidSplitOverrideError,
    ListNotFoundError,
    NotEntryPayerError,
    SubjectNotFoundError,
)
from domain.expense_lens import ViewerExpenseLens, build_viewer_expense_lens
from domain.expenses import ManualExpenseDraft, validate_manual_expense, validate_origin_update
from domain.splits import SUBJECT_ITEM, compute_share_allocations, resolve_override_source
from domain.statement_cycles import filter_entries_by_statement, resolve_period_bounds

from application.cards import CardRecord
from application.fx_service import MaterializedFx, MaterializeFxService
from application.list_access import (
    AuthorizeListAccessCommand,
    AuthorizeListAccessService,
)
from application.lists import ListRecord, StoredDefaultSplit
from application.splits import (
    SetSplitOverrideCommand,
    SetSplitOverrideService,
    SplitRepository,
    StoredSplitOverride,
    load_item_override_specs,
)


@dataclass(frozen=True, slots=True)
class LedgerEntryRecord:
    id: UUID
    list_id: UUID
    amount: Decimal
    currency: str
    normalized_description: str
    payer_id: UUID
    provenance: str
    line_type: str
    posted_date: date
    created_at: datetime
    # FX materialized at commit (Story 3.5 / AD-7) — CRC entries pass through 1:1.
    amount_crc: Decimal
    fx_rate: Decimal
    fx_rate_date: date | None
    fx_fallback: bool
    receipt_id: UUID | None = None
    product_id: UUID | None = None
    external_ref: str | None = None
    origin_kind: str | None = None
    origin_card_id: UUID | None = None
    import_batch_id: UUID | None = None
    statement_id: UUID | None = None
    budget_id: UUID | None = None


@dataclass(frozen=True, slots=True)
class ListMemberView:
    user_id: UUID
    # Null only for accounts that have not passed the alias gate yet.
    alias: str | None
    photo_base64: str | None = None


@dataclass(frozen=True, slots=True)
class SplitOverrideInput:
    kind: str
    assignee_id: UUID | None = None
    amounts: dict[UUID, Decimal] | None = None
    percentages: dict[UUID, Decimal] | None = None


class ExpenseRepository(Protocol):
    def get_list(self, list_id: UUID) -> ListRecord | None: ...

    def list_member_ids(self, list_id: UUID) -> list[UUID]: ...

    def get_membership(self, list_id: UUID, user_id: UUID): ...

    def get_list_with_grant(self, grant, list_id: UUID) -> ListRecord: ...

    def create_ledger_entry(
        self,
        *,
        entry_id: UUID,
        list_id: UUID,
        draft: ManualExpenseDraft,
        fx: MaterializedFx,
    ) -> LedgerEntryRecord: ...

    def list_ledger_entries(self, list_id: UUID) -> list[LedgerEntryRecord]: ...

    def list_members_with_alias(self, list_id: UUID) -> list[ListMemberView]: ...

    def get_card_for_owner(self, user_id: UUID, card_id: UUID) -> CardRecord | None: ...

    def get_split_override(
        self, list_id: UUID, subject_kind: str, subject_id: UUID
    ) -> StoredSplitOverride | None: ...

    def get_stored_default_split(self, list_id: UUID) -> StoredDefaultSplit | None: ...

    def get_ledger_entry_payer(self, *, list_id: UUID, entry_id: UUID) -> UUID | None: ...

    def update_ledger_entry_origin(
        self,
        *,
        list_id: UUID,
        entry_id: UUID,
        actor_user_id: UUID,
        origin_kind: str | None,
        origin_card_id: UUID | None,
    ) -> LedgerEntryRecord: ...

    def atomic(self) -> AbstractContextManager[None]:
        """Savepoint so create+override failures do not need a full session rollback."""
        ...


@dataclass(frozen=True, slots=True)
class CreateManualExpenseCommand:
    actor_user_id: UUID
    list_id: UUID
    amount: str
    currency: str
    description: str
    payer_id: UUID
    split_override: SplitOverrideInput | None = None
    origin_kind: str | None = None
    origin_card_id: UUID | None = None


@dataclass(frozen=True, slots=True)
class UpdateExpenseOriginCommand:
    actor_user_id: UUID
    list_id: UUID
    entry_id: UUID
    origin_kind: str | None
    origin_card_id: UUID | None


@dataclass(frozen=True, slots=True)
class ListedExpense:
    """Ledger row plus optional viewer lens for the Soft-Ledger receipt list."""

    entry: LedgerEntryRecord
    lens: ViewerExpenseLens | None = None
    origin_card_label: str | None = None


@dataclass(frozen=True, slots=True)
class ListExpensesCommand:
    actor_user_id: UUID
    list_id: UUID
    period_start: date | None = None
    period_end: date | None = None
    statement_id: UUID | None = None


@dataclass(frozen=True, slots=True)
class ListExpensesResult:
    list_id: UUID
    expenses: tuple[ListedExpense, ...]
    period_start: date | None = None
    period_end: date | None = None


@dataclass(frozen=True, slots=True)
class ListMembersCommand:
    actor_user_id: UUID
    list_id: UUID


@dataclass(frozen=True, slots=True)
class ListMembersResult:
    list_id: UUID
    members: tuple[ListMemberView, ...]


def _reject_unowned_card_origin(
    repo: ExpenseRepository,
    *,
    actor_user_id: UUID,
    origin_kind: str | None,
    origin_card_id: UUID | None,
) -> None:
    """Fail loud before any write — a stranger's card id must never land as an origin."""
    if origin_kind != "card":
        return
    owned_card = repo.get_card_for_owner(actor_user_id, origin_card_id)
    if owned_card is None:
        raise InvalidManualExpenseError("Selected card is not registered to you.")


class CreateManualExpenseService:
    """Create a hand ledger entry; optionally attach item split override in one txn."""

    def __init__(self, repo: ExpenseRepository, fx_service: MaterializeFxService) -> None:
        self._repo = repo
        self._fx_service = fx_service

    def execute(self, command: CreateManualExpenseCommand) -> LedgerEntryRecord:
        AuthorizeListAccessService(self._repo).execute(
            AuthorizeListAccessCommand(
                acting_user_id=command.actor_user_id,
                list_id=command.list_id,
                action="write_expense",
            )
        )
        members = self._repo.list_member_ids(command.list_id)
        draft = validate_manual_expense(
            amount=command.amount,
            currency=command.currency,
            description=command.description,
            payer_id=command.payer_id,
            actor_user_id=command.actor_user_id,
            member_ids=members,
            origin_kind=command.origin_kind,
            origin_card_id=command.origin_card_id,
        )
        _reject_unowned_card_origin(
            self._repo,
            actor_user_id=command.actor_user_id,
            origin_kind=draft.origin_kind,
            origin_card_id=draft.origin_card_id,
        )
        # Materialize FX before any write — a failed BCCR lookup must not persist
        # a half-written entry (fail loud, AD-7). CRC drafts pass through 1:1.
        fx = self._fx_service.materialize_fx_for_entry(
            amount=draft.amount,
            currency=draft.currency,
            posted_date=date.fromisoformat(draft.posted_date),
        )
        entry_id = uuid4()
        if not hasattr(self._repo, "atomic") or not callable(self._repo.atomic):
            raise TypeError("Expense repository must provide atomic() savepoints.")
        with self._repo.atomic():
            created = self._repo.create_ledger_entry(
                entry_id=entry_id,
                list_id=command.list_id,
                draft=draft,
                fx=fx,
            )
            if command.split_override is not None:
                # Reuse SetSplitOverride — do not invent a second allocator.
                SetSplitOverrideService(self._repo).execute(  # type: ignore[arg-type]
                    SetSplitOverrideCommand(
                        actor_user_id=command.actor_user_id,
                        list_id=command.list_id,
                        subject_kind=SUBJECT_ITEM,
                        subject_id=created.id,
                        kind=command.split_override.kind,
                        assignee_id=command.split_override.assignee_id,
                        amounts=command.split_override.amounts,
                        percentages=command.split_override.percentages,
                    )
                )
            return created


class UpdateExpenseOriginService:
    """Set/clear origin (card / Cash / blank) on an existing manual expense (FR-21)."""

    def __init__(self, repo: ExpenseRepository) -> None:
        self._repo = repo

    def execute(self, command: UpdateExpenseOriginCommand) -> LedgerEntryRecord:
        AuthorizeListAccessService(self._repo).execute(
            AuthorizeListAccessCommand(
                acting_user_id=command.actor_user_id,
                list_id=command.list_id,
                action="write_expense",
            )
        )
        # Authorization (who this entry belongs to) is resolved before validating
        # incidental input shape (e.g. an unowned card id) — a non-payer must always
        # see 403 not_entry_payer, never a 422 that leaks past the real rejection.
        payer_id = self._repo.get_ledger_entry_payer(
            list_id=command.list_id, entry_id=command.entry_id
        )
        if payer_id is None:
            raise SubjectNotFoundError()
        if payer_id != command.actor_user_id:
            raise NotEntryPayerError()
        origin_kind, origin_card_id = validate_origin_update(
            origin_kind=command.origin_kind, origin_card_id=command.origin_card_id
        )
        _reject_unowned_card_origin(
            self._repo,
            actor_user_id=command.actor_user_id,
            origin_kind=origin_kind,
            origin_card_id=origin_card_id,
        )
        return self._repo.update_ledger_entry_origin(
            list_id=command.list_id,
            entry_id=command.entry_id,
            actor_user_id=command.actor_user_id,
            origin_kind=origin_kind,
            origin_card_id=origin_card_id,
        )


class ListExpensesService:
    """Newest-first expenses for Soft-Ledger — authorize_list_access(read_expenses)."""

    def __init__(self, repo: ExpenseRepository) -> None:
        self._repo = repo

    def execute(self, command: ListExpensesCommand) -> ListExpensesResult:
        grant = AuthorizeListAccessService(self._repo).execute(
            AuthorizeListAccessCommand(
                acting_user_id=command.actor_user_id,
                list_id=command.list_id,
                action="read_expenses",
            )
        )
        lst = self._repo.get_list_with_grant(grant, command.list_id)
        rows = self._repo.list_ledger_entries(command.list_id)
        if command.statement_id is not None:
            rows = filter_entries_by_statement(rows, statement_id=command.statement_id)
            period_start, period_end = command.period_start, command.period_end
        else:
            window = resolve_period_bounds(
                rows, period_start=command.period_start, period_end=command.period_end
            )
            period_start, period_end = window.period_start, window.period_end
            rows = [row for row in rows if period_start <= row.posted_date <= period_end]
        members = self._repo.list_member_ids(command.list_id)
        stored_default = self._repo.get_stored_default_split(command.list_id)
        default_mode = stored_default.mode if stored_default is not None else "even"
        default_shares = stored_default.shares if stored_default is not None else None
        listed: list[ListedExpense] = []
        for row in rows:
            listed.append(
                self._with_viewer_lens(
                    row,
                    actor_user_id=command.actor_user_id,
                    members=members,
                    creator_user_id=lst.owner_id,
                    default_mode=default_mode,
                    default_shares=default_shares,
                )
            )
        return ListExpensesResult(
            list_id=command.list_id,
            expenses=tuple(listed),
            period_start=period_start,
            period_end=period_end,
        )

    def _with_viewer_lens(
        self,
        row: LedgerEntryRecord,
        *,
        actor_user_id: UUID,
        members: list[UUID],
        creator_user_id: UUID,
        default_mode: str,
        default_shares: dict[UUID, Decimal] | None,
    ) -> ListedExpense:
        origin_card_label = self._origin_card_label(row, actor_user_id)
        try:
            item_override, receipt_override = load_item_override_specs(
                self._repo,  # type: ignore[arg-type]
                list_id=row.list_id,
                subject_id=row.id,
                receipt_id=row.receipt_id,
            )
            allocation = compute_share_allocations(
                row.amount_crc,
                "CRC",
                item_override=item_override,
                receipt_override=receipt_override,
                list_default_mode=default_mode,
                list_default_shares=default_shares,
                member_ids=members,
                creator_user_id=creator_user_id,
            )
            _, winning = resolve_override_source(
                item_override=item_override,
                receipt_override=receipt_override,
            )
            lens = build_viewer_expense_lens(
                viewer_id=actor_user_id,
                payer_id=row.payer_id,
                amount_crc=row.amount_crc,
                allocations=allocation.allocations,
                override=winning,
                list_default_mode=default_mode,
                list_default_shares=default_shares,
                member_ids=members,
            )
        except (
            InvalidSplitOverrideError,
            InvalidDefaultSplitError,
            SubjectNotFoundError,
            ListNotFoundError,
            KeyError,
            ValueError,
        ):
            lens = None
        return ListedExpense(entry=row, lens=lens, origin_card_label=origin_card_label)

    def _origin_card_label(self, row: LedgerEntryRecord, actor_user_id: UUID) -> str | None:
        if row.origin_kind != "card" or row.origin_card_id is None:
            return None
        if row.payer_id != actor_user_id:
            return None
        card = self._repo.get_card_for_owner(actor_user_id, row.origin_card_id)
        if card is None:
            return None
        return card.label


class ListMembersService:
    """Member roster for payer/split pickers — authorize_list_access(read_list)."""

    def __init__(self, repo: ExpenseRepository) -> None:
        self._repo = repo

    def execute(self, command: ListMembersCommand) -> ListMembersResult:
        grant = AuthorizeListAccessService(self._repo).execute(
            AuthorizeListAccessCommand(
                acting_user_id=command.actor_user_id,
                list_id=command.list_id,
                action="read_list",
            )
        )
        self._repo.get_list_with_grant(grant, command.list_id)
        members = self._repo.list_members_with_alias(command.list_id)
        return ListMembersResult(list_id=command.list_id, members=tuple(members))


__all__ = [
    "CreateManualExpenseCommand",
    "CreateManualExpenseService",
    "ExpenseRepository",
    "InvalidManualExpenseError",
    "LedgerEntryRecord",
    "ListExpensesCommand",
    "ListExpensesResult",
    "ListExpensesService",
    "ListedExpense",
    "ListMemberView",
    "ListMembersCommand",
    "ListMembersResult",
    "ListMembersService",
    "SplitOverrideInput",
    "SplitRepository",
    "ListNotFoundError",
    "UpdateExpenseOriginCommand",
    "UpdateExpenseOriginService",
]
