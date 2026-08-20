"""Alembic revision: import batches + ledger_entries.import_batch_id (Story 4.7).

Revision ID: 0017_import_batches
Revises: 0016_import_sessions
Create Date: 2026-08-19

Adds `import_batches` (AD-4: one row per committed Statement — `statement_id`
is unique, enforcing "one Statement = one batch_id, ever") and a nullable
`ledger_entries.import_batch_id` FK so committed rows trace back to the
batch that created them. Hand-entered expenses leave it null.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0017_import_batches"
down_revision: str | None = "0016_import_sessions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "import_batches",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "session_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("import_sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "statement_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("import_statements.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "list_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("lists.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "actor_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_import_batches_session_id", "import_batches", ["session_id"])
    op.create_index("ix_import_batches_list_id", "import_batches", ["list_id"])
    op.create_unique_constraint(
        "uq_import_batches_statement_id", "import_batches", ["statement_id"]
    )

    op.add_column(
        "ledger_entries",
        sa.Column(
            "import_batch_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("import_batches.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_ledger_entries_import_batch_id", "ledger_entries", ["import_batch_id"])


def downgrade() -> None:
    op.drop_index("ix_ledger_entries_import_batch_id", table_name="ledger_entries")
    op.drop_column("ledger_entries", "import_batch_id")

    op.drop_constraint("uq_import_batches_statement_id", "import_batches", type_="unique")
    op.drop_index("ix_import_batches_list_id", table_name="import_batches")
    op.drop_index("ix_import_batches_session_id", table_name="import_batches")
    op.drop_table("import_batches")
