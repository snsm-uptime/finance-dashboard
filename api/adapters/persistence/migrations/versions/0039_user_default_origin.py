"""Alembic revision: users.default_origin_kind — account default for new expenses' origin.

Revision ID: 0039_user_default_origin
Revises: 0038_lists_cards_archived
Create Date: 2026-09-06

Adds `users.default_origin_kind` (nullable String(8), values "cash"/"blank")
so the Account page can configure the payment-origin default new manual
expenses start from — unset/None is treated as "cash" at the application
layer (see domain.preferences.coerce_stored_default_origin_kind).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0039_user_default_origin"
down_revision: str | None = "0038_lists_cards_archived"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("default_origin_kind", sa.String(length=8), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "default_origin_kind")
