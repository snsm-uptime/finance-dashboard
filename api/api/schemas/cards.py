"""Pydantic DTOs for card register / list (Story 4.1)."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from domain.cards import CARD_IBAN_MAX_LENGTH, CARD_LABEL_MAX_LENGTH
from pydantic import BaseModel, Field


class RegisterCardBody(BaseModel):
    # Domain validates blank/whitespace via InvalidCardLabelError/InvalidCardIbanError
    # for stable error codes; wire only caps length to match the DB columns.
    label: str = Field(max_length=CARD_LABEL_MAX_LENGTH)
    iban: str = Field(max_length=CARD_IBAN_MAX_LENGTH)


class CardResponse(BaseModel):
    id: UUID
    label: str
    iban: str
    created_at: datetime


class CardsListResponse(BaseModel):
    cards: list[CardResponse] = Field(default_factory=list)
