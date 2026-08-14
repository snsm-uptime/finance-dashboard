"""Alembic revision: cards table (Story 4.1).

Revision ID: 0013_cards
Revises: 0012_ledger_fx_fields
Create Date: 2026-08-14

Adds the `cards` table — user-owned bank cards keyed by IBAN (FR-37, AD-20).
Uniqueness on (user_id, iban) is per-user so two household members can each
register a card on a shared account under their own label.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0013_cards"
down_revision: str | None = "0012_ledger_fx_fields"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "cards",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("label", sa.String(100), nullable=False),
        sa.Column("iban", sa.String(64), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("user_id", "iban", name="uq_cards_user_iban"),
    )


def downgrade() -> None:
    op.drop_table("cards")
