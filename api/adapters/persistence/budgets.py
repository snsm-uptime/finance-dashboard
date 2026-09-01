"""SQLAlchemy repository for list-scoped budgets (Story 6.3) and attribution
(manual assignment, rules, candidates — Story 6.5)."""

from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from application.budgets import BudgetRecord, BudgetRuleRecord
from application.expenses import LedgerEntryRecord
from sqlalchemy import select
from sqlalchemy.orm import Session

from adapters.persistence.models import BudgetModel, BudgetRuleModel, LedgerEntryModel
from adapters.persistence.repositories import _ledger_entry_record


def _budget_record(row: BudgetModel) -> BudgetRecord:
    return BudgetRecord(
        id=row.id,
        list_id=row.list_id,
        name=row.name,
        cap_amount=row.cap_amount,
        currency=row.currency,
        created_at=row.created_at,
    )


def _budget_rule_record(row: BudgetRuleModel) -> BudgetRuleRecord:
    return BudgetRuleRecord(
        id=row.id,
        budget_id=row.budget_id,
        list_id=row.list_id,
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
        list_id: UUID,
        name: str,
        cap_amount: Decimal,
        currency: str,
    ) -> BudgetRecord:
        row = BudgetModel(
            id=budget_id,
            list_id=list_id,
            name=name,
            cap_amount=cap_amount,
            currency=currency,
        )
        self._session.add(row)
        self._session.flush()
        return _budget_record(row)

    def list_budgets_for_list(self, list_id: UUID) -> list[BudgetRecord]:
        stmt = (
            select(BudgetModel)
            .where(BudgetModel.list_id == list_id)
            .order_by(BudgetModel.created_at.asc(), BudgetModel.id.asc())
        )
        rows = self._session.scalars(stmt).all()
        return [_budget_record(row) for row in rows]

    def get_budget(self, budget_id: UUID, list_id: UUID) -> BudgetRecord | None:
        # Scoping by (id, list_id) together — not id alone, then a separate
        # ownership check — is what makes a budget on a different list 404
        # exactly like a nonexistent one (Story 6.4 AC #3).
        stmt = select(BudgetModel).where(
            BudgetModel.id == budget_id, BudgetModel.list_id == list_id
        )
        row = self._session.scalars(stmt).one_or_none()
        return _budget_record(row) if row is not None else None

    def list_ledger_entries(self, list_id: UUID) -> list[LedgerEntryRecord]:
        # Delegates to SqlAlchemyListRepository's exact query rather than
        # duplicating it (Story 6.5) — same session, same conversion point.
        from adapters.persistence.repositories import SqlAlchemyListRepository

        return SqlAlchemyListRepository(self._session).list_ledger_entries(list_id)

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

    def create_rule(
        self, rule_id: UUID, budget_id: UUID, list_id: UUID, match_text: str
    ) -> BudgetRuleRecord:
        row = BudgetRuleModel(
            id=rule_id,
            budget_id=budget_id,
            list_id=list_id,
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
