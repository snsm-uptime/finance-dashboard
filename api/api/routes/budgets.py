"""Budget create/list routes — Story 6.3 (FR-48)."""

from __future__ import annotations

import logging
import uuid
from decimal import Decimal

from adapters.persistence.budgets import SqlAlchemyBudgetRepository
from adapters.persistence.repositories import SqlAlchemyListRepository
from application.budgets import (
    AssignEntryToBudgetCommand,
    AssignEntryToBudgetService,
    BudgetCandidate,
    BudgetDetailView,
    BudgetHistoryLine,
    BudgetRuleRecord,
    BudgetRuleView,
    BudgetView,
    CreateBudgetCommand,
    CreateBudgetRuleCommand,
    CreateBudgetRuleService,
    CreateBudgetService,
    DeleteBudgetRuleCommand,
    DeleteBudgetRuleService,
    GetBudgetDetailCommand,
    GetBudgetDetailService,
    ListBudgetCandidatesCommand,
    ListBudgetCandidatesService,
    ListBudgetsCommand,
    ListBudgetsService,
    UnassignEntryFromBudgetCommand,
    UnassignEntryFromBudgetService,
)
from domain.budgets import classify_budget_state
from domain.errors import (
    BudgetNotFoundError,
    BudgetRuleNotFoundError,
    InvalidBudgetCapError,
    InvalidBudgetCurrencyError,
    InvalidBudgetNameError,
    InvalidBudgetRuleMatchTextError,
    LedgerEntryNotFoundError,
    ListNotFoundError,
    NotListMemberError,
)
from fastapi import APIRouter, Depends, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from api.deps import get_db, require_authenticated_user
from api.schemas.budgets import (
    AssignBudgetEntryBody,
    BudgetCandidateResponse,
    BudgetCandidatesResponse,
    BudgetDetailResponse,
    BudgetHistoryLineResponse,
    BudgetResponse,
    BudgetRuleResponse,
    BudgetsListResponse,
    CreateBudgetBody,
    CreateBudgetRuleBody,
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


def _ledger_entry_not_found() -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_404_NOT_FOUND,
        content={"detail": LedgerEntryNotFoundError.MESSAGE, "code": "ledger_entry_not_found"},
    )


def _budget_rule_not_found() -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_404_NOT_FOUND,
        content={"detail": BudgetRuleNotFoundError.MESSAGE, "code": "budget_rule_not_found"},
    )


def _budget_history_line_response(line: BudgetHistoryLine) -> BudgetHistoryLineResponse:
    return BudgetHistoryLineResponse(
        id=line.id,
        description=line.normalized_description,
        posted_date=line.posted_date,
        amount_crc=format(line.amount_crc, "f"),
        attributed_via=line.attributed_via,
    )


def _budget_rule_response(rule: BudgetRuleView | BudgetRuleRecord) -> BudgetRuleResponse:
    return BudgetRuleResponse(id=rule.id, match_text=rule.match_text, created_at=rule.created_at)


def _budget_candidate_response(candidate: BudgetCandidate) -> BudgetCandidateResponse:
    return BudgetCandidateResponse(
        id=candidate.id,
        description=candidate.normalized_description,
        posted_date=candidate.posted_date,
        amount_crc=format(candidate.amount_crc, "f"),
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
        history=[_budget_history_line_response(line) for line in view.history],
        rules=[_budget_rule_response(rule) for rule in view.rules],
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


@router.post("/{list_id}/budgets/{budget_id}/assignments", response_model=None)
def assign_budget_entry(
    list_id: uuid.UUID,
    budget_id: uuid.UUID,
    body: AssignBudgetEntryBody,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> Response | JSONResponse:
    service = AssignEntryToBudgetService(
        SqlAlchemyBudgetRepository(db), SqlAlchemyListRepository(db)
    )
    try:
        service.execute(
            AssignEntryToBudgetCommand(
                actor_user_id=user_id,
                list_id=list_id,
                budget_id=budget_id,
                ledger_entry_id=body.ledger_entry_id,
            )
        )
    except ListNotFoundError:
        return _list_not_found()
    except NotListMemberError:
        return _not_list_member()
    except BudgetNotFoundError:
        return _budget_not_found()
    except LedgerEntryNotFoundError:
        return _ledger_entry_not_found()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete(
    "/{list_id}/budgets/{budget_id}/assignments/{ledger_entry_id}",
    response_model=None,
)
def unassign_budget_entry(
    list_id: uuid.UUID,
    budget_id: uuid.UUID,
    ledger_entry_id: uuid.UUID,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> Response | JSONResponse:
    service = UnassignEntryFromBudgetService(
        SqlAlchemyBudgetRepository(db), SqlAlchemyListRepository(db)
    )
    try:
        service.execute(
            UnassignEntryFromBudgetCommand(
                actor_user_id=user_id,
                list_id=list_id,
                budget_id=budget_id,
                ledger_entry_id=ledger_entry_id,
            )
        )
    except ListNotFoundError:
        return _list_not_found()
    except NotListMemberError:
        return _not_list_member()
    except BudgetNotFoundError:
        return _budget_not_found()
    except LedgerEntryNotFoundError:
        return _ledger_entry_not_found()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/{list_id}/budgets/{budget_id}/candidates", response_model=BudgetCandidatesResponse
)
def list_budget_candidates(
    list_id: uuid.UUID,
    budget_id: uuid.UUID,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> BudgetCandidatesResponse | JSONResponse:
    service = ListBudgetCandidatesService(
        SqlAlchemyBudgetRepository(db), SqlAlchemyListRepository(db)
    )
    try:
        candidates = service.execute(
            ListBudgetCandidatesCommand(actor_user_id=user_id, list_id=list_id, budget_id=budget_id)
        )
    except ListNotFoundError:
        return _list_not_found()
    except BudgetNotFoundError:
        return _budget_not_found()
    return BudgetCandidatesResponse(
        candidates=[_budget_candidate_response(c) for c in candidates]
    )


@router.post(
    "/{list_id}/budgets/{budget_id}/rules",
    response_model=BudgetRuleResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_budget_rule(
    list_id: uuid.UUID,
    budget_id: uuid.UUID,
    body: CreateBudgetRuleBody,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> BudgetRuleResponse | JSONResponse:
    service = CreateBudgetRuleService(SqlAlchemyBudgetRepository(db), SqlAlchemyListRepository(db))
    try:
        rule = service.execute(
            CreateBudgetRuleCommand(
                actor_user_id=user_id,
                list_id=list_id,
                budget_id=budget_id,
                match_text=body.match_text,
            )
        )
    except ListNotFoundError:
        return _list_not_found()
    except NotListMemberError:
        return _not_list_member()
    except BudgetNotFoundError:
        return _budget_not_found()
    except InvalidBudgetRuleMatchTextError as exc:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content={"detail": str(exc), "code": "invalid_budget_rule_match_text"},
        )
    return _budget_rule_response(rule)


@router.delete(
    "/{list_id}/budgets/{budget_id}/rules/{rule_id}", response_model=None
)
def delete_budget_rule(
    list_id: uuid.UUID,
    budget_id: uuid.UUID,
    rule_id: uuid.UUID,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> Response | JSONResponse:
    service = DeleteBudgetRuleService(SqlAlchemyBudgetRepository(db), SqlAlchemyListRepository(db))
    try:
        service.execute(
            DeleteBudgetRuleCommand(
                actor_user_id=user_id, list_id=list_id, budget_id=budget_id, rule_id=rule_id
            )
        )
    except ListNotFoundError:
        return _list_not_found()
    except NotListMemberError:
        return _not_list_member()
    except BudgetNotFoundError:
        return _budget_not_found()
    except BudgetRuleNotFoundError:
        return _budget_rule_not_found()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
