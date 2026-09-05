"""Pydantic DTOs for card register / list / routing (Story 4.1 / 4.3)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from domain.cards import CARD_LABEL_MAX_LENGTH
from pydantic import BaseModel, Field


class RegisterCardBody(BaseModel):
    # Domain validates blank/whitespace via InvalidCardLabelError/InvalidCardIbanError
    # for stable error codes; wire caps label length (trim-only, mirrors schemas/lists.py).
    # iban has no wire-layer cap: normalize_iban() strips internal whitespace before
    # enforcing CARD_IBAN_MAX_LENGTH, so a raw IBAN with bank-style spacing can be longer
    # than the normalized limit while still being valid — the domain layer is the sole
    # length authority here so the invalid_card_iban code/shape stays consistent.
    label: str = Field(max_length=CARD_LABEL_MAX_LENGTH)
    iban: str


class CardResponse(BaseModel):
    id: UUID
    label: str
    iban: str
    created_at: datetime
    routing_mode: str
    fixed_list_id: UUID | None = None
    is_archived: bool = False


class CardsListResponse(BaseModel):
    cards: list[CardResponse] = Field(default_factory=list)


class SetCardRoutingBody(BaseModel):
    routing_mode: Literal["fixed", "review"]
    fixed_list_id: UUID | None = None
