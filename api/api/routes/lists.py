"""List create / rename / membership / ACL-gated reads (Stories 2.1 / 2.2)."""

from __future__ import annotations

import logging
import uuid

from adapters.persistence.repositories import SqlAlchemyListRepository
from application.lists import (
    CreateOwnedListCommand,
    CreateOwnedListService,
    GetListBalancesStubCommand,
    GetListBalancesStubService,
    GetListDetailCommand,
    GetListDetailService,
    GetListExpensesStubCommand,
    GetListExpensesStubService,
    ListMembershipsCommand,
    ListMembershipsService,
    RenameListCommand,
    RenameListService,
)
from domain.errors import (
    InvalidListNameError,
    ListNotFoundError,
    ListWriteError,
    NotListMemberError,
    NotListOwnerError,
)
from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from api.deps import get_db, require_authenticated_user
from api.schemas.lists import (
    CreateListBody,
    ListBalancesStubResponse,
    ListDetailResponse,
    ListExpensesStubResponse,
    ListMembershipItem,
    ListMembershipsResponse,
    ListResponse,
    RenameListBody,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/lists", tags=["lists"])


def _list_response(list_id: uuid.UUID, name: str, owner_id: uuid.UUID) -> ListResponse:
    return ListResponse(id=list_id, name=name, owner_id=owner_id)


def _access_denied() -> JSONResponse:
    """Same body for missing list and non-member on mutations — no existence oracle."""
    return JSONResponse(
        status_code=status.HTTP_403_FORBIDDEN,
        content={"detail": NotListMemberError.MESSAGE, "code": "not_list_member"},
    )


def _list_not_found() -> JSONResponse:
    """Same body for missing list and non-member on reads (Story 1.5.4 disclosure)."""
    return JSONResponse(
        status_code=status.HTTP_404_NOT_FOUND,
        content={"detail": ListNotFoundError.MESSAGE, "code": "list_not_found"},
    )


@router.get("", response_model=ListMembershipsResponse)
def list_memberships(
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> ListMembershipsResponse:
    service = ListMembershipsService(SqlAlchemyListRepository(db))
    items = service.execute(ListMembershipsCommand(actor_user_id=user_id))
    return ListMembershipsResponse(
        lists=[
            ListMembershipItem(
                id=item.id,
                name=item.name,
                owner_id=item.owner_id,
                role=item.role,
                balance_crc=item.balance_crc,
            )
            for item in items
        ]
    )


@router.post("", response_model=ListResponse, status_code=status.HTTP_201_CREATED)
def create_list(
    body: CreateListBody,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> ListResponse | JSONResponse:
    service = CreateOwnedListService(SqlAlchemyListRepository(db))
    try:
        result = service.execute(CreateOwnedListCommand(actor_user_id=user_id, name=body.name))
    except InvalidListNameError as exc:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content={"detail": str(exc), "code": "invalid_list_name"},
        )
    except ListWriteError as exc:
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={"detail": str(exc), "code": "list_write_failed"},
        )
    logger.info("list_created list_id=%s owner_id=%s", result.id, result.owner_id)
    return _list_response(result.id, result.name, result.owner_id)


@router.get("/{list_id}", response_model=ListDetailResponse)
def get_list_detail(
    list_id: uuid.UUID,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> ListDetailResponse | JSONResponse:
    service = GetListDetailService(SqlAlchemyListRepository(db))
    try:
        result = service.execute(
            GetListDetailCommand(actor_user_id=user_id, list_id=list_id)
        )
    except ListNotFoundError:
        return _list_not_found()
    return ListDetailResponse(id=result.id, name=result.name, owner_id=result.owner_id)


@router.get("/{list_id}/expenses", response_model=ListExpensesStubResponse)
def get_list_expenses_stub(
    list_id: uuid.UUID,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> ListExpensesStubResponse | JSONResponse:
    service = GetListExpensesStubService(SqlAlchemyListRepository(db))
    try:
        result = service.execute(
            GetListExpensesStubCommand(actor_user_id=user_id, list_id=list_id)
        )
    except ListNotFoundError:
        return _list_not_found()
    return ListExpensesStubResponse(list_id=result.list_id, expenses=list(result.expenses))


@router.get("/{list_id}/balances", response_model=ListBalancesStubResponse)
def get_list_balances_stub(
    list_id: uuid.UUID,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> ListBalancesStubResponse | JSONResponse:
    service = GetListBalancesStubService(SqlAlchemyListRepository(db))
    try:
        result = service.execute(
            GetListBalancesStubCommand(actor_user_id=user_id, list_id=list_id)
        )
    except ListNotFoundError:
        return _list_not_found()
    return ListBalancesStubResponse(list_id=result.list_id, balance_crc=result.balance_crc)


@router.patch("/{list_id}", response_model=ListResponse)
def rename_list(
    list_id: uuid.UUID,
    body: RenameListBody,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> ListResponse | JSONResponse:
    service = RenameListService(SqlAlchemyListRepository(db))
    try:
        result = service.execute(
            RenameListCommand(
                actor_user_id=user_id,
                list_id=list_id,
                name=body.name,
            )
        )
    except InvalidListNameError as exc:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content={"detail": str(exc), "code": "invalid_list_name"},
        )
    except (ListNotFoundError, NotListMemberError):
        return _access_denied()
    except NotListOwnerError as exc:
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={"detail": str(exc), "code": "not_list_owner"},
        )
    logger.info("list_renamed list_id=%s", result.id)
    return _list_response(result.id, result.name, result.owner_id)
