"""List create / rename / membership / ACL reads / invites / default split / expenses."""

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
from application.expenses import (
    CreateManualExpenseCommand,
    CreateManualExpenseService,
    ListedExpense,
    ListExpensesCommand,
    ListExpensesService,
    ListMembersCommand,
    ListMembersService,
    MarkLedgerEntryReviewedCommand,
    MarkLedgerEntryReviewedService,
    SplitOverrideInput,
    UpdateExpenseOriginCommand,
    UpdateExpenseOriginService,
)
from application.fx_service import MaterializeFxService
from application.list_invite import InviteMemberToListCommand, InviteMemberToListService
from application.lists import (
    CreateOwnedListCommand,
    CreateOwnedListService,
    DeleteListCommand,
    DeleteListService,
    GetListBalancesStubCommand,
    GetListBalancesStubService,
    GetListDefaultSplitCommand,
    GetListDefaultSplitService,
    GetListDetailCommand,
    GetListDetailService,
    ListMembershipsCommand,
    ListMembershipsService,
    RenameListCommand,
    RenameListService,
    SetListDefaultSplitCommand,
    SetListDefaultSplitService,
)
from domain.errors import (
    AlreadyListMemberError,
    FxAuthenticationError,
    FxCurrencyNotSupportedError,
    FxFutureDateError,
    FxRateNotAvailableError,
    FxServiceUnavailableError,
    InvalidDefaultSplitError,
    InvalidInviteEmailError,
    InvalidListNameError,
    InvalidManualExpenseError,
    InvalidSplitOverrideError,
    ListNotFoundError,
    ListWriteError,
    NotEntryPayerError,
    NotListMemberError,
    NotListOwnerError,
    SmtpConfigurationError,
    SmtpSendError,
    SubjectNotFoundError,
)
from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse, Response
from sqlalchemy.orm import Session

from api.deps import get_auth_settings, get_db, get_fx_service, require_authenticated_user
from api.schemas.lists import (
    CreateExpenseBody,
    CreateExpenseResponse,
    CreateListBody,
    DefaultSplitResponse,
    DefaultSplitShareItem,
    ExpenseItemResponse,
    InviteMemberBody,
    InviteMemberResponse,
    ListBalancesStubResponse,
    ListDetailResponse,
    ListExpensesStubResponse,
    ListMemberItem,
    ListMembershipItem,
    ListMembershipsResponse,
    ListMembersResponse,
    ListResponse,
    RenameListBody,
    SetDefaultSplitBody,
    UpdateExpenseOriginBody,
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


def _subject_not_found() -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_404_NOT_FOUND,
        content={"detail": SubjectNotFoundError.MESSAGE, "code": "subject_not_found"},
    )


def _money_str(value: Decimal) -> str:
    return format(value, "f")


def _expense_item(row: ListedExpense) -> ExpenseItemResponse:
    entry = row.entry
    lens = row.lens
    share_kind = (
        lens.share_kind
        if lens is not None and lens.share_kind in ("percentage", "absolute")
        else None
    )
    net_polarity = (
        lens.net_polarity
        if lens is not None and lens.net_polarity in ("owe", "owed", "zero")
        else None
    )
    return ExpenseItemResponse(
        id=entry.id,
        list_id=entry.list_id,
        amount=_money_str(entry.amount),
        currency=entry.currency,
        description=entry.normalized_description,
        payer_id=entry.payer_id,
        provenance=entry.provenance,
        line_type=entry.line_type,
        posted_date=entry.posted_date.isoformat(),
        created_at=entry.created_at,
        amount_crc=_money_str(entry.amount_crc),
        fx_rate=_money_str(entry.fx_rate),
        fx_rate_date=entry.fx_rate_date.isoformat() if entry.fx_rate_date else None,
        fx_fallback=entry.fx_fallback,
        origin_kind=entry.origin_kind if entry.origin_kind in ("card", "cash") else None,
        origin_card_id=entry.origin_card_id,
        import_reviewed_at=entry.import_reviewed_at,
        viewer_share_kind=share_kind,
        viewer_share_value=(
            _money_str(lens.share_value) if share_kind is not None and lens is not None else None
        ),
        viewer_net_crc=(
            _money_str(lens.net_crc) if net_polarity is not None and lens is not None else None
        ),
        viewer_net_polarity=net_polarity,
        origin_card_label=row.origin_card_label,
    )


def _parse_split_override(body: CreateExpenseBody) -> SplitOverrideInput | None | JSONResponse:
    if body.split_override is None:
        return None
    ov = body.split_override
    amounts = None
    percentages = None
    try:
        if ov.amounts is not None:
            amounts = {}
            for k, v in ov.amounts.items():
                parsed = Decimal(v)
                if not parsed.is_finite():
                    raise InvalidOperation
                amounts[k] = parsed
        if ov.percentages is not None:
            percentages = {}
            for k, v in ov.percentages.items():
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
    return SplitOverrideInput(
        kind=ov.kind,
        assignee_id=ov.assignee_id,
        amounts=amounts,
        percentages=percentages,
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


def _fx_error_response(
    exc: FxFutureDateError
    | FxCurrencyNotSupportedError
    | FxRateNotAvailableError
    | FxAuthenticationError
    | FxServiceUnavailableError,
) -> JSONResponse:
    """FX error → HTTP mapping (Dev Notes error classification, AD-7 fail loud)."""
    if isinstance(exc, FxAuthenticationError):
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": str(exc), "code": exc.CODE},
        )
    if isinstance(exc, FxServiceUnavailableError):
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"detail": str(exc), "code": exc.CODE},
        )
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        content={"detail": str(exc), "code": exc.CODE},
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
                members=[
                    ListMemberItem(user_id=member.user_id, alias=member.alias)
                    for member in item.members
                ],
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
        view = service.execute(GetListDefaultSplitCommand(actor_user_id=user_id, list_id=list_id))
    except ListNotFoundError:
        return _list_not_found()
    except InvalidDefaultSplitError as exc:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content={"detail": str(exc), "code": "invalid_default_split"},
        )
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
def get_list_expenses(
    list_id: uuid.UUID,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> ListExpensesStubResponse | JSONResponse:
    service = ListExpensesService(SqlAlchemyListRepository(db))
    try:
        result = service.execute(ListExpensesCommand(actor_user_id=user_id, list_id=list_id))
    except ListNotFoundError:
        return _list_not_found()
    return ListExpensesStubResponse(
        list_id=result.list_id,
        expenses=[_expense_item(row) for row in result.expenses],
    )


@router.post(
    "/{list_id}/expenses",
    response_model=CreateExpenseResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_list_expense(
    list_id: uuid.UUID,
    body: CreateExpenseBody,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
    fx_service: MaterializeFxService = Depends(get_fx_service),
) -> CreateExpenseResponse | JSONResponse:
    parsed_override = _parse_split_override(body)
    if isinstance(parsed_override, JSONResponse):
        return parsed_override

    service = CreateManualExpenseService(SqlAlchemyListRepository(db), fx_service)
    try:
        created = service.execute(
            CreateManualExpenseCommand(
                actor_user_id=user_id,
                list_id=list_id,
                amount=body.amount,
                currency=body.currency,
                description=body.description,
                payer_id=body.payer_id,
                split_override=parsed_override,
                origin_kind=body.origin_kind,
                origin_card_id=body.origin_card_id,
            )
        )
    except InvalidManualExpenseError as exc:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content={"detail": str(exc), "code": "invalid_manual_expense"},
        )
    except InvalidSplitOverrideError as exc:
        # Nested savepoint in CreateManualExpenseService undoes the entry.
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content={"detail": str(exc), "code": "invalid_split_override"},
        )
    except (
        FxFutureDateError,
        FxCurrencyNotSupportedError,
        FxRateNotAvailableError,
        FxAuthenticationError,
        FxServiceUnavailableError,
    ) as exc:
        return _fx_error_response(exc)
    except (ListNotFoundError, NotListMemberError):
        return _access_denied()

    logger.info(
        "manual_expense_created list_id=%s entry_id=%s provenance=%s currency=%s fx_fallback=%s",
        list_id,
        created.id,
        created.provenance,
        created.currency,
        created.fx_fallback,
    )
    return CreateExpenseResponse(
        id=created.id,
        list_id=created.list_id,
        amount=_money_str(created.amount),
        currency=created.currency,
        description=created.normalized_description,
        payer_id=created.payer_id,
        provenance="hand",
        line_type=created.line_type,
        posted_date=created.posted_date.isoformat(),
        created_at=created.created_at,
        amount_crc=_money_str(created.amount_crc),
        fx_rate=_money_str(created.fx_rate),
        fx_rate_date=created.fx_rate_date.isoformat() if created.fx_rate_date else None,
        fx_fallback=created.fx_fallback,
        origin_kind=created.origin_kind,
        origin_card_id=created.origin_card_id,
        import_reviewed_at=created.import_reviewed_at,
    )


@router.patch("/{list_id}/expenses/{entry_id}/origin", response_model=ExpenseItemResponse)
def update_list_expense_origin(
    list_id: uuid.UUID,
    entry_id: uuid.UUID,
    body: UpdateExpenseOriginBody,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> ExpenseItemResponse | JSONResponse:
    service = UpdateExpenseOriginService(SqlAlchemyListRepository(db))
    try:
        updated = service.execute(
            UpdateExpenseOriginCommand(
                actor_user_id=user_id,
                list_id=list_id,
                entry_id=entry_id,
                origin_kind=body.origin_kind,
                origin_card_id=body.origin_card_id,
            )
        )
    except InvalidManualExpenseError as exc:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content={"detail": str(exc), "code": "invalid_manual_expense"},
        )
    except SubjectNotFoundError:
        return _subject_not_found()
    except NotEntryPayerError as exc:
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={"detail": str(exc), "code": "not_entry_payer"},
        )
    except (ListNotFoundError, NotListMemberError):
        return _access_denied()

    logger.info(
        "manual_expense_origin_updated list_id=%s entry_id=%s origin_kind=%s",
        list_id,
        entry_id,
        updated.origin_kind,
    )
    return _expense_item(ListedExpense(entry=updated))


@router.patch("/{list_id}/expenses/{entry_id}/reviewed", response_model=ExpenseItemResponse)
def mark_list_expense_reviewed(
    list_id: uuid.UUID,
    entry_id: uuid.UUID,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> ExpenseItemResponse | JSONResponse:
    service = MarkLedgerEntryReviewedService(SqlAlchemyListRepository(db))
    try:
        updated = service.execute(
            MarkLedgerEntryReviewedCommand(
                actor_user_id=user_id, list_id=list_id, entry_id=entry_id
            )
        )
    except SubjectNotFoundError:
        return _subject_not_found()
    except (ListNotFoundError, NotListMemberError):
        return _access_denied()
    logger.info("manual_expense_marked_reviewed list_id=%s entry_id=%s", list_id, entry_id)
    return _expense_item(ListedExpense(entry=updated))


@router.get("/{list_id}/members", response_model=ListMembersResponse)
def get_list_members(
    list_id: uuid.UUID,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> ListMembersResponse | JSONResponse:
    service = ListMembersService(SqlAlchemyListRepository(db))
    try:
        result = service.execute(ListMembersCommand(actor_user_id=user_id, list_id=list_id))
    except ListNotFoundError:
        return _list_not_found()
    return ListMembersResponse(
        members=[ListMemberItem(user_id=m.user_id, alias=m.alias) for m in result.members]
    )


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


@router.delete("/{list_id}", response_model=None)
def delete_list(
    list_id: uuid.UUID,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> Response | JSONResponse:
    service = DeleteListService(SqlAlchemyListRepository(db))
    try:
        service.execute(DeleteListCommand(actor_user_id=user_id, list_id=list_id))
    except (ListNotFoundError, NotListMemberError):
        return _access_denied()
    except NotListOwnerError as exc:
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={"detail": str(exc), "code": "not_list_owner"},
        )
    logger.info("list_deleted list_id=%s", list_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
