"""Pydantic DTOs for Import Session upload / discard (Story 4.6).

Also card identification endpoint (Story 4.8.1).
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CandidateRowResponse(BaseModel):
    """One reviewable transaction on the wire.

    amount is a string and posted_date an ISO calendar-date string — money
    never crosses the JSON boundary as a number (AD-5).
    """

    id: UUID
    sequence: int
    description: str
    amount: str
    currency: str
    posted_date: str
    status: str


class UndoPointerResponse(BaseModel):
    row_id: UUID
    action: str


class StagedStatementResponse(BaseModel):
    id: UUID
    product_id: str
    status: str
    candidate_row_count: int
    iban: str | None = None  # Story 4.8.1: IBAN for card identification
    filename: str | None = None  # Story 4.8.2: original uploaded filename
    card_id: UUID | None = None  # Story 4.8.3: identified card (if IBAN matched)
    rows: list[CandidateRowResponse] = Field(default_factory=list)
    zero_amount_excluded_count: int = 0


class ImportSessionResponse(BaseModel):
    id: UUID
    created_at: datetime
    discarded_at: datetime | None = None
    statements: list[StagedStatementResponse] = Field(default_factory=list)
    undo: UndoPointerResponse | None = None
    # Story 4.12. All four default so an older client parsing this payload is
    # unaffected. The counts are derived from row state server-side, never
    # incremented — undo moves them back with the row.
    finalized_at: datetime | None = None
    imported_new_count: int = 0
    skipped_duplicate_count: int = 0
    # Which list to land on when the session completes; null when the session
    # imported nothing new, so the caller stays put rather than guessing.
    landing_list_id: UUID | None = None


class BulkCommitBody(BaseModel):
    list_id: UUID


class AssignRowBody(BaseModel):
    list_id: UUID
    card_id: UUID | None = None  # Story 4.8.1: optional card ID for origin assignment


class EditRowBody(BaseModel):
    description: str


class ImportBatchResponse(BaseModel):
    id: UUID
    statement_id: UUID
    list_id: UUID
    ledger_entry_count: int


class BulkCommitResponse(BaseModel):
    session_id: UUID
    list_id: UUID
    batches: list[ImportBatchResponse] = Field(default_factory=list)
    # Story 4.12: a fully-duplicate statement contributes no batch, so the
    # batch list alone no longer describes what the commit did.
    imported_new_count: int = 0
    skipped_duplicate_count: int = 0


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
