"""SQLAlchemy repository for Import Sessions (Story 4.6, AD-4)."""

from __future__ import annotations

from datetime import UTC, date, datetime
from uuid import UUID, uuid4

from application.import_session import (
    DetectedStatement,
    ImportSessionRecord,
    StagedStatementRecord,
)
from domain.errors import ImportSessionNotFoundError, InvalidCanonicalLineError
from domain.import_session import STATEMENT_STATUS_STAGED
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from adapters.persistence.models import (
    ImportCandidateRowModel,
    ImportSessionModel,
    ImportStatementModel,
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
            )
            for statement in row.statements
        ],
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
