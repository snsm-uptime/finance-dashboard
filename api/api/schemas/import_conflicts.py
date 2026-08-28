"""Pydantic DTOs for same-price conflict review (Story 5.5).

Money on the wire is always a string, never a JSON number (project-context
"Never" list) — mirrors ExpenseItemResponse.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class ConflictEntryResponse(BaseModel):
    entry_id: UUID
    list_id: UUID
    list_name: str
    amount: str
    currency: str
    normalized_description: str
    posted_date: date


class SamePriceConflictResponse(BaseModel):
    id: UUID
    manual: ConflictEntryResponse
    parsed: ConflictEntryResponse
    detected_at: datetime


class ConflictQueueResponse(BaseModel):
    conflicts: list[SamePriceConflictResponse] = Field(default_factory=list)


class ResolveConflictBody(BaseModel):
    resolution: Literal["manual_survivor", "parsed_survivor", "not_same_expense"]
    confirmed: bool = False
