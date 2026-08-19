"""Alembic revision: import sessions / statements / candidate rows (Story 4.6).

Revision ID: 0016_import_sessions
Revises: 0015_card_routing
Create Date: 2026-08-18

Adds the Import Session staging schema (AD-4): `import_sessions` (one row per
upload, soft-deleted via `discarded_at` so "discard drops only uncommitted
state" is trivially auditable), `import_statements` (one row per detected
statement — `product_id` is a String adapter id, e.g. "bac_credit", a
different type than the speculative UUID `ledger_entries.product_id` added
in Story 3.2; see this story's Completion Notes), and `import_candidate_rows`
(one row per parsed CanonicalLine for staged statements only).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0016_import_sessions"
down_revision: str | None = "0015_card_routing"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "import_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
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
        sa.Column("discarded_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "import_statements",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "session_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("import_sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("product_id", sa.String(64), nullable=False),
        sa.Column("pdf_path", sa.String(500), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_import_statements_session_id", "import_statements", ["session_id"])

    op.create_table(
        "import_candidate_rows",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "statement_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("import_statements.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("posted_date", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(18, 4), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("line_type", sa.String(32), nullable=False),
        sa.Column("normalized_description", sa.Text(), nullable=False),
        sa.Column("external_ref", sa.String(255), nullable=True),
        sa.Column("ref_quality", sa.String(16), nullable=True),
        sa.Column("provenance", sa.String(16), nullable=False, server_default="parser"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_import_candidate_rows_statement_id", "import_candidate_rows", ["statement_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_import_candidate_rows_statement_id", table_name="import_candidate_rows")
    op.drop_table("import_candidate_rows")
    op.drop_index("ix_import_statements_session_id", table_name="import_statements")
    op.drop_table("import_statements")
    op.drop_table("import_sessions")
