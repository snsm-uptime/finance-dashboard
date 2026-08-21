"""Alembic revision: import_statements.card_id for upload-time identification (Story 4.8.3).

Revision ID: 0021_import_statements_card_id
Revises: 0020_row_level_review
Create Date: 2026-08-21

Adds `import_statements.card_id` (UUID, nullable, indexed, FK to cards.id) to store
the card identified at upload time by matching the statement IBAN to a registered card.

This moves card identification from individual review start (Story 4.8.1) to upload time
(Story 4.8.3), enabling pre-population of card context in both bulk and individual flows.

Nullable for backward compatibility with pre-identification sessions.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0021_import_statements_card_id"
down_revision: str | None = "0020_row_level_review"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "import_statements",
        sa.Column("card_id", sa.UUID(as_uuid=True), nullable=True),
    )
    op.create_index("ix_import_statements_card_id", "import_statements", ["card_id"])
    op.create_foreign_key(
        "fk_import_statements_card_id_cards_id",
        "import_statements",
        "cards",
        ["card_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_import_statements_card_id_cards_id",
        "import_statements",
        type_="foreignkey",
    )
    op.drop_index("ix_import_statements_card_id", table_name="import_statements")
    op.drop_column("import_statements", "card_id")
