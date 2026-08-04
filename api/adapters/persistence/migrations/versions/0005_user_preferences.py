"""Alembic revision: users.language + users.theme account preferences.

Revision ID: 0005_user_preferences
Revises: 0004_email_verification
Create Date: 2026-08-04
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005_user_preferences"
down_revision: str | None = "0004_email_verification"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("language", sa.String(length=8), nullable=True))
    op.add_column("users", sa.Column("theme", sa.String(length=16), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "theme")
    op.drop_column("users", "language")
