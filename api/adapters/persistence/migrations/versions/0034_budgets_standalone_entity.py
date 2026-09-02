"""Alembic revision: budgets become a standalone owner-scoped entity (Story 7.1).

Revision ID: 0034_budgets_standalone_entity
Revises: 0033_budget_attribution
Create Date: 2026-09-01

AD-30: budgets stop being list-scoped (single `list_id`) and become owned by
a user, with one or more source lists (`budget_source_lists`). This revision:
1. adds `budgets.owner_user_id` nullable
2. backfills it from each budget's (soon-to-be-dropped) list's owner
3. makes `owner_user_id` NOT NULL
4. creates `budget_source_lists` (composite PK, indexed on list_id)
5. backfills one `budget_source_lists` row per existing budget from its old list_id
6. drops `budgets.list_id` (+ its index)
7. drops `budget_rules.list_id` (+ its index) — Story 7.1 also drops the
   list-scoping on rules; rules are read-time text matches scoped to their
   budget only, never queried by list_id directly.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0034_budgets_standalone_entity"
down_revision: str | None = "0033_budget_attribution"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "budgets",
        sa.Column(
            "owner_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.execute(
        "UPDATE budgets SET owner_user_id = "
        "(SELECT owner_id FROM lists WHERE lists.id = budgets.list_id)"
    )
    op.alter_column("budgets", "owner_user_id", nullable=False)
    op.create_index("ix_budgets_owner_user_id", "budgets", ["owner_user_id"])

    op.create_table(
        "budget_source_lists",
        sa.Column(
            "budget_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("budgets.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "list_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("lists.id", ondelete="CASCADE"),
            primary_key=True,
        ),
    )
    op.create_index("ix_budget_source_lists_list_id", "budget_source_lists", ["list_id"])

    op.execute(
        "INSERT INTO budget_source_lists (budget_id, list_id) SELECT id, list_id FROM budgets"
    )

    op.drop_index("ix_budgets_list_id", table_name="budgets")
    op.drop_column("budgets", "list_id")

    op.drop_index("ix_budget_rules_list_id", table_name="budget_rules")
    op.drop_column("budget_rules", "list_id")


def downgrade() -> None:
    op.add_column(
        "budget_rules",
        sa.Column(
            "list_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("lists.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.execute(
        "UPDATE budget_rules SET list_id = "
        "(SELECT list_id FROM budget_source_lists "
        " WHERE budget_source_lists.budget_id = budget_rules.budget_id LIMIT 1)"
    )
    op.create_index("ix_budget_rules_list_id", "budget_rules", ["list_id"])

    op.add_column(
        "budgets",
        sa.Column(
            "list_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("lists.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    # Lossy: a budget with more than one source list only recovers its
    # first (arbitrary, per-budget-insertion-order) source list on downgrade
    # (matches AD-30's documented lossy-downgrade limitation).
    op.execute(
        "UPDATE budgets SET list_id = "
        "(SELECT list_id FROM budget_source_lists "
        " WHERE budget_source_lists.budget_id = budgets.id LIMIT 1)"
    )
    op.create_index("ix_budgets_list_id", "budgets", ["list_id"])

    op.drop_index("ix_budget_source_lists_list_id", table_name="budget_source_lists")
    op.drop_table("budget_source_lists")

    op.drop_index("ix_budgets_owner_user_id", table_name="budgets")
    op.drop_column("budgets", "owner_user_id")
