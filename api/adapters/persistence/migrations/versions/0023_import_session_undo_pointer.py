"""Alembic revision: single-level undo pointer on import_sessions.

Revision ID: 0023_import_session_undo_pointer
Revises: 0022_original_filename
Create Date: 2026-08-21

Row-level review resolves one transaction at a time, and undo targets the last
action rather than a row the caller names. Persisting the pointer on the session
(rather than holding it in client state) is what lets undo survive a reload.

No backfill: an existing session with a null pointer is correctly "nothing to
undo".

Revision id is kept under 32 chars — alembic_version.version_num is VARCHAR(32).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0023_import_session_undo_pointer"
down_revision: str | None = "0022_original_filename"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "import_sessions",
        sa.Column("last_resolved_row_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    # `excluded_zero_amount` is 20 chars — the same width 0020 chose for the
    # row status column, mirrored here so a prior status always fits.
    op.add_column(
        "import_sessions", sa.Column("last_resolved_action", sa.String(16), nullable=True)
    )
    op.add_column(
        "import_sessions", sa.Column("last_resolved_prior_status", sa.String(20), nullable=True)
    )
    op.create_foreign_key(
        "fk_import_sessions_last_resolved_row_id",
        "import_sessions",
        "import_candidate_rows",
        ["last_resolved_row_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_import_sessions_last_resolved_row_id", "import_sessions", type_="foreignkey"
    )
    op.drop_column("import_sessions", "last_resolved_prior_status")
    op.drop_column("import_sessions", "last_resolved_action")
    op.drop_column("import_sessions", "last_resolved_row_id")
