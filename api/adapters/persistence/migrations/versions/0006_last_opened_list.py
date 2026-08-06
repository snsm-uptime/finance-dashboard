"""Alembic revision: users.last_opened_list_id account preference.

Revision ID: 0006_last_opened_list
Revises: 0005_user_preferences
Create Date: 2026-08-06
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0006_last_opened_list"
down_revision: str | None = "0005_user_preferences"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "last_opened_list_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("lists.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "last_opened_list_id")
