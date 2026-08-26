"""Alembic revision: parse_evidence JSONB on import_statements (Story 5.1).

Revision ID: 0028_stmt_parse_evidence
Revises: 0027_import_session_content_hash
Create Date: 2026-08-26

Nullable JSONB of display-only parse-failure evidence. No backfill.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0028_stmt_parse_evidence"
down_revision: str | None = "0027_import_session_content_hash"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("import_statements", sa.Column("parse_evidence", JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("import_statements", "parse_evidence")
