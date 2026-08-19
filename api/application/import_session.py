"""Upload → detect/split/parse → Import Session composition (Story 4.6, FR-13/14/15).

The only genuinely new composition this story contributes: everything else
in the pipeline (detect_bank_adapter, BankAdapter.split/.parse) already
exists in application/bank_adapters.py (Story 4.4). See Dev Notes "The
composition this story adds" in the story file for the exact call chain this
module implements.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol
from uuid import UUID, uuid4

from domain.canonical_line import CanonicalLine
from domain.errors import ImportSessionNotFoundError, InvalidCanonicalLineError
from domain.import_session import (
    STATEMENT_STATUS_FAILED,
    STATEMENT_STATUS_STAGED,
    validate_pdf_upload,
)

from application.bank_adapters import BankAdapter, detect_bank_adapter
from application.ports import PdfStorage

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class DetectedStatement:
    """One statement's outcome after split + parse (AC #2/#3).

    Reuses CanonicalLine directly as the row shape — AD-16 defines
    CANDIDATE_ROW as CanonicalLine + session review fields only, and this
    story adds no review fields yet (that's Stories 4.7/4.8).
    """

    product_id: str
    status: str
    candidate_rows: list[CanonicalLine]


def run_import_pipeline(
    pdf_bytes: bytes, *, filename: str, adapters: list[BankAdapter]
) -> list[DetectedStatement]:
    """Detect the bank adapter, split into statements, parse each (AC #2/#3).

    Detection and whole-file split failures propagate uncaught — there is
    nothing to stage in either case. A per-chunk parse failure is the one
    place a failure is deliberately swallowed: it becomes a "failed"
    DetectedStatement with no rows so sibling statements in the same upload
    are not discarded (AC #3).
    """
    adapter = detect_bank_adapter(
        adapters, override=None, filename=filename, content_sample=pdf_bytes
    )
    chunks = adapter.split(pdf_bytes)

    detected: list[DetectedStatement] = []
    for chunk in chunks:
        try:
            rows = adapter.parse(chunk)
        except InvalidCanonicalLineError:
            detected.append(
                DetectedStatement(
                    product_id=adapter.product_id,
                    status=STATEMENT_STATUS_FAILED,
                    candidate_rows=[],
                )
            )
            continue
        detected.append(
            DetectedStatement(
                product_id=adapter.product_id,
                status=STATEMENT_STATUS_STAGED,
                candidate_rows=rows,
            )
        )
    return detected


@dataclass(frozen=True, slots=True)
class StagedStatementRecord:
    """`pdf_path` is not part of the API response DTO (Task 6.2 keeps that
    thin) — kept here so DiscardImportSessionService can resolve which
    files to delete without a second repository round-trip."""

    id: UUID
    session_id: UUID
    product_id: str
    status: str
    candidate_row_count: int
    pdf_path: str


@dataclass(frozen=True, slots=True)
class ImportSessionRecord:
    id: UUID
    user_id: UUID
    created_at: datetime
    discarded_at: datetime | None
    statements: list[StagedStatementRecord]


class ImportSessionRepository(Protocol):
    def create_session(
        self,
        *,
        session_id: UUID,
        user_id: UUID,
        statements: list[DetectedStatement],
        pdf_paths: dict[int, str],
    ) -> ImportSessionRecord: ...

    def get_session(self, session_id: UUID, user_id: UUID) -> ImportSessionRecord | None: ...

    def discard_session(self, session_id: UUID, user_id: UUID) -> ImportSessionRecord:
        """Set discarded_at. Idempotent — calling twice does not error."""
        ...


@dataclass(frozen=True, slots=True)
class UploadStatementPdfCommand:
    actor_user_id: UUID
    filename: str
    content: bytes


class UploadStatementPdfService:
    """Validate → store → run the pipeline → persist the Import Session (AC #1/#2/#3)."""

    def __init__(
        self,
        pdf_storage: PdfStorage,
        adapters: list[BankAdapter],
        session_repo: ImportSessionRepository,
    ) -> None:
        self._pdf_storage = pdf_storage
        self._adapters = adapters
        self._session_repo = session_repo

    def execute(self, command: UploadStatementPdfCommand) -> ImportSessionRecord:
        validate_pdf_upload(command.filename, command.content)

        whole_pdf_path = self._pdf_storage.save(
            user_id=command.actor_user_id, filename=command.filename, content=command.content
        )

        try:
            detected = run_import_pipeline(
                command.content, filename=command.filename, adapters=self._adapters
            )
            pdf_paths = {index: whole_pdf_path for index in range(len(detected))}
            return self._session_repo.create_session(
                session_id=uuid4(),
                user_id=command.actor_user_id,
                statements=detected,
                pdf_paths=pdf_paths,
            )
        except Exception:
            try:
                self._pdf_storage.delete(whole_pdf_path)
            except OSError:
                logger.warning(
                    "import_session_upload_cleanup_failed pdf_path=%s", whole_pdf_path
                )
            raise


@dataclass(frozen=True, slots=True)
class DiscardImportSessionCommand:
    actor_user_id: UUID
    session_id: UUID


class DiscardImportSessionService:
    """Drop uncommitted session state only — no ledger writes (AC #4, AD-3/AD-4)."""

    def __init__(self, session_repo: ImportSessionRepository, pdf_storage: PdfStorage) -> None:
        self._session_repo = session_repo
        self._pdf_storage = pdf_storage

    def execute(self, command: DiscardImportSessionCommand) -> ImportSessionRecord:
        session = self._session_repo.get_session(command.session_id, command.actor_user_id)
        if session is None:
            raise ImportSessionNotFoundError()

        updated = self._session_repo.discard_session(command.session_id, command.actor_user_id)

        distinct_paths = {statement.pdf_path for statement in updated.statements}
        for path in distinct_paths:
            try:
                self._pdf_storage.delete(path)
            except OSError:
                logger.warning("import_session_discard_cleanup_failed pdf_path=%s", path)

        return updated
