"""Alembic revision: flagged rows, statement notes, section totals on import_statements.

Revision ID: 0043_stmt_review_fields
Revises: 0042_fx_rate_cache
Create Date: 2026-11-09

Promerica partial import (spec 001-promerica-statement-layout, FR-009, FR-012,
FR-013): unreadable rows are kept as reviewable JSON (review_status lives in
each item), points-transfer amounts are kept as statement notes, and printed
section totals are kept for the reconciliation check. Nullable, no backfill.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0043_stmt_review_fields"
down_revision: str | None = "0042_fx_rate_cache"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("import_statements", sa.Column("flagged_rows", JSONB(), nullable=True))
    op.add_column("import_statements", sa.Column("statement_notes", JSONB(), nullable=True))
    op.add_column("import_statements", sa.Column("section_totals", JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("import_statements", "section_totals")
    op.drop_column("import_statements", "statement_notes")
    op.drop_column("import_statements", "flagged_rows")
