"""Alembic revision: dedup identity on ledger entries + session finalize (Story 4.12).

Revision ID: 0024_import_dedup_identity_and_finalize
Revises: 0023_import_session_undo_pointer
Create Date: 2026-08-23

Three columns, one index:

- `ledger_entries.import_identity` — the domain-computed canonical identity
  (AD-18, amended by this story), persisted because it cannot be reconstructed
  from ledger columns at query time: `ledger_entries.product_id` is a UUID stub
  that never receives the adapter's *string* product_id.
- `import_candidate_rows.dedup_skipped` — the row resolved but wrote no ledger
  entry. Together with `status` it derives both counts on the session payload,
  which is what keeps them honest across undo (a counter column would drift).
- `import_sessions.finalized_at` — Save / bulk commit, the moment that unlocks
  the AD-3 PDF delete. Row-grain assign/delete no longer releases the PDF.

The index is deliberately **non-unique**: two genuinely distinct purchases can
share a fallback identity (same merchant, amount and day, no stable
external_ref), and the specified behavior there is skip-and-count, not a 500 on
a legitimate statement. Double-commit protection is a different problem and
already has its two layers (guarded UPDATE + `import_candidate_row_id UNIQUE`).

No backfill — decided 2026-08-23. A pre-4.12 import was never identity-keyed,
so claiming one as a duplicate would be a guess. Existing ledger rows keep
`import_identity = NULL` and are simply invisible to dedup (a NULL never
matches an `IN` list); existing sessions keep `finalized_at = NULL`.

Revision id is kept under 32 chars — alembic_version.version_num is VARCHAR(32).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0024_import_dedup_identity"
down_revision: str | None = "0023_import_session_undo_pointer"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("ledger_entries", sa.Column("import_identity", sa.String(80), nullable=True))
    op.create_index(
        "ix_ledger_entries_list_import_identity",
        "ledger_entries",
        ["list_id", "import_identity"],
        unique=False,
    )
    op.add_column(
        "import_candidate_rows",
        sa.Column("dedup_skipped", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "import_sessions", sa.Column("finalized_at", sa.DateTime(timezone=True), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("import_sessions", "finalized_at")
    op.drop_column("import_candidate_rows", "dedup_skipped")
    op.drop_index("ix_ledger_entries_list_import_identity", table_name="ledger_entries")
    op.drop_column("ledger_entries", "import_identity")
