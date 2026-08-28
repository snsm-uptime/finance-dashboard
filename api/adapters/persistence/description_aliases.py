"""SqlAlchemyDescriptionAliasRepository (Story 5.6, FR-23)."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from adapters.persistence.models import DescriptionAliasModel


class SqlAlchemyDescriptionAliasRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def record_alias(
        self,
        *,
        list_id: UUID,
        manual_label: str,
        bank_description: str,
        source_conflict_id: UUID | None,
    ) -> None:
        from uuid import uuid4

        try:
            with self._session.begin_nested():
                self._session.add(
                    DescriptionAliasModel(
                        id=uuid4(),
                        list_id=list_id,
                        manual_label=manual_label,
                        bank_description=bank_description,
                        source_conflict_id=source_conflict_id,
                    )
                )
                self._session.flush()
        except IntegrityError as exc:
            # UNIQUE (list_id, manual_label, bank_description) — a re-upload
            # that re-confirms the same pair is a no-op, not an error. Any
            # other integrity violation is a real failure and must not be
            # swallowed alongside the expected dedup case.
            constraint = getattr(getattr(exc.orig, "diag", None), "constraint_name", None)
            if constraint is not None and constraint != "uq_description_alias_pair":
                raise
