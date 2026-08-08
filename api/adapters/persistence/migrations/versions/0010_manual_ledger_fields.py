"""Alembic revision: expand ledger_entries for manual hand expenses (Story 3.2).

Revision ID: 0010_manual_ledger_fields
Revises: 0009_split_overrides
Create Date: 2026-08-07

Adds AD-16 CanonicalLine hand-row subset columns. Origin/card fields intentionally
omitted until Story 4.1 (no cards model / FK). product_id and external_ref are
nullable stubs without FK for later import.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0010_manual_ledger_fields"
down_revision: str | None = "0009_split_overrides"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "ledger_entries",
        sa.Column("normalized_description", sa.Text(), nullable=True),
    )
    op.add_column(
        "ledger_entries",
        sa.Column(
            "payer_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=True,
        ),
    )
    op.add_column(
        "ledger_entries",
        sa.Column("provenance", sa.String(length=16), nullable=True),
    )
    op.add_column(
        "ledger_entries",
        sa.Column("line_type", sa.String(length=32), nullable=True),
    )
    op.add_column(
        "ledger_entries",
        sa.Column("posted_date", sa.Date(), nullable=True),
    )
    # Import stubs — no FK (cards arrive in Epic 4). Origin_* columns intentionally absent.
    op.add_column(
        "ledger_entries",
        sa.Column("product_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "ledger_entries",
        sa.Column("external_ref", sa.String(length=255), nullable=True),
    )
    op.create_index("ix_ledger_entries_payer_id", "ledger_entries", ["payer_id"])
    op.create_index("ix_ledger_entries_posted_date", "ledger_entries", ["posted_date"])
    op.create_index(
        "ix_ledger_entries_list_created_at",
        "ledger_entries",
        ["list_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_ledger_entries_list_created_at", table_name="ledger_entries")
    op.drop_index("ix_ledger_entries_posted_date", table_name="ledger_entries")
    op.drop_index("ix_ledger_entries_payer_id", table_name="ledger_entries")
    op.drop_column("ledger_entries", "external_ref")
    op.drop_column("ledger_entries", "product_id")
    op.drop_column("ledger_entries", "posted_date")
    op.drop_column("ledger_entries", "line_type")
    op.drop_column("ledger_entries", "provenance")
    op.drop_column("ledger_entries", "payer_id")
    op.drop_column("ledger_entries", "normalized_description")
