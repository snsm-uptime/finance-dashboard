"""Pydantic DTOs for budget create/list (Story 6.3)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from domain.budgets import BUDGET_NAME_MAX_LENGTH
from pydantic import BaseModel, Field


class CreateBudgetBody(BaseModel):
    name: str = Field(max_length=BUDGET_NAME_MAX_LENGTH)
    # cap arrives as a wire-layer string, never a JSON number (money rule).
    cap: str
    currency: str


class BudgetResponse(BaseModel):
    id: UUID
    list_id: UUID
    name: str
    cap: str
    currency: str
    spent: str
    state: Literal["ok", "near", "over"]
    created_at: datetime


class BudgetsListResponse(BaseModel):
    budgets: list[BudgetResponse] = Field(default_factory=list)


class BudgetDetailResponse(BaseModel):
    id: UUID
    list_id: UUID
    name: str
    cap: str
    currency: str
    spent: str
    state: Literal["ok", "near", "over"]
    created_at: datetime
    # Always [] until Story 6.5 attributes ledger lines — loosely typed on
    # purpose since 6.5's eventual line shape isn't decided yet.
    history: list[dict] = Field(default_factory=list)
