"""Pydantic DTOs for budget create/list (Story 6.3) and attribution — manual
assign, rules, candidates (Story 6.5)."""

from __future__ import annotations

from datetime import date, datetime
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


class BudgetHistoryLineResponse(BaseModel):
    id: UUID
    description: str
    posted_date: date
    amount_crc: str
    attributed_via: Literal["manual", "rule"]


class BudgetRuleResponse(BaseModel):
    id: UUID
    match_text: str
    created_at: datetime


class BudgetDetailResponse(BaseModel):
    id: UUID
    list_id: UUID
    name: str
    cap: str
    currency: str
    spent: str
    state: Literal["ok", "near", "over"]
    created_at: datetime
    history: list[BudgetHistoryLineResponse] = Field(default_factory=list)
    rules: list[BudgetRuleResponse] = Field(default_factory=list)


class AssignBudgetEntryBody(BaseModel):
    ledger_entry_id: UUID


class CreateBudgetRuleBody(BaseModel):
    match_text: str


class BudgetCandidateResponse(BaseModel):
    id: UUID
    description: str
    posted_date: date
    amount_crc: str


class BudgetCandidatesResponse(BaseModel):
    candidates: list[BudgetCandidateResponse] = Field(default_factory=list)
