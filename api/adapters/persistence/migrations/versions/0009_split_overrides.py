"""Alembic revision: minimal ledger/receipt stubs + split overrides (Story 2.6).

Revision ID: 0009_split_overrides
Revises: 0008_list_default_split
Create Date: 2026-08-06

Maps to future LEDGER_ENTRY in ARCHITECTURE-SPINE: this revision adds a minimal
allocatable subject row + override configuration storage. Receipt totals are
explicit amounts (not derived from child line sums) for Stories 3.2 / 4.x.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0009_split_overrides"
down_revision: str | None = "0008_list_default_split"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "receipts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "list_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("lists.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("amount", sa.Numeric(18, 4), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_receipts_list_id", "receipts", ["list_id"])

    op.create_table(
        "ledger_entries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "list_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("lists.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("amount", sa.Numeric(18, 4), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column(
            "receipt_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("receipts.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_ledger_entries_list_id", "ledger_entries", ["list_id"])
    op.create_index("ix_ledger_entries_receipt_id", "ledger_entries", ["receipt_id"])

    op.create_table(
        "split_overrides",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "list_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("lists.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("subject_kind", sa.String(length=16), nullable=False),
        sa.Column("subject_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "set_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "subject_kind",
            "subject_id",
            name="uq_split_override_subject",
        ),
    )
    op.create_index("ix_split_overrides_list_id", "split_overrides", ["list_id"])


def downgrade() -> None:
    op.drop_index("ix_split_overrides_list_id", table_name="split_overrides")
    op.drop_table("split_overrides")
    op.drop_index("ix_ledger_entries_receipt_id", table_name="ledger_entries")
    op.drop_index("ix_ledger_entries_list_id", table_name="ledger_entries")
    op.drop_table("ledger_entries")
    op.drop_index("ix_receipts_list_id", table_name="receipts")
    op.drop_table("receipts")
