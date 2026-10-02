"""Statement listing routes — Story 12.1 (FR-57).

Gated on require_user_alias: statements is a cross-list membership-scoped
browse surface like budgets, not a personal pre-alias resource like cards.
"""

from __future__ import annotations

import logging
import uuid

from adapters.persistence.repositories import SqlAlchemyListRepository
from application.statements import (
    GetUserStatementSummaryCommand,
    GetUserStatementSummaryService,
    ListUserStatementsCommand,
    ListUserStatementsService,
    StatementSummary,
)
from domain.errors import ImportStatementNotFoundError
from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from api.deps import get_db, require_authenticated_user
from api.schemas.statements import (
    StatementGroupsResponse,
    StatementSummaryResponse,
    StatementCardGroupResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/statements", tags=["statements"])


def _statement_summary_response(summary: StatementSummary) -> StatementSummaryResponse:
    return StatementSummaryResponse(
        statement_id=summary.statement_id,
        card_id=summary.card_id,
        card_label=summary.card_label,
        period_start=summary.period_start.isoformat(),
        period_end=summary.period_end.isoformat(),
        item_count=summary.item_count,
        destination_list_ids=list(summary.destination_list_ids),
        destination_list_names=list(summary.destination_list_names),
    )


@router.get("", response_model=StatementGroupsResponse)
def list_statements(
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> StatementGroupsResponse:
    service = ListUserStatementsService(SqlAlchemyListRepository(db))
    result = service.execute(ListUserStatementsCommand(actor_user_id=user_id))

    groups = [
        StatementCardGroupResponse(
            card_id=group.card_id,
            card_label=group.card_label,
            statements=[_statement_summary_response(s) for s in group.statements],
        )
        for group in result.groups
    ]

    return StatementGroupsResponse(groups=groups)


@router.get("/{statement_id}", response_model=StatementSummaryResponse)
def get_statement(
    statement_id: uuid.UUID,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> StatementSummaryResponse | JSONResponse:
    service = GetUserStatementSummaryService(SqlAlchemyListRepository(db))
    try:
        summary = service.execute(
            GetUserStatementSummaryCommand(
                actor_user_id=user_id,
                statement_id=statement_id,
            )
        )
    except ImportStatementNotFoundError as exc:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": str(exc), "code": "import_statement_not_found"},
        )
    return _statement_summary_response(summary)
