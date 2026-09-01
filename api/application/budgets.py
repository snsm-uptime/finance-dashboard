"""Create/list/detail budgets with near-cap state (Story 6.3, FR-48) and
budget attribution — manual assign, rules, candidates (Story 6.5, FR-49)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Literal, Protocol
from uuid import UUID, uuid4

from domain.budget_attribution import (
    compute_attributed_entries,
    compute_budget_spent,
    matches_rule,
    validate_rule_match_text,
)
from domain.budgets import (
    BudgetState,
    classify_budget_state,
    validate_budget_cap,
    validate_budget_currency,
    validate_budget_name,
)
from domain.errors import (
    BudgetNotFoundError,
    BudgetRuleNotFoundError,
    LedgerEntryNotFoundError,
)
from domain.settle import INCLUDED_LINE_TYPES

from application.expenses import LedgerEntryRecord
from application.list_access import (
    AuthorizeListAccessCommand,
    AuthorizeListAccessService,
    ListAccessLookup,
)


@dataclass(frozen=True, slots=True)
class BudgetRecord:
    id: UUID
    list_id: UUID
    name: str
    cap_amount: Decimal
    currency: str
    created_at: datetime


@dataclass(frozen=True, slots=True)
class BudgetRuleRecord:
    id: UUID
    budget_id: UUID
    list_id: UUID
    match_text: str
    created_at: datetime


class BudgetRepository(Protocol):
    def create_budget(
        self,
        *,
        budget_id: UUID,
        list_id: UUID,
        name: str,
        cap_amount: Decimal,
        currency: str,
    ) -> BudgetRecord: ...

    def list_budgets_for_list(self, list_id: UUID) -> list[BudgetRecord]: ...

    def get_budget(self, budget_id: UUID, list_id: UUID) -> BudgetRecord | None: ...

    def list_ledger_entries(self, list_id: UUID) -> list[LedgerEntryRecord]: ...

    def get_ledger_entry(self, entry_id: UUID, list_id: UUID) -> LedgerEntryRecord | None: ...

    def assign_entry_to_budget(self, entry_id: UUID, budget_id: UUID) -> None: ...

    def unassign_entry(self, entry_id: UUID) -> None: ...

    def list_rules_for_budget(self, budget_id: UUID) -> list[BudgetRuleRecord]: ...

    def create_rule(
        self, rule_id: UUID, budget_id: UUID, list_id: UUID, match_text: str
    ) -> BudgetRuleRecord: ...

    def get_rule(self, rule_id: UUID, budget_id: UUID) -> BudgetRuleRecord | None: ...

    def delete_rule(self, rule_id: UUID) -> None: ...


@dataclass(frozen=True, slots=True)
class CreateBudgetCommand:
    actor_user_id: UUID
    list_id: UUID
    name: str
    cap: str
    currency: str


@dataclass(frozen=True, slots=True)
class BudgetView:
    id: UUID
    name: str
    cap_amount: Decimal
    currency: str
    spent: Decimal
    state: BudgetState
    created_at: datetime


class CreateBudgetService:
    def __init__(self, repo: BudgetRepository, list_lookup: ListAccessLookup) -> None:
        self._repo = repo
        self._list_lookup = list_lookup

    def execute(self, command: CreateBudgetCommand) -> BudgetRecord:
        AuthorizeListAccessService(self._list_lookup).execute(
            AuthorizeListAccessCommand(
                acting_user_id=command.actor_user_id,
                list_id=command.list_id,
                action="write_budgets",
            )
        )

        name = validate_budget_name(command.name)
        cap = validate_budget_cap(command.cap, currency_exponent=2)
        currency = validate_budget_currency(command.currency)

        return self._repo.create_budget(
            budget_id=uuid4(),
            list_id=command.list_id,
            name=name,
            cap_amount=cap,
            currency=currency,
        )


@dataclass(frozen=True, slots=True)
class BudgetHistoryLine:
    id: UUID
    normalized_description: str
    posted_date: date
    amount_crc: Decimal
    attributed_via: Literal["manual", "rule"]


@dataclass(frozen=True, slots=True)
class BudgetRuleView:
    id: UUID
    match_text: str
    created_at: datetime


def _compute_spent_and_history(
    record: BudgetRecord,
    repo: BudgetRepository,
    list_id: UUID,
    *,
    entries: list[LedgerEntryRecord] | None = None,
) -> tuple[Decimal, tuple[BudgetHistoryLine, ...], tuple[BudgetRuleView, ...]]:
    """Shared CRC-only spend/history/rules computation for a single budget
    (Story 6.5). `spent`/`history` in this story are CRC-only (AC #8) — a
    USD budget keeps the pre-6.5 hardcoded spent=0/history=() behavior,
    but its rules still reflect reality (assignment/rule-creation are not
    currency-gated, only the spend computation is).

    `entries` lets a caller iterating multiple budgets for the same list
    (e.g. `ListBudgetsService`) fetch the list's ledger once and reuse it,
    instead of one full-ledger fetch per budget."""
    rules = repo.list_rules_for_budget(record.id)
    rule_views = tuple(
        BudgetRuleView(id=r.id, match_text=r.match_text, created_at=r.created_at) for r in rules
    )

    if record.currency != "CRC":
        return Decimal("0"), (), rule_views

    if entries is None:
        entries = repo.list_ledger_entries(list_id)
    attributed = compute_attributed_entries(
        entries, budget_id=record.id, rule_texts=[r.match_text for r in rules]
    )
    spent = compute_budget_spent(attributed)
    history = tuple(
        BudgetHistoryLine(
            id=e.id,
            normalized_description=e.normalized_description,
            posted_date=e.posted_date,
            amount_crc=e.amount_crc,
            attributed_via="manual" if e.budget_id == record.id else "rule",
        )
        for e in attributed
    )
    return spent, history, rule_views


@dataclass(frozen=True, slots=True)
class ListBudgetsCommand:
    actor_user_id: UUID
    list_id: UUID


class ListBudgetsService:
    def __init__(self, repo: BudgetRepository, list_lookup: ListAccessLookup) -> None:
        self._repo = repo
        self._list_lookup = list_lookup

    def execute(self, command: ListBudgetsCommand) -> list[BudgetView]:
        AuthorizeListAccessService(self._list_lookup).execute(
            AuthorizeListAccessCommand(
                acting_user_id=command.actor_user_id,
                list_id=command.list_id,
                action="read_budgets",
            )
        )

        records = self._repo.list_budgets_for_list(command.list_id)
        entries = self._repo.list_ledger_entries(command.list_id)

        views = []
        for record in records:
            spent, _history, _rules = _compute_spent_and_history(
                record, self._repo, command.list_id, entries=entries
            )
            state = classify_budget_state(spent, record.cap_amount)
            views.append(
                BudgetView(
                    id=record.id,
                    name=record.name,
                    cap_amount=record.cap_amount,
                    currency=record.currency,
                    spent=spent,
                    state=state,
                    created_at=record.created_at,
                )
            )
        return views


@dataclass(frozen=True, slots=True)
class GetBudgetDetailCommand:
    actor_user_id: UUID
    list_id: UUID
    budget_id: UUID


@dataclass(frozen=True, slots=True)
class BudgetDetailView:
    id: UUID
    name: str
    cap_amount: Decimal
    currency: str
    spent: Decimal
    state: BudgetState
    created_at: datetime
    history: tuple[BudgetHistoryLine, ...]
    rules: tuple[BudgetRuleView, ...]


class GetBudgetDetailService:
    def __init__(self, repo: BudgetRepository, list_lookup: ListAccessLookup) -> None:
        self._repo = repo
        self._list_lookup = list_lookup

    def execute(self, command: GetBudgetDetailCommand) -> BudgetDetailView:
        AuthorizeListAccessService(self._list_lookup).execute(
            AuthorizeListAccessCommand(
                acting_user_id=command.actor_user_id,
                list_id=command.list_id,
                action="read_budgets",
            )
        )

        record = self._repo.get_budget(budget_id=command.budget_id, list_id=command.list_id)
        if record is None:
            raise BudgetNotFoundError()

        spent, history, rules = _compute_spent_and_history(record, self._repo, command.list_id)
        state = classify_budget_state(spent, record.cap_amount)
        return BudgetDetailView(
            id=record.id,
            name=record.name,
            cap_amount=record.cap_amount,
            currency=record.currency,
            spent=spent,
            state=state,
            created_at=record.created_at,
            history=history,
            rules=rules,
        )


@dataclass(frozen=True, slots=True)
class AssignEntryToBudgetCommand:
    actor_user_id: UUID
    list_id: UUID
    budget_id: UUID
    ledger_entry_id: UUID


class AssignEntryToBudgetService:
    def __init__(self, repo: BudgetRepository, list_lookup: ListAccessLookup) -> None:
        self._repo = repo
        self._list_lookup = list_lookup

    def execute(self, command: AssignEntryToBudgetCommand) -> None:
        AuthorizeListAccessService(self._list_lookup).execute(
            AuthorizeListAccessCommand(
                acting_user_id=command.actor_user_id,
                list_id=command.list_id,
                action="write_budgets",
            )
        )

        budget = self._repo.get_budget(budget_id=command.budget_id, list_id=command.list_id)
        if budget is None:
            raise BudgetNotFoundError()

        entry = self._repo.get_ledger_entry(command.ledger_entry_id, command.list_id)
        if entry is None:
            raise LedgerEntryNotFoundError()
        if entry.line_type not in INCLUDED_LINE_TYPES:
            # A non-spend line is not a valid attribution target — looks
            # identical to "doesn't exist" from the caller's perspective
            # (no distinct error code; nothing leaks about which ids exist).
            raise LedgerEntryNotFoundError()

        self._repo.assign_entry_to_budget(entry.id, budget.id)


@dataclass(frozen=True, slots=True)
class UnassignEntryFromBudgetCommand:
    actor_user_id: UUID
    list_id: UUID
    budget_id: UUID
    ledger_entry_id: UUID


class UnassignEntryFromBudgetService:
    def __init__(self, repo: BudgetRepository, list_lookup: ListAccessLookup) -> None:
        self._repo = repo
        self._list_lookup = list_lookup

    def execute(self, command: UnassignEntryFromBudgetCommand) -> None:
        AuthorizeListAccessService(self._list_lookup).execute(
            AuthorizeListAccessCommand(
                acting_user_id=command.actor_user_id,
                list_id=command.list_id,
                action="write_budgets",
            )
        )

        budget = self._repo.get_budget(budget_id=command.budget_id, list_id=command.list_id)
        if budget is None:
            raise BudgetNotFoundError()

        entry = self._repo.get_ledger_entry(command.ledger_entry_id, command.list_id)
        if entry is None:
            raise LedgerEntryNotFoundError()
        if entry.budget_id != budget.id:
            # Exists but not assigned to *this* budget — same "look
            # identical to not found" reasoning; don't leak that it's
            # assigned elsewhere.
            raise LedgerEntryNotFoundError()

        self._repo.unassign_entry(entry.id)


@dataclass(frozen=True, slots=True)
class BudgetCandidate:
    id: UUID
    normalized_description: str
    posted_date: date
    amount_crc: Decimal


@dataclass(frozen=True, slots=True)
class ListBudgetCandidatesCommand:
    actor_user_id: UUID
    list_id: UUID
    budget_id: UUID


class ListBudgetCandidatesService:
    def __init__(self, repo: BudgetRepository, list_lookup: ListAccessLookup) -> None:
        self._repo = repo
        self._list_lookup = list_lookup

    def execute(self, command: ListBudgetCandidatesCommand) -> tuple[BudgetCandidate, ...]:
        AuthorizeListAccessService(self._list_lookup).execute(
            AuthorizeListAccessCommand(
                acting_user_id=command.actor_user_id,
                list_id=command.list_id,
                action="read_budgets",
            )
        )

        budget = self._repo.get_budget(budget_id=command.budget_id, list_id=command.list_id)
        if budget is None:
            raise BudgetNotFoundError()

        rule_texts = [r.match_text for r in self._repo.list_rules_for_budget(budget.id)]
        entries = self._repo.list_ledger_entries(command.list_id)
        candidates = [
            e
            for e in entries
            if e.line_type in INCLUDED_LINE_TYPES
            and e.budget_id is None
            and not any(matches_rule(e.normalized_description, rt) for rt in rule_texts)
        ]
        candidates.sort(key=lambda e: (e.posted_date, str(e.id)), reverse=True)
        return tuple(
            BudgetCandidate(
                id=e.id,
                normalized_description=e.normalized_description,
                posted_date=e.posted_date,
                amount_crc=e.amount_crc,
            )
            for e in candidates
        )


@dataclass(frozen=True, slots=True)
class CreateBudgetRuleCommand:
    actor_user_id: UUID
    list_id: UUID
    budget_id: UUID
    match_text: str


class CreateBudgetRuleService:
    def __init__(self, repo: BudgetRepository, list_lookup: ListAccessLookup) -> None:
        self._repo = repo
        self._list_lookup = list_lookup

    def execute(self, command: CreateBudgetRuleCommand) -> BudgetRuleRecord:
        AuthorizeListAccessService(self._list_lookup).execute(
            AuthorizeListAccessCommand(
                acting_user_id=command.actor_user_id,
                list_id=command.list_id,
                action="write_budgets",
            )
        )

        budget = self._repo.get_budget(budget_id=command.budget_id, list_id=command.list_id)
        if budget is None:
            raise BudgetNotFoundError()

        text = validate_rule_match_text(command.match_text)
        return self._repo.create_rule(uuid4(), budget.id, command.list_id, text)


@dataclass(frozen=True, slots=True)
class DeleteBudgetRuleCommand:
    actor_user_id: UUID
    list_id: UUID
    budget_id: UUID
    rule_id: UUID


class DeleteBudgetRuleService:
    def __init__(self, repo: BudgetRepository, list_lookup: ListAccessLookup) -> None:
        self._repo = repo
        self._list_lookup = list_lookup

    def execute(self, command: DeleteBudgetRuleCommand) -> None:
        AuthorizeListAccessService(self._list_lookup).execute(
            AuthorizeListAccessCommand(
                acting_user_id=command.actor_user_id,
                list_id=command.list_id,
                action="write_budgets",
            )
        )

        budget = self._repo.get_budget(budget_id=command.budget_id, list_id=command.list_id)
        if budget is None:
            raise BudgetNotFoundError()

        rule = self._repo.get_rule(command.rule_id, budget.id)
        if rule is None:
            raise BudgetRuleNotFoundError()

        self._repo.delete_rule(rule.id)
