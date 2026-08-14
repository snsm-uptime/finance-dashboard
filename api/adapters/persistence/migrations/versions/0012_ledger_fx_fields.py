"""Alembic revision: materialize FX fields on ledger_entries (Story 3.5).

Revision ID: 0012_ledger_fx_fields
Revises: 0011_user_alias
Create Date: 2026-08-13

Adds amount_crc / fx_rate / fx_rate_date / fx_fallback (AD-7, AD-5). Existing
CRC-only entries are backfilled so every row carries FX fields going forward;
new non-CRC entries are populated by MaterializeFxService at commit.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0012_ledger_fx_fields"
down_revision: str | None = "0011_user_alias"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "ledger_entries",
        sa.Column(
            "amount_crc",
            sa.Numeric(19, 2),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "ledger_entries",
        sa.Column(
            "fx_rate",
            sa.Numeric(10, 4),
            nullable=False,
            server_default="1",
        ),
    )
    op.add_column(
        "ledger_entries",
        sa.Column("fx_rate_date", sa.Date(), nullable=True),
    )
    op.add_column(
        "ledger_entries",
        sa.Column(
            "fx_fallback",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    # Backfill existing CRC rows: amount_crc = amount, fx_rate = 1,
    # fx_rate_date = posted_date, fx_fallback = false.
    op.execute(
        """
        UPDATE ledger_entries
        SET amount_crc = amount,
            fx_rate = 1,
            fx_rate_date = posted_date,
            fx_fallback = FALSE
        WHERE currency = 'CRC' AND amount_crc = 0
        """
    )


def downgrade() -> None:
    op.drop_column("ledger_entries", "fx_fallback")
    op.drop_column("ledger_entries", "fx_rate_date")
    op.drop_column("ledger_entries", "fx_rate")
    op.drop_column("ledger_entries", "amount_crc")
