"""Alembic revision: budget attribution — ledger_entries.budget_id + budget_rules (Story 6.5).

Revision ID: 0033_budget_attribution
Revises: 0032_budgets
Create Date: 2026-09-01

Adds `ledger_entries.budget_id` (FK -> budgets.id, ON DELETE SET NULL — mirrors
origin_card_id's nullable-FK shape) for manual attribution, and the
`budget_rules` table for rule-based attribution (FR-49).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0033_budget_attribution"
down_revision: str | None = "0032_budgets"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "ledger_entries",
        sa.Column(
            "budget_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("budgets.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_ledger_entries_budget_id", "ledger_entries", ["budget_id"])

    op.create_table(
        "budget_rules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "budget_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("budgets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "list_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("lists.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("match_text", sa.String(100), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_budget_rules_budget_id", "budget_rules", ["budget_id"])
    op.create_index("ix_budget_rules_list_id", "budget_rules", ["list_id"])


def downgrade() -> None:
    op.drop_index("ix_budget_rules_list_id", table_name="budget_rules")
    op.drop_index("ix_budget_rules_budget_id", table_name="budget_rules")
    op.drop_table("budget_rules")

    op.drop_index("ix_ledger_entries_budget_id", table_name="ledger_entries")
    op.drop_column("ledger_entries", "budget_id")
