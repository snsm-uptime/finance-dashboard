"""SQLAlchemy repository for standalone, owner-scoped budgets (Story 7.1,
AD-30) and attribution (manual assignment, rules, candidates — Story 6.5)."""

from __future__ import annotations

from collections import defaultdict
from datetime import date
from decimal import Decimal
from uuid import UUID

from application.budgets import BudgetRecord, BudgetRuleRecord
from application.expenses import LedgerEntryRecord
from domain.errors import BudgetNotFoundError
from sqlalchemy import select
from sqlalchemy.orm import Session

from adapters.persistence.models import (
    BudgetModel,
    BudgetRuleModel,
    BudgetSourceListModel,
    LedgerEntryModel,
)
from adapters.persistence.repositories import _ledger_entry_record


def _budget_record(row: BudgetModel, source_list_ids: tuple[UUID, ...]) -> BudgetRecord:
    return BudgetRecord(
        id=row.id,
        owner_user_id=row.owner_user_id,
        name=row.name,
        cap_amount=row.cap_amount,
        currency=row.currency,
        source_list_ids=source_list_ids,
        period_start=row.period_start,
        period_end=row.period_end,
        created_at=row.created_at,
        is_archived=row.is_archived,
    )


def _budget_rule_record(row: BudgetRuleModel) -> BudgetRuleRecord:
    return BudgetRuleRecord(
        id=row.id,
        budget_id=row.budget_id,
        match_text=row.match_text,
        created_at=row.created_at,
    )


class SqlAlchemyBudgetRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def create_budget(
        self,
        *,
        budget_id: UUID,
        owner_user_id: UUID,
        name: str,
        cap_amount: Decimal,
        currency: str,
        source_list_ids: tuple[UUID, ...],
        period_start: date | None = None,
        period_end: date | None = None,
    ) -> BudgetRecord:
        row = BudgetModel(
            id=budget_id,
            owner_user_id=owner_user_id,
            name=name,
            cap_amount=cap_amount,
            currency=currency,
            period_start=period_start,
            period_end=period_end,
        )
        self._session.add(row)
        for list_id in source_list_ids:
            self._session.add(BudgetSourceListModel(budget_id=budget_id, list_id=list_id))
        self._session.flush()
        return _budget_record(row, source_list_ids)

    def _source_list_ids_for(self, budget_ids: list[UUID]) -> dict[UUID, tuple[UUID, ...]]:
        if not budget_ids:
            return {}
        stmt = select(BudgetSourceListModel).where(BudgetSourceListModel.budget_id.in_(budget_ids))
        grouped: dict[UUID, list[UUID]] = defaultdict(list)
        for row in self._session.scalars(stmt).all():
            grouped[row.budget_id].append(row.list_id)
        return {budget_id: tuple(list_ids) for budget_id, list_ids in grouped.items()}

    def list_budgets_for_owner(
        self, owner_user_id: UUID, *, archived: bool = False
    ) -> list[BudgetRecord]:
        stmt = (
            select(BudgetModel)
            .where(
                BudgetModel.owner_user_id == owner_user_id,
                BudgetModel.is_archived == archived,
            )
            .order_by(BudgetModel.created_at.asc(), BudgetModel.id.asc())
        )
        rows = self._session.scalars(stmt).all()
        source_lists_by_budget = self._source_list_ids_for([row.id for row in rows])
        return [_budget_record(row, source_lists_by_budget.get(row.id, ())) for row in rows]

    def get_budget(self, budget_id: UUID, owner_user_id: UUID) -> BudgetRecord | None:
        # Scoping by (id, owner_user_id) together — not id alone, then a
        # separate ownership check — is what makes a budget owned by
        # another user 404 exactly like a nonexistent one (AC #2).
        stmt = select(BudgetModel).where(
            BudgetModel.id == budget_id, BudgetModel.owner_user_id == owner_user_id
        )
        row = self._session.scalars(stmt).one_or_none()
        if row is None:
            return None
        source_list_ids = self._source_list_ids_for([row.id]).get(row.id, ())
        return _budget_record(row, source_list_ids)

    def update_budget(
        self,
        *,
        budget_id: UUID,
        name: str,
        cap_amount: Decimal,
        currency: str,
        source_list_ids: tuple[UUID, ...],
        period_start: date | None = None,
        period_end: date | None = None,
    ) -> BudgetRecord:
        row = self._session.get(BudgetModel, budget_id)
        if row is None:
            raise BudgetNotFoundError()
        row.name = name
        row.cap_amount = cap_amount
        row.currency = currency
        row.period_start = period_start
        row.period_end = period_end
        existing = self._session.scalars(
            select(BudgetSourceListModel).where(BudgetSourceListModel.budget_id == budget_id)
        ).all()
        for source_row in existing:
            self._session.delete(source_row)
        self._session.flush()
        for list_id in source_list_ids:
            self._session.add(BudgetSourceListModel(budget_id=budget_id, list_id=list_id))
        self._session.flush()
        return _budget_record(row, source_list_ids)

    def archive_budget(self, budget_id: UUID) -> None:
        row = self._session.get(BudgetModel, budget_id)
        if row is not None:
            row.is_archived = True
            self._session.flush()

    def unarchive_budget(self, budget_id: UUID) -> None:
        row = self._session.get(BudgetModel, budget_id)
        if row is not None:
            row.is_archived = False
            self._session.flush()

    def delete_budget(self, budget_id: UUID) -> None:
        # FK cascades handle budget_rules/budget_source_lists (CASCADE) and
        # ledger_entries.budget_id (SET NULL) — no manual cascade here.
        row = self._session.get(BudgetModel, budget_id)
        if row is not None:
            self._session.delete(row)
            self._session.flush()

    def list_ledger_entries(self, list_id: UUID) -> list[LedgerEntryRecord]:
        # Delegates to SqlAlchemyListRepository's exact query rather than
        # duplicating it (Story 6.5) — same session, same conversion point.
        from adapters.persistence.repositories import SqlAlchemyListRepository

        return SqlAlchemyListRepository(self._session).list_ledger_entries(list_id)

    def list_ledger_entries_for_lists(self, list_ids: list[UUID]) -> list[LedgerEntryRecord]:
        # Read-time convenience helper, not a hot path (Story 7.1) — one
        # query per source list, concatenated. No new cross-list SQL query
        # for this story; see Completion Notes for a Story 7.2 candidate.
        entries: list[LedgerEntryRecord] = []
        for list_id in list_ids:
            entries.extend(self.list_ledger_entries(list_id))
        return entries

    def get_ledger_entry(self, entry_id: UUID, list_id: UUID) -> LedgerEntryRecord | None:
        row = self._session.scalars(
            select(LedgerEntryModel).where(
                LedgerEntryModel.id == entry_id, LedgerEntryModel.list_id == list_id
            )
        ).one_or_none()
        if row is None:
            return None
        return _ledger_entry_record(row)

    def assign_entry_to_budget(self, entry_id: UUID, budget_id: UUID) -> None:
        row = self._session.get(LedgerEntryModel, entry_id)
        if row is not None:
            row.budget_id = budget_id
            self._session.flush()

    def unassign_entry(self, entry_id: UUID) -> None:
        row = self._session.get(LedgerEntryModel, entry_id)
        if row is not None:
            row.budget_id = None
            self._session.flush()

    def list_rules_for_budget(self, budget_id: UUID) -> list[BudgetRuleRecord]:
        stmt = (
            select(BudgetRuleModel)
            .where(BudgetRuleModel.budget_id == budget_id)
            .order_by(BudgetRuleModel.created_at.asc(), BudgetRuleModel.id.asc())
        )
        rows = self._session.scalars(stmt).all()
        return [_budget_rule_record(row) for row in rows]

    def create_rule(self, rule_id: UUID, budget_id: UUID, match_text: str) -> BudgetRuleRecord:
        row = BudgetRuleModel(
            id=rule_id,
            budget_id=budget_id,
            match_text=match_text,
        )
        self._session.add(row)
        self._session.flush()
        return _budget_rule_record(row)

    def get_rule(self, rule_id: UUID, budget_id: UUID) -> BudgetRuleRecord | None:
        stmt = select(BudgetRuleModel).where(
            BudgetRuleModel.id == rule_id, BudgetRuleModel.budget_id == budget_id
        )
        row = self._session.scalars(stmt).one_or_none()
        return _budget_rule_record(row) if row is not None else None

    def delete_rule(self, rule_id: UUID) -> None:
        row = self._session.get(BudgetRuleModel, rule_id)
        if row is not None:
            self._session.delete(row)
            self._session.flush()
