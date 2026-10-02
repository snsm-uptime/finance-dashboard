"""Pydantic DTOs for statement listing (Story 12.1)."""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field


class StatementSummaryResponse(BaseModel):
    statement_id: UUID
    card_id: UUID | None = None
    card_label: str | None = None
    period_start: str  # ISO 8601 date string
    period_end: str  # ISO 8601 date string
    item_count: int
    destination_list_ids: list[UUID] = Field(default_factory=list)
    destination_list_names: list[str | None] = Field(default_factory=list)


class StatementCardGroupResponse(BaseModel):
    card_id: UUID | None = None
    card_label: str | None = None
    statements: list[StatementSummaryResponse] = Field(default_factory=list)


class StatementGroupsResponse(BaseModel):
    groups: list[StatementCardGroupResponse] = Field(default_factory=list)
