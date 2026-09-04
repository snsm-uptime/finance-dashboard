"""Standalone, owner-scoped budget routes (Story 7.1, AD-30, FR-48)."""

from __future__ import annotations

import logging
import uuid
from datetime import date
from decimal import Decimal

from adapters.persistence.budgets import SqlAlchemyBudgetRepository
from adapters.persistence.repositories import SqlAlchemyListRepository
from application.budgets import (
    ArchiveBudgetCommand,
    ArchiveBudgetService,
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
    DeleteBudgetCommand,
    DeleteBudgetRuleCommand,
    DeleteBudgetRuleService,
    DeleteBudgetService,
    GetBudgetDetailCommand,
    GetBudgetDetailService,
    ListBudgetCandidatesCommand,
    ListBudgetCandidatesService,
    ListBudgetsCommand,
    ListBudgetsService,
    PeriodChangeRequiresConfirmationError,
    PreviewBudgetPeriodChangeCommand,
    PreviewBudgetPeriodChangeService,
    UnarchiveBudgetCommand,
    UnarchiveBudgetService,
    UnassignEntryFromBudgetCommand,
    UnassignEntryFromBudgetService,
    UpdateBudgetCommand,
    UpdateBudgetService,
    _compute_spent_and_history,
)
from application.expenses import LedgerEntryRecord
from domain.budgets import classify_budget_state
from domain.errors import (
    BudgetNotFoundError,
    BudgetRuleNotFoundError,
    DuplicateBudgetNameError,
    InvalidBudgetCapError,
    InvalidBudgetCurrencyError,
    InvalidBudgetNameError,
    InvalidBudgetPeriodError,
    InvalidBudgetRuleMatchTextError,
    InvalidBudgetSourceListsError,
    LedgerEntryNotFoundError,
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
    BudgetPeriodPreviewLineResponse,
    BudgetPeriodPreviewResponse,
    BudgetResponse,
    BudgetRuleResponse,
    BudgetsListResponse,
    CreateBudgetBody,
    CreateBudgetRuleBody,
    UpdateBudgetBody,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/budgets", tags=["budgets"])


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


def _budget_name_taken() -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        content={"detail": DuplicateBudgetNameError.MESSAGE, "code": "budget_name_taken"},
    )


def _budget_history_line_response(line: BudgetHistoryLine) -> BudgetHistoryLineResponse:
    return BudgetHistoryLineResponse(
        id=line.id,
        description=line.normalized_description,
        posted_date=line.posted_date,
        amount_crc=format(line.amount_crc, "f"),
        attributed_via=line.attributed_via,
        viewer_share_crc=format(line.viewer_share_crc, "f"),
        payer_id=line.payer_id,
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


def _budget_period_preview_line_response(
    entry: LedgerEntryRecord,
) -> BudgetPeriodPreviewLineResponse:
    return BudgetPeriodPreviewLineResponse(
        id=entry.id,
        description=entry.normalized_description,
        posted_date=entry.posted_date,
        amount_crc=format(entry.amount_crc, "f"),
    )


def _invalid_budget_period(exc: InvalidBudgetPeriodError) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        content={"detail": str(exc), "code": "invalid_budget_period"},
    )


def _period_change_requires_confirmation(
    exc: PeriodChangeRequiresConfirmationError,
) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        content={
            "detail": str(exc),
            "code": "period_change_requires_confirmation",
            "excluded_lines": [
                _budget_period_preview_line_response(e).model_dump(mode="json")
                for e in exc.excluded_entries
            ],
        },
    )


def _budget_response(view: BudgetView) -> BudgetResponse:
    return BudgetResponse(
        id=view.id,
        name=view.name,
        cap=format(view.cap_amount, "f"),
        currency=view.currency,
        spent=format(view.spent, "f"),
        state=view.state,
        source_lists=list(view.source_list_ids),
        period_start=view.period_start,
        period_end=view.period_end,
        created_at=view.created_at,
        is_archived=view.is_archived,
    )


def _budget_detail_response(view: BudgetDetailView) -> BudgetDetailResponse:
    return BudgetDetailResponse(
        id=view.id,
        name=view.name,
        cap=format(view.cap_amount, "f"),
        currency=view.currency,
        spent=format(view.spent, "f"),
        state=view.state,
        source_lists=list(view.source_list_ids),
        period_start=view.period_start,
        period_end=view.period_end,
        created_at=view.created_at,
        history=[_budget_history_line_response(line) for line in view.history],
        rules=[_budget_rule_response(rule) for rule in view.rules],
        is_archived=view.is_archived,
    )


@router.get("", response_model=BudgetsListResponse)
def list_budgets(
    archived: bool = False,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> BudgetsListResponse:
    service = ListBudgetsService(SqlAlchemyBudgetRepository(db))
    views = service.execute(ListBudgetsCommand(actor_user_id=user_id, archived=archived))
    return BudgetsListResponse(budgets=[_budget_response(v) for v in views])


@router.post("", response_model=BudgetResponse, status_code=status.HTTP_201_CREATED)
def create_budget(
    body: CreateBudgetBody,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> BudgetResponse | JSONResponse:
    service = CreateBudgetService(SqlAlchemyBudgetRepository(db), SqlAlchemyListRepository(db))
    try:
        record = service.execute(
            CreateBudgetCommand(
                actor_user_id=user_id,
                name=body.name,
                cap=body.cap,
                currency=body.currency,
                source_list_ids=body.source_list_ids,
                period_start=body.period_start,
                period_end=body.period_end,
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
    except InvalidBudgetSourceListsError as exc:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content={"detail": str(exc), "code": "invalid_budget_source_lists"},
        )
    except InvalidBudgetPeriodError as exc:
        return _invalid_budget_period(exc)
    except NotListMemberError:
        # The one remaining 403 in this module (AC #5) — a named source list
        # the caller doesn't belong to.
        return _not_list_member()
    logger.info("budget_created budget_id=%s owner_user_id=%s", record.id, user_id)
    spent = Decimal("0")
    view = BudgetView(
        id=record.id,
        name=record.name,
        cap_amount=record.cap_amount,
        currency=record.currency,
        spent=spent,
        state=classify_budget_state(spent, record.cap_amount),
        source_list_ids=record.source_list_ids,
        period_start=record.period_start,
        period_end=record.period_end,
        created_at=record.created_at,
        is_archived=record.is_archived,
    )
    return _budget_response(view)


@router.get("/{budget_id}", response_model=BudgetDetailResponse)
def get_budget_detail(
    budget_id: uuid.UUID,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> BudgetDetailResponse | JSONResponse:
    service = GetBudgetDetailService(SqlAlchemyBudgetRepository(db), SqlAlchemyListRepository(db))
    try:
        view = service.execute(GetBudgetDetailCommand(actor_user_id=user_id, budget_id=budget_id))
    except BudgetNotFoundError:
        return _budget_not_found()
    return _budget_detail_response(view)


@router.patch("/{budget_id}", response_model=BudgetResponse)
def update_budget(
    budget_id: uuid.UUID,
    body: UpdateBudgetBody,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> BudgetResponse | JSONResponse:
    service = UpdateBudgetService(SqlAlchemyBudgetRepository(db), SqlAlchemyListRepository(db))
    try:
        record = service.execute(
            UpdateBudgetCommand(
                actor_user_id=user_id,
                budget_id=budget_id,
                name=body.name,
                cap=body.cap,
                currency=body.currency,
                source_list_ids=body.source_list_ids,
                period_start=body.period_start,
                period_end=body.period_end,
                confirm_period_change=body.confirm_period_change,
            )
        )
    except BudgetNotFoundError:
        return _budget_not_found()
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
    except InvalidBudgetSourceListsError as exc:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content={"detail": str(exc), "code": "invalid_budget_source_lists"},
        )
    except InvalidBudgetPeriodError as exc:
        return _invalid_budget_period(exc)
    except PeriodChangeRequiresConfirmationError as exc:
        return _period_change_requires_confirmation(exc)
    except DuplicateBudgetNameError:
        return _budget_name_taken()
    except NotListMemberError:
        return _not_list_member()
    logger.info("budget_updated budget_id=%s owner_user_id=%s", record.id, user_id)
    spent, _history, _rules = _compute_spent_and_history(record, SqlAlchemyBudgetRepository(db))
    view = BudgetView(
        id=record.id,
        name=record.name,
        cap_amount=record.cap_amount,
        currency=record.currency,
        spent=spent,
        state=classify_budget_state(spent, record.cap_amount),
        source_list_ids=record.source_list_ids,
        period_start=record.period_start,
        period_end=record.period_end,
        created_at=record.created_at,
        is_archived=record.is_archived,
    )
    return _budget_response(view)


@router.delete("/{budget_id}", response_model=None)
def delete_budget(
    budget_id: uuid.UUID,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> Response | JSONResponse:
    service = DeleteBudgetService(SqlAlchemyBudgetRepository(db))
    try:
        service.execute(DeleteBudgetCommand(actor_user_id=user_id, budget_id=budget_id))
    except BudgetNotFoundError:
        return _budget_not_found()
    logger.info("budget_deleted budget_id=%s", budget_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{budget_id}/archive", response_model=BudgetResponse)
def archive_budget(
    budget_id: uuid.UUID,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> BudgetResponse | JSONResponse:
    service = ArchiveBudgetService(SqlAlchemyBudgetRepository(db))
    try:
        record = service.execute(ArchiveBudgetCommand(actor_user_id=user_id, budget_id=budget_id))
    except BudgetNotFoundError:
        return _budget_not_found()
    logger.info("budget_archived budget_id=%s owner_user_id=%s", record.id, user_id)
    spent, _history, _rules = _compute_spent_and_history(record, SqlAlchemyBudgetRepository(db))
    view = BudgetView(
        id=record.id,
        name=record.name,
        cap_amount=record.cap_amount,
        currency=record.currency,
        spent=spent,
        state=classify_budget_state(spent, record.cap_amount),
        source_list_ids=record.source_list_ids,
        period_start=record.period_start,
        period_end=record.period_end,
        created_at=record.created_at,
        is_archived=record.is_archived,
    )
    return _budget_response(view)


@router.post("/{budget_id}/unarchive", response_model=BudgetResponse)
def unarchive_budget(
    budget_id: uuid.UUID,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> BudgetResponse | JSONResponse:
    service = UnarchiveBudgetService(SqlAlchemyBudgetRepository(db))
    try:
        record = service.execute(UnarchiveBudgetCommand(actor_user_id=user_id, budget_id=budget_id))
    except BudgetNotFoundError:
        return _budget_not_found()
    logger.info("budget_unarchived budget_id=%s owner_user_id=%s", record.id, user_id)
    spent, _history, _rules = _compute_spent_and_history(record, SqlAlchemyBudgetRepository(db))
    view = BudgetView(
        id=record.id,
        name=record.name,
        cap_amount=record.cap_amount,
        currency=record.currency,
        spent=spent,
        state=classify_budget_state(spent, record.cap_amount),
        source_list_ids=record.source_list_ids,
        period_start=record.period_start,
        period_end=record.period_end,
        created_at=record.created_at,
        is_archived=record.is_archived,
    )
    return _budget_response(view)


@router.post("/{budget_id}/assignments", response_model=None)
def assign_budget_entry(
    budget_id: uuid.UUID,
    body: AssignBudgetEntryBody,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> Response | JSONResponse:
    service = AssignEntryToBudgetService(SqlAlchemyBudgetRepository(db))
    try:
        service.execute(
            AssignEntryToBudgetCommand(
                actor_user_id=user_id,
                budget_id=budget_id,
                ledger_entry_id=body.ledger_entry_id,
            )
        )
    except BudgetNotFoundError:
        return _budget_not_found()
    except LedgerEntryNotFoundError:
        return _ledger_entry_not_found()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{budget_id}/assignments/{ledger_entry_id}", response_model=None)
def unassign_budget_entry(
    budget_id: uuid.UUID,
    ledger_entry_id: uuid.UUID,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> Response | JSONResponse:
    service = UnassignEntryFromBudgetService(SqlAlchemyBudgetRepository(db))
    try:
        service.execute(
            UnassignEntryFromBudgetCommand(
                actor_user_id=user_id,
                budget_id=budget_id,
                ledger_entry_id=ledger_entry_id,
            )
        )
    except BudgetNotFoundError:
        return _budget_not_found()
    except LedgerEntryNotFoundError:
        return _ledger_entry_not_found()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{budget_id}/candidates", response_model=BudgetCandidatesResponse)
def list_budget_candidates(
    budget_id: uuid.UUID,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> BudgetCandidatesResponse | JSONResponse:
    service = ListBudgetCandidatesService(SqlAlchemyBudgetRepository(db))
    try:
        candidates = service.execute(
            ListBudgetCandidatesCommand(actor_user_id=user_id, budget_id=budget_id)
        )
    except BudgetNotFoundError:
        return _budget_not_found()
    return BudgetCandidatesResponse(candidates=[_budget_candidate_response(c) for c in candidates])


def _parse_period_query_date(raw: str | None, *, field: str) -> date | None:
    if raw is None or raw == "":
        return None
    try:
        return date.fromisoformat(raw)
    except ValueError as exc:
        raise InvalidBudgetPeriodError(f"{field} must be an ISO-8601 date.") from exc


@router.get("/{budget_id}/period-preview", response_model=BudgetPeriodPreviewResponse)
def preview_budget_period_change(
    budget_id: uuid.UUID,
    period_start: str | None = None,
    period_end: str | None = None,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> BudgetPeriodPreviewResponse | JSONResponse:
    service = PreviewBudgetPeriodChangeService(SqlAlchemyBudgetRepository(db))
    try:
        parsed_period_start = _parse_period_query_date(period_start, field="period_start")
        parsed_period_end = _parse_period_query_date(period_end, field="period_end")
    except InvalidBudgetPeriodError as exc:
        return _invalid_budget_period(exc)
    try:
        excluded_entries = service.execute(
            PreviewBudgetPeriodChangeCommand(
                actor_user_id=user_id,
                budget_id=budget_id,
                period_start=parsed_period_start,
                period_end=parsed_period_end,
            )
        )
    except BudgetNotFoundError:
        return _budget_not_found()
    except InvalidBudgetPeriodError as exc:
        return _invalid_budget_period(exc)
    return BudgetPeriodPreviewResponse(
        excluded_lines=[_budget_period_preview_line_response(e) for e in excluded_entries]
    )


@router.post(
    "/{budget_id}/rules",
    response_model=BudgetRuleResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_budget_rule(
    budget_id: uuid.UUID,
    body: CreateBudgetRuleBody,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> BudgetRuleResponse | JSONResponse:
    service = CreateBudgetRuleService(SqlAlchemyBudgetRepository(db))
    try:
        rule = service.execute(
            CreateBudgetRuleCommand(
                actor_user_id=user_id,
                budget_id=budget_id,
                match_text=body.match_text,
            )
        )
    except BudgetNotFoundError:
        return _budget_not_found()
    except InvalidBudgetRuleMatchTextError as exc:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content={"detail": str(exc), "code": "invalid_budget_rule_match_text"},
        )
    return _budget_rule_response(rule)


@router.delete("/{budget_id}/rules/{rule_id}", response_model=None)
def delete_budget_rule(
    budget_id: uuid.UUID,
    rule_id: uuid.UUID,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> Response | JSONResponse:
    service = DeleteBudgetRuleService(SqlAlchemyBudgetRepository(db))
    try:
        service.execute(
            DeleteBudgetRuleCommand(actor_user_id=user_id, budget_id=budget_id, rule_id=rule_id)
        )
    except BudgetNotFoundError:
        return _budget_not_found()
    except BudgetRuleNotFoundError:
        return _budget_rule_not_found()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
