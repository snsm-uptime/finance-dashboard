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
from domain.cards import normalize_iban
from domain.errors import (
    ImportSessionNotFoundError,
    ImportStatementNotFoundError,
    InvalidCanonicalLineError,
    InvalidCardIbanError,
)
from domain.expenses import ORIGIN_KIND_CARD, ManualExpenseDraft
from domain.import_session import (
    STATEMENT_STATUS_FAILED,
    STATEMENT_STATUS_STAGED,
    session_needs_source_pdf,
    validate_bulk_candidate_row,
    validate_bulk_commit_eligible,
    validate_individual_accept_eligible,
    validate_individual_skip_eligible,
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
    """

    product_id: str
    status: str
    candidate_rows: list[CanonicalLine]
    iban: str | None = None


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
    header, used for card identification at review-start."""

    id: UUID
    session_id: UUID
    product_id: str
    status: str
    candidate_row_count: int
    pdf_path: str | None
    iban: str | None = None
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
        card_id: UUID | None = None,
    ) -> ImportBatchRecord:
        """Persist one Import Batch atomically (Story 4.7, AD-4): the batch
        row, one ledger entry per row, and flips the statement to
        committed. `rows` order does not matter — no ledger row depends on
        another within the same batch."""
        ...

    def skip_statement(
        self, *, session_id: UUID, statement_id: UUID, user_id: UUID
    ) -> ImportSessionRecord:
        """Flip one statement to skipped (Story 4.8, FR-18) — no ledger
        writes. Raises ImportSessionNotFoundError if the session/user pair
        doesn't match, ImportStatementNotFoundError if the statement isn't
        in that session."""
        ...

    def clear_statement_pdf_paths(self, session_id: UUID, user_id: UUID) -> None:
        """Null out path references after the source PDF has been deleted (AD-3)."""
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

        distinct_paths = {
            statement.pdf_path for statement in updated.statements if statement.pdf_path
        }
        for path in distinct_paths:
            try:
                self._pdf_storage.delete(path)
            except OSError:
                logger.warning("import_session_discard_cleanup_failed pdf_path=%s", path)

        return updated


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

        updated = self._session_repo.get_session(command.session_id, command.actor_user_id)
        if updated is not None:
            _release_source_pdf_if_idle(
                session=updated,
                session_repo=self._session_repo,
                pdf_storage=self._pdf_storage,
            )

        return AssignBulkImportResult(
            session_id=command.session_id, list_id=command.list_id, batches=batches
        )


def _find_statement(session: ImportSessionRecord, statement_id: UUID) -> StagedStatementRecord:
    for statement in session.statements:
        if statement.id == statement_id:
            return statement
    raise ImportStatementNotFoundError()


@dataclass(frozen=True, slots=True)
class AssignIndividualImportCommand:
    actor_user_id: UUID
    session_id: UUID
    statement_id: UUID
    list_id: UUID
    card_id: UUID | None = None  # Story 4.8.1: optional card ID for origin assignment


class AssignIndividualImportService:
    """Individual review accept (Story 4.8, AC #1/#2/#3): commits exactly
    one statement to one list — the same `commit_statement_batch` port
    Story 4.7's Bulk service already calls in a loop, called here once.
    Serves both the "chosen list" and "configurable default list" outcomes
    identically — the caller decides which `list_id` to send.
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

    def execute(self, command: AssignIndividualImportCommand) -> ImportBatchRecord:
        # Same missing-card/routing_mode gap as AssignBulkImportService.execute
        # (Story 4.7 review finding) — no card/routing_mode linkage exists on
        # a statement yet, so there is nothing to check here today. See that
        # service's identical comment and
        # test_staged_statement_record_has_no_unchecked_card_routing_field.
        session = self._session_repo.get_session(command.session_id, command.actor_user_id)
        if session is None:
            raise ImportSessionNotFoundError()

        statement = _find_statement(session, command.statement_id)

        AuthorizeListAccessService(self._list_lookup).execute(
            AuthorizeListAccessCommand(
                acting_user_id=command.actor_user_id,
                list_id=command.list_id,
                action="import_to_list",
            )
        )

        validate_individual_accept_eligible(
            discarded_at=session.discarded_at, statement_status=statement.status
        )

        rows: list[tuple[ManualExpenseDraft, MaterializedFx]] = []
        for candidate in statement.candidate_rows:
            validate_bulk_candidate_row(
                amount=candidate.amount, normalized_description=candidate.normalized_description
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
                origin_kind=ORIGIN_KIND_CARD if command.card_id else None,
                origin_card_id=command.card_id,
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
            card_id=command.card_id,
        )
        updated = self._session_repo.get_session(command.session_id, command.actor_user_id)
        if updated is not None:
            _release_source_pdf_if_idle(
                session=updated,
                session_repo=self._session_repo,
                pdf_storage=self._pdf_storage,
            )
        return batch


@dataclass(frozen=True, slots=True)
class SkipStatementCommand:
    actor_user_id: UUID
    session_id: UUID
    statement_id: UUID


class SkipStatementService:
    """Individual review skip (Story 4.8, AC #5, FR-18): no ledger rows —
    only flips the targeted statement's own status."""

    def __init__(self, session_repo: ImportSessionRepository, pdf_storage: PdfStorage) -> None:
        self._session_repo = session_repo
        self._pdf_storage = pdf_storage

    def execute(self, command: SkipStatementCommand) -> ImportSessionRecord:
        session = self._session_repo.get_session(command.session_id, command.actor_user_id)
        if session is None:
            raise ImportSessionNotFoundError()

        statement = _find_statement(session, command.statement_id)

        validate_individual_skip_eligible(
            discarded_at=session.discarded_at, statement_status=statement.status
        )

        updated = self._session_repo.skip_statement(
            session_id=command.session_id,
            statement_id=command.statement_id,
            user_id=command.actor_user_id,
        )
        _release_source_pdf_if_idle(
            session=updated,
            session_repo=self._session_repo,
            pdf_storage=self._pdf_storage,
        )
        return updated


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
