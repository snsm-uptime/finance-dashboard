"""Alembic revision: import_reviewed_at on ledger entries (Story 4.15).

Revision ID: 0025_import_reviewed_at
Revises: 0024_import_dedup_identity
Create Date: 2026-08-24

Nullable timestamp set when a freshly imported parser row is acknowledged
(origin edit or explicit mark-reviewed). No index, no server default, no
backfill — existing rows stay NULL.

Revision id is kept under 32 chars — alembic_version.version_num is VARCHAR(32).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0025_import_reviewed_at"
down_revision: str | None = "0024_import_dedup_identity"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "ledger_entries",
        sa.Column("import_reviewed_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("ledger_entries", "import_reviewed_at")
