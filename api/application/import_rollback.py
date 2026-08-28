"""Roll back a committed Import Batch (Story 5.4 / FR-30)."""

from __future__ import annotations

from contextlib import AbstractContextManager
from dataclasses import dataclass
from typing import Protocol
from uuid import UUID

from domain.errors import ImportBatchNotFoundError, ListNotFoundError, NotListMemberError

from application.list_access import (
    AuthorizeListAccessCommand,
    AuthorizeListAccessService,
    ListAccessLookup,
)


@dataclass(frozen=True, slots=True)
class ImportBatchPeek:
    id: UUID
    list_id: UUID


class ImportBatchRollbackRepository(Protocol):
    def get_import_batch(self, batch_id: UUID) -> ImportBatchPeek | None: ...

    def rollback_batch(self, batch_id: UUID) -> int:
        """Delete item split overrides, all ledger rows for the batch, then the batch.

        Returns removed ledger-entry count. Does not reopen candidates.
        """
        ...

    def atomic(self) -> AbstractContextManager[None]: ...


@dataclass(frozen=True, slots=True)
class RollbackImportBatchCommand:
    actor_user_id: UUID
    list_id: UUID
    batch_id: UUID


class RollbackImportBatchService:
    def __init__(
        self,
        repo: ImportBatchRollbackRepository,
        list_lookup: ListAccessLookup,
    ) -> None:
        self._repo = repo
        self._list_lookup = list_lookup

    def execute(self, command: RollbackImportBatchCommand) -> int:
        batch = self._repo.get_import_batch(command.batch_id)
        if batch is None or batch.list_id != command.list_id:
            raise ImportBatchNotFoundError()
        try:
            AuthorizeListAccessService(self._list_lookup).execute(
                AuthorizeListAccessCommand(
                    acting_user_id=command.actor_user_id,
                    list_id=command.list_id,
                    action="import_to_list",
                )
            )
        except (ListNotFoundError, NotListMemberError) as exc:
            raise ImportBatchNotFoundError() from exc

        with self._repo.atomic():
            return self._repo.rollback_batch(command.batch_id)
