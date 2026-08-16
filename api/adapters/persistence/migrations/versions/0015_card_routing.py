"""Alembic revision: card routing mode + default import list (Story 4.3).

Revision ID: 0015_card_routing
Revises: 0014_ledger_origin
Create Date: 2026-08-15

Adds routing_mode ("fixed" | "review", default "review") and fixed_list_id
(FK -> lists.id, ON DELETE SET NULL) to cards (FR-11/FR-16), and
default_import_list_id (same FK/ondelete shape) to users (FR-12). Existing
Story-4.1 cards backfill to "review" mode via server_default — no default
silently assumes a personal-list destination (AC #4).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0015_card_routing"
down_revision: str | None = "0014_ledger_origin"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "cards",
        sa.Column("routing_mode", sa.String(16), nullable=False, server_default="review"),
    )
    op.add_column(
        "cards",
        sa.Column(
            "fixed_list_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("lists.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_cards_fixed_list_id", "cards", ["fixed_list_id"])
    op.add_column(
        "users",
        sa.Column(
            "default_import_list_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("lists.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_users_default_import_list_id", "users", ["default_import_list_id"])


def downgrade() -> None:
    op.drop_index("ix_users_default_import_list_id", table_name="users")
    op.drop_column("users", "default_import_list_id")
    op.drop_index("ix_cards_fixed_list_id", table_name="cards")
    op.drop_column("cards", "fixed_list_id")
    op.drop_column("cards", "routing_mode")
