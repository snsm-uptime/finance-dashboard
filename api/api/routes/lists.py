"""List create / rename / membership / ACL reads / invites / default split (2.1–2.5)."""

from __future__ import annotations

import logging
import uuid
from decimal import Decimal, InvalidOperation

from adapters.email import SmtpEmailSender, load_smtp_settings
from adapters.persistence.list_invite import SqlAlchemyListInviteTokenRepository
from adapters.persistence.repositories import (
    SqlAlchemyAuthUserRepository,
    SqlAlchemyListRepository,
)
from application.list_invite import InviteMemberToListCommand, InviteMemberToListService
from application.lists import (
    CreateOwnedListCommand,
    CreateOwnedListService,
    GetListBalancesStubCommand,
    GetListBalancesStubService,
    GetListDefaultSplitCommand,
    GetListDefaultSplitService,
    GetListDetailCommand,
    GetListDetailService,
    GetListExpensesStubCommand,
    GetListExpensesStubService,
    ListMembershipsCommand,
    ListMembershipsService,
    RenameListCommand,
    RenameListService,
    SetListDefaultSplitCommand,
    SetListDefaultSplitService,
)
from domain.errors import (
    AlreadyListMemberError,
    InvalidDefaultSplitError,
    InvalidInviteEmailError,
    InvalidListNameError,
    ListNotFoundError,
    ListWriteError,
    NotListMemberError,
    NotListOwnerError,
    SmtpConfigurationError,
    SmtpSendError,
)
from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from api.deps import get_auth_settings, get_db, require_authenticated_user
from api.schemas.lists import (
    CreateListBody,
    DefaultSplitResponse,
    DefaultSplitShareItem,
    InviteMemberBody,
    InviteMemberResponse,
    ListBalancesStubResponse,
    ListDetailResponse,
    ListExpensesStubResponse,
    ListMembershipItem,
    ListMembershipsResponse,
    ListResponse,
    RenameListBody,
    SetDefaultSplitBody,
)
from api.settings import AuthSettings

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


def _default_split_response(view: object) -> DefaultSplitResponse:
    return DefaultSplitResponse(
        list_id=view.list_id,  # type: ignore[attr-defined]
        owner_id=view.owner_id,  # type: ignore[attr-defined]
        mode=view.mode,  # type: ignore[attr-defined]
        shares=[
            DefaultSplitShareItem(
                user_id=s.user_id,
                percentage=format(s.percentage, "f"),
            )
            for s in view.shares  # type: ignore[attr-defined]
        ],
        member_ids=list(view.member_ids),  # type: ignore[attr-defined]
    )


def _smtp_error_response(exc: SmtpConfigurationError | SmtpSendError) -> JSONResponse:
    code = "smtp_config_error" if isinstance(exc, SmtpConfigurationError) else "smtp_send_error"
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content={"detail": str(exc), "code": code},
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
        result = service.execute(GetListDetailCommand(actor_user_id=user_id, list_id=list_id))
    except ListNotFoundError:
        return _list_not_found()
    return ListDetailResponse(id=result.id, name=result.name, owner_id=result.owner_id)


@router.get("/{list_id}/default-split", response_model=DefaultSplitResponse)
def get_list_default_split(
    list_id: uuid.UUID,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> DefaultSplitResponse | JSONResponse:
    service = GetListDefaultSplitService(SqlAlchemyListRepository(db))
    try:
        view = service.execute(
            GetListDefaultSplitCommand(actor_user_id=user_id, list_id=list_id)
        )
    except ListNotFoundError:
        return _list_not_found()
    return _default_split_response(view)


@router.put("/{list_id}/default-split", response_model=DefaultSplitResponse)
def put_list_default_split(
    list_id: uuid.UUID,
    body: SetDefaultSplitBody,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> DefaultSplitResponse | JSONResponse:
    shares: dict[uuid.UUID, Decimal] | None = None
    if body.shares is not None:
        shares = {}
        try:
            for item in body.shares:
                shares[item.user_id] = Decimal(item.percentage)
        except (InvalidOperation, ValueError):
            return JSONResponse(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                content={
                    "detail": "Percentages must be exact decimal strings.",
                    "code": "invalid_default_split",
                },
            )

    service = SetListDefaultSplitService(SqlAlchemyListRepository(db))
    try:
        view = service.execute(
            SetListDefaultSplitCommand(
                actor_user_id=user_id,
                list_id=list_id,
                mode=body.mode,
                shares=shares,
            )
        )
    except InvalidDefaultSplitError as exc:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content={"detail": str(exc), "code": "invalid_default_split"},
        )
    except NotListOwnerError as exc:
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={"detail": str(exc), "code": "not_list_owner"},
        )
    except NotListMemberError:
        return _access_denied()
    except ListNotFoundError:
        return _access_denied()
    logger.info("list_default_split_updated list_id=%s mode=%s", list_id, view.mode)
    return _default_split_response(view)


@router.get("/{list_id}/expenses", response_model=ListExpensesStubResponse)
def get_list_expenses_stub(
    list_id: uuid.UUID,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> ListExpensesStubResponse | JSONResponse:
    service = GetListExpensesStubService(SqlAlchemyListRepository(db))
    try:
        result = service.execute(GetListExpensesStubCommand(actor_user_id=user_id, list_id=list_id))
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
        result = service.execute(GetListBalancesStubCommand(actor_user_id=user_id, list_id=list_id))
    except ListNotFoundError:
        return _list_not_found()
    return ListBalancesStubResponse(list_id=result.list_id, balance_crc=result.balance_crc)


@router.post(
    "/{list_id}/invites",
    response_model=InviteMemberResponse,
    status_code=status.HTTP_201_CREATED,
)
def invite_member(
    list_id: uuid.UUID,
    body: InviteMemberBody,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
    settings: AuthSettings = Depends(get_auth_settings),
) -> InviteMemberResponse | JSONResponse:
    list_repo = SqlAlchemyListRepository(db)
    users = SqlAlchemyAuthUserRepository(db)
    try:
        # load_smtp_settings inside try — misconfig must be 503 smtp_config_error (AC #5).
        service = InviteMemberToListService(
            list_repo,
            users,
            users,
            SqlAlchemyListInviteTokenRepository(db),
            SmtpEmailSender(load_smtp_settings()),
            public_app_url=settings.public_app_url,
        )
        result = service.execute(
            InviteMemberToListCommand(
                actor_user_id=user_id,
                list_id=list_id,
                email=body.email,
            )
        )
    except InvalidInviteEmailError as exc:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content={"detail": str(exc), "code": "invalid_invite_email"},
        )
    except AlreadyListMemberError as exc:
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={"detail": str(exc), "code": "already_list_member"},
        )
    except (ListNotFoundError, NotListMemberError):
        return _access_denied()
    except NotListOwnerError as exc:
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={"detail": str(exc), "code": "not_list_owner"},
        )
    except (SmtpConfigurationError, SmtpSendError) as exc:
        db.rollback()
        logger.error(
            "list_invite_smtp_failed list_id=%s code=%s",
            list_id,
            type(exc).__name__,
        )
        return _smtp_error_response(exc)

    logger.info(
        "list_invite_sent list_id=%s invite_id=%s template=%s",
        list_id,
        result.invite_id,
        result.template_kind,
    )
    return InviteMemberResponse(
        status=result.status,
        template_kind=result.template_kind,
        invite_id=result.invite_id,
    )


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
