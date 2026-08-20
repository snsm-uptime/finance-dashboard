"""Pydantic DTOs for Import Session upload / discard (Story 4.6) and card identification (Story 4.8.1)."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, ConfigDict


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


class IdentifyCardBody(BaseModel):
    """Card identification request for a statement (Story 4.8.1, AC #2/#3).

    label: optional. If provided, registers a new card with this label and
           the statement's IBAN. If absent, just returns the matched card status.
    """

    label: str | None = None


class CardIdentificationResponse(BaseModel):
    """Result of card identification (Story 4.8.1).

    matched: True if the statement IBAN matches an existing registered card.
    card_id: UUID of the matched card (only if matched=True).
    card_label: Label of the matched card (only if matched=True).
    iban: The normalized IBAN from the statement (for registration display).
    """

    model_config = ConfigDict(from_attributes=True)

    matched: bool
    card_id: UUID | None = None
    card_label: str | None = None
    iban: str | None = None
