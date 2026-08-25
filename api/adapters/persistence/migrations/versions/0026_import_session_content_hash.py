"""Alembic revision: content_hash on import_sessions (Story 4.16).

Revision ID: 0026_import_session_content_hash
Revises: 0025_import_reviewed_at
Create Date: 2026-08-24

Nullable SHA-256 hex digest of the uploaded PDF bytes, used to reject
re-uploading a file already active (not discarded/finalized) for the same
user (AC #4). No backfill — pre-4.16 sessions never participate in hash
dedup. A partial, non-unique index is defense-in-depth only; the
application-level check in UploadStatementPdfService is the contract.

Revision id is kept under 32 chars — alembic_version.version_num is VARCHAR(32).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0026_import_session_content_hash"
down_revision: str | None = "0025_import_reviewed_at"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "import_sessions",
        sa.Column("content_hash", sa.String(length=64), nullable=True),
    )
    op.create_index(
        "ix_import_sessions_user_id_content_hash_active",
        "import_sessions",
        ["user_id", "content_hash"],
        unique=False,
        postgresql_where=sa.text("discarded_at IS NULL AND finalized_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index(
        "ix_import_sessions_user_id_content_hash_active",
        table_name="import_sessions",
    )
    op.drop_column("import_sessions", "content_hash")
