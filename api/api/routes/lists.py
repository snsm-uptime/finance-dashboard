"""List create / rename / membership listing routes (Story 2.1 / FR-6)."""

from __future__ import annotations

import logging
import uuid

from adapters.persistence.repositories import SqlAlchemyListRepository
from application.lists import (
    CreateOwnedListCommand,
    CreateOwnedListService,
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
    """Same body for missing list and non-member — no existence oracle."""
    return JSONResponse(
        status_code=status.HTTP_403_FORBIDDEN,
        content={"detail": NotListMemberError.MESSAGE, "code": "not_list_member"},
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
