"""SQLAlchemy repository for Import Sessions (Story 4.6, AD-4)."""

from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import UUID, uuid4

from application.fx_service import MaterializedFx
from application.import_session import (
    DetectedStatement,
    ImportBatchRecord,
    ImportSessionRecord,
    StagedStatementRecord,
)
from domain.canonical_line import CanonicalLine
from domain.errors import (
    ImportSessionAlreadyCommittedError,
    ImportSessionNotFoundError,
    ImportStatementNotAvailableError,
    ImportStatementNotFoundError,
    InvalidCanonicalLineError,
)
from domain.expenses import ManualExpenseDraft
from domain.import_session import (
    STATEMENT_STATUS_COMMITTED,
    STATEMENT_STATUS_FAILED,
    STATEMENT_STATUS_SKIPPED,
    STATEMENT_STATUS_STAGED,
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
                candidate_rows=[
                    _candidate_line(candidate, statement) for candidate in statement.candidate_rows
                ],
            )
            for statement in row.statements
        ],
    )


def _candidate_line(
    candidate: ImportCandidateRowModel, statement: ImportStatementModel
) -> CanonicalLine:
    return CanonicalLine(
        posted_date=candidate.posted_date.isoformat(),
        amount=Decimal(str(candidate.amount)),
        currency=candidate.currency,
        product_id=statement.product_id,
        line_type=candidate.line_type,
        normalized_description=candidate.normalized_description,
        provenance=candidate.provenance,
        external_ref=candidate.external_ref,
        ref_quality=candidate.ref_quality,
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
                status=detected.status,
            )
            self._session.add(statement_row)
            session_row.statements.append(statement_row)

            if detected.status == STATEMENT_STATUS_STAGED:
                for line in detected.candidate_rows:
                    try:
                        posted_date = date.fromisoformat(line.posted_date)
                    except ValueError as exc:
                        raise InvalidCanonicalLineError(
                            f"Malformed posted_date: {line.posted_date!r}."
                        ) from exc
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
                    )
                    self._session.add(row)
                    statement_row.candidate_rows.append(row)

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

    def commit_statement_batch(
        self,
        *,
        batch_id: UUID,
        session_id: UUID,
        statement_id: UUID,
        list_id: UUID,
        actor_user_id: UUID,
        rows: list[tuple[ManualExpenseDraft, MaterializedFx]],
    ) -> ImportBatchRecord:
        # Batch row is flushed before any ledger entry references it via
        # import_batch_id (FK ordering) — a mid-loop failure rolls back the
        # whole request (get_db), so there is no orphaned batch either way.
        #
        # Wrapped in a SAVEPOINT: a concurrent double bulk-commit for the
        # same statement trips uq_import_batches_statement_id right here —
        # surfaced as the same domain error the sequential double-commit
        # path already raises, instead of an unhandled IntegrityError
        # (Story 4.7 review finding).
        batch_row = ImportBatchModel(
            id=batch_id,
            session_id=session_id,
            statement_id=statement_id,
            list_id=list_id,
            actor_user_id=actor_user_id,
        )
        try:
            with self._session.begin_nested():
                self._session.add(batch_row)
                self._session.flush()
        except IntegrityError as exc:
            raise ImportSessionAlreadyCommittedError() from exc

        entry_ids: list[UUID] = []
        for draft, fx in rows:
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
                amount_crc=fx.amount_crc,
                fx_rate=fx.fx_rate,
                fx_rate_date=fx.fx_rate_date,
                fx_fallback=fx.fx_fallback,
                created_at=datetime.now(UTC),
            )
            self._session.add(entry)
            entry_ids.append(entry.id)

        statement_row = self._session.get(ImportStatementModel, statement_id)
        if statement_row is None:
            raise ImportSessionNotFoundError()
        statement_row.status = STATEMENT_STATUS_COMMITTED

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

    def skip_statement(
        self, *, session_id: UUID, statement_id: UUID, user_id: UUID
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

        # Guarded write, not an unconditional set: a concurrent commit could
        # land between the caller's eligibility check (against the snapshot
        # above) and this write. The WHERE clause re-checks status against
        # the database's current row at write time — if a concurrent commit
        # already flipped it, this affects zero rows instead of silently
        # clobbering a committed statement's status to "skipped" (Story 4.8
        # review finding).
        result = self._session.execute(
            update(ImportStatementModel)
            .where(
                ImportStatementModel.id == statement_id,
                ImportStatementModel.status.in_(
                    (STATEMENT_STATUS_STAGED, STATEMENT_STATUS_FAILED)
                ),
            )
            .values(status=STATEMENT_STATUS_SKIPPED)
        )
        if result.rowcount == 0:
            raise ImportStatementNotAvailableError()

        self._session.flush()
        self._session.refresh(statement_row)
        return _session_record(row)
