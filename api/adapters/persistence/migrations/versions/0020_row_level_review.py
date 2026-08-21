"""Alembic revision: row-level review columns + per-row commit uniqueness (Story 4.10).

Revision ID: 0020_row_level_review
Revises: 0019_import_statements_iban
Create Date: 2026-08-20

Adds independent status/sequence/resolution on `import_candidate_rows`, a
nullable UNIQUE `ledger_entries.import_candidate_row_id` (double-commit
backstop; NULLs stay distinct so manual expenses are unaffected), then drops
`uq_import_batches_statement_id` so one statement may spawn many batches
(amended AD-4). Both protection layers exist before that unique is dropped.

PRE-MIGRATION REQUIREMENT (operator step, decided at code review 2026-08-21):
discard and re-upload every open (non-discarded, non-committed) Import Session
before applying this revision. The `sequence` backfill below cannot recover the
original parse order for pre-existing rows: `import_candidate_rows.created_at`
is a `now()` server default, which in Postgres is the *transaction* timestamp,
so every row of a statement inserted in one request shares the same value and
the ORDER BY falls through to a random `uuid4()` id. Because
`ImportStatementModel.candidate_rows` now orders by `sequence` and
`uq_import_candidate_rows_statement_sequence` freezes it, any surviving
pre-4.10 statement would render in a permanently scrambled order. Rows created
after this revision get their `sequence` from `create_session`'s deterministic
`enumerate`, so only in-flight sessions are affected.

Downgrade re-creates `uq_import_batches_statement_id`. That is unsafe once a
statement has two batches — matches the Sprint Change Proposal rollback
posture. Do not invent a data-repair downgrade.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0020_row_level_review"
down_revision: str | None = "0019_import_statements_iban"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "import_candidate_rows",
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default="pending",
        ),
    )
    op.add_column(
        "import_candidate_rows",
        sa.Column(
            "resolved_list_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("lists.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "import_candidate_rows",
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "import_candidate_rows",
        sa.Column("sequence", sa.Integer(), nullable=True),
    )

    op.execute(
        sa.text(
            """
            UPDATE import_candidate_rows AS r
            SET sequence = sub.seq
            FROM (
                SELECT id,
                       ROW_NUMBER() OVER (
                           PARTITION BY statement_id ORDER BY created_at, id
                       ) - 1 AS seq
                FROM import_candidate_rows
            ) AS sub
            WHERE r.id = sub.id
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE import_candidate_rows AS r
            SET status = CASE
                WHEN s.status = 'committed' THEN 'committed'
                WHEN s.status = 'skipped' THEN 'deleted'
                WHEN r.amount = 0 THEN 'excluded_zero_amount'
                ELSE 'pending'
            END
            FROM import_statements AS s
            WHERE r.statement_id = s.id
            """
        )
    )
    op.alter_column("import_candidate_rows", "sequence", nullable=False)
    op.create_unique_constraint(
        "uq_import_candidate_rows_statement_sequence",
        "import_candidate_rows",
        ["statement_id", "sequence"],
    )

    op.add_column(
        "ledger_entries",
        sa.Column(
            "import_candidate_row_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
    )
    op.create_foreign_key(
        "fk_ledger_entries_import_candidate_row_id",
        "ledger_entries",
        "import_candidate_rows",
        ["import_candidate_row_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_unique_constraint(
        "uq_ledger_entries_import_candidate_row_id",
        "ledger_entries",
        ["import_candidate_row_id"],
    )

    op.drop_constraint("uq_import_batches_statement_id", "import_batches", type_="unique")


def downgrade() -> None:
    # Unsafe once a statement has two batches — restoring the unique will
    # fail (or would require collapsing batches, which this revision does not).
    op.create_unique_constraint(
        "uq_import_batches_statement_id", "import_batches", ["statement_id"]
    )

    op.drop_constraint(
        "uq_ledger_entries_import_candidate_row_id", "ledger_entries", type_="unique"
    )
    op.drop_constraint(
        "fk_ledger_entries_import_candidate_row_id", "ledger_entries", type_="foreignkey"
    )
    op.drop_column("ledger_entries", "import_candidate_row_id")

    op.drop_constraint(
        "uq_import_candidate_rows_statement_sequence",
        "import_candidate_rows",
        type_="unique",
    )
    op.drop_column("import_candidate_rows", "sequence")
    op.drop_column("import_candidate_rows", "resolved_at")
    op.drop_column("import_candidate_rows", "resolved_list_id")
    op.drop_column("import_candidate_rows", "status")
