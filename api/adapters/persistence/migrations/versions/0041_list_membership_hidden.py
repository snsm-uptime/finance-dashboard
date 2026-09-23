"""Alembic revision: add list_memberships.is_hidden (member-scoped list hide).

Revision ID: 0041_list_membership_hidden
Revises: 0040_user_default_origin_card
Create Date: 2026-09-21

Adds a per-membership boolean so a non-owner member can hide a list from
their own dashboard, independent of the owner-only lists.is_archived flag
added in Story 9.1. No index needed: list_for_user already scopes by
(user_id) via the existing membership join, same reasoning as the
unindexed is_archived columns.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0041_list_membership_hidden"
down_revision: str | None = "0040_user_default_origin_card"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "list_memberships",
        sa.Column(
            "is_hidden",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("list_memberships", "is_hidden")
