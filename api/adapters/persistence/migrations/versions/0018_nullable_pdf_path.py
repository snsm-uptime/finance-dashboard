"""Alembic revision: nullable import_statements.pdf_path after commit cleanup.

Revision ID: 0018_nullable_pdf_path
Revises: 0017_import_batches
Create Date: 2026-08-20

AD-3: after a clean commit/skip with no remaining staged or failed
statements, the source PDF is deleted and path refs are cleared. The
column must be nullable so those rows can drop the path without keeping
a dead filesystem pointer.

Revision id is kept under 32 chars — alembic_version.version_num is VARCHAR(32).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0018_nullable_pdf_path"
down_revision: str | None = "0017_import_batches"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "import_statements",
        "pdf_path",
        existing_type=sa.String(500),
        nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "import_statements",
        "pdf_path",
        existing_type=sa.String(500),
        nullable=False,
    )
