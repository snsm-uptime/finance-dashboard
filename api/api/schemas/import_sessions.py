"""Pydantic DTOs for Import Session upload / discard (Story 4.6)."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class StagedStatementResponse(BaseModel):
    id: UUID
    product_id: str
    status: str
    candidate_row_count: int


class ImportSessionResponse(BaseModel):
    id: UUID
    created_at: datetime
    discarded_at: datetime | None = None
    statements: list[StagedStatementResponse] = Field(default_factory=list)
