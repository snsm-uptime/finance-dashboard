"""Alembic revision: description_aliases table (Story 5.6, FR-23).

Revision ID: 0030_description_aliases
Revises: 0029_same_price_conflicts
Create Date: 2026-08-28

Adds the write-only manual-label/bank-description alias table seeded as a
side effect of a survivor-pick same-price conflict resolution. No read path
ships this story (v1 does not use aliases for ML categorization).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0030_description_aliases"
down_revision: str | None = "0029_same_price_conflicts"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "description_aliases",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "list_id",
            UUID(as_uuid=True),
            sa.ForeignKey("lists.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("manual_label", sa.Text(), nullable=False),
        sa.Column("bank_description", sa.Text(), nullable=False),
        sa.Column(
            "source_conflict_id",
            UUID(as_uuid=True),
            sa.ForeignKey("same_price_conflicts.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint(
            "list_id", "manual_label", "bank_description", name="uq_description_alias_pair"
        ),
    )


def downgrade() -> None:
    op.drop_table("description_aliases")
