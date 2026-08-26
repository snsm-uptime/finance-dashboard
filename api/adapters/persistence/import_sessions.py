"""SQLAlchemy repository for Import Sessions (Story 4.6, AD-4; Story 4.10 row grain)."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import UUID, uuid4

from application.import_session import (
    CandidateRowRecord,
    CommitOutcome,
    CommitRow,
    CommittedByListRecord,
    DetectedStatement,
    FailedStatementRecord,
    ImportBatchRecord,
    ImportSessionRecord,
    StagedStatementRecord,
)
from domain.canonical_line import CanonicalLine
from domain.errors import (
    ImportNothingToUndoError,
    ImportRowNotAvailableError,
    ImportRowNotDiscardableError,
    ImportSessionNotFoundError,
    ImportStatementNotFoundError,
    InvalidCanonicalLineError,
)
from domain.import_session import (
    ROW_STATUS_COMMITTED,
    ROW_STATUS_DELETED,
    ROW_STATUS_EXCLUDED_ZERO_AMOUNT,
    ROW_STATUS_PENDING,
    STATEMENT_STATUS_COMMITTED,
    STATEMENT_STATUS_FAILED,
    STATEMENT_STATUS_STAGED,
    UNDO_ACTION_ASSIGN,
    UNDO_ACTION_DELETE,
    row_is_zero_amount,
    select_landing_list_id,
    statement_has_pending_rows,
    statement_is_fully_resolved,
)
from domain.parse_evidence import ParseEvidence
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from adapters.persistence.models import (
    ImportBatchModel,
    ImportCandidateRowModel,
    ImportSessionModel,
    ImportStatementModel,
    LedgerEntryModel,
    ListModel,
)


def _session_record(
    row: ImportSessionModel, *, list_names: dict[UUID, str] | None = None
) -> ImportSessionRecord:
    # Counts and landing target are derived here from rows the selectinload
    # already fetched — no drift (Story 4.12, AC #4/#6). `committed_by_list`
    # (Story 4.14) needs list *names*, which the selectinload doesn't carry;
    # `_to_record` below issues one extra `_list_names` query for that, only
    # when the session has at least one committed row.
    # Two integer counters on the session would be the obvious move and would
    # be wrong: undo returns a row to pending and the counters would not follow
    # it, so the Story 4.14 summary would lie after any undo.
    names = list_names or {}
    imported_new = 0
    skipped_duplicate = 0
    deleted_count = 0
    zero_amount_excluded = 0
    by_list: dict[UUID, int] = {}
    landed: list[tuple[UUID, datetime]] = []
    failed_statements: list[FailedStatementRecord] = []
    for statement in row.statements:
        if statement.status == STATEMENT_STATUS_FAILED:
            failed_statements.append(
                FailedStatementRecord(
                    id=statement.id,
                    product_id=statement.product_id,
                    filename=statement.original_filename,
                )
            )
        for candidate in statement.candidate_rows:
            if candidate.status == ROW_STATUS_DELETED:
                deleted_count += 1
                continue
            if candidate.status == ROW_STATUS_EXCLUDED_ZERO_AMOUNT:
                zero_amount_excluded += 1
                continue
            if candidate.status != ROW_STATUS_COMMITTED:
                continue
            if candidate.dedup_skipped:
                skipped_duplicate += 1
                continue
            imported_new += 1
            if candidate.resolved_list_id is not None:
                by_list[candidate.resolved_list_id] = by_list.get(candidate.resolved_list_id, 0) + 1
            if candidate.resolved_list_id is not None and candidate.resolved_at is not None:
                landed.append((candidate.resolved_list_id, candidate.resolved_at))

    committed_by_list = [
        CommittedByListRecord(list_id=list_id, name=names.get(list_id, ""), count=count)
        for list_id, count in sorted(by_list.items(), key=lambda item: str(item[0]))
    ]

    return ImportSessionRecord(
        id=row.id,
        user_id=row.user_id,
        created_at=row.created_at,
        discarded_at=row.discarded_at,
        finalized_at=row.finalized_at,
        undo_row_id=row.last_resolved_row_id,
        undo_action=row.last_resolved_action,
        imported_new_count=imported_new,
        skipped_duplicate_count=skipped_duplicate,
        landing_list_id=select_landing_list_id(landed),
        deleted_count=deleted_count,
        zero_amount_excluded_count=zero_amount_excluded,
        failed_statements=failed_statements,
        committed_by_list=committed_by_list,
        statements=[
            StagedStatementRecord(
                id=statement.id,
                session_id=statement.session_id,
                product_id=statement.product_id,
                status=statement.status,
                candidate_row_count=len(statement.candidate_rows),
                pdf_path=statement.pdf_path,
                iban=statement.iban,  # Story 4.8.1: carry IBAN through record
                card_id=statement.card_id,  # Story 4.8.3: identified at upload time
                original_filename=statement.original_filename,
                candidate_rows=[
                    _candidate_row(candidate, statement) for candidate in statement.candidate_rows
                ],
                parse_evidence=ParseEvidence.from_json(statement.parse_evidence),
            )
            for statement in row.statements
        ],
    )


def _candidate_row(
    candidate: ImportCandidateRowModel, statement: ImportStatementModel
) -> CandidateRowRecord:
    return CandidateRowRecord(
        id=candidate.id,
        sequence=candidate.sequence,
        status=candidate.status,
        resolved_list_id=candidate.resolved_list_id,
        resolved_at=candidate.resolved_at,
        dedup_skipped=candidate.dedup_skipped,
        line=CanonicalLine(
            posted_date=candidate.posted_date.isoformat(),
            amount=Decimal(str(candidate.amount)),
            currency=candidate.currency,
            product_id=statement.product_id,
            line_type=candidate.line_type,
            normalized_description=candidate.normalized_description,
            provenance=candidate.provenance,
            external_ref=candidate.external_ref,
            ref_quality=candidate.ref_quality,
        ),
    )


class SqlAlchemyImportSessionRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def _list_names(self, list_ids: set[UUID]) -> dict[UUID, str]:
        if not list_ids:
            return {}
        rows = self._session.execute(
            select(ListModel.id, ListModel.name).where(ListModel.id.in_(list_ids))
        ).all()
        return {list_id: name for list_id, name in rows}

    def _to_record(self, row: ImportSessionModel) -> ImportSessionRecord:
        list_ids = {
            candidate.resolved_list_id
            for statement in row.statements
            for candidate in statement.candidate_rows
            if candidate.status == ROW_STATUS_COMMITTED
            and not candidate.dedup_skipped
            and candidate.resolved_list_id is not None
        }
        return _session_record(row, list_names=self._list_names(list_ids))

    def _load_session(self, session_id: UUID, user_id: UUID) -> ImportSessionModel | None:
        return self._session.scalar(
            select(ImportSessionModel)
            .options(
                selectinload(ImportSessionModel.statements).selectinload(
                    ImportStatementModel.candidate_rows
                )
            )
            .where(ImportSessionModel.id == session_id, ImportSessionModel.user_id == user_id)
            .limit(1)
        )

    def create_session(
        self,
        *,
        session_id: UUID,
        user_id: UUID,
        statements: list[DetectedStatement],
        pdf_paths: dict[int, str],
        content_hash: str | None = None,
    ) -> ImportSessionRecord:
        session_row = ImportSessionModel(id=session_id, user_id=user_id, content_hash=content_hash)
        self._session.add(session_row)

        for index, detected in enumerate(statements):
            statement_row = ImportStatementModel(
                id=uuid4(),
                session_id=session_id,
                product_id=detected.product_id,
                pdf_path=pdf_paths[index],
                iban=detected.iban,  # Story 4.8.1: persist IBAN
                card_id=detected.card_id,  # Story 4.8.3: persist identified card
                original_filename=detected.original_filename,
                status=detected.status,
                parse_evidence=(
                    detected.parse_evidence.to_json()
                    if detected.parse_evidence is not None
                    else None
                ),
            )
            self._session.add(statement_row)
            session_row.statements.append(statement_row)

            if detected.status == STATEMENT_STATUS_STAGED:
                for sequence, line in enumerate(detected.candidate_rows):
                    try:
                        posted_date = date.fromisoformat(line.posted_date)
                    except ValueError as exc:
                        raise InvalidCanonicalLineError(
                            f"Malformed posted_date: {line.posted_date!r}."
                        ) from exc
                    status = (
                        ROW_STATUS_EXCLUDED_ZERO_AMOUNT
                        if row_is_zero_amount(line.amount)
                        else ROW_STATUS_PENDING
                    )
                    row = ImportCandidateRowModel(
                        id=uuid4(),
                        statement_id=statement_row.id,
                        posted_date=posted_date,
                        amount=line.amount,
                        currency=line.currency,
                        line_type=line.line_type,
                        normalized_description=line.normalized_description,
                        external_ref=line.external_ref,
                        ref_quality=line.ref_quality,
                        provenance=line.provenance,
                        status=status,
                        sequence=sequence,
                    )
                    self._session.add(row)
                    statement_row.candidate_rows.append(row)
                if statement_is_fully_resolved([c.status for c in statement_row.candidate_rows]):
                    statement_row.status = STATEMENT_STATUS_COMMITTED

        self._session.flush()
        return self._to_record(session_row)

    def get_session(self, session_id: UUID, user_id: UUID) -> ImportSessionRecord | None:
        row = self._load_session(session_id, user_id)
        if row is None:
            return None
        return self._to_record(row)

    def find_active_session_by_content_hash(self, user_id: UUID, content_hash: str) -> UUID | None:
        """Story 4.16, AC #4: id of a non-discarded, non-finalized session
        already holding this exact PDF's bytes, or None."""
        return self._session.scalar(
            select(ImportSessionModel.id)
            .where(
                ImportSessionModel.user_id == user_id,
                ImportSessionModel.content_hash == content_hash,
                ImportSessionModel.discarded_at.is_(None),
                ImportSessionModel.finalized_at.is_(None),
            )
            .limit(1)
        )

    def find_active_session(self, user_id: UUID) -> ImportSessionRecord | None:
        row = self._session.scalar(
            select(ImportSessionModel)
            .options(
                selectinload(ImportSessionModel.statements).selectinload(
                    ImportStatementModel.candidate_rows
                )
            )
            .where(
                ImportSessionModel.user_id == user_id,
                ImportSessionModel.discarded_at.is_(None),
                ImportSessionModel.finalized_at.is_(None),
            )
            .order_by(ImportSessionModel.created_at.desc(), ImportSessionModel.id.desc())
            .limit(1)
        )
        if row is None:
            return None
        return self._to_record(row)

    def discard_session(self, session_id: UUID, user_id: UUID) -> ImportSessionRecord:
        row = self._load_session(session_id, user_id)
        if row is None:
            raise ImportSessionNotFoundError()
        if row.discarded_at is None:
            row.discarded_at = datetime.now(UTC)
            self._session.flush()
        return self._to_record(row)

    def set_statement_card_id(
        self, *, session_id: UUID, user_id: UUID, statement_id: UUID, card_id: UUID
    ) -> None:
        row = self._session.scalar(
            select(ImportSessionModel)
            .options(selectinload(ImportSessionModel.statements))
            .where(ImportSessionModel.id == session_id, ImportSessionModel.user_id == user_id)
            .limit(1)
        )
        if row is None:
            raise ImportSessionNotFoundError()
        statement_row = next((s for s in row.statements if s.id == statement_id), None)
        if statement_row is None:
            raise ImportStatementNotFoundError()
        statement_row.card_id = card_id
        self._session.flush()

    def commit_statement_batch(
        self,
        *,
        batch_id: UUID,
        session_id: UUID,
        statement_id: UUID,
        list_id: UUID,
        actor_user_id: UUID,
        rows: list[CommitRow],
        undo_row_id: UUID | None = None,
        duplicate_row_ids: Sequence[UUID] = (),
    ) -> CommitOutcome:
        ids = [row.candidate_row_id for row in rows]
        duplicate_ids = list(duplicate_row_ids)
        now = datetime.now(UTC)
        entry_ids: list[UUID] = []
        batch_row: ImportBatchModel | None = None
        statement_row = self._session.get(ImportStatementModel, statement_id)
        # The status flip, the batch INSERT and the ledger INSERTs are one
        # atomic unit: they all live inside a single SAVEPOINT so that an
        # IntegrityError on the ledger insert (layer 2 of the double-commit
        # guard) cannot leave rows stamped `committed` with no ledger entries
        # and an orphan batch behind. The caller converts the resulting
        # ImportRowNotAvailableError into a 409 JSONResponse, which get_db
        # treats as a normal return and commits — so anything left outside
        # this SAVEPOINT would be persisted (Story 4.10 review).
        try:
            with self._session.begin_nested():
                # Guarded UPDATE is the fast path / clean-error path and MUST
                # precede any ledger INSERT (Story 4.10, AC #4). Scoped to the
                # target statement so a row id from a sibling statement can
                # never be swept into this batch.
                result = self._session.execute(
                    update(ImportCandidateRowModel)
                    .where(
                        ImportCandidateRowModel.id.in_(ids),
                        ImportCandidateRowModel.statement_id == statement_id,
                        ImportCandidateRowModel.status == ROW_STATUS_PENDING,
                    )
                    .values(
                        status=ROW_STATUS_COMMITTED,
                        resolved_list_id=list_id,
                        resolved_at=now,
                        dedup_skipped=False,
                    )
                )
                if result.rowcount != len(ids):
                    raise ImportRowNotAvailableError()

                # Duplicates resolve too — same guarded UPDATE, same pending-only
                # WHERE — but write no ledger entry (Story 4.12, AC #3). Leaving
                # them pending would hang the review queue on rows the user has
                # already handled, and `statement_is_fully_resolved` would never
                # fire. "Committed" means "this row is done", not "a ledger entry
                # exists"; `dedup_skipped` is what tells the two apart.
                if duplicate_ids:
                    duplicate_result = self._session.execute(
                        update(ImportCandidateRowModel)
                        .where(
                            ImportCandidateRowModel.id.in_(duplicate_ids),
                            ImportCandidateRowModel.statement_id == statement_id,
                            ImportCandidateRowModel.status == ROW_STATUS_PENDING,
                        )
                        .values(
                            status=ROW_STATUS_COMMITTED,
                            resolved_list_id=list_id,
                            resolved_at=now,
                            dedup_skipped=True,
                        )
                    )
                    if duplicate_result.rowcount != len(duplicate_ids):
                        raise ImportRowNotAvailableError()

                # No batch for an all-duplicate commit action: AD-4 says a batch
                # is one commit action that *happened*, and an empty batch would
                # pollute FR-30 rollback — the same reason `_undo_assign` already
                # deletes emptied batches. Falls through rather than returning:
                # the statement completion and the undo pointer write must stay
                # outside this SAVEPOINT, exactly where they are for a normal
                # commit action.
                if rows:
                    # Batch row is flushed before any ledger entry references it
                    # via import_batch_id (FK ordering).
                    batch_row = ImportBatchModel(
                        id=batch_id,
                        session_id=session_id,
                        statement_id=statement_id,
                        list_id=list_id,
                        actor_user_id=actor_user_id,
                    )
                    self._session.add(batch_row)
                    self._session.flush()

                    self._insert_ledger_entries(
                        rows=rows,
                        batch_id=batch_id,
                        list_id=list_id,
                        entry_ids=entry_ids,
                    )
        except IntegrityError as exc:
            raise ImportRowNotAvailableError() from exc

        return self._finish_commit_action(
            statement_id=statement_id,
            statement_row=statement_row,
            session_id=session_id,
            actor_user_id=actor_user_id,
            undo_row_id=undo_row_id,
            batch=(
                ImportBatchRecord(
                    id=batch_id,
                    session_id=session_id,
                    statement_id=statement_id,
                    list_id=list_id,
                    actor_user_id=actor_user_id,
                    created_at=batch_row.created_at,
                    ledger_entry_ids=entry_ids,
                )
                if batch_row is not None
                else None
            ),
            skipped_duplicate=len(duplicate_ids),
        )

    def _insert_ledger_entries(
        self,
        *,
        rows: list[CommitRow],
        batch_id: UUID,
        list_id: UUID,
        entry_ids: list[UUID],
    ) -> None:
        """One ledger entry per surviving row. Called only from inside
        `commit_statement_batch`'s SAVEPOINT."""
        for commit_row in rows:
            draft = commit_row.draft
            fx = commit_row.fx
            entry = LedgerEntryModel(
                id=uuid4(),
                list_id=list_id,
                amount=draft.amount,
                currency=draft.currency,
                normalized_description=draft.normalized_description,
                payer_id=draft.payer_id,
                provenance=draft.provenance,
                line_type=draft.line_type,
                posted_date=date.fromisoformat(draft.posted_date),
                receipt_id=None,
                product_id=None,
                external_ref=draft.external_ref,
                origin_kind=draft.origin_kind,
                origin_card_id=draft.origin_card_id,
                import_batch_id=batch_id,
                import_candidate_row_id=commit_row.candidate_row_id,
                import_identity=commit_row.identity,
                amount_crc=fx.amount_crc,
                fx_rate=fx.fx_rate,
                fx_rate_date=fx.fx_rate_date,
                fx_fallback=fx.fx_fallback,
                created_at=datetime.now(UTC),
            )
            self._session.add(entry)
            entry_ids.append(entry.id)
        self._session.flush()

    def _finish_commit_action(
        self,
        *,
        statement_id: UUID,
        statement_row: ImportStatementModel | None,
        session_id: UUID,
        actor_user_id: UUID,
        undo_row_id: UUID | None,
        batch: ImportBatchRecord | None,
        skipped_duplicate: int,
    ) -> CommitOutcome:
        """Everything that must happen *outside* the SAVEPOINT, for both the
        normal and the all-duplicate commit action."""
        self._complete_statement_if_resolved(statement_id)
        # Only a row-grain assign is undoable per row. Bulk passes no
        # undo_row_id even when a statement happens to hold a single row.
        # The pointer is written even when the action produced no batch — an
        # all-duplicate assign is still undoable.
        if undo_row_id is not None:
            self.set_undo_pointer(
                session_id=session_id,
                user_id=actor_user_id,
                row_id=undo_row_id,
                action=UNDO_ACTION_ASSIGN,
                prior_status=ROW_STATUS_PENDING,
            )
        self._session.flush()
        # The guarded UPDATEs are Core `update()`s, which do not expire the
        # identity map — without this refresh a later `_session_record` would
        # echo pre-update `status` / `dedup_skipped`. Same bug 4.11's review
        # patch fixed for delete/undo/edit.
        if statement_row is not None:
            self._reload_statement(statement_row)
        return CommitOutcome(
            batch=batch,
            imported_new=len(batch.ledger_entry_ids) if batch is not None else 0,
            skipped_duplicate=skipped_duplicate,
        )

    def mark_candidate_row_deleted(
        self, *, session_id: UUID, statement_id: UUID, row_id: UUID, user_id: UUID
    ) -> ImportSessionRecord:
        row = self._load_session(session_id, user_id)
        if row is None:
            raise ImportSessionNotFoundError()

        statement_row = next((s for s in row.statements if s.id == statement_id), None)
        if statement_row is None:
            raise ImportStatementNotFoundError()

        pending = self._session.execute(
            update(ImportCandidateRowModel)
            .where(
                ImportCandidateRowModel.id == row_id,
                ImportCandidateRowModel.statement_id == statement_id,
                ImportCandidateRowModel.status == ROW_STATUS_PENDING,
            )
            .values(status=ROW_STATUS_DELETED, resolved_at=datetime.now(UTC))
        )
        if pending.rowcount == 1:
            self._complete_statement_if_resolved(statement_id)
            row.last_resolved_row_id = row_id
            row.last_resolved_action = UNDO_ACTION_DELETE
            row.last_resolved_prior_status = ROW_STATUS_PENDING
            self._session.flush()
            self._reload_statement(statement_row)
            return self._to_record(row)

        # ImportReviewSheet Save: drop an already-assigned row without
        # returning it to pending (that would 409 finalize). Reverse the
        # ledger write from assign; a dedup_skipped row has none.
        candidate_row = next((c for c in statement_row.candidate_rows if c.id == row_id), None)
        # Same rule as unassign_candidate_row: a dedup_skipped row never had a
        # ledger entry, so deleting it here would silently drop it from
        # assigned_rows despite AC #5 requiring Discard stay blocked (UI + API).
        if candidate_row is not None and candidate_row.dedup_skipped:
            raise ImportRowNotDiscardableError()

        assigned = self._session.execute(
            update(ImportCandidateRowModel)
            .where(
                ImportCandidateRowModel.id == row_id,
                ImportCandidateRowModel.statement_id == statement_id,
                ImportCandidateRowModel.status == ROW_STATUS_COMMITTED,
            )
            .values(status=ROW_STATUS_DELETED, resolved_list_id=None, resolved_at=datetime.now(UTC))
        )
        if assigned.rowcount == 0:
            raise ImportRowNotAvailableError()

        self._hard_delete_ledger_for_row(row_id)
        self._complete_statement_if_resolved(statement_id)
        self._clear_pointer_on(row)
        self._session.flush()
        self._reload_statement(statement_row)
        return self._to_record(row)

    def update_candidate_row_description(
        self,
        *,
        session_id: UUID,
        statement_id: UUID,
        row_id: UUID,
        user_id: UUID,
        description: str,
    ) -> ImportSessionRecord:
        row = self._load_session(session_id, user_id)
        if row is None:
            raise ImportSessionNotFoundError()

        statement_row = next((s for s in row.statements if s.id == statement_id), None)
        if statement_row is None:
            raise ImportStatementNotFoundError()

        # Same guarded-UPDATE idiom as the resolution writes: the WHERE clause
        # is what enforces "pending only" against the database's current row,
        # not the snapshot the caller read.
        result = self._session.execute(
            update(ImportCandidateRowModel)
            .where(
                ImportCandidateRowModel.id == row_id,
                ImportCandidateRowModel.statement_id == statement_id,
                ImportCandidateRowModel.status == ROW_STATUS_PENDING,
            )
            .values(normalized_description=description)
        )
        if result.rowcount == 0:
            raise ImportRowNotAvailableError()

        self._session.flush()
        self._reload_statement(statement_row)
        return self._to_record(row)

    def set_undo_pointer(
        self,
        *,
        session_id: UUID,
        user_id: UUID,
        row_id: UUID,
        action: str,
        prior_status: str,
    ) -> None:
        self._session.execute(
            update(ImportSessionModel)
            .where(ImportSessionModel.id == session_id, ImportSessionModel.user_id == user_id)
            .values(
                last_resolved_row_id=row_id,
                last_resolved_action=action,
                last_resolved_prior_status=prior_status,
            )
        )

    def clear_undo_pointer(self, *, session_id: UUID, user_id: UUID) -> None:
        self._session.execute(
            update(ImportSessionModel)
            .where(ImportSessionModel.id == session_id, ImportSessionModel.user_id == user_id)
            .values(
                last_resolved_row_id=None,
                last_resolved_action=None,
                last_resolved_prior_status=None,
            )
        )

    def undo_last_resolution(self, *, session_id: UUID, user_id: UUID) -> ImportSessionRecord:
        row = self._load_session(session_id, user_id)
        if row is None:
            raise ImportSessionNotFoundError()

        row_id = row.last_resolved_row_id
        action = row.last_resolved_action
        if row_id is None or action is None:
            self._clear_pointer_on(row)
            self._session.flush()
            raise ImportNothingToUndoError()

        statement_row = next(
            (
                statement
                for statement in row.statements
                for candidate in statement.candidate_rows
                if candidate.id == row_id
            ),
            None,
        )
        if statement_row is None:
            # Stale pointer — the row was removed under it (FK SET NULL loses
            # the id but not the action). Nothing to reverse; clear and report.
            self._clear_pointer_on(row)
            self._session.flush()
            raise ImportNothingToUndoError()

        try:
            if action == UNDO_ACTION_ASSIGN:
                self._undo_assign(row_id)
            elif action == UNDO_ACTION_DELETE:
                result = self._session.execute(
                    update(ImportCandidateRowModel)
                    .where(
                        ImportCandidateRowModel.id == row_id,
                        ImportCandidateRowModel.status == ROW_STATUS_DELETED,
                    )
                    .values(status=ROW_STATUS_PENDING, resolved_at=None)
                )
                if result.rowcount == 0:
                    raise ImportRowNotAvailableError()
            else:
                raise ImportNothingToUndoError()
        except (ImportRowNotAvailableError, ImportNothingToUndoError):
            self._clear_pointer_on(row)
            self._session.flush()
            raise

        self._reopen_statement_if_pending(statement_row.id)
        self._clear_pointer_on(row)
        self._session.flush()
        self._reload_statement(statement_row)
        return self._to_record(row)

    def unassign_candidate_row(
        self, *, session_id: UUID, user_id: UUID, row_id: UUID
    ) -> ImportSessionRecord:
        """ImportReviewSheet per-row discard (Story 4.13.1). Reuses
        `_undo_assign` for the ledger/batch-delete — same reversal as card
        undo — but is not the single-level undo pointer: it targets an
        arbitrary committed row, and clears the pointer rather than setting
        it, so the next card down/undo cannot reverse a sheet action."""
        row = self._load_session(session_id, user_id)
        if row is None:
            raise ImportSessionNotFoundError()

        statement_row = next(
            (
                statement
                for statement in row.statements
                for candidate in statement.candidate_rows
                if candidate.id == row_id
            ),
            None,
        )
        candidate_row = (
            next((c for c in statement_row.candidate_rows if c.id == row_id), None)
            if statement_row is not None
            else None
        )
        if statement_row is None or candidate_row is None:
            raise ImportRowNotAvailableError()
        if candidate_row.status != ROW_STATUS_COMMITTED:
            raise ImportRowNotAvailableError()
        # Duplicate-skipped rows never had a ledger entry — re-assigning would
        # collide with the same identity and skip forever (Story 4.12 deferred
        # decision, resolved here: block before `_undo_assign` even looks).
        if candidate_row.dedup_skipped:
            raise ImportRowNotDiscardableError()

        self._undo_assign(row_id)
        self._reopen_statement_if_pending(statement_row.id)
        self._clear_pointer_on(row)
        self._session.flush()
        self._reload_statement(statement_row)
        return self._to_record(row)

    def _hard_delete_ledger_for_row(self, row_id: UUID) -> None:
        entry = self._session.scalar(
            select(LedgerEntryModel)
            .where(LedgerEntryModel.import_candidate_row_id == row_id)
            .limit(1)
        )
        if entry is None:
            return

        batch_id = entry.import_batch_id
        # Hard delete, not a soft one: ledger_entries has no deleted_at, and
        # the UNIQUE on import_candidate_row_id must actually be freed or every
        # later re-assign of this row would conflict forever.
        self._session.delete(entry)
        self._session.flush()

        if batch_id is None:
            return
        # A batch is one commit action (AD-4). Undo / assigned-delete means
        # that action did not happen, so an emptied batch must not linger
        # into Epic 5's rollback.
        remaining = self._session.scalar(
            select(LedgerEntryModel.id).where(LedgerEntryModel.import_batch_id == batch_id).limit(1)
        )
        if remaining is None:
            batch_row = self._session.get(ImportBatchModel, batch_id)
            if batch_row is not None:
                self._session.delete(batch_row)
                self._session.flush()

    def _undo_assign(self, row_id: UUID) -> None:
        result = self._session.execute(
            update(ImportCandidateRowModel)
            .where(
                ImportCandidateRowModel.id == row_id,
                ImportCandidateRowModel.status == ROW_STATUS_COMMITTED,
            )
            # dedup_skipped resets too (Story 4.12): without it an undone
            # duplicate returns to pending still flagged, and keeps counting
            # against skipped_duplicate_count forever.
            .values(
                status=ROW_STATUS_PENDING,
                resolved_list_id=None,
                resolved_at=None,
                dedup_skipped=False,
            )
        )
        if result.rowcount == 0:
            raise ImportRowNotAvailableError()

        self._hard_delete_ledger_for_row(row_id)

    def _reload_statement(self, statement_row: ImportStatementModel) -> None:
        # Core UPDATE() does not expire identity-map collections, so a later
        # `_session_record` would still echo pre-update statuses/descriptions.
        self._session.expire(statement_row, ["candidate_rows", "status"])
        self._session.refresh(statement_row)

    @staticmethod
    def _clear_pointer_on(row: ImportSessionModel) -> None:
        row.last_resolved_row_id = None
        row.last_resolved_action = None
        row.last_resolved_prior_status = None

    def _reopen_statement_if_pending(self, statement_id: UUID) -> None:
        """Mirror of `_complete_statement_if_resolved`, which only ever flips
        *to* committed. Without this a restored row would sit pending inside a
        statement still marked committed, invisible to review."""
        statement_row = self._session.get(
            ImportStatementModel, statement_id, with_for_update=True, populate_existing=True
        )
        if statement_row is None:
            raise ImportStatementNotFoundError()
        if statement_row.status != STATEMENT_STATUS_COMMITTED:
            return
        statuses = list(
            self._session.scalars(
                select(ImportCandidateRowModel.status).where(
                    ImportCandidateRowModel.statement_id == statement_id
                )
            )
        )
        if statement_has_pending_rows(statuses):
            statement_row.status = STATEMENT_STATUS_STAGED

    def _complete_statement_if_resolved(self, statement_id: UUID) -> None:
        # FOR UPDATE serializes concurrent resolutions of the same statement's
        # last rows. Without it, under READ COMMITTED each transaction still
        # sees its sibling's row as `pending`, so neither flips the statement
        # and it stays `staged` with zero pending rows forever (Story 4.10
        # review).
        # populate_existing forces a real SELECT ... FOR UPDATE even when the
        # statement is already in the identity map from an earlier read.
        statement_row = self._session.get(
            ImportStatementModel, statement_id, with_for_update=True, populate_existing=True
        )
        if statement_row is None:
            raise ImportStatementNotFoundError()
        statuses = list(
            self._session.scalars(
                select(ImportCandidateRowModel.status).where(
                    ImportCandidateRowModel.statement_id == statement_id
                )
            )
        )
        if statement_is_fully_resolved(statuses):
            statement_row.status = STATEMENT_STATUS_COMMITTED

    def find_existing_identities(self, *, list_id: UUID, identities: Sequence[str]) -> set[str]:
        wanted = list(identities)
        # An empty IN () is a SQL footgun — skip the round-trip entirely.
        if not wanted:
            return set()
        return set(
            self._session.scalars(
                select(LedgerEntryModel.import_identity).where(
                    LedgerEntryModel.list_id == list_id,
                    LedgerEntryModel.import_identity.in_(wanted),
                )
            )
        )

    def mark_session_finalized(self, *, session_id: UUID, user_id: UUID) -> ImportSessionRecord:
        row = self._load_session(session_id, user_id)
        if row is None:
            raise ImportSessionNotFoundError()
        if row.finalized_at is None:
            row.finalized_at = datetime.now(UTC)
            self._session.flush()
        return self._to_record(row)

    def clear_statement_pdf_paths(self, session_id: UUID, user_id: UUID) -> None:
        row = self._session.scalar(
            select(ImportSessionModel)
            .options(selectinload(ImportSessionModel.statements))
            .where(ImportSessionModel.id == session_id, ImportSessionModel.user_id == user_id)
            .limit(1)
        )
        if row is None:
            return
        for statement in row.statements:
            statement.pdf_path = None
        self._session.flush()
