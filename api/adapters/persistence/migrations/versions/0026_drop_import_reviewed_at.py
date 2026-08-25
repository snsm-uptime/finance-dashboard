"""Alembic revision: drop unused import_reviewed_at (Story 4.15 review).

Revision ID: 0026_drop_import_reviewed_at
Revises: 0025_import_reviewed_at
Create Date: 2026-08-25

Badge visibility is the Costa Rica calendar day of created_at, not a
persisted review timestamp. 0025 added the column; this drops it after
the mark-reviewed write surface was removed.

Revision id is kept under 32 chars — alembic_version.version_num is VARCHAR(32).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0026_drop_import_reviewed_at"
down_revision: str | None = "0025_import_reviewed_at"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_column("ledger_entries", "import_reviewed_at")


def downgrade() -> None:
    op.add_column(
        "ledger_entries",
        sa.Column("import_reviewed_at", sa.DateTime(timezone=True), nullable=True),
    )
