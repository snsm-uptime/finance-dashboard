"""Alembic revision: list_settle_assertions table (Story 5.8).

Revision ID: 0031_list_settle_assertions
Revises: 0030_description_aliases
Create Date: 2026-08-29

A viewer-only "my payables are done" timestamp per (list, actor) — never an
inter-member transfer/payment ledger line (AD-21). One row per member per
list; settling again upserts `settled_at` forward, it does not append a log.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0031_list_settle_assertions"
down_revision: str | None = "0030_description_aliases"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "list_settle_assertions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "list_id",
            UUID(as_uuid=True),
            sa.ForeignKey("lists.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "actor_user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("settled_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("list_id", "actor_user_id", name="uq_list_settle_assertion_member"),
    )


def downgrade() -> None:
    op.drop_table("list_settle_assertions")
