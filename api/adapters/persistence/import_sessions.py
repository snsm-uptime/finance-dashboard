"""SQLAlchemy repository for Import Sessions (Story 4.6, AD-4; Story 4.10 row grain)."""

from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import UUID, uuid4

from application.import_session import (
    CandidateRowRecord,
    CommitRow,
    DetectedStatement,
    ImportBatchRecord,
    ImportSessionRecord,
    StagedStatementRecord,
)
from domain.canonical_line import CanonicalLine
from domain.errors import (
    ImportRowNotAvailableError,
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
    STATEMENT_STATUS_STAGED,
    row_is_zero_amount,
    statement_is_fully_resolved,
)
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from adapters.persistence.models import (
    ImportBatchModel,
    ImportCandidateRowModel,
    ImportSessionModel,
    ImportStatementModel,
    LedgerEntryModel,
)


def _session_record(row: ImportSessionModel) -> ImportSessionRecord:
    return ImportSessionRecord(
        id=row.id,
        user_id=row.user_id,
        created_at=row.created_at,
        discarded_at=row.discarded_at,
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

    def create_session(
        self,
        *,
        session_id: UUID,
        user_id: UUID,
        statements: list[DetectedStatement],
        pdf_paths: dict[int, str],
    ) -> ImportSessionRecord:
        session_row = ImportSessionModel(id=session_id, user_id=user_id)
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
        return _session_record(session_row)

    def get_session(self, session_id: UUID, user_id: UUID) -> ImportSessionRecord | None:
        row = self._session.scalar(
            select(ImportSessionModel)
            .options(
                selectinload(ImportSessionModel.statements).selectinload(
                    ImportStatementModel.candidate_rows
                )
            )
            .where(ImportSessionModel.id == session_id, ImportSessionModel.user_id == user_id)
            .limit(1)
        )
        if row is None:
            return None
        return _session_record(row)

    def discard_session(self, session_id: UUID, user_id: UUID) -> ImportSessionRecord:
        row = self._session.scalar(
            select(ImportSessionModel)
            .options(
                selectinload(ImportSessionModel.statements).selectinload(
                    ImportStatementModel.candidate_rows
                )
            )
            .where(ImportSessionModel.id == session_id, ImportSessionModel.user_id == user_id)
            .limit(1)
        )
        if row is None:
            raise ImportSessionNotFoundError()
        if row.discarded_at is None:
            row.discarded_at = datetime.now(UTC)
            self._session.flush()
        return _session_record(row)

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
    ) -> ImportBatchRecord:
        ids = [row.candidate_row_id for row in rows]
        now = datetime.now(UTC)
        # Guarded UPDATE is the fast path / clean-error path and MUST precede
        # any ledger INSERT (Story 4.10, AC #4).
        result = self._session.execute(
            update(ImportCandidateRowModel)
            .where(
                ImportCandidateRowModel.id.in_(ids),
                ImportCandidateRowModel.status == ROW_STATUS_PENDING,
            )
            .values(
                status=ROW_STATUS_COMMITTED,
                resolved_list_id=list_id,
                resolved_at=now,
            )
        )
        if result.rowcount != len(ids):
            raise ImportRowNotAvailableError()

        # Batch row is flushed before any ledger entry references it via
        # import_batch_id (FK ordering) — a mid-loop failure rolls back the
        # whole request (get_db), so there is no orphaned batch either way.
        batch_row = ImportBatchModel(
            id=batch_id,
            session_id=session_id,
            statement_id=statement_id,
            list_id=list_id,
            actor_user_id=actor_user_id,
        )
        self._session.add(batch_row)
        self._session.flush()

        entry_ids: list[UUID] = []
        try:
            with self._session.begin_nested():
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
                        amount_crc=fx.amount_crc,
                        fx_rate=fx.fx_rate,
                        fx_rate_date=fx.fx_rate_date,
                        fx_fallback=fx.fx_fallback,
                        created_at=datetime.now(UTC),
                    )
                    self._session.add(entry)
                    entry_ids.append(entry.id)
                self._session.flush()
        except IntegrityError as exc:
            raise ImportRowNotAvailableError() from exc

        self._complete_statement_if_resolved(statement_id)
        self._session.flush()
        return ImportBatchRecord(
            id=batch_id,
            session_id=session_id,
            statement_id=statement_id,
            list_id=list_id,
            actor_user_id=actor_user_id,
            created_at=batch_row.created_at,
            ledger_entry_ids=entry_ids,
        )

    def mark_candidate_row_deleted(
        self, *, session_id: UUID, statement_id: UUID, row_id: UUID, user_id: UUID
    ) -> ImportSessionRecord:
        row = self._session.scalar(
            select(ImportSessionModel)
            .options(
                selectinload(ImportSessionModel.statements).selectinload(
                    ImportStatementModel.candidate_rows
                )
            )
            .where(ImportSessionModel.id == session_id, ImportSessionModel.user_id == user_id)
            .limit(1)
        )
        if row is None:
            raise ImportSessionNotFoundError()

        statement_row = next((s for s in row.statements if s.id == statement_id), None)
        if statement_row is None:
            raise ImportStatementNotFoundError()

        result = self._session.execute(
            update(ImportCandidateRowModel)
            .where(
                ImportCandidateRowModel.id == row_id,
                ImportCandidateRowModel.statement_id == statement_id,
                ImportCandidateRowModel.status == ROW_STATUS_PENDING,
            )
            .values(status=ROW_STATUS_DELETED, resolved_at=datetime.now(UTC))
        )
        if result.rowcount == 0:
            raise ImportRowNotAvailableError()

        self._complete_statement_if_resolved(statement_id)
        self._session.flush()
        self._session.refresh(statement_row)
        return _session_record(row)

    def _complete_statement_if_resolved(self, statement_id: UUID) -> None:
        statement_row = self._session.get(ImportStatementModel, statement_id)
        if statement_row is None:
            raise ImportSessionNotFoundError()
        statuses = list(
            self._session.scalars(
                select(ImportCandidateRowModel.status).where(
                    ImportCandidateRowModel.statement_id == statement_id
                )
            )
        )
        if statement_is_fully_resolved(statuses):
            statement_row.status = STATEMENT_STATUS_COMMITTED

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
