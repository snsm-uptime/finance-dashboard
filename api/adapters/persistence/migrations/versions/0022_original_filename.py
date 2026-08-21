"""Alembic revision: import_statements.original_filename for upload display.

Revision ID: 0022_original_filename
Revises: 0021_import_statements_card_id
Create Date: 2026-08-21

Stores the client-supplied PDF name so review UI can show it instead of the
opaque storage path (uuid.pdf) or the adapter product_id (e.g. bac_credit).

Revision id is kept under 32 chars — alembic_version.version_num is VARCHAR(32).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0022_original_filename"
down_revision: str | None = "0021_import_statements_card_id"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "import_statements",
        sa.Column("original_filename", sa.String(length=255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("import_statements", "original_filename")
