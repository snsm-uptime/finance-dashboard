"""Alembic revision: list_invite_tokens.

Revision ID: 0007_list_invite_tokens
Revises: 0006_last_opened_list
Create Date: 2026-08-06
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0007_list_invite_tokens"
down_revision: str | None = "0006_last_opened_list"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "list_invite_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("list_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("inviter_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("locale", sa.String(length=8), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["list_id"], ["lists.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["inviter_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index(
        "ix_list_invite_tokens_list_id_email",
        "list_invite_tokens",
        ["list_id", "email"],
        unique=False,
    )
    op.create_index(
        "ix_list_invite_tokens_inviter_user_id",
        "list_invite_tokens",
        ["inviter_user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_list_invite_tokens_inviter_user_id", table_name="list_invite_tokens")
    op.drop_index("ix_list_invite_tokens_list_id_email", table_name="list_invite_tokens")
    op.drop_table("list_invite_tokens")
