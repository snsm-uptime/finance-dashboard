"""Alembic revision: users.default_origin_card_id — default origin can name a card.

Revision ID: 0040_user_default_origin_card
Revises: 0039_user_default_origin
Create Date: 2026-09-06

Adds `users.default_origin_card_id` (nullable UUID FK -> cards.id, ON DELETE
SET NULL) so the default-origin setting can point at one of the account's own
cards, not just cash/blank. `default_origin_kind` now also accepts "card"
(see domain.preferences.ALLOWED_DEFAULT_ORIGIN_KINDS).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0040_user_default_origin_card"
down_revision: str | None = "0039_user_default_origin"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("default_origin_card_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index(
        "ix_users_default_origin_card_id", "users", ["default_origin_card_id"]
    )
    op.create_foreign_key(
        "fk_users_default_origin_card_id_cards",
        "users",
        "cards",
        ["default_origin_card_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_users_default_origin_card_id_cards", "users", type_="foreignkey")
    op.drop_index("ix_users_default_origin_card_id", table_name="users")
    op.drop_column("users", "default_origin_card_id")
