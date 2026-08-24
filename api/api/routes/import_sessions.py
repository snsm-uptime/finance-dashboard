"""Upload / discard Import Session routes — Story 4.6 (FR-13/14/15).

Gated on require_authenticated_user only, not require_user_alias: upload is
a global entry point (EXPERIENCE.md), not a list-roster surface — list/alias
assignment happens in review (Stories 4.7/4.8), same rationale cards.py
already documents for its own no-alias-gate choice.
"""

from __future__ import annotations

import logging
import uuid

from adapters.persistence.cards import SqlAlchemyCardRepository
from adapters.persistence.import_sessions import SqlAlchemyImportSessionRepository
from adapters.persistence.repositories import SqlAlchemyListRepository
from application.bank_adapters import BankAdapter
from application.cards import MatchCardByIbanService, RegisterCardCommand, RegisterCardService
from application.fx_service import MaterializeFxService
from application.import_session import (
    AssignBulkImportCommand,
    AssignBulkImportResult,
    AssignBulkImportService,
    AssignCandidateRowCommand,
    AssignCandidateRowService,
    DeleteCandidateRowCommand,
    DeleteCandidateRowService,
    DiscardImportSessionCommand,
    DiscardImportSessionService,
    EditCandidateRowCommand,
    EditCandidateRowService,
    FinalizeImportSessionCommand,
    FinalizeImportSessionService,
    ImportSessionRecord,
    MatchStatementCardCommand,
    MatchStatementCardService,
    StagedStatementRecord,
    UnassignCandidateRowCommand,
    UnassignCandidateRowService,
    UndoLastResolutionCommand,
    UndoLastResolutionService,
    UploadStatementPdfCommand,
    UploadStatementPdfService,
    _find_statement,
)
from application.ports import PdfStorage
from domain.errors import (
    AmbiguousBankAdapterError,
    CardIbanAlreadyRegisteredError,
    FxAuthenticationError,
    FxCurrencyNotSupportedError,
    FxFutureDateError,
    FxRateNotAvailableError,
    FxServiceUnavailableError,
    ImportNothingToUndoError,
    ImportRowNotAvailableError,
    ImportRowNotDiscardableError,
    ImportRowNotFoundError,
    ImportSessionDiscardedError,
    ImportSessionHasPendingRowsError,
    ImportSessionNotFoundError,
    ImportStatementNotFoundError,
    InvalidCanonicalLineError,
    InvalidCardIbanError,
    InvalidCardLabelError,
    NoCleanStatementsToCommitError,
    NotListMemberError,
    UnknownBankAdapterError,
    UnsupportedFileTypeError,
)
from domain.import_session import (
    ROW_STATUS_COMMITTED,
    ROW_STATUS_EXCLUDED_ZERO_AMOUNT,
    ROW_STATUS_PENDING,
)
from fastapi import APIRouter, Depends, File, UploadFile, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from api.deps import (
    get_bank_adapters,
    get_db,
    get_fx_service,
    get_pdf_storage,
    require_authenticated_user,
)
from api.schemas.import_sessions import (
    AssignRowBody,
    BulkCommitBody,
    BulkCommitResponse,
    CandidateRowResponse,
    CardIdentificationResponse,
    CommittedByListResponse,
    EditRowBody,
    FailedStatementResponse,
    IdentifyCardBody,
    ImportBatchResponse,
    ImportSessionResponse,
    StagedStatementResponse,
    UndoPointerResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/import/sessions", tags=["import"])


def _statement_response(statement: StagedStatementRecord) -> StagedStatementResponse:
    # Only pending rows form the review queue, ordered by sequence: selectinload
    # gives no ordering guarantee, and "a restored row re-enters at its original
    # position" is a payload-ordering promise, not a data one.
    pending = sorted(
        (row for row in statement.candidate_rows if row.status == ROW_STATUS_PENDING),
        key=lambda row: row.sequence,
    )
    # Story 4.13.1: committed rows (assign survivors + dedup_skipped), also
    # sequence-ordered, for ImportReviewSheet. Deleted / excluded rows never
    # appear in either array.
    assigned = sorted(
        (row for row in statement.candidate_rows if row.status == ROW_STATUS_COMMITTED),
        key=lambda row: row.sequence,
    )
    return StagedStatementResponse(
        id=statement.id,
        product_id=statement.product_id,
        status=statement.status,
        # Still the total parsed rows — Bulk review (Story 4.7) renders this
        # number. len(rows) is the pending count.
        candidate_row_count=statement.candidate_row_count,
        iban=statement.iban,  # Story 4.8.1: include IBAN for card identification
        filename=statement.original_filename,  # original upload name, not the storage path
        card_id=statement.card_id,  # Story 4.8.3: identified card from upload
        rows=[
            CandidateRowResponse(
                id=row.id,
                sequence=row.sequence,
                description=row.line.normalized_description,
                amount=str(row.line.amount),
                currency=row.line.currency,
                posted_date=row.line.posted_date,
                status=row.status,
            )
            for row in pending
        ],
        zero_amount_excluded_count=sum(
            1 for row in statement.candidate_rows if row.status == ROW_STATUS_EXCLUDED_ZERO_AMOUNT
        ),
        assigned_rows=[
            CandidateRowResponse(
                id=row.id,
                sequence=row.sequence,
                description=row.line.normalized_description,
                amount=str(row.line.amount),
                currency=row.line.currency,
                posted_date=row.line.posted_date,
                status=row.status,
                resolved_list_id=row.resolved_list_id,
                dedup_skipped=row.dedup_skipped,
            )
            for row in assigned
        ],
    )


def _session_response(session: ImportSessionRecord) -> ImportSessionResponse:
    undo = (
        UndoPointerResponse(row_id=session.undo_row_id, action=session.undo_action)
        if session.undo_row_id is not None and session.undo_action is not None
        else None
    )
    return ImportSessionResponse(
        id=session.id,
        created_at=session.created_at,
        discarded_at=session.discarded_at,
        statements=[_statement_response(s) for s in session.statements],
        undo=undo,
        # Story 4.12 — one mapper, so every route that returns a session gets
        # these at once (AC #4).
        finalized_at=session.finalized_at,
        imported_new_count=session.imported_new_count,
        skipped_duplicate_count=session.skipped_duplicate_count,
        landing_list_id=session.landing_list_id,
        deleted_count=session.deleted_count,
        zero_amount_excluded_count=session.zero_amount_excluded_count,
        failed_statements=[
            FailedStatementResponse(
                id=failed.id, product_id=failed.product_id, filename=failed.filename
            )
            for failed in session.failed_statements
        ],
        committed_by_list=[
            CommittedByListResponse(list_id=item.list_id, name=item.name, count=item.count)
            for item in session.committed_by_list
        ],
    )


@router.post("", response_model=ImportSessionResponse, status_code=status.HTTP_201_CREATED)
async def upload_statement_pdf(
    file: UploadFile = File(...),
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
    pdf_storage: PdfStorage = Depends(get_pdf_storage),
    adapters: list[BankAdapter] = Depends(get_bank_adapters),
) -> ImportSessionResponse | JSONResponse:
    content = await file.read()
    session_repo = SqlAlchemyImportSessionRepository(db)
    card_repo = SqlAlchemyCardRepository(db)
    card_match_service = MatchCardByIbanService(card_repo)
    service = UploadStatementPdfService(pdf_storage, adapters, session_repo, card_match_service)
    try:
        result = service.execute(
            UploadStatementPdfCommand(
                actor_user_id=user_id,
                filename=file.filename or "upload.pdf",
                content=content,
            )
        )
    except UnsupportedFileTypeError as exc:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content={"detail": str(exc), "code": "unsupported_file_type"},
        )
    except UnknownBankAdapterError as exc:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content={"detail": str(exc), "code": "unknown_bank_adapter"},
        )
    except AmbiguousBankAdapterError as exc:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content={"detail": str(exc), "code": "ambiguous_bank_adapter"},
        )
    except InvalidCanonicalLineError as exc:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content={"detail": str(exc), "code": "invalid_canonical_line"},
        )
    logger.info(
        "import_session_created session_id=%s user_id=%s statement_count=%s",
        result.id,
        user_id,
        len(result.statements),
    )
    return _session_response(result)


def _persist_identified_card(
    session_repo: SqlAlchemyImportSessionRepository,
    *,
    session_id: uuid.UUID,
    user_id: uuid.UUID,
    statement_id: uuid.UUID,
    card_id: uuid.UUID,
) -> JSONResponse | None:
    try:
        session_repo.set_statement_card_id(
            session_id=session_id,
            user_id=user_id,
            statement_id=statement_id,
            card_id=card_id,
        )
    except ImportSessionNotFoundError as exc:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": str(exc), "code": "import_session_not_found"},
        )
    except ImportStatementNotFoundError as exc:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": str(exc), "code": "import_statement_not_found"},
        )
    return None


@router.get("/{session_id}", response_model=ImportSessionResponse)
def get_import_session(
    session_id: uuid.UUID,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> ImportSessionResponse | JSONResponse:
    session_repo = SqlAlchemyImportSessionRepository(db)
    result = session_repo.get_session(session_id, user_id)
    if result is None:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": "Import session not found.", "code": "import_session_not_found"},
        )
    return _session_response(result)


@router.delete("/{session_id}", response_model=ImportSessionResponse)
def discard_import_session(
    session_id: uuid.UUID,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
    pdf_storage: PdfStorage = Depends(get_pdf_storage),
) -> ImportSessionResponse | JSONResponse:
    session_repo = SqlAlchemyImportSessionRepository(db)
    service = DiscardImportSessionService(session_repo, pdf_storage)
    try:
        result = service.execute(
            DiscardImportSessionCommand(actor_user_id=user_id, session_id=session_id)
        )
    except ImportSessionNotFoundError as exc:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": str(exc), "code": "import_session_not_found"},
        )
    return _session_response(result)


def _bulk_commit_response(result: AssignBulkImportResult) -> BulkCommitResponse:
    return BulkCommitResponse(
        session_id=result.session_id,
        list_id=result.list_id,
        batches=[
            ImportBatchResponse(
                id=b.id,
                statement_id=b.statement_id,
                list_id=b.list_id,
                ledger_entry_count=len(b.ledger_entry_ids),
            )
            for b in result.batches
        ],
        imported_new_count=result.imported_new,
        skipped_duplicate_count=result.skipped_duplicate,
    )


# Bulk commit's domain-error → HTTP mapping. A `None` code means the
# exception carries its own `CODE` (the Fx* family).
_BULK_COMMIT_ERROR_MAP: tuple[tuple[type[Exception], int, str | None], ...] = (
    (ImportSessionNotFoundError, status.HTTP_404_NOT_FOUND, "import_session_not_found"),
    (NotListMemberError, status.HTTP_403_FORBIDDEN, "not_list_member"),
    (ImportSessionDiscardedError, status.HTTP_409_CONFLICT, "import_session_discarded"),
    (ImportRowNotAvailableError, status.HTTP_409_CONFLICT, "import_row_not_available"),
    (
        NoCleanStatementsToCommitError,
        status.HTTP_422_UNPROCESSABLE_CONTENT,
        "no_clean_statements_to_commit",
    ),
    (InvalidCanonicalLineError, status.HTTP_422_UNPROCESSABLE_CONTENT, "invalid_canonical_line"),
    (FxAuthenticationError, status.HTTP_500_INTERNAL_SERVER_ERROR, None),
    (FxServiceUnavailableError, status.HTTP_503_SERVICE_UNAVAILABLE, None),
    (FxFutureDateError, status.HTTP_422_UNPROCESSABLE_CONTENT, None),
    (FxCurrencyNotSupportedError, status.HTTP_422_UNPROCESSABLE_CONTENT, None),
    (FxRateNotAvailableError, status.HTTP_422_UNPROCESSABLE_CONTENT, None),
)

_BULK_COMMIT_ERROR_TYPES = tuple(entry[0] for entry in _BULK_COMMIT_ERROR_MAP)


@router.post("/{session_id}/bulk-commit", response_model=BulkCommitResponse)
def bulk_commit_import_session(
    session_id: uuid.UUID,
    body: BulkCommitBody,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
    fx_service: MaterializeFxService = Depends(get_fx_service),
    pdf_storage: PdfStorage = Depends(get_pdf_storage),
) -> BulkCommitResponse | JSONResponse:
    session_repo = SqlAlchemyImportSessionRepository(db)
    list_repo = SqlAlchemyListRepository(db)
    service = AssignBulkImportService(session_repo, list_repo, fx_service, pdf_storage)
    try:
        result = service.execute(
            AssignBulkImportCommand(
                actor_user_id=user_id, session_id=session_id, list_id=body.list_id
            )
        )
    except _BULK_COMMIT_ERROR_TYPES as exc:
        # Bulk commit is all-or-nothing (Task 5.1). get_db commits on *normal
        # return*, and returning a JSONResponse is a normal return — so without
        # this rollback the statements committed before the failing one would
        # be persisted while the client is told the commit failed
        # (Story 4.10 review).
        db.rollback()
        for error_type, status_code, code in _BULK_COMMIT_ERROR_MAP:
            if isinstance(exc, error_type):
                return JSONResponse(
                    status_code=status_code,
                    content={"detail": str(exc), "code": code or exc.CODE},
                )
        raise
    logger.info(
        "import_bulk_committed session_id=%s user_id=%s list_id=%s batch_count=%s",
        session_id,
        user_id,
        body.list_id,
        len(result.batches),
    )
    return _bulk_commit_response(result)


# Shared row-endpoint error mapping (AC #7). JSONResponse with an explicit
# `code`, not HTTPException — the established idiom in this module, and the
# shape mapIndividualReviewError consumes on the client.
_ROW_ERROR_MAP: tuple[tuple[type[Exception], int, str | None], ...] = (
    (ImportSessionNotFoundError, status.HTTP_404_NOT_FOUND, "import_session_not_found"),
    (ImportRowNotFoundError, status.HTTP_404_NOT_FOUND, "import_row_not_found"),
    (ImportStatementNotFoundError, status.HTTP_404_NOT_FOUND, "import_statement_not_found"),
    (NotListMemberError, status.HTTP_403_FORBIDDEN, "not_list_member"),
    (ImportSessionDiscardedError, status.HTTP_409_CONFLICT, "import_session_discarded"),
    (ImportRowNotAvailableError, status.HTTP_409_CONFLICT, "import_row_not_available"),
    (ImportRowNotDiscardableError, status.HTTP_409_CONFLICT, "import_row_not_discardable"),
    (ImportNothingToUndoError, status.HTTP_409_CONFLICT, "import_nothing_to_undo"),
    (
        ImportSessionHasPendingRowsError,
        status.HTTP_409_CONFLICT,
        "import_session_has_pending_rows",
    ),
    (InvalidCanonicalLineError, status.HTTP_422_UNPROCESSABLE_CONTENT, "invalid_canonical_line"),
    (FxAuthenticationError, status.HTTP_500_INTERNAL_SERVER_ERROR, None),
    (FxServiceUnavailableError, status.HTTP_503_SERVICE_UNAVAILABLE, None),
    (FxFutureDateError, status.HTTP_422_UNPROCESSABLE_CONTENT, None),
    (FxCurrencyNotSupportedError, status.HTTP_422_UNPROCESSABLE_CONTENT, None),
    (FxRateNotAvailableError, status.HTTP_422_UNPROCESSABLE_CONTENT, None),
)

_ROW_ERROR_TYPES = tuple(entry[0] for entry in _ROW_ERROR_MAP)


def _row_error_response(exc: Exception) -> JSONResponse:
    for error_type, status_code, code in _ROW_ERROR_MAP:
        if isinstance(exc, error_type):
            return JSONResponse(
                status_code=status_code,
                content={"detail": str(exc), "code": code or exc.CODE},
            )
    raise exc


def _fresh_session_response(
    session_repo: SqlAlchemyImportSessionRepository, session_id: uuid.UUID, user_id: uuid.UUID
) -> ImportSessionResponse | JSONResponse:
    """Return the whole updated session so the caller never needs a second
    round-trip to learn what to review next."""
    updated = session_repo.get_session(session_id, user_id)
    if updated is None:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": "Import session not found.", "code": "import_session_not_found"},
        )
    return _session_response(updated)


@router.post("/{session_id}/rows/{row_id}/assign", response_model=ImportSessionResponse)
def assign_candidate_row(
    session_id: uuid.UUID,
    row_id: uuid.UUID,
    body: AssignRowBody,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
    fx_service: MaterializeFxService = Depends(get_fx_service),
) -> ImportSessionResponse | JSONResponse:
    """One endpoint for both accept directions — the caller supplies either the
    default list or the picked one (AC #2)."""
    session_repo = SqlAlchemyImportSessionRepository(db)
    list_repo = SqlAlchemyListRepository(db)
    service = AssignCandidateRowService(session_repo, list_repo, fx_service)
    try:
        service.execute(
            AssignCandidateRowCommand(
                actor_user_id=user_id,
                session_id=session_id,
                row_id=row_id,
                list_id=body.list_id,
                card_id=body.card_id,
            )
        )
    except _ROW_ERROR_TYPES as exc:
        db.rollback()
        return _row_error_response(exc)
    logger.info(
        "import_row_assigned session_id=%s row_id=%s user_id=%s list_id=%s",
        session_id,
        row_id,
        user_id,
        body.list_id,
    )
    return _fresh_session_response(session_repo, session_id, user_id)


@router.post("/{session_id}/rows/{row_id}/delete", response_model=ImportSessionResponse)
def delete_candidate_row(
    session_id: uuid.UUID,
    row_id: uuid.UUID,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> ImportSessionResponse | JSONResponse:
    """Soft-marks the row deleted. Pending rows (card trash) stay undoable;
    committed assigned rows reverse the assign-time ledger and do not return
    to pending (ImportReviewSheet Save discard)."""
    session_repo = SqlAlchemyImportSessionRepository(db)
    service = DeleteCandidateRowService(session_repo)
    try:
        result = service.execute(
            DeleteCandidateRowCommand(actor_user_id=user_id, session_id=session_id, row_id=row_id)
        )
    except _ROW_ERROR_TYPES as exc:
        db.rollback()
        return _row_error_response(exc)
    logger.info(
        "import_row_deleted session_id=%s row_id=%s user_id=%s", session_id, row_id, user_id
    )
    return _session_response(result)


@router.post("/{session_id}/rows/{row_id}/unassign", response_model=ImportSessionResponse)
def unassign_candidate_row(
    session_id: uuid.UUID,
    row_id: uuid.UUID,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> ImportSessionResponse | JSONResponse:
    """ImportReviewSheet per-row discard (Story 4.13.1, AC #4/#5): reverses a
    single committed row back to pending. Not `POST /undo` — that is
    single-level and last-action-only; this targets an arbitrary assigned
    row. 409s with `import_row_not_discardable` for a `dedup_skipped` row."""
    session_repo = SqlAlchemyImportSessionRepository(db)
    service = UnassignCandidateRowService(session_repo)
    try:
        service.execute(
            UnassignCandidateRowCommand(actor_user_id=user_id, session_id=session_id, row_id=row_id)
        )
    except _ROW_ERROR_TYPES as exc:
        db.rollback()
        return _row_error_response(exc)
    logger.info(
        "import_row_unassigned session_id=%s row_id=%s user_id=%s", session_id, row_id, user_id
    )
    return _fresh_session_response(session_repo, session_id, user_id)


@router.post("/{session_id}/undo", response_model=ImportSessionResponse)
def undo_last_resolution(
    session_id: uuid.UUID,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> ImportSessionResponse | JSONResponse:
    """Single-level undo of the session's last row resolution (AC #4)."""
    session_repo = SqlAlchemyImportSessionRepository(db)
    service = UndoLastResolutionService(session_repo)
    snapshot = session_repo.get_session(session_id, user_id)
    undone_row_id = snapshot.undo_row_id if snapshot is not None else None
    try:
        result = service.execute(
            UndoLastResolutionCommand(actor_user_id=user_id, session_id=session_id)
        )
    except _ROW_ERROR_TYPES as exc:
        db.rollback()
        return _row_error_response(exc)
    logger.info(
        "import_row_undone session_id=%s row_id=%s user_id=%s",
        session_id,
        undone_row_id,
        user_id,
    )
    return _session_response(result)


@router.post("/{session_id}/finalize", response_model=ImportSessionResponse)
def finalize_import_session(
    session_id: uuid.UUID,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
    pdf_storage: PdfStorage = Depends(get_pdf_storage),
) -> ImportSessionResponse | JSONResponse:
    """End of review — releases the source PDF and stamps finalized_at (AC #7).

    ImportReviewSheet's Save calls this (Story 4.13.1). Idempotent: a second
    call returns the session unchanged rather than erroring or re-deleting.
    """
    session_repo = SqlAlchemyImportSessionRepository(db)
    service = FinalizeImportSessionService(session_repo, pdf_storage)
    try:
        result = service.execute(
            FinalizeImportSessionCommand(actor_user_id=user_id, session_id=session_id)
        )
    except _ROW_ERROR_TYPES as exc:
        db.rollback()
        return _row_error_response(exc)
    # No normalized_description and no import_identity at info level — identity
    # is derived from statement PII.
    logger.info(
        "import_session_finalized session_id=%s user_id=%s imported_new=%s skipped_duplicate=%s",
        session_id,
        user_id,
        result.imported_new_count,
        result.skipped_duplicate_count,
    )
    return _session_response(result)


@router.patch("/{session_id}/rows/{row_id}", response_model=ImportSessionResponse)
def edit_candidate_row(
    session_id: uuid.UUID,
    row_id: uuid.UUID,
    body: EditRowBody,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> ImportSessionResponse | JSONResponse:
    """Correct a still-pending row's description (AC #6). No description in the
    log line — statement text is PII and never reaches info level."""
    session_repo = SqlAlchemyImportSessionRepository(db)
    service = EditCandidateRowService(session_repo)
    try:
        result = service.execute(
            EditCandidateRowCommand(
                actor_user_id=user_id,
                session_id=session_id,
                row_id=row_id,
                description=body.description,
            )
        )
    except _ROW_ERROR_TYPES as exc:
        db.rollback()
        return _row_error_response(exc)
    logger.info("import_row_edited session_id=%s row_id=%s user_id=%s", session_id, row_id, user_id)
    return _session_response(result)


@router.post(
    "/{session_id}/statements/{statement_id}/identify-card",
    response_model=CardIdentificationResponse,
)
def identify_card_for_statement(
    session_id: uuid.UUID,
    statement_id: uuid.UUID,
    body: IdentifyCardBody,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> CardIdentificationResponse | JSONResponse:
    """Card identification for individual review (Story 4.8.1, AC #2/#3/#5).

    Given a statement IBAN:
    - If matched to a known card → return card_id + label (auto-assign, no prompt)
    - If IBAN unknown + label provided → register new card + return card_id
    - If IBAN missing or unknown without label → return matched=False (graceful degrade)

    Raises 404 if session or statement not found, 409 if session discarded,
    or 422 if card label/IBAN validation fails.
    """
    session_repo = SqlAlchemyImportSessionRepository(db)
    session = session_repo.get_session(session_id, user_id)
    if session is None:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": "Import session not found.", "code": "import_session_not_found"},
        )

    try:
        statement = _find_statement(session, statement_id)
    except ImportStatementNotFoundError as exc:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": str(exc), "code": "import_statement_not_found"},
        )

    if session.discarded_at is not None:
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={"detail": "Session discarded.", "code": "import_session_discarded"},
        )

    # Statement has no IBAN → return unknown gracefully (AC #5).
    # Note: both None (missing field) and empty string (whitespace-only normalized)
    # are treated as "no IBAN"; iban=None in response for both cases.
    if not statement.iban:
        logger.debug(
            "identify_card_no_iban session_id=%s statement_id=%s",
            session_id,
            statement_id,
        )
        return CardIdentificationResponse(matched=False, iban=None)

    # Try to match IBAN to existing card
    card_repo = SqlAlchemyCardRepository(db)
    card_match_service = MatchCardByIbanService(card_repo)
    statement_card_service = MatchStatementCardService(card_match_service)

    logger.debug(
        "identify_card_iban_found session_id=%s statement_id=%s iban=%r",
        session_id,
        statement_id,
        statement.iban,
    )
    match_result = statement_card_service.execute(
        MatchStatementCardCommand(actor_user_id=user_id, iban=statement.iban)
    )

    # Known card → auto-assign silently (AC #2, no prompt required)
    if match_result.matched_card is not None:
        logger.debug(
            "identify_card_matched session_id=%s statement_id=%s card_id=%s",
            session_id,
            statement_id,
            match_result.matched_card.id,
        )
        persist_error = _persist_identified_card(
            session_repo,
            session_id=session_id,
            user_id=user_id,
            statement_id=statement_id,
            card_id=match_result.matched_card.id,
        )
        if persist_error is not None:
            return persist_error
        return CardIdentificationResponse(
            matched=True,
            card_id=match_result.matched_card.id,
            card_label=match_result.matched_card.label,
            iban=statement.iban,
        )

    # Unknown IBAN
    logger.debug(
        "identify_card_unknown_iban session_id=%s statement_id=%s iban=%r has_label=%s",
        session_id,
        statement_id,
        statement.iban,
        bool(body.label),
    )
    if body.label:
        # AC #3: Register new card with provided label
        logger.debug(
            "identify_card_registering_new_card session_id=%s statement_id=%s iban=%r label=%r",
            session_id,
            statement_id,
            statement.iban,
            body.label,
        )
        try:
            register_service = RegisterCardService(card_repo)
            new_card = register_service.execute(
                RegisterCardCommand(
                    actor_user_id=user_id,
                    label=body.label,
                    iban=statement.iban,
                )
            )
            logger.info(
                "card_registered_from_import session_id=%s statement_id=%s card_id=%s user_id=%s",
                session_id,
                statement_id,
                new_card.id,
                user_id,
            )
            persist_error = _persist_identified_card(
                session_repo,
                session_id=session_id,
                user_id=user_id,
                statement_id=statement_id,
                card_id=new_card.id,
            )
            if persist_error is not None:
                return persist_error
            return CardIdentificationResponse(
                matched=True,
                card_id=new_card.id,
                card_label=new_card.label,
                iban=statement.iban,
            )
        except InvalidCardLabelError as exc:
            return JSONResponse(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                content={"detail": str(exc), "code": "invalid_card_label"},
            )
        except InvalidCardIbanError as exc:
            return JSONResponse(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                content={"detail": str(exc), "code": "invalid_card_iban"},
            )
        except CardIbanAlreadyRegisteredError as exc:
            # Race condition: concurrent request registered the same IBAN.
            # Re-check to see if the card is now available to use.
            recheck_result = statement_card_service.execute(
                MatchStatementCardCommand(
                    actor_user_id=user_id,
                    iban=statement.iban,
                )
            )
            if recheck_result.matched_card is not None:
                logger.info(
                    "card_concurrent_registration_resolved "
                    "session_id=%s statement_id=%s card_id=%s",
                    session_id,
                    statement_id,
                    recheck_result.matched_card.id,
                )
                persist_error = _persist_identified_card(
                    session_repo,
                    session_id=session_id,
                    user_id=user_id,
                    statement_id=statement_id,
                    card_id=recheck_result.matched_card.id,
                )
                if persist_error is not None:
                    return persist_error
                return CardIdentificationResponse(
                    matched=True,
                    card_id=recheck_result.matched_card.id,
                    card_label=recheck_result.matched_card.label,
                    iban=statement.iban,
                )
            # Still can't match, return original conflict error
            return JSONResponse(
                status_code=status.HTTP_409_CONFLICT,
                content={"detail": str(exc), "code": "card_iban_already_registered"},
            )
    else:
        # No label provided → return unknown, UI will prompt
        logger.debug(
            "identify_card_no_label_prompt_registration session_id=%s statement_id=%s iban=%r",
            session_id,
            statement_id,
            statement.iban,
        )
        return CardIdentificationResponse(matched=False, iban=statement.iban)
