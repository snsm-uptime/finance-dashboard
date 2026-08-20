"""Upload → detect/split/parse → Import Session composition (Story 4.6, FR-13/14/15).

The only genuinely new composition this story contributes: everything else
in the pipeline (detect_bank_adapter, BankAdapter.split/.parse) already
exists in application/bank_adapters.py (Story 4.4). See Dev Notes "The
composition this story adds" in the story file for the exact call chain this
module implements.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Protocol
from uuid import UUID, uuid4

from domain.canonical_line import CanonicalLine
from domain.errors import ImportSessionNotFoundError, InvalidCanonicalLineError
from domain.expenses import ManualExpenseDraft
from domain.import_session import (
    STATEMENT_STATUS_FAILED,
    STATEMENT_STATUS_STAGED,
    validate_bulk_candidate_row,
    validate_bulk_commit_eligible,
    validate_pdf_upload,
)

from application.bank_adapters import BankAdapter, detect_bank_adapter
from application.fx_service import MaterializedFx, MaterializeFxService
from application.list_access import (
    AuthorizeListAccessCommand,
    AuthorizeListAccessService,
    ListAccessLookup,
)
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
    files to delete without a second repository round-trip.

    `candidate_rows` (Story 4.7) is likewise not part of the upload/discard
    response DTOs — it exists so AssignBulkImportService can build ledger
    drafts from the same fetched record without a second round-trip."""

    id: UUID
    session_id: UUID
    product_id: str
    status: str
    candidate_row_count: int
    pdf_path: str
    candidate_rows: list[CanonicalLine] = field(default_factory=list)


@dataclass(frozen=True, slots=True)
class ImportSessionRecord:
    id: UUID
    user_id: UUID
    created_at: datetime
    discarded_at: datetime | None
    statements: list[StagedStatementRecord]


@dataclass(frozen=True, slots=True)
class ImportBatchRecord:
    """One committed Import Batch — one Statement's accept (Story 4.7, AD-4)."""

    id: UUID
    session_id: UUID
    statement_id: UUID
    list_id: UUID
    actor_user_id: UUID
    created_at: datetime
    ledger_entry_ids: list[UUID]


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
        """Persist one Import Batch atomically (Story 4.7, AD-4): the batch
        row, one ledger entry per row, and flips the statement to
        committed. `rows` order does not matter — no ledger row depends on
        another within the same batch."""
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
                logger.warning("import_session_upload_cleanup_failed pdf_path=%s", whole_pdf_path)
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


@dataclass(frozen=True, slots=True)
class AssignBulkImportCommand:
    actor_user_id: UUID
    session_id: UUID
    list_id: UUID


@dataclass(frozen=True, slots=True)
class AssignBulkImportResult:
    session_id: UUID
    list_id: UUID
    batches: list[ImportBatchRecord]


class AssignBulkImportService:
    """Bulk review assign & commit (Story 4.7, AC #1/#2/#3): the whole upload
    goes to one chosen list, one Import Batch per clean-parse statement.

    Payer defaults to the actor (FR-19) and reuses ManualExpenseDraft — the
    same payer/provenance/line_type shape Story 3.2's hand expenses already
    use, not a second import-specific representation. FX materialization
    (AD-7) reuses MaterializeFxService exactly as manual expense create does.
    """

    def __init__(
        self,
        session_repo: ImportSessionRepository,
        list_lookup: ListAccessLookup,
        fx_service: MaterializeFxService,
    ) -> None:
        self._session_repo = session_repo
        self._list_lookup = list_lookup
        self._fx_service = fx_service

    def execute(self, command: AssignBulkImportCommand) -> AssignBulkImportResult:
        # AC #1 assumes Bulk only ever sees review-routed cards, but no card
        # / routing_mode linkage exists on a statement yet (Stories 4.4/4.6's
        # territory, per this story's Prerequisites gap) — there is nothing
        # to check here today. `test_staged_statement_record_has_no_unchecked_
        # card_routing_field` in test_import_session_application.py fails
        # loud if that linkage lands without a routing_mode gate being added
        # here — do not remove this comment or that test until it is.
        session = self._session_repo.get_session(command.session_id, command.actor_user_id)
        if session is None:
            raise ImportSessionNotFoundError()

        AuthorizeListAccessService(self._list_lookup).execute(
            AuthorizeListAccessCommand(
                acting_user_id=command.actor_user_id,
                list_id=command.list_id,
                action="import_to_list",
            )
        )

        validate_bulk_commit_eligible(
            discarded_at=session.discarded_at,
            statement_statuses=[s.status for s in session.statements],
        )

        batches: list[ImportBatchRecord] = []
        for statement in session.statements:
            if statement.status != STATEMENT_STATUS_STAGED:
                continue
            rows: list[tuple[ManualExpenseDraft, MaterializedFx]] = []
            for candidate in statement.candidate_rows:
                validate_bulk_candidate_row(
                    amount=candidate.amount,
                    normalized_description=candidate.normalized_description,
                )
                draft = ManualExpenseDraft(
                    amount=candidate.amount,
                    currency=candidate.currency,
                    normalized_description=candidate.normalized_description,
                    payer_id=command.actor_user_id,
                    provenance=candidate.provenance,
                    line_type=candidate.line_type,
                    posted_date=candidate.posted_date,
                    external_ref=candidate.external_ref,
                )
                fx = self._fx_service.materialize_fx_for_entry(
                    amount=draft.amount,
                    currency=draft.currency,
                    posted_date=date.fromisoformat(draft.posted_date),
                )
                rows.append((draft, fx))

            batch = self._session_repo.commit_statement_batch(
                batch_id=uuid4(),
                session_id=command.session_id,
                statement_id=statement.id,
                list_id=command.list_id,
                actor_user_id=command.actor_user_id,
                rows=rows,
            )
            batches.append(batch)

        return AssignBulkImportResult(
            session_id=command.session_id, list_id=command.list_id, batches=batches
        )
