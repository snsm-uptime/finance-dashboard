"""Move committed ledger rows for one statement onto another list (Story 5.3)."""

from __future__ import annotations

from contextlib import AbstractContextManager
from dataclasses import dataclass
from decimal import Decimal
from typing import Protocol
from uuid import UUID

from domain.errors import ImportStatementNotFoundError
from domain.splits import SUBJECT_ITEM, SUBJECT_RECEIPT, parse_split_spec

from application.list_access import AuthorizeListAccessCommand, AuthorizeListAccessService
from application.lists import ListRecord
from application.splits import StoredSplitOverride


@dataclass(frozen=True, slots=True)
class StatementLedgerMove:
    entry_id: UUID
    list_id: UUID
    batch_id: UUID
    candidate_row_id: UUID | None
    receipt_id: UUID | None
    amount_crc: Decimal
    fx_rate: Decimal
    fx_fallback: bool
    import_identity: str | None


class ReassignStatementRepository(Protocol):
    def get_list(self, list_id: UUID) -> ListRecord | None: ...

    def get_membership(self, list_id: UUID, user_id: UUID): ...

    def list_member_ids(self, list_id: UUID) -> list[UUID]: ...

    def get_split_override(
        self, list_id: UUID, subject_kind: str, subject_id: UUID
    ) -> StoredSplitOverride | None: ...

    def list_statement_ledger_moves(self, statement_id: UUID) -> list[StatementLedgerMove]: ...

    def atomic(self) -> AbstractContextManager[None]: ...

    def apply_statement_reassign(
        self,
        *,
        destination_list_id: UUID,
        entry_ids: tuple[UUID, ...],
        batch_ids: tuple[UUID, ...],
        candidate_ids: tuple[UUID, ...],
        receipt_ids: tuple[UUID, ...],
        override_keys: tuple[tuple[str, UUID], ...],
    ) -> None: ...


@dataclass(frozen=True, slots=True)
class ReassignStatementCommand:
    acting_user_id: UUID
    source_list_id: UUID
    statement_id: UUID
    destination_list_id: UUID


@dataclass(frozen=True, slots=True)
class ReassignStatementResult:
    ledger_entry_ids: tuple[UUID, ...]
    batch_ids: tuple[UUID, ...]
    from_list_ids: tuple[UUID, ...]
    destination_list_id: UUID


class ReassignStatementService:
    def __init__(self, repo: ReassignStatementRepository) -> None:
        self._repo = repo
        self._acl = AuthorizeListAccessService(repo)

    def execute(self, command: ReassignStatementCommand) -> ReassignStatementResult:
        moves = self._repo.list_statement_ledger_moves(command.statement_id)
        if not moves:
            raise ImportStatementNotFoundError()

        from_list_ids = tuple(dict.fromkeys(row.list_id for row in moves))
        if command.source_list_id not in from_list_ids:
            raise ImportStatementNotFoundError()

        for list_id in from_list_ids:
            self._acl.execute(
                AuthorizeListAccessCommand(
                    acting_user_id=command.acting_user_id,
                    list_id=list_id,
                    action="reassign_statement",
                )
            )
        self._acl.execute(
            AuthorizeListAccessCommand(
                acting_user_id=command.acting_user_id,
                list_id=command.destination_list_id,
                action="import_to_list",
            )
        )

        entry_ids = tuple(row.entry_id for row in moves)
        batch_ids = tuple(dict.fromkeys(row.batch_id for row in moves))
        result = ReassignStatementResult(
            ledger_entry_ids=entry_ids,
            batch_ids=batch_ids,
            from_list_ids=from_list_ids,
            destination_list_id=command.destination_list_id,
        )

        unique_homes = set(from_list_ids)
        if unique_homes == {command.destination_list_id}:
            return result

        dest_members = self._repo.list_member_ids(command.destination_list_id)
        override_keys = self._override_keys(moves)
        for kind, subject_id in override_keys:
            home_list = next(
                row.list_id
                for row in moves
                if (kind == SUBJECT_ITEM and row.entry_id == subject_id)
                or (kind == SUBJECT_RECEIPT and row.receipt_id == subject_id)
            )
            stored = self._repo.get_split_override(home_list, kind, subject_id)
            if stored is None:
                continue
            parse_split_spec(
                kind=stored.kind,
                member_ids=dest_members,
                assignee_id=stored.assignee_id,
                amounts=stored.amounts,
                percentages=stored.percentages,
            )

        candidate_ids = tuple(
            row.candidate_row_id for row in moves if row.candidate_row_id is not None
        )
        receipt_ids = tuple(dict.fromkeys(row.receipt_id for row in moves if row.receipt_id))
        with self._repo.atomic():
            self._repo.apply_statement_reassign(
                destination_list_id=command.destination_list_id,
                entry_ids=entry_ids,
                batch_ids=batch_ids,
                candidate_ids=candidate_ids,
                receipt_ids=receipt_ids,
                override_keys=override_keys,
            )
        return result

    def _override_keys(self, moves: list[StatementLedgerMove]) -> tuple[tuple[str, UUID], ...]:
        keys: list[tuple[str, UUID]] = []
        seen: set[tuple[str, UUID]] = set()
        for row in moves:
            item_key = (SUBJECT_ITEM, row.entry_id)
            if item_key not in seen:
                seen.add(item_key)
                keys.append(item_key)
            if row.receipt_id is not None:
                receipt_key = (SUBJECT_RECEIPT, row.receipt_id)
                if receipt_key not in seen:
                    seen.add(receipt_key)
                    keys.append(receipt_key)
        return tuple(keys)
