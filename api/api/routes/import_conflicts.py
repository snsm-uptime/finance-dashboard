"""Same-price conflict review routes (Story 5.5, FR-22/AD-10).

Global (non-list-scoped), mirroring import_sessions.py: a conflict pair spans
two lists, so it does not fit under /lists/{list_id}/... Gated on
require_authenticated_user only — same rationale as upload/import_sessions.
"""

from __future__ import annotations

import uuid

from adapters.persistence.description_aliases import SqlAlchemyDescriptionAliasRepository
from adapters.persistence.repositories import SqlAlchemyListRepository
from adapters.persistence.same_price_conflicts import SqlAlchemySamePriceConflictRepository
from application.same_price_conflicts import (
    ListSamePriceConflictQueueService,
    ResolveSamePriceConflictCommand,
    ResolveSamePriceConflictService,
    SamePriceConflictRecord,
)
from domain.errors import (
    SamePriceConflictAlreadyResolvedError,
    SamePriceConflictConfirmRequiredError,
    SamePriceConflictInvalidResolutionError,
    SamePriceConflictNotFoundError,
)
from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse, Response
from sqlalchemy.orm import Session

from api.deps import get_db, require_authenticated_user
from api.schemas.import_conflicts import (
    ConflictEntryResponse,
    ConflictQueueResponse,
    ResolveConflictBody,
    SamePriceConflictResponse,
)

router = APIRouter(prefix="/import-conflicts", tags=["import"])

_RESOLVE_ERROR_MAP: tuple[tuple[type[Exception], int, str | None], ...] = (
    (SamePriceConflictNotFoundError, status.HTTP_404_NOT_FOUND, None),
    (SamePriceConflictAlreadyResolvedError, status.HTTP_409_CONFLICT, None),
    (SamePriceConflictConfirmRequiredError, status.HTTP_422_UNPROCESSABLE_CONTENT, None),
    (SamePriceConflictInvalidResolutionError, status.HTTP_422_UNPROCESSABLE_CONTENT, None),
)
_RESOLVE_ERROR_TYPES = tuple(entry[0] for entry in _RESOLVE_ERROR_MAP)


def _entry_response(entry) -> ConflictEntryResponse:
    return ConflictEntryResponse(
        entry_id=entry.entry_id,
        list_id=entry.list_id,
        list_name=entry.list_name,
        amount=str(entry.amount),
        currency=entry.currency,
        normalized_description=entry.normalized_description,
        posted_date=entry.posted_date,
    )


def _conflict_response(record: SamePriceConflictRecord) -> SamePriceConflictResponse:
    return SamePriceConflictResponse(
        id=record.id,
        manual=_entry_response(record.manual),
        parsed=_entry_response(record.parsed),
        detected_at=record.detected_at,
    )


@router.get("", response_model=ConflictQueueResponse)
def list_import_conflicts(
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> ConflictQueueResponse:
    repo = SqlAlchemySamePriceConflictRepository(db)
    conflicts = ListSamePriceConflictQueueService(repo).execute(user_id)
    return ConflictQueueResponse(conflicts=[_conflict_response(c) for c in conflicts])


@router.post("/{conflict_id}/resolve", response_model=None)
def resolve_import_conflict(
    conflict_id: uuid.UUID,
    body: ResolveConflictBody,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> Response | JSONResponse:
    conflict_repo = SqlAlchemySamePriceConflictRepository(db)
    list_repo = SqlAlchemyListRepository(db)
    alias_repo = SqlAlchemyDescriptionAliasRepository(db)
    service = ResolveSamePriceConflictService(conflict_repo, list_repo, alias_repo)
    try:
        service.execute(
            ResolveSamePriceConflictCommand(
                actor_user_id=user_id,
                conflict_id=conflict_id,
                resolution=body.resolution,
                confirmed=body.confirmed,
            )
        )
    except _RESOLVE_ERROR_TYPES as exc:
        db.rollback()
        for error_type, status_code, code in _RESOLVE_ERROR_MAP:
            if isinstance(exc, error_type):
                return JSONResponse(
                    status_code=status_code,
                    content={"detail": str(exc), "code": code or exc.CODE},
                )
        raise
    return Response(status_code=status.HTTP_204_NO_CONTENT)
