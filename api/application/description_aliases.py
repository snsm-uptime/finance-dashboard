"""Record-alias application service (Story 5.6, FR-23)."""

from __future__ import annotations

from typing import Protocol
from uuid import UUID

from domain.description_alias import normalize_alias_pair


class DescriptionAliasRepository(Protocol):
    def record_alias(
        self,
        *,
        list_id: UUID,
        manual_label: str,
        bank_description: str,
        source_conflict_id: UUID | None,
    ) -> None:
        """No-op (not an error) if the `(list_id, manual_label,
        bank_description)` triple already exists (UNIQUE guard)."""
        ...


class NullDescriptionAliasRepository:
    """No-op default — keeps pre-existing `ResolveSamePriceConflictService`
    call sites compiling unchanged when no alias repo is injected."""

    def record_alias(
        self,
        *,
        list_id: UUID,
        manual_label: str,
        bank_description: str,
        source_conflict_id: UUID | None,
    ) -> None:
        return None


class RecordDescriptionAliasService:
    def __init__(self, repo: DescriptionAliasRepository) -> None:
        self._repo = repo

    def execute(
        self,
        *,
        list_id: UUID,
        manual_label: str | None,
        bank_description: str | None,
        source_conflict_id: UUID | None,
    ) -> None:
        pair = normalize_alias_pair(manual_label, bank_description)
        if pair is None:
            return
        manual, bank = pair
        self._repo.record_alias(
            list_id=list_id,
            manual_label=manual,
            bank_description=bank,
            source_conflict_id=source_conflict_id,
        )


__all__ = [
    "DescriptionAliasRepository",
    "NullDescriptionAliasRepository",
    "RecordDescriptionAliasService",
]
