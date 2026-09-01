"""Create + list budgets, with near-cap state — Story 6.3 (FR-48)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Protocol
from uuid import UUID, uuid4

from domain.budgets import (
    BudgetState,
    classify_budget_state,
    validate_budget_cap,
    validate_budget_currency,
    validate_budget_name,
)
from domain.errors import BudgetNotFoundError

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

        # spent is hardcoded to 0 for every budget in this story — no
        # ledger-attribution mechanism exists yet (Story 6.5). Do not query
        # ledger_entries here; there is nothing to sum yet.
        views = []
        for record in records:
            spent = Decimal("0")
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
    # Always empty until Story 6.5 attributes ledger lines to budgets — see
    # that story for the eventual element shape.
    history: list


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

        spent = Decimal("0")
        state = classify_budget_state(spent, record.cap_amount)
        return BudgetDetailView(
            id=record.id,
            name=record.name,
            cap_amount=record.cap_amount,
            currency=record.currency,
            spent=spent,
            state=state,
            created_at=record.created_at,
            history=[],
        )
