"""Alembic revision: manual expense origin fields on ledger_entries (Story 4.2).

Revision ID: 0014_ledger_origin
Revises: 0013_cards
Create Date: 2026-08-14

Adds origin_kind ("card" | "cash" | NULL) and origin_card_id (FK -> cards.id,
ON DELETE SET NULL) to ledger_entries (FR-21). Distinct from product_id, which
stays reserved for the future bank-adapter pipeline (Story 4.1 forward note).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0014_ledger_origin"
down_revision: str | None = "0013_cards"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "ledger_entries",
        sa.Column("origin_kind", sa.String(16), nullable=True),
    )
    op.add_column(
        "ledger_entries",
        sa.Column(
            "origin_card_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("cards.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_ledger_entries_origin_card_id",
        "ledger_entries",
        ["origin_card_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_ledger_entries_origin_card_id", table_name="ledger_entries")
    op.drop_column("ledger_entries", "origin_card_id")
    op.drop_column("ledger_entries", "origin_kind")
