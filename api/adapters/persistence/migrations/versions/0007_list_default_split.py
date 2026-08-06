"""Alembic revision: list standing default split (FR-9 / Story 2.5).

Revision ID: 0007_list_default_split
Revises: 0006_last_opened_list
Create Date: 2026-08-06
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0007_list_default_split"
down_revision: str | None = "0006_last_opened_list"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "lists",
        sa.Column(
            "default_split_mode",
            sa.String(length=32),
            nullable=False,
            server_default="even",
        ),
    )
    op.create_table(
        "list_default_split_shares",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "list_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("lists.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("percentage", sa.Numeric(12, 4), nullable=False),
        sa.UniqueConstraint("list_id", "user_id", name="uq_list_default_split_share"),
    )
    op.create_index(
        "ix_list_default_split_shares_list_id",
        "list_default_split_shares",
        ["list_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_list_default_split_shares_list_id", table_name="list_default_split_shares")
    op.drop_table("list_default_split_shares")
    op.drop_column("lists", "default_split_mode")
