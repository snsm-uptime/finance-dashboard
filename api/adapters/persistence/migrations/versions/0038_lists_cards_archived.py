"""Alembic revision: add lists.is_archived and cards.is_archived (Story 9.1).

Revision ID: 0038_lists_cards_archived
Revises: 0037_budget_archived
Create Date: 2026-09-04

Adds a boolean archive flag to lists and cards, mirroring Story 7.6's
budgets.is_archived. No index needed on either column: lists are
membership-scoped per-user (small row counts, same reasoning as
list_budgets_for_owner's unindexed lookup) and cards are already scoped by
user_id with an existing unique index on (user_id, iban).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0038_lists_cards_archived"
down_revision: str | None = "0037_budget_archived"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "lists",
        sa.Column(
            "is_archived",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column(
        "cards",
        sa.Column(
            "is_archived",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("cards", "is_archived")
    op.drop_column("lists", "is_archived")
