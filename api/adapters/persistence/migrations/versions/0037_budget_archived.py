"""Alembic revision: add budgets.is_archived (Story 7.6).

Revision ID: 0037_budget_archived
Revises: 0036_budget_period
Create Date: 2026-09-04

Adds a boolean archive flag to budgets so owners can hide budgets they no
longer track without deleting their history. No index needed (owner-scoped,
small per-user row counts, same reasoning as `list_budgets_for_owner`'s
unindexed name lookup). Chained after 0036_budget_period (Story 7.5, which
landed on main after this story's own creation) rather than 0035 directly.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0037_budget_archived"
down_revision: str | None = "0036_budget_period"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "budgets",
        sa.Column(
            "is_archived",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("budgets", "is_archived")
