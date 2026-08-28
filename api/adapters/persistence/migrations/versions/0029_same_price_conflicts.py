"""Alembic revision: same_price_conflicts table + list window column (Story 5.5).

Revision ID: 0029_same_price_conflicts
Revises: 0028_stmt_parse_evidence
Create Date: 2026-08-28

Adds the durable same-price conflict queue (AD-10) and a nullable
per-list window-days column (schema-level list-configurability only —
no settings UI ships in this story).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0029_same_price_conflicts"
down_revision: str | None = "0028_stmt_parse_evidence"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("lists", sa.Column("same_price_window_days", sa.Integer(), nullable=True))

    op.create_table(
        "same_price_conflicts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "manual_entry_id",
            UUID(as_uuid=True),
            sa.ForeignKey("ledger_entries.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "parsed_entry_id",
            UUID(as_uuid=True),
            sa.ForeignKey("ledger_entries.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "manual_list_id",
            UUID(as_uuid=True),
            sa.ForeignKey("lists.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "parsed_list_id",
            UUID(as_uuid=True),
            sa.ForeignKey("lists.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "detected_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolution", sa.String(24), nullable=True),
        sa.Column(
            "resolved_by_user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.UniqueConstraint(
            "manual_entry_id", "parsed_entry_id", name="uq_same_price_conflict_pair"
        ),
    )
    op.create_index(
        "ix_same_price_conflicts_parsed_list_resolved",
        "same_price_conflicts",
        ["parsed_list_id", "resolved_at"],
    )
    op.create_index(
        "ix_same_price_conflicts_manual_list_resolved",
        "same_price_conflicts",
        ["manual_list_id", "resolved_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_same_price_conflicts_manual_list_resolved", table_name="same_price_conflicts")
    op.drop_index("ix_same_price_conflicts_parsed_list_resolved", table_name="same_price_conflicts")
    op.drop_table("same_price_conflicts")
    op.drop_column("lists", "same_price_window_days")
