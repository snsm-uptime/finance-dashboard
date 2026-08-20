"""Upload / discard Import Session routes — Story 4.6 (FR-13/14/15).

Gated on require_authenticated_user only, not require_user_alias: upload is
a global entry point (EXPERIENCE.md), not a list-roster surface — list/alias
assignment happens in review (Stories 4.7/4.8), same rationale cards.py
already documents for its own no-alias-gate choice.
"""

from __future__ import annotations

import logging
import uuid

from adapters.persistence.import_sessions import SqlAlchemyImportSessionRepository
from adapters.persistence.repositories import SqlAlchemyListRepository
from application.bank_adapters import BankAdapter
from application.fx_service import MaterializeFxService
from application.import_session import (
    AssignBulkImportCommand,
    AssignBulkImportResult,
    AssignBulkImportService,
    AssignIndividualImportCommand,
    AssignIndividualImportService,
    DiscardImportSessionCommand,
    DiscardImportSessionService,
    ImportSessionRecord,
    SkipStatementCommand,
    SkipStatementService,
    UploadStatementPdfCommand,
    UploadStatementPdfService,
)
from application.ports import PdfStorage
from domain.errors import (
    AmbiguousBankAdapterError,
    FxAuthenticationError,
    FxCurrencyNotSupportedError,
    FxFutureDateError,
    FxRateNotAvailableError,
    FxServiceUnavailableError,
    ImportSessionAlreadyCommittedError,
    ImportSessionDiscardedError,
    ImportSessionNotFoundError,
    ImportStatementNotAvailableError,
    ImportStatementNotFoundError,
    InvalidCanonicalLineError,
    NoCleanStatementsToCommitError,
    NotListMemberError,
    UnknownBankAdapterError,
    UnsupportedFileTypeError,
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
    BulkCommitBody,
    BulkCommitResponse,
    ImportBatchResponse,
    ImportSessionResponse,
    IndividualCommitBody,
    StagedStatementResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/import/sessions", tags=["import"])


def _session_response(session: ImportSessionRecord) -> ImportSessionResponse:
    return ImportSessionResponse(
        id=session.id,
        created_at=session.created_at,
        discarded_at=session.discarded_at,
        statements=[
            StagedStatementResponse(
                id=s.id,
                product_id=s.product_id,
                status=s.status,
                candidate_row_count=s.candidate_row_count,
            )
            for s in session.statements
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
    service = UploadStatementPdfService(pdf_storage, adapters, session_repo)
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
    )


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
    except ImportSessionNotFoundError as exc:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": str(exc), "code": "import_session_not_found"},
        )
    except NotListMemberError as exc:
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={"detail": str(exc), "code": "not_list_member"},
        )
    except ImportSessionDiscardedError as exc:
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={"detail": str(exc), "code": "import_session_discarded"},
        )
    except ImportSessionAlreadyCommittedError as exc:
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={"detail": str(exc), "code": "import_session_already_committed"},
        )
    except NoCleanStatementsToCommitError as exc:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content={"detail": str(exc), "code": "no_clean_statements_to_commit"},
        )
    except InvalidCanonicalLineError as exc:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content={"detail": str(exc), "code": "invalid_canonical_line"},
        )
    except FxAuthenticationError as exc:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": str(exc), "code": exc.CODE},
        )
    except FxServiceUnavailableError as exc:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"detail": str(exc), "code": exc.CODE},
        )
    except (FxFutureDateError, FxCurrencyNotSupportedError, FxRateNotAvailableError) as exc:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content={"detail": str(exc), "code": exc.CODE},
        )
    logger.info(
        "import_bulk_committed session_id=%s user_id=%s list_id=%s batch_count=%s",
        session_id,
        user_id,
        body.list_id,
        len(result.batches),
    )
    return _bulk_commit_response(result)


@router.post("/{session_id}/statements/{statement_id}/commit", response_model=ImportSessionResponse)
def commit_individual_statement(
    session_id: uuid.UUID,
    statement_id: uuid.UUID,
    body: IndividualCommitBody,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
    fx_service: MaterializeFxService = Depends(get_fx_service),
    pdf_storage: PdfStorage = Depends(get_pdf_storage),
) -> ImportSessionResponse | JSONResponse:
    """Individual review accept (Story 4.8, AC #1/#2/#3): commits exactly
    one statement to one list — serves both the "chosen list" and
    "configurable default list" outcomes identically, the caller decides
    which list_id to send. Returns the updated session (not just the batch)
    so the caller never has to make a second round-trip to learn what to
    review next (Story 4.8 review finding)."""
    session_repo = SqlAlchemyImportSessionRepository(db)
    list_repo = SqlAlchemyListRepository(db)
    service = AssignIndividualImportService(session_repo, list_repo, fx_service, pdf_storage)
    try:
        service.execute(
            AssignIndividualImportCommand(
                actor_user_id=user_id,
                session_id=session_id,
                statement_id=statement_id,
                list_id=body.list_id,
            )
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
    except NotListMemberError as exc:
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={"detail": str(exc), "code": "not_list_member"},
        )
    except ImportSessionDiscardedError as exc:
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={"detail": str(exc), "code": "import_session_discarded"},
        )
    except ImportStatementNotAvailableError as exc:
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={"detail": str(exc), "code": "import_statement_not_available"},
        )
    except InvalidCanonicalLineError as exc:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content={"detail": str(exc), "code": "invalid_canonical_line"},
        )
    except FxAuthenticationError as exc:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": str(exc), "code": exc.CODE},
        )
    except FxServiceUnavailableError as exc:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"detail": str(exc), "code": exc.CODE},
        )
    except (FxFutureDateError, FxCurrencyNotSupportedError, FxRateNotAvailableError) as exc:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content={"detail": str(exc), "code": exc.CODE},
        )
    logger.info(
        "import_statement_committed session_id=%s statement_id=%s user_id=%s list_id=%s",
        session_id,
        statement_id,
        user_id,
        body.list_id,
    )
    updated_session = session_repo.get_session(session_id, user_id)
    if updated_session is None:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": "Import session not found.", "code": "import_session_not_found"},
        )
    return _session_response(updated_session)


@router.post("/{session_id}/statements/{statement_id}/skip", response_model=ImportSessionResponse)
def skip_individual_statement(
    session_id: uuid.UUID,
    statement_id: uuid.UUID,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
    pdf_storage: PdfStorage = Depends(get_pdf_storage),
) -> ImportSessionResponse | JSONResponse:
    """Individual review skip (Story 4.8, AC #5, FR-18): no ledger writes."""
    session_repo = SqlAlchemyImportSessionRepository(db)
    service = SkipStatementService(session_repo, pdf_storage)
    try:
        result = service.execute(
            SkipStatementCommand(
                actor_user_id=user_id, session_id=session_id, statement_id=statement_id
            )
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
    except ImportSessionDiscardedError as exc:
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={"detail": str(exc), "code": "import_session_discarded"},
        )
    except ImportStatementNotAvailableError as exc:
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={"detail": str(exc), "code": "import_statement_not_available"},
        )
    logger.info(
        "import_statement_skipped session_id=%s statement_id=%s user_id=%s",
        session_id,
        statement_id,
        user_id,
    )
    return _session_response(result)
