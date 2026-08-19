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
from application.bank_adapters import BankAdapter
from application.import_session import (
    DiscardImportSessionCommand,
    DiscardImportSessionService,
    ImportSessionRecord,
    UploadStatementPdfCommand,
    UploadStatementPdfService,
)
from application.ports import PdfStorage
from domain.errors import (
    AmbiguousBankAdapterError,
    ImportSessionNotFoundError,
    InvalidCanonicalLineError,
    UnknownBankAdapterError,
    UnsupportedFileTypeError,
)
from fastapi import APIRouter, Depends, File, UploadFile, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from api.deps import get_bank_adapters, get_db, get_pdf_storage, require_authenticated_user
from api.schemas.import_sessions import ImportSessionResponse, StagedStatementResponse

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
