"""Alembic revision: import_statements.iban for card identification (Story 4.8.1).

Revision ID: 0018_import_statements_iban
Revises: 0017_import_batches
Create Date: 2026-08-20

Adds `import_statements.iban` (String(64), nullable, indexed) to store the
normalized IBAN extracted from the BAC statement header during upload.
This enables card identification at review-start (AC #1): a match on
user's registered cards auto-assigns the card; an unknown IBAN prompts
card registration before individual accept (AC #2/#3).

Nullable for backward compatibility with pre-IBAN sessions created before
this story (AC #5).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text
from sqlalchemy.dialects import postgresql

revision: str = "0018_import_statements_iban"
down_revision: str | None = "0017_import_batches"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "import_statements",
        sa.Column("iban", sa.String(64), nullable=True),
    )
    op.create_index("ix_import_statements_iban", "import_statements", ["iban"])


def downgrade() -> None:
    # Guard: do not downgrade if there are IBAN values to preserve
    connection = op.get_bind()
    result = connection.execute(text("SELECT COUNT(*) FROM import_statements WHERE iban IS NOT NULL"))
    count = result.scalar()
    if count and count > 0:
        raise RuntimeError(
            f"Cannot downgrade: {count} import statements have IBAN data. "
            "Backup the database before downgrading to avoid permanent data loss."
        )
    op.drop_index("ix_import_statements_iban", table_name="import_statements")
    op.drop_column("import_statements", "iban")
