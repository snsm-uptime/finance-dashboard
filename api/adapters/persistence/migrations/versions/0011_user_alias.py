"""Alembic revision: user alias for readable roster/picker labels.

Revision ID: 0011_user_alias
Revises: 0010_manual_ledger_fields
Create Date: 2026-08-07

Nullable so existing accounts can claim one at the alias gate; uniqueness is on
lower(alias) because the product treats aliases case-insensitively.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0011_user_alias"
down_revision: str | None = "0010_manual_ledger_fields"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("alias", sa.String(length=32), nullable=True))
    op.create_index(
        "uq_users_alias_lower",
        "users",
        [sa.text("lower(alias)")],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_users_alias_lower", table_name="users")
    op.drop_column("users", "alias")
