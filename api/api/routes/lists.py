"""List create / rename / membership / ACL reads / invites / default split / expenses."""

from __future__ import annotations

import logging
import uuid
from datetime import date
from decimal import Decimal, InvalidOperation

from adapters.email import SmtpEmailSender, load_smtp_settings
from adapters.persistence.import_sessions import SqlAlchemyImportSessionRepository
from adapters.persistence.list_invite import SqlAlchemyListInviteTokenRepository
from adapters.persistence.repositories import (
    SqlAlchemyAuthUserRepository,
    SqlAlchemyListRepository,
)
from adapters.persistence.same_price_conflicts import SqlAlchemySamePriceConflictRepository
from application.expenses import (
    CreateManualExpenseCommand,
    CreateManualExpenseService,
    ListedExpense,
    ListExpensesCommand,
    ListExpensesService,
    ListMembersCommand,
    ListMembersService,
    SplitOverrideInput,
    UpdateExpenseOriginCommand,
    UpdateExpenseOriginService,
)
from application.fx_service import MaterializeFxService
from application.import_rollback import RollbackImportBatchCommand, RollbackImportBatchService
from application.list_invite import InviteMemberToListCommand, InviteMemberToListService
from application.lists import (
    CreateOwnedListCommand,
    CreateOwnedListService,
    DeleteListCommand,
    DeleteListService,
    GetListBalancesStubCommand,
    GetListBalancesStubService,
    GetListCyclesCommand,
    GetListCyclesService,
    GetListDefaultSplitCommand,
    GetListDefaultSplitService,
    GetListDetailCommand,
    GetListDetailService,
    GetListOriginSpendCommand,
    GetListOriginSpendService,
    ListMembershipsCommand,
    ListMembershipsService,
    RenameListCommand,
    RenameListService,
    SetListDefaultSplitCommand,
    SetListDefaultSplitService,
    SettlePayablesCommand,
    SettlePayablesService,
    SimplifyGroupPlanCommand,
    SimplifyGroupPlanService,
)
from application.reassign_statement import ReassignStatementCommand, ReassignStatementService
from domain.errors import (
    AlreadyListMemberError,
    FxAuthenticationError,
    FxCurrencyNotSupportedError,
    FxFutureDateError,
    FxRateNotAvailableError,
    FxServiceUnavailableError,
    ImportBatchNotFoundError,
    ImportStatementNotFoundError,
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
from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import JSONResponse, Response
from sqlalchemy.orm import Session

from api.deps import get_auth_settings, get_db, get_fx_service, require_authenticated_user
from api.schemas.lists import (
    BalanceStatusResponse,
    CreateExpenseBody,
    CreateExpenseResponse,
    CreateListBody,
    CycleItemResponse,
    DefaultSplitResponse,
    DefaultSplitShareItem,
    ExpenseItemResponse,
    InviteMemberBody,
    InviteMemberResponse,
    ListBalancesStubResponse,
    ListCyclesResponse,
    ListDetailResponse,
    ListExpensesStubResponse,
    ListMemberItem,
    ListMembershipItem,
    ListMembershipsResponse,
    ListMembersResponse,
    ListOriginSpendResponse,
    ListResponse,
    OriginSpendItemResponse,
    PairwiseEdgeResponse,
    PeriodResponse,
    ReassignStatementBody,
    ReassignStatementResponse,
    RenameListBody,
    SetDefaultSplitBody,
    SimplifyPlanResponse,
    TransferResponse,
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


def _invalid_period() -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={
            "detail": (
                "period_start and period_end must be provided together, "
                "and period_start must not be after period_end."
            ),
            "code": "invalid_period",
        },
    )


def _period_params_invalid(period_start: date | None, period_end: date | None) -> bool:
    if (period_start is None) != (period_end is None):
        return True
    return period_start is not None and period_end is not None and period_start > period_end


def _money_str(value: Decimal) -> str:
    return format(value, "f")


def _amount_str(value: Decimal) -> str:
    """`amount` is Numeric(18, 4) for FX headroom, but money always displays at
    2 decimals — quantize before rendering so a DB round-trip doesn't leak the
    column's storage scale (e.g. "40.0000") into the API response."""
    return format(value.quantize(Decimal("0.01")), "f")


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
        amount=_amount_str(entry.amount),
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
        import_batch_id=entry.import_batch_id,
        viewer_share_kind=share_kind,
        viewer_share_value=(
            _money_str(lens.share_value) if share_kind is not None and lens is not None else None
        ),
        viewer_net_crc=(
            _money_str(lens.net_crc) if net_polarity is not None and lens is not None else None
        ),
        viewer_net_polarity=net_polarity,
        origin_card_label=row.origin_card_label,
        statement_id=entry.statement_id,
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
                total_crc=item.total_crc,
                members=[
                    ListMemberItem(
                        user_id=member.user_id,
                        alias=member.alias,
                        photo_base64=member.photo_base64,
                    )
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
    period_start: date | None = Query(default=None),
    period_end: date | None = Query(default=None),
    statement_id: uuid.UUID | None = Query(default=None),
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> ListExpensesStubResponse | JSONResponse:
    if statement_id is None and _period_params_invalid(period_start, period_end):
        return _invalid_period()
    service = ListExpensesService(SqlAlchemyListRepository(db))
    try:
        result = service.execute(
            ListExpensesCommand(
                actor_user_id=user_id,
                list_id=list_id,
                period_start=period_start,
                period_end=period_end,
                statement_id=statement_id,
            )
        )
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
        amount=_amount_str(created.amount),
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


@router.delete("/{list_id}/import-batches/{batch_id}", response_model=None)
def rollback_list_import_batch(
    list_id: uuid.UUID,
    batch_id: uuid.UUID,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> Response | JSONResponse:
    service = RollbackImportBatchService(
        SqlAlchemyImportSessionRepository(db),
        SqlAlchemyListRepository(db),
    )
    try:
        service.execute(
            RollbackImportBatchCommand(
                actor_user_id=user_id,
                list_id=list_id,
                batch_id=batch_id,
            )
        )
    except ImportBatchNotFoundError as exc:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": str(exc), "code": ImportBatchNotFoundError.CODE},
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


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
        members=[
            ListMemberItem(user_id=m.user_id, alias=m.alias, photo_base64=m.photo_base64)
            for m in result.members
        ]
    )


@router.get("/{list_id}/balances", response_model=ListBalancesStubResponse)
def get_list_balances_stub(
    list_id: uuid.UUID,
    period_start: date | None = Query(default=None),
    period_end: date | None = Query(default=None),
    statement_id: uuid.UUID | None = Query(default=None),
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> ListBalancesStubResponse | JSONResponse:
    if statement_id is None and _period_params_invalid(period_start, period_end):
        return _invalid_period()
    service = GetListBalancesStubService(
        SqlAlchemyListRepository(db), SqlAlchemySamePriceConflictRepository(db)
    )
    try:
        result = service.execute(
            GetListBalancesStubCommand(
                actor_user_id=user_id,
                list_id=list_id,
                period_start=period_start,
                period_end=period_end,
                statement_id=statement_id,
            )
        )
    except ListNotFoundError:
        return _list_not_found()
    return ListBalancesStubResponse(
        list_id=result.list_id,
        balance_crc=result.balance_crc,
        balance_status=BalanceStatusResponse(is_incomplete=result.is_incomplete),
        you_are_owed=[
            PairwiseEdgeResponse(
                member_id=e.member_id,
                alias=e.alias,
                photo_base64=e.photo_base64,
                amount_crc=e.amount_crc,
            )
            for e in result.you_are_owed
        ],
        you_owe=[
            PairwiseEdgeResponse(
                member_id=e.member_id,
                alias=e.alias,
                photo_base64=e.photo_base64,
                amount_crc=e.amount_crc,
            )
            for e in result.you_owe
        ],
    )


@router.get("/{list_id}/cycles", response_model=ListCyclesResponse)
def get_list_cycles(
    list_id: uuid.UUID,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> ListCyclesResponse | JSONResponse:
    service = GetListCyclesService(SqlAlchemyListRepository(db))
    try:
        result = service.execute(GetListCyclesCommand(actor_user_id=user_id, list_id=list_id))
    except ListNotFoundError:
        return _list_not_found()
    return ListCyclesResponse(
        cycles=[
            CycleItemResponse(
                statement_id=cycle.statement_id,
                card_id=cycle.card_id,
                card_label=cycle.card_label,
                period_start=cycle.period_start.isoformat(),
                period_end=cycle.period_end.isoformat(),
            )
            for cycle in result.cycles
        ],
        default_statement_id=result.default_statement_id,
        fallback_period=(
            PeriodResponse(
                start=result.fallback_period.period_start.isoformat(),
                end=result.fallback_period.period_end.isoformat(),
            )
            if result.fallback_period is not None
            else None
        ),
    )


@router.get("/{list_id}/origin-spend", response_model=ListOriginSpendResponse)
def get_list_origin_spend(
    list_id: uuid.UUID,
    period_start: date | None = Query(default=None),
    period_end: date | None = Query(default=None),
    statement_id: uuid.UUID | None = Query(default=None),
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> ListOriginSpendResponse | JSONResponse:
    if statement_id is None and _period_params_invalid(period_start, period_end):
        return _invalid_period()
    service = GetListOriginSpendService(SqlAlchemyListRepository(db))
    try:
        result = service.execute(
            GetListOriginSpendCommand(
                actor_user_id=user_id,
                list_id=list_id,
                period_start=period_start,
                period_end=period_end,
                statement_id=statement_id,
            )
        )
    except ListNotFoundError:
        return _list_not_found()
    return ListOriginSpendResponse(
        list_id=result.list_id,
        origins=[
            OriginSpendItemResponse(
                kind=origin.kind,
                card_id=origin.card_id,
                card_label=origin.card_label,
                total_crc=origin.total_crc,
            )
            for origin in result.origins
        ],
        period_start=result.period_start.isoformat(),
        period_end=result.period_end.isoformat(),
    )


@router.get("/{list_id}/settle/simplify", response_model=SimplifyPlanResponse)
def get_settle_simplify_plan(
    list_id: uuid.UUID,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> SimplifyPlanResponse | JSONResponse:
    service = SimplifyGroupPlanService(
        SqlAlchemyListRepository(db), SqlAlchemySamePriceConflictRepository(db)
    )
    try:
        result = service.execute(SimplifyGroupPlanCommand(actor_user_id=user_id, list_id=list_id))
    except ListNotFoundError:
        return _list_not_found()
    if result.is_incomplete:
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={"detail": "Unresolved conflicts block simplify.", "code": "settle_incomplete"},
        )
    return SimplifyPlanResponse(
        transfers=[
            TransferResponse(
                from_member_id=t.from_member_id,
                from_alias=t.from_alias,
                from_photo_base64=t.from_photo_base64,
                to_member_id=t.to_member_id,
                to_alias=t.to_alias,
                to_photo_base64=t.to_photo_base64,
                amount_crc=t.amount_crc,
            )
            for t in result.transfers
        ],
        is_incomplete=result.is_incomplete,
    )


@router.post("/{list_id}/settle", response_model=None)
def post_settle_payables(
    list_id: uuid.UUID,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> Response | JSONResponse:
    service = SettlePayablesService(SqlAlchemyListRepository(db))
    try:
        service.execute(SettlePayablesCommand(actor_user_id=user_id, list_id=list_id))
    except NotListMemberError:
        return _access_denied()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


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


@router.post(
    "/{list_id}/statements/{statement_id}/reassign",
    response_model=ReassignStatementResponse,
)
def reassign_statement(
    list_id: uuid.UUID,
    statement_id: uuid.UUID,
    body: ReassignStatementBody,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> ReassignStatementResponse | JSONResponse:
    service = ReassignStatementService(SqlAlchemyListRepository(db))
    try:
        result = service.execute(
            ReassignStatementCommand(
                acting_user_id=user_id,
                source_list_id=list_id,
                statement_id=statement_id,
                destination_list_id=body.destination_list_id,
            )
        )
    except ImportStatementNotFoundError as exc:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": str(exc), "code": "statement_not_found"},
        )
    except InvalidSplitOverrideError as exc:
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={"detail": str(exc), "code": "invalid_split_override"},
        )
    except (ListNotFoundError, NotListMemberError):
        return _access_denied()
    logger.info(
        "statement_reassigned statement_id=%s destination_list_id=%s entries=%s",
        statement_id,
        result.destination_list_id,
        len(result.ledger_entry_ids),
    )
    return ReassignStatementResponse(
        ledger_entry_ids=list(result.ledger_entry_ids),
        batch_ids=list(result.batch_ids),
        from_list_ids=list(result.from_list_ids),
        destination_list_id=result.destination_list_id,
    )


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
