"""Alembic revision: user profile photo — users.photo_base64.

Revision ID: 0034_user_photo
Revises: 0033_budget_attribution
Create Date: 2026-09-01

Adds `users.photo_base64` (nullable TEXT) to store an optional profile photo
as a base64 data URI, inline on the user row (no separate media storage).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0034_user_photo"
down_revision: str | None = "0033_budget_attribution"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("photo_base64", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "photo_base64")
