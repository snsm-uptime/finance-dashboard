"""Budget create/list routes — Story 6.3 (FR-48)."""

from __future__ import annotations

import logging
import uuid
from decimal import Decimal

from adapters.persistence.budgets import SqlAlchemyBudgetRepository
from adapters.persistence.repositories import SqlAlchemyListRepository
from application.budgets import (
    BudgetDetailView,
    BudgetView,
    CreateBudgetCommand,
    CreateBudgetService,
    GetBudgetDetailCommand,
    GetBudgetDetailService,
    ListBudgetsCommand,
    ListBudgetsService,
)
from domain.budgets import classify_budget_state
from domain.errors import (
    BudgetNotFoundError,
    InvalidBudgetCapError,
    InvalidBudgetCurrencyError,
    InvalidBudgetNameError,
    ListNotFoundError,
    NotListMemberError,
)
from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from api.deps import get_db, require_authenticated_user
from api.schemas.budgets import (
    BudgetDetailResponse,
    BudgetResponse,
    BudgetsListResponse,
    CreateBudgetBody,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/lists", tags=["budgets"])


def _list_not_found() -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_404_NOT_FOUND,
        content={"detail": ListNotFoundError.MESSAGE, "code": "list_not_found"},
    )


def _not_list_member() -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_403_FORBIDDEN,
        content={"detail": NotListMemberError.MESSAGE, "code": "not_list_member"},
    )


def _budget_not_found() -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_404_NOT_FOUND,
        content={"detail": BudgetNotFoundError.MESSAGE, "code": "budget_not_found"},
    )


def _budget_response(list_id: uuid.UUID, view: BudgetView) -> BudgetResponse:
    return BudgetResponse(
        id=view.id,
        list_id=list_id,
        name=view.name,
        cap=format(view.cap_amount, "f"),
        currency=view.currency,
        spent=format(view.spent, "f"),
        state=view.state,
        created_at=view.created_at,
    )


def _budget_detail_response(list_id: uuid.UUID, view: BudgetDetailView) -> BudgetDetailResponse:
    return BudgetDetailResponse(
        id=view.id,
        list_id=list_id,
        name=view.name,
        cap=format(view.cap_amount, "f"),
        currency=view.currency,
        spent=format(view.spent, "f"),
        state=view.state,
        created_at=view.created_at,
        history=view.history,
    )


@router.get("/{list_id}/budgets", response_model=BudgetsListResponse)
def list_budgets(
    list_id: uuid.UUID,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> BudgetsListResponse | JSONResponse:
    service = ListBudgetsService(SqlAlchemyBudgetRepository(db), SqlAlchemyListRepository(db))
    try:
        views = service.execute(ListBudgetsCommand(actor_user_id=user_id, list_id=list_id))
    except ListNotFoundError:
        return _list_not_found()
    return BudgetsListResponse(budgets=[_budget_response(list_id, v) for v in views])


@router.post(
    "/{list_id}/budgets", response_model=BudgetResponse, status_code=status.HTTP_201_CREATED
)
def create_budget(
    list_id: uuid.UUID,
    body: CreateBudgetBody,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> BudgetResponse | JSONResponse:
    service = CreateBudgetService(SqlAlchemyBudgetRepository(db), SqlAlchemyListRepository(db))
    try:
        record = service.execute(
            CreateBudgetCommand(
                actor_user_id=user_id,
                list_id=list_id,
                name=body.name,
                cap=body.cap,
                currency=body.currency,
            )
        )
    except InvalidBudgetNameError as exc:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content={"detail": str(exc), "code": "invalid_budget_name"},
        )
    except InvalidBudgetCapError as exc:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content={"detail": str(exc), "code": "invalid_budget_cap"},
        )
    except InvalidBudgetCurrencyError as exc:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content={"detail": str(exc), "code": "invalid_budget_currency"},
        )
    except NotListMemberError:
        # write_budgets is a mutation action — a deny renders as 403, not 404
        # (mirrors set_card_routing/put_split_override's NotListMemberError mapping).
        return _not_list_member()
    logger.info("budget_created budget_id=%s list_id=%s", record.id, list_id)
    spent = Decimal("0")
    view = BudgetView(
        id=record.id,
        name=record.name,
        cap_amount=record.cap_amount,
        currency=record.currency,
        spent=spent,
        state=classify_budget_state(spent, record.cap_amount),
        created_at=record.created_at,
    )
    return _budget_response(list_id, view)


@router.get("/{list_id}/budgets/{budget_id}", response_model=BudgetDetailResponse)
def get_budget_detail(
    list_id: uuid.UUID,
    budget_id: uuid.UUID,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> BudgetDetailResponse | JSONResponse:
    service = GetBudgetDetailService(SqlAlchemyBudgetRepository(db), SqlAlchemyListRepository(db))
    try:
        view = service.execute(
            GetBudgetDetailCommand(actor_user_id=user_id, list_id=list_id, budget_id=budget_id)
        )
    except ListNotFoundError:
        return _list_not_found()
    except BudgetNotFoundError:
        return _budget_not_found()
    return _budget_detail_response(list_id, view)
