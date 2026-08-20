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


class BulkCommitBody(BaseModel):
    list_id: UUID


class IndividualCommitBody(BaseModel):
    list_id: UUID


class ImportBatchResponse(BaseModel):
    id: UUID
    statement_id: UUID
    list_id: UUID
    ledger_entry_count: int


class BulkCommitResponse(BaseModel):
    session_id: UUID
    list_id: UUID
    batches: list[ImportBatchResponse] = Field(default_factory=list)
