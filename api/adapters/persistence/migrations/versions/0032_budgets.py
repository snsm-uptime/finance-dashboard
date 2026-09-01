"""Alembic revision: budgets table (Story 6.3).

Revision ID: 0032_budgets
Revises: 0031_list_settle_assertions
Create Date: 2026-08-31

Adds the `budgets` table — list-scoped named caps (FR-48). No uniqueness
on (list_id, name); nothing in FR-48/epics.md requires unique budget names.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0032_budgets"
down_revision: str | None = "0031_list_settle_assertions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "budgets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "list_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("lists.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("cap_amount", sa.Numeric, nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_budgets_list_id", "budgets", ["list_id"])


def downgrade() -> None:
    op.drop_index("ix_budgets_list_id", table_name="budgets")
    op.drop_table("budgets")
