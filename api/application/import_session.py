"""Upload → detect/split/parse → Import Session composition (Story 4.6, FR-13/14/15).

The only genuinely new composition this story contributes: everything else
in the pipeline (detect_bank_adapter, BankAdapter.split/.parse) already
exists in application/bank_adapters.py (Story 4.4). See Dev Notes "The
composition this story adds" in the story file for the exact call chain this
module implements.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from dataclasses import dataclass, field, replace
from datetime import date, datetime
from typing import Protocol
from uuid import UUID, uuid4

from domain.canonical_line import CanonicalLine, canonical_identity_key
from domain.cards import normalize_iban
from domain.errors import (
    ImportRowNotAvailableError,
    ImportRowNotFoundError,
    ImportSessionDiscardedError,
    ImportSessionHasPendingRowsError,
    ImportSessionNotFoundError,
    ImportStatementNotFoundError,
    InvalidCanonicalLineError,
    InvalidCardIbanError,
)
from domain.expenses import ORIGIN_KIND_CARD, ManualExpenseDraft
from domain.import_session import (
    ROW_STATUS_EXCLUDED_ZERO_AMOUNT,
    ROW_STATUS_PENDING,
    STATEMENT_STATUS_FAILED,
    STATEMENT_STATUS_STAGED,
    normalize_row_description,
    session_needs_source_pdf,
    validate_bulk_candidate_row,
    validate_bulk_commit_eligible,
    validate_pdf_upload,
)

from application.bank_adapters import BankAdapter, detect_bank_adapter
from application.cards import CardRecord, MatchCardByIbanCommand, MatchCardByIbanService
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

    iban is extracted from the statement header during parse (Story 4.8.1);
    normalized but not validated for checksum (FR-37, AD-20).

    card_id is populated during upload if IBAN matches a registered card
    (moved from individual review to upload stage for Story 4.8.3).
    """

    product_id: str
    status: str
    candidate_rows: list[CanonicalLine]
    iban: str | None = None
    card_id: UUID | None = None  # Story 4.8.3: card identification at upload time
    original_filename: str | None = None


def run_import_pipeline(
    pdf_bytes: bytes, *, filename: str, adapters: list[BankAdapter]
) -> list[DetectedStatement]:
    """Detect the bank adapter, split into statements, parse each (AC #2/#3).

    Detection and whole-file split failures propagate uncaught — there is
    nothing to stage in either case. A per-chunk parse failure is the one
    place a failure is deliberately swallowed: it becomes a "failed"
    DetectedStatement with no rows so sibling statements in the same upload
    are not discarded (AC #3).

    IBAN extraction (Story 4.8.1) happens per-chunk after split, before parse.
    """
    adapter = detect_bank_adapter(
        adapters, override=None, filename=filename, content_sample=pdf_bytes
    )
    chunks = adapter.split(pdf_bytes)

    detected: list[DetectedStatement] = []
    for chunk_idx, chunk in enumerate(chunks):
        # Extract IBAN first (Story 4.8.1); normalize if present
        iban_raw = None
        iban_normalized = None
        if hasattr(adapter, "extract_iban"):
            logger.debug(
                "iban_extraction_starting chunk_idx=%d adapter=%s",
                chunk_idx,
                adapter.__class__.__name__,
            )
            iban_raw = adapter.extract_iban(chunk)
            logger.debug("iban_extraction_result chunk_idx=%d iban_raw=%r", chunk_idx, iban_raw)
            if iban_raw:
                try:
                    iban_normalized = normalize_iban(iban_raw)
                    logger.debug(
                        "iban_normalization_success chunk_idx=%d iban_raw=%r iban_normalized=%r",
                        chunk_idx,
                        iban_raw,
                        iban_normalized,
                    )
                except InvalidCardIbanError as e:
                    # IBAN normalization fails → treat as absent (AC #5, graceful degrade)
                    logger.warning(
                        "iban_normalization_failed chunk_idx=%d iban_raw=%r error=%s",
                        chunk_idx,
                        iban_raw,
                        e,
                    )
                    iban_normalized = None
        else:
            logger.debug(
                "iban_extraction_not_available adapter=%s has_extract_iban=%s",
                adapter.__class__.__name__,
                hasattr(adapter, "extract_iban"),
            )

        try:
            rows = adapter.parse(chunk)
        except InvalidCanonicalLineError:
            detected.append(
                DetectedStatement(
                    product_id=adapter.product_id,
                    status=STATEMENT_STATUS_FAILED,
                    candidate_rows=[],
                    iban=iban_normalized,
                )
            )
            continue
        detected.append(
            DetectedStatement(
                product_id=adapter.product_id,
                status=STATEMENT_STATUS_STAGED,
                candidate_rows=rows,
                iban=iban_normalized,
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
    drafts from the same fetched record without a second round-trip.

    `iban` (Story 4.8.1) is statement-level metadata extracted from the PDF
    header, used for card identification at review-start.

    `card_id` (Story 4.8.3) is populated during upload if IBAN matches a
    registered card, making card context available to both bulk and
    individual review flows.

    `original_filename` is the client-supplied upload name (display only —
    never used as a storage path)."""

    id: UUID
    session_id: UUID
    product_id: str
    status: str
    candidate_row_count: int
    pdf_path: str | None
    iban: str | None = None
    card_id: UUID | None = None  # Story 4.8.3: identified at upload time
    original_filename: str | None = None
    candidate_rows: list[CandidateRowRecord] = field(default_factory=list)


@dataclass(frozen=True, slots=True)
class CandidateRowRecord:
    """CanonicalLine plus session review fields (Story 4.10, AD-16).

    Review status/sequence/resolution live here — never on CanonicalLine.
    """

    id: UUID
    sequence: int
    status: str
    resolved_list_id: UUID | None
    line: CanonicalLine
    resolved_at: datetime | None = None
    # Resolved without a ledger entry — the identity was already in the
    # destination list (Story 4.12). Drives skipped_duplicate_count.
    dedup_skipped: bool = False


@dataclass(frozen=True, slots=True)
class CommitRow:
    """One row handed to `commit_statement_batch` (Story 4.10)."""

    candidate_row_id: UUID
    draft: ManualExpenseDraft
    fx: MaterializedFx
    # Domain-computed canonical identity, persisted on the ledger entry so a
    # later session can recognize the same transaction (Story 4.12, AD-18).
    identity: str


@dataclass(frozen=True, slots=True)
class FailedStatementRecord:
    id: UUID
    product_id: str
    filename: str | None = None


@dataclass(frozen=True, slots=True)
class CommittedByListRecord:
    list_id: UUID
    name: str
    count: int


@dataclass(frozen=True, slots=True)
class ImportSessionRecord:
    id: UUID
    user_id: UUID
    created_at: datetime
    discarded_at: datetime | None
    statements: list[StagedStatementRecord]
    # Single-level undo pointer (AC #1/#5): the last resolved row and how it
    # was resolved, or None when there is nothing to undo.
    undo_row_id: UUID | None = None
    undo_action: str | None = None
    # Save / bulk commit — what unlocks the AD-3 PDF delete (Story 4.12, AC #7).
    finalized_at: datetime | None = None
    # Derived from row state every time the record is built, never incremented
    # counters (Story 4.12, AC #4): undo returns a row to pending and counters
    # would drift, so the 4.14 summary would lie after any undo.
    # Session-lifetime scope (Story 4.14) — not the same as BulkCommitResponse
    # imported_new_count / skipped_duplicate_count, which cover one bulk call.
    imported_new_count: int = 0
    skipped_duplicate_count: int = 0
    # The list that received the most newly imported rows this session, or None
    # when the session imported nothing new (AC #6).
    landing_list_id: UUID | None = None
    deleted_count: int = 0
    zero_amount_excluded_count: int = 0
    failed_statements: list[FailedStatementRecord] = field(default_factory=list)
    committed_by_list: list[CommittedByListRecord] = field(default_factory=list)


@dataclass(frozen=True, slots=True)
class ImportBatchRecord:
    """One committed Import Batch — one commit action (Story 4.10, amended AD-4)."""

    id: UUID
    session_id: UUID
    statement_id: UUID
    list_id: UUID
    actor_user_id: UUID
    created_at: datetime
    ledger_entry_ids: list[UUID]


@dataclass(frozen=True, slots=True)
class CommitOutcome:
    """What one commit action actually did (Story 4.12).

    `batch` is None when every targeted row was a duplicate: AD-4 says a batch
    is one commit action that *happened*, and an empty batch would pollute
    FR-30 rollback — the same reason `_undo_assign` already deletes emptied
    batches.
    """

    batch: ImportBatchRecord | None
    imported_new: int
    skipped_duplicate: int


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

    def find_active_session(self, user_id: UUID) -> ImportSessionRecord | None:
        """Owner's most recent session that is neither discarded nor finalized."""
        ...

    def discard_session(self, session_id: UUID, user_id: UUID) -> ImportSessionRecord:
        """Set discarded_at. Idempotent — calling twice does not error."""
        ...

    def set_statement_card_id(
        self, *, session_id: UUID, user_id: UUID, statement_id: UUID, card_id: UUID
    ) -> None:
        """Persist an identified/registered card on a statement in this session."""
        ...

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
        """Persist one Import Batch atomically (Story 4.10, amended AD-4):
        guarded pending→committed UPDATE on the targeted candidate rows,
        the batch row, one ledger entry per row (with import_candidate_row_id
        and import_identity), then complete the statement if every non-excluded
        row has left pending.

        `undo_row_id` records the session undo pointer for a row-grain assign.
        Bulk passes nothing: a single-row statement committed under Bulk is
        still a statement-grain action and must not become undoable per row.

        `duplicate_row_ids` (Story 4.12) are rows whose identity is already in
        the destination list. They resolve — same guarded pending→committed
        UPDATE — but write no ledger entry and are stamped `dedup_skipped`.
        A commit action in which *every* row is a duplicate journals no batch:
        `rows` empty means `CommitOutcome.batch is None`.
        """
        ...

    def find_existing_identities(self, *, list_id: UUID, identities: Sequence[str]) -> set[str]:
        """Which of `identities` already have a ledger entry in this list
        (Story 4.12, AC #3).

        Scoped to the destination list, not global: a duplicate in list A
        cannot corrupt list B's balance, and re-import is currently the only
        informal way to repair a misrouted statement (no reassign, no batch
        rollback yet). Revisit after Stories 5.5 / 5.6.
        """
        ...

    def mark_session_finalized(self, *, session_id: UUID, user_id: UUID) -> ImportSessionRecord:
        """Stamp `finalized_at` if not already set and return the reloaded
        record. Idempotent — Save is double-clickable (Story 4.12, AC #8)."""
        ...

    def mark_candidate_row_deleted(
        self, *, session_id: UUID, statement_id: UUID, row_id: UUID, user_id: UUID
    ) -> ImportSessionRecord:
        """Guarded pending→deleted or committed→deleted UPDATE; complete the
        statement if resolved. Pending delete writes no ledger. Assigned
        (committed) delete reverses the assign-time ledger entry so the row
        is neither pending nor assigned. Raises ImportRowNotAvailableError
        when the row is already deleted or excluded."""
        ...

    def update_candidate_row_description(
        self,
        *,
        session_id: UUID,
        statement_id: UUID,
        row_id: UUID,
        user_id: UUID,
        description: str,
    ) -> ImportSessionRecord:
        """Guarded UPDATE of a still-pending row's description. Raises
        ImportRowNotAvailableError once the row has been resolved."""
        ...

    def set_undo_pointer(
        self,
        *,
        session_id: UUID,
        user_id: UUID,
        row_id: UUID,
        action: str,
        prior_status: str,
    ) -> None:
        """Record the single-level undo pointer for the session."""
        ...

    def clear_undo_pointer(self, *, session_id: UUID, user_id: UUID) -> None:
        """Drop the undo pointer — used or superseded."""
        ...

    def undo_last_resolution(self, *, session_id: UUID, user_id: UUID) -> ImportSessionRecord:
        """Reverse the pointed-at resolution and clear the pointer. Raises
        ImportNothingToUndoError when there is no usable pointer."""
        ...

    def clear_statement_pdf_paths(self, session_id: UUID, user_id: UUID) -> None:
        """Null out path references after the source PDF has been deleted (AD-3)."""
        ...

    def unassign_candidate_row(
        self, *, session_id: UUID, user_id: UUID, row_id: UUID
    ) -> ImportSessionRecord:
        """ImportReviewSheet per-row discard (Story 4.13.1): reverse a
        committed row back to pending via the same ledger/batch-delete path
        `_undo_assign` already uses for card undo. Raises
        ImportRowNotAvailableError when the row is not committed and
        ImportRowNotDiscardableError when it is `dedup_skipped` (re-assigning
        it would skip forever). Clears the session's undo pointer — a sheet
        discard is not a card action and must not become undoable by the
        next card down/undo.
        """
        ...


@dataclass(frozen=True, slots=True)
class UploadStatementPdfCommand:
    actor_user_id: UUID
    filename: str
    content: bytes


class UploadStatementPdfService:
    """Validate → store → run the pipeline → identify cards → persist the Import Session.

    Story 4.8.3: Card identification moved to upload time so both bulk and
    individual review flows can use pre-identified cards.
    """

    def __init__(
        self,
        pdf_storage: PdfStorage,
        adapters: list[BankAdapter],
        session_repo: ImportSessionRepository,
        card_match_service: MatchCardByIbanService,
    ) -> None:
        self._pdf_storage = pdf_storage
        self._adapters = adapters
        self._session_repo = session_repo
        self._card_match_service = card_match_service

    def execute(self, command: UploadStatementPdfCommand) -> ImportSessionRecord:
        validate_pdf_upload(command.filename, command.content)

        whole_pdf_path = self._pdf_storage.save(
            user_id=command.actor_user_id, filename=command.filename, content=command.content
        )

        try:
            detected = run_import_pipeline(
                command.content, filename=command.filename, adapters=self._adapters
            )

            # Story 4.8.3: Identify cards for all statements at upload time
            detected_with_cards = []
            for statement in detected:
                card_id = statement.card_id
                if statement.iban:
                    matched_card = self._card_match_service.execute(
                        MatchCardByIbanCommand(
                            actor_user_id=command.actor_user_id, iban=statement.iban
                        )
                    )
                    if matched_card:
                        card_id = matched_card.id
                        logger.debug(
                            "upload_statement_card_identified session_filename=%s "
                            "iban=%r card_id=%s",
                            command.filename,
                            statement.iban,
                            matched_card.id,
                        )
                    else:
                        logger.debug(
                            "upload_statement_card_unknown session_filename=%s iban=%r",
                            command.filename,
                            statement.iban,
                        )
                detected_with_cards.append(
                    replace(
                        statement,
                        card_id=card_id,
                        original_filename=command.filename,
                    )
                )

            pdf_paths = {index: whole_pdf_path for index in range(len(detected_with_cards))}
            created = self._session_repo.create_session(
                session_id=uuid4(),
                user_id=command.actor_user_id,
                statements=detected_with_cards,
                pdf_paths=pdf_paths,
            )
            # A statement that parses to zero rows (zero-activity month) or to
            # nothing but excluded zero-amount rows is stamped `committed` at
            # create time — there is nothing left to review. Bulk commit then
            # refuses the session outright, so the release that normally runs
            # after a commit never fires and the PDF leaks. Release here so
            # AD-3 holds for a session that is born fully resolved.
            _release_source_pdf_if_idle(
                session=created,
                session_repo=self._session_repo,
                pdf_storage=self._pdf_storage,
            )
            return self._session_repo.get_session(created.id, command.actor_user_id) or created
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


class GetActiveImportSessionService:
    """Most recent in-flight session for the caller, or None (Story 4.14)."""

    def __init__(self, session_repo: ImportSessionRepository) -> None:
        self._session_repo = session_repo

    def execute(self, actor_user_id: UUID) -> ImportSessionRecord | None:
        return self._session_repo.find_active_session(actor_user_id)


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
        _release_source_pdf_if_idle(
            session=updated,
            session_repo=self._session_repo,
            pdf_storage=self._pdf_storage,
        )
        return self._session_repo.get_session(command.session_id, command.actor_user_id) or updated


def _release_source_pdf_if_idle(
    *,
    session: ImportSessionRecord,
    session_repo: ImportSessionRepository,
    pdf_storage: PdfStorage,
) -> None:
    """Delete the source PDF and clear path refs after a clean commit (AD-3)."""
    if session_needs_source_pdf([statement.status for statement in session.statements]):
        return
    paths = {statement.pdf_path for statement in session.statements if statement.pdf_path}
    for path in paths:
        try:
            pdf_storage.delete(path)
        except OSError:
            logger.warning(
                "import_session_commit_cleanup_failed session_id=%s pdf_path=%s",
                session.id,
                path,
            )
    if paths:
        session_repo.clear_statement_pdf_paths(session.id, session.user_id)


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
    # Story 4.12: a fully-duplicate statement contributes no batch, so the
    # batch list alone can no longer tell the caller what happened.
    imported_new: int = 0
    skipped_duplicate: int = 0


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
        pdf_storage: PdfStorage,
    ) -> None:
        self._session_repo = session_repo
        self._list_lookup = list_lookup
        self._fx_service = fx_service
        self._pdf_storage = pdf_storage

    def execute(self, command: AssignBulkImportCommand) -> AssignBulkImportResult:
        # statement.card_id is origin for committed ledger rows (Story 4.8.1
        # stamp; restored after 4.8.3 moved identification to upload). It is
        # not a routing_mode gate — Bulk still does not check review vs fixed
        # routing. test_staged_statement_record_has_no_unchecked_routing_mode_field
        # fails loud if routing_mode lands on a statement record without a gate.
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
        imported_new = 0
        skipped_duplicate = 0
        for statement in session.statements:
            if statement.status != STATEMENT_STATUS_STAGED:
                continue
            non_excluded = [
                candidate
                for candidate in statement.candidate_rows
                if candidate.status != ROW_STATUS_EXCLUDED_ZERO_AMOUNT
            ]
            if any(candidate.status != ROW_STATUS_PENDING for candidate in non_excluded):
                raise ImportRowNotAvailableError()
            rows: list[CommitRow] = []
            duplicate_row_ids: list[UUID] = []
            card_id = statement.card_id

            # One lookup per statement, not one per row (Story 4.12, AC #3).
            identities = {
                candidate.id: canonical_identity_key(candidate.line) for candidate in non_excluded
            }
            already_in_list = self._session_repo.find_existing_identities(
                list_id=command.list_id, identities=list(identities.values())
            )
            # A bulk statement can legitimately carry two byte-identical rows,
            # and the database lookup only catches rows already committed — so
            # identities claimed by an earlier row in *this* loop count too.
            claimed_in_this_action: set[str] = set()

            for candidate in non_excluded:
                # Validate before the duplicate check (matches
                # AssignCandidateRowService's order, Story 4.12 review): a row
                # that is both invalid and a duplicate must fail loudly, not
                # be silently absorbed into skipped_duplicate_count.
                line = candidate.line
                validate_bulk_candidate_row(
                    amount=line.amount,
                    normalized_description=line.normalized_description,
                )

                identity = identities[candidate.id]
                if identity in already_in_list or identity in claimed_in_this_action:
                    duplicate_row_ids.append(candidate.id)
                    continue
                claimed_in_this_action.add(identity)

                draft = ManualExpenseDraft(
                    amount=line.amount,
                    currency=line.currency,
                    normalized_description=line.normalized_description,
                    payer_id=command.actor_user_id,
                    provenance=line.provenance,
                    line_type=line.line_type,
                    posted_date=line.posted_date,
                    external_ref=line.external_ref,
                    origin_kind=ORIGIN_KIND_CARD if card_id else None,
                    origin_card_id=card_id,
                )
                fx = self._fx_service.materialize_fx_for_entry(
                    amount=draft.amount,
                    currency=draft.currency,
                    posted_date=date.fromisoformat(draft.posted_date),
                )
                rows.append(
                    CommitRow(candidate_row_id=candidate.id, draft=draft, fx=fx, identity=identity)
                )

            if not rows and not duplicate_row_ids:
                continue

            outcome = self._session_repo.commit_statement_batch(
                batch_id=uuid4(),
                session_id=command.session_id,
                statement_id=statement.id,
                list_id=command.list_id,
                actor_user_id=command.actor_user_id,
                rows=rows,
                duplicate_row_ids=duplicate_row_ids,
            )
            imported_new += outcome.imported_new
            skipped_duplicate += outcome.skipped_duplicate
            if outcome.batch is not None:
                batches.append(outcome.batch)

        # A row-grain undo pointer is meaningless once a whole statement was
        # bulk-committed on top of it (AC #5, "cleared once used or superseded").
        self._session_repo.clear_undo_pointer(
            session_id=command.session_id, user_id=command.actor_user_id
        )

        # Bulk is deliberately unchanged on PDF release (Story 4.12, AC #5):
        # there is no ImportReviewSheet in the bulk flow, so bulk commit *is*
        # the end of review. AD-4 makes it a finalize too.
        updated = self._session_repo.get_session(command.session_id, command.actor_user_id)
        if updated is not None:
            _release_source_pdf_if_idle(
                session=updated,
                session_repo=self._session_repo,
                pdf_storage=self._pdf_storage,
            )
        self._session_repo.mark_session_finalized(
            session_id=command.session_id, user_id=command.actor_user_id
        )

        return AssignBulkImportResult(
            session_id=command.session_id,
            list_id=command.list_id,
            batches=batches,
            imported_new=imported_new,
            skipped_duplicate=skipped_duplicate,
        )


def _find_statement(session: ImportSessionRecord, statement_id: UUID) -> StagedStatementRecord:
    for statement in session.statements:
        if statement.id == statement_id:
            return statement
    raise ImportStatementNotFoundError()


def _find_candidate_row(
    session: ImportSessionRecord, row_id: UUID
) -> tuple[StagedStatementRecord, CandidateRowRecord]:
    for statement in session.statements:
        for row in statement.candidate_rows:
            if row.id == row_id:
                return statement, row
    raise ImportRowNotFoundError()


@dataclass(frozen=True, slots=True)
class AssignCandidateRowCommand:
    actor_user_id: UUID
    session_id: UUID
    row_id: UUID
    list_id: UUID
    card_id: UUID | None = None  # Story 4.8.1: optional card ID for origin assignment


class AssignCandidateRowService:
    """Per-row assign (Story 4.10): one candidate row → one commit action.

    Reuses `commit_statement_batch` with a 1-element rows list. HTTP lands
    in Story 4.11.
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

    def execute(self, command: AssignCandidateRowCommand) -> CommitOutcome:
        session = self._session_repo.get_session(command.session_id, command.actor_user_id)
        if session is None:
            raise ImportSessionNotFoundError()

        statement, candidate = _find_candidate_row(session, command.row_id)

        AuthorizeListAccessService(self._list_lookup).execute(
            AuthorizeListAccessCommand(
                acting_user_id=command.actor_user_id,
                list_id=command.list_id,
                action="import_to_list",
            )
        )

        if session.discarded_at is not None:
            raise ImportSessionDiscardedError()

        # Cheap pre-check so a stale-UI retry on an already-resolved row fails
        # as 409 instead of burning an external FX call and surfacing a 503
        # during an FX outage. The repo's guarded UPDATE stays authoritative
        # for the actual race (Story 4.10 review).
        if candidate.status != ROW_STATUS_PENDING:
            raise ImportRowNotAvailableError()

        line = candidate.line
        validate_bulk_candidate_row(
            amount=line.amount, normalized_description=line.normalized_description
        )

        # Dedup *before* FX (Story 4.12, AC #3): a re-imported statement must
        # not burn a BCCR call per duplicate row, and an FX outage must not 503
        # the whole re-import on rows that were never going to be written.
        identity = canonical_identity_key(line)
        already_in_list = self._session_repo.find_existing_identities(
            list_id=command.list_id, identities=[identity]
        )
        if identity in already_in_list:
            # The row still resolves — it leaves pending and the queue advances
            # — but writes no ledger entry and journals no batch.
            return self._session_repo.commit_statement_batch(
                batch_id=uuid4(),
                session_id=command.session_id,
                statement_id=statement.id,
                list_id=command.list_id,
                actor_user_id=command.actor_user_id,
                rows=[],
                undo_row_id=candidate.id,
                duplicate_row_ids=[candidate.id],
            )

        card_id = command.card_id or statement.card_id
        draft = ManualExpenseDraft(
            amount=line.amount,
            currency=line.currency,
            normalized_description=line.normalized_description,
            payer_id=command.actor_user_id,
            provenance=line.provenance,
            line_type=line.line_type,
            posted_date=line.posted_date,
            external_ref=line.external_ref,
            origin_kind=ORIGIN_KIND_CARD if card_id else None,
            origin_card_id=card_id,
        )
        fx = self._fx_service.materialize_fx_for_entry(
            amount=draft.amount,
            currency=draft.currency,
            posted_date=date.fromisoformat(draft.posted_date),
        )
        # No PDF release here (Story 4.12, AC #7): the last pending assign is
        # not finalization. Review includes ImportReviewSheet until Save, which
        # calls POST /finalize — dropping the file here would strand a user who
        # still wants to compare, and 4.11 deferred exactly this defect.
        return self._session_repo.commit_statement_batch(
            batch_id=uuid4(),
            session_id=command.session_id,
            statement_id=statement.id,
            list_id=command.list_id,
            actor_user_id=command.actor_user_id,
            rows=[CommitRow(candidate_row_id=candidate.id, draft=draft, fx=fx, identity=identity)],
            undo_row_id=candidate.id,
        )


@dataclass(frozen=True, slots=True)
class DeleteCandidateRowCommand:
    actor_user_id: UUID
    session_id: UUID
    row_id: UUID


class DeleteCandidateRowService:
    """Per-row delete: pending→deleted (card trash, Story 4.10) or
    committed→deleted with ledger reversal (ImportReviewSheet Save discard).

    Assigned delete must not return the row to pending — that would 409
    finalize. No `pdf_storage`: Story 4.12 moved PDF release behind finalize.
    """

    def __init__(self, session_repo: ImportSessionRepository) -> None:
        self._session_repo = session_repo

    def execute(self, command: DeleteCandidateRowCommand) -> ImportSessionRecord:
        session = self._session_repo.get_session(command.session_id, command.actor_user_id)
        if session is None:
            raise ImportSessionNotFoundError()

        statement, candidate = _find_candidate_row(session, command.row_id)

        if session.discarded_at is not None:
            raise ImportSessionDiscardedError()
        if session.finalized_at is not None:
            raise ImportRowNotAvailableError()

        # No PDF release here (Story 4.12, AC #7) — see AssignCandidateRowService.
        return self._session_repo.mark_candidate_row_deleted(
            session_id=command.session_id,
            statement_id=statement.id,
            row_id=candidate.id,
            user_id=command.actor_user_id,
        )


@dataclass(frozen=True, slots=True)
class UnassignCandidateRowCommand:
    actor_user_id: UUID
    session_id: UUID
    row_id: UUID


class UnassignCandidateRowService:
    """ImportReviewSheet per-row discard (Story 4.13.1): reverses a single
    committed row back to pending. Not `POST /undo` — undo is single-level and
    last-action-only, and the sheet must be able to discard an arbitrary
    assigned row, not just the most recent one.

    Not-found / discarded / finalized checks mirror every other row-endpoint
    service; the pending-only guard and the `dedup_skipped` block both live
    in the repository, same as `DeleteCandidateRowService` leans on the
    repo's guarded UPDATE rather than duplicating the check here.

    No FX, no PDF release: discard makes the session less resolved, never
    more, so AD-3's retain rule can only move toward keeping the file (same
    rationale as `UndoLastResolutionService`).
    """

    def __init__(self, session_repo: ImportSessionRepository) -> None:
        self._session_repo = session_repo

    def execute(self, command: UnassignCandidateRowCommand) -> ImportSessionRecord:
        session = self._session_repo.get_session(command.session_id, command.actor_user_id)
        if session is None:
            raise ImportSessionNotFoundError()

        _find_candidate_row(session, command.row_id)

        if session.discarded_at is not None:
            raise ImportSessionDiscardedError()
        if session.finalized_at is not None:
            raise ImportRowNotAvailableError()

        return self._session_repo.unassign_candidate_row(
            session_id=command.session_id,
            user_id=command.actor_user_id,
            row_id=command.row_id,
        )


@dataclass(frozen=True, slots=True)
class UndoLastResolutionCommand:
    actor_user_id: UUID
    session_id: UUID


class UndoLastResolutionService:
    """Single-level undo of the session's last row resolution.

    No PDF release here: undo makes a session less resolved, never more, so
    the retain rule (AD-3) can only move in the direction of keeping the file.
    """

    def __init__(self, session_repo: ImportSessionRepository) -> None:
        self._session_repo = session_repo

    def execute(self, command: UndoLastResolutionCommand) -> ImportSessionRecord:
        session = self._session_repo.get_session(command.session_id, command.actor_user_id)
        if session is None:
            raise ImportSessionNotFoundError()

        if session.discarded_at is not None:
            raise ImportSessionDiscardedError()

        return self._session_repo.undo_last_resolution(
            session_id=command.session_id, user_id=command.actor_user_id
        )


@dataclass(frozen=True, slots=True)
class FinalizeImportSessionCommand:
    actor_user_id: UUID
    session_id: UUID


class FinalizeImportSessionService:
    """End of review — the moment the source PDF may go (Story 4.12, AC #7/#8).

    Called by ImportReviewSheet's Save (Story 4.13.1). This, not the last
    pending row leaving the queue, is what AD-3 means by "review no longer
    needs the PDF": review includes the sheet, and a user who has emptied the
    queue may still want to compare before saving.

    Session-owner scoped through the repository (AD-19): every query filters
    on `user_id`, so a non-owner gets `import_session_not_found` rather than a
    403. That non-enumerating shape is deliberate.
    """

    def __init__(self, session_repo: ImportSessionRepository, pdf_storage: PdfStorage) -> None:
        self._session_repo = session_repo
        self._pdf_storage = pdf_storage

    def execute(self, command: FinalizeImportSessionCommand) -> ImportSessionRecord:
        session = self._session_repo.get_session(command.session_id, command.actor_user_id)
        if session is None:
            raise ImportSessionNotFoundError()

        if session.discarded_at is not None:
            raise ImportSessionDiscardedError()

        # Idempotent: Save is double-clickable, and a second call must not
        # re-run the delete against paths that are already gone.
        if session.finalized_at is not None:
            return session

        if any(
            row.status == ROW_STATUS_PENDING
            for statement in session.statements
            for row in statement.candidate_rows
        ):
            raise ImportSessionHasPendingRowsError()

        # Retention while a statement is staged or failed stays exactly today's
        # `session_needs_source_pdf` rule — unresolved-quarantine retention is
        # Epic 5's (5.2-5.3), not this story's.
        _release_source_pdf_if_idle(
            session=session,
            session_repo=self._session_repo,
            pdf_storage=self._pdf_storage,
        )
        return self._session_repo.mark_session_finalized(
            session_id=command.session_id, user_id=command.actor_user_id
        )


@dataclass(frozen=True, slots=True)
class EditCandidateRowCommand:
    actor_user_id: UUID
    session_id: UUID
    row_id: UUID
    description: str


class EditCandidateRowService:
    """Correct a still-pending row's description before it is resolved.

    Description only — no ledger, no FX, no PDF release.
    """

    def __init__(self, session_repo: ImportSessionRepository) -> None:
        self._session_repo = session_repo

    def execute(self, command: EditCandidateRowCommand) -> ImportSessionRecord:
        session = self._session_repo.get_session(command.session_id, command.actor_user_id)
        if session is None:
            raise ImportSessionNotFoundError()

        statement, candidate = _find_candidate_row(session, command.row_id)

        if session.discarded_at is not None:
            raise ImportSessionDiscardedError()

        description = normalize_row_description(command.description)

        return self._session_repo.update_candidate_row_description(
            session_id=command.session_id,
            statement_id=statement.id,
            row_id=candidate.id,
            user_id=command.actor_user_id,
            description=description,
        )


@dataclass(frozen=True, slots=True)
class MatchStatementCardCommand:
    """Card identification for a statement with known IBAN (Story 4.8.1, AC #2/#3).

    actor_user_id is required to scope card lookup to the user's own registered cards.
    """

    actor_user_id: UUID
    iban: str


@dataclass(frozen=True, slots=True)
class MatchStatementCardResult:
    """Result of card matching: either a matched card or None (unknown IBAN).

    matched_card: CardRecord if IBAN matches a registered card; None if unknown.
    """

    matched_card: CardRecord | None


class MatchStatementCardService:
    """Match a statement IBAN to a registered card, or return unknown (Story 4.8.1).

    AC #2: Known IBAN → returns matched card silently (no prompt).
    AC #3: Unknown IBAN → returns None; caller must prompt card registration.
    AC #5: Missing IBAN → returns None; review proceeds without card.

    Reuses Story 4.1's MatchCardByIbanService for the core lookup.
    """

    def __init__(self, card_match_service: MatchCardByIbanService) -> None:
        self._card_match_service = card_match_service

    def execute(self, command: MatchStatementCardCommand) -> MatchStatementCardResult:
        """Match IBAN to existing card; return None if unknown or missing.

        IBAN will be normalized by MatchCardByIbanService before matching.
        """
        if not command.iban:
            logger.debug("match_statement_card_empty_iban user_id=%s", command.actor_user_id)
            return MatchStatementCardResult(matched_card=None)

        logger.debug(
            "match_statement_card_lookup_start user_id=%s iban=%r",
            command.actor_user_id,
            command.iban,
        )
        matched = self._card_match_service.execute(
            MatchCardByIbanCommand(actor_user_id=command.actor_user_id, iban=command.iban)
        )
        logger.debug(
            "match_statement_card_lookup_result user_id=%s iban=%r matched=%s",
            command.actor_user_id,
            command.iban,
            matched.id if matched else None,
        )
        return MatchStatementCardResult(matched_card=matched)
