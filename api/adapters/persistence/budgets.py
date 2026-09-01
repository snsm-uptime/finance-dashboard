"""SQLAlchemy repository for list-scoped budgets (Story 6.3)."""

from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from application.budgets import BudgetRecord
from sqlalchemy import select
from sqlalchemy.orm import Session

from adapters.persistence.models import BudgetModel


def _budget_record(row: BudgetModel) -> BudgetRecord:
    return BudgetRecord(
        id=row.id,
        list_id=row.list_id,
        name=row.name,
        cap_amount=row.cap_amount,
        currency=row.currency,
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
