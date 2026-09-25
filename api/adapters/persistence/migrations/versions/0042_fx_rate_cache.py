"""Alembic revision: add fx_rate_cache table.

Revision ID: 0042_fx_rate_cache
Revises: 0041_list_membership_hidden
Create Date: 2026-09-24

Caches BCCR daily FX rates per (rate_date, currency) so repeat commits on
the same date don't re-hit the BCCR API (real BCCR client story, AD-7).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0042_fx_rate_cache"
down_revision: str | None = "0041_list_membership_hidden"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "fx_rate_cache",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("rate_date", sa.Date(), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("rate", sa.Numeric(10, 4), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("rate_date", "currency", name="uq_fx_rate_cache_date_currency"),
    )


def downgrade() -> None:
    op.drop_table("fx_rate_cache")
