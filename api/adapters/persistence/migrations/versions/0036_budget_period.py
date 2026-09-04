"""Alembic revision: optional date-range period on budgets (Story 7.5).

Revision ID: 0036_budget_period
Revises: 0035_budgets_standalone_entity
Create Date: 2026-09-03

Adds two nullable `Date` columns to `budgets`: `period_start`/`period_end`.
No CHECK constraint at the DB level — the `start <= end` invariant lives in
`domain/budgets.py::validate_budget_period` per AD-1, matching how
cap/currency/name are handled. Downgrade drops both columns (lossy: any
period data is discarded).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0036_budget_period"
down_revision: str | None = "0035_budgets_standalone_entity"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("budgets", sa.Column("period_start", sa.Date(), nullable=True))
    op.add_column("budgets", sa.Column("period_end", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("budgets", "period_end")
    op.drop_column("budgets", "period_start")
