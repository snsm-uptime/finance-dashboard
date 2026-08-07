"""Item/receipt split override + share-allocation routes (Story 2.6 / FR-10)."""

from __future__ import annotations

import logging
import uuid
from decimal import Decimal, InvalidOperation

from adapters.persistence.repositories import SqlAlchemyListRepository
from application.splits import (
    ClearSplitOverrideCommand,
    ClearSplitOverrideService,
    ComputeShareAllocationsCommand,
    ComputeShareAllocationsService,
    GetSplitOverrideCommand,
    GetSplitOverrideService,
    SetSplitOverrideCommand,
    SetSplitOverrideService,
)
from domain.errors import (
    InvalidSplitOverrideError,
    ListNotFoundError,
    NotListMemberError,
    SplitOverrideNotFoundError,
    SubjectNotFoundError,
)
from fastapi import APIRouter, Depends, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from api.deps import get_db, require_authenticated_user
from api.schemas.splits import (
    SetSplitOverrideBody,
    ShareAllocationItem,
    ShareAllocationsResponse,
    SplitOverrideResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/lists", tags=["splits"])


def _access_denied() -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_403_FORBIDDEN,
        content={"detail": NotListMemberError.MESSAGE, "code": "not_list_member"},
    )


def _list_not_found() -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_404_NOT_FOUND,
        content={"detail": ListNotFoundError.MESSAGE, "code": "list_not_found"},
    )


def _subject_not_found() -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_404_NOT_FOUND,
        content={"detail": SubjectNotFoundError.MESSAGE, "code": "subject_not_found"},
    )


def _override_response(view: object) -> SplitOverrideResponse:
    amounts = getattr(view, "amounts", None)
    percentages = getattr(view, "percentages", None)
    return SplitOverrideResponse(
        list_id=view.list_id,  # type: ignore[attr-defined]
        subject_kind=view.subject_kind,  # type: ignore[attr-defined]
        subject_id=view.subject_id,  # type: ignore[attr-defined]
        kind=view.kind,  # type: ignore[attr-defined]
        assignee_id=view.assignee_id,  # type: ignore[attr-defined]
        amounts=({k: format(v, "f") for k, v in amounts.items()} if amounts is not None else None),
        percentages=(
            {k: format(v, "f") for k, v in percentages.items()} if percentages is not None else None
        ),
        set_by_user_id=view.set_by_user_id,  # type: ignore[attr-defined]
    )


@router.put(
    "/{list_id}/subjects/{subject_kind}/{subject_id}/split-override",
    response_model=SplitOverrideResponse,
)
def put_split_override(
    list_id: uuid.UUID,
    subject_kind: str,
    subject_id: uuid.UUID,
    body: SetSplitOverrideBody,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> SplitOverrideResponse | JSONResponse:
    amounts: dict[uuid.UUID, Decimal] | None = None
    percentages: dict[uuid.UUID, Decimal] | None = None
    try:
        if body.amounts is not None:
            amounts = {}
            for k, v in body.amounts.items():
                parsed = Decimal(v)
                if not parsed.is_finite():
                    raise InvalidOperation
                amounts[k] = parsed
        if body.percentages is not None:
            percentages = {}
            for k, v in body.percentages.items():
                parsed = Decimal(v)
                if not parsed.is_finite():
                    raise InvalidOperation
                percentages[k] = parsed
    except (InvalidOperation, ValueError):
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content={
                "detail": "Money and percentage values must be exact decimal strings.",
                "code": "invalid_split_override",
            },
        )

    service = SetSplitOverrideService(SqlAlchemyListRepository(db))
    try:
        view = service.execute(
            SetSplitOverrideCommand(
                actor_user_id=user_id,
                list_id=list_id,
                subject_kind=subject_kind,
                subject_id=subject_id,
                kind=body.kind,
                assignee_id=body.assignee_id,
                amounts=amounts,
                percentages=percentages,
            )
        )
    except InvalidSplitOverrideError as exc:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content={"detail": str(exc), "code": "invalid_split_override"},
        )
    except SubjectNotFoundError:
        return _subject_not_found()
    except (ListNotFoundError, NotListMemberError):
        return _access_denied()
    logger.info(
        "split_override_set list_id=%s subject=%s/%s kind=%s",
        list_id,
        subject_kind,
        subject_id,
        body.kind,
    )
    return _override_response(view)


@router.get(
    "/{list_id}/subjects/{subject_kind}/{subject_id}/split-override",
    response_model=SplitOverrideResponse,
)
def get_split_override(
    list_id: uuid.UUID,
    subject_kind: str,
    subject_id: uuid.UUID,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> SplitOverrideResponse | JSONResponse:
    service = GetSplitOverrideService(SqlAlchemyListRepository(db))
    try:
        view = service.execute(
            GetSplitOverrideCommand(
                actor_user_id=user_id,
                list_id=list_id,
                subject_kind=subject_kind,
                subject_id=subject_id,
            )
        )
    except SplitOverrideNotFoundError:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={
                "detail": SplitOverrideNotFoundError.MESSAGE,
                "code": "split_override_not_found",
            },
        )
    except SubjectNotFoundError:
        return _subject_not_found()
    except ListNotFoundError:
        return _list_not_found()
    return _override_response(view)


@router.delete("/{list_id}/subjects/{subject_kind}/{subject_id}/split-override")
def delete_split_override(
    list_id: uuid.UUID,
    subject_kind: str,
    subject_id: uuid.UUID,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> Response:
    service = ClearSplitOverrideService(SqlAlchemyListRepository(db))
    try:
        service.execute(
            ClearSplitOverrideCommand(
                actor_user_id=user_id,
                list_id=list_id,
                subject_kind=subject_kind,
                subject_id=subject_id,
            )
        )
    except SubjectNotFoundError:
        return _subject_not_found()
    except (ListNotFoundError, NotListMemberError):
        return _access_denied()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/{list_id}/subjects/{subject_kind}/{subject_id}/share-allocations",
    response_model=ShareAllocationsResponse,
)
def get_share_allocations(
    list_id: uuid.UUID,
    subject_kind: str,
    subject_id: uuid.UUID,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> ShareAllocationsResponse | JSONResponse:
    service = ComputeShareAllocationsService(SqlAlchemyListRepository(db))
    try:
        result = service.execute(
            ComputeShareAllocationsCommand(
                actor_user_id=user_id,
                list_id=list_id,
                subject_kind=subject_kind,
                subject_id=subject_id,
            )
        )
    except InvalidSplitOverrideError as exc:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content={"detail": str(exc), "code": "invalid_split_override"},
        )
    except SubjectNotFoundError:
        return _subject_not_found()
    except ListNotFoundError:
        return _list_not_found()
    return ShareAllocationsResponse(
        allocations=[
            ShareAllocationItem(
                member_id=row.member_id,
                amount=format(row.amount, "f"),
                currency=row.currency,
            )
            for row in result.allocations
        ],
        resolved_from=result.resolved_from,  # type: ignore[arg-type]
    )
