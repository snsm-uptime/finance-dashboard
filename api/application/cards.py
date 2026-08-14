"""Register / match / list cards by IBAN — Story 4.1 (FR-37, AD-20)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol
from uuid import UUID, uuid4

from domain.cards import normalize_iban, validate_card_label
from domain.errors import CardIbanAlreadyRegisteredError


@dataclass(frozen=True, slots=True)
class CardRecord:
    id: UUID
    user_id: UUID
    label: str
    iban: str
    created_at: datetime


class CardRepository(Protocol):
    def create_card(
        self, *, card_id: UUID, user_id: UUID, label: str, iban: str
    ) -> CardRecord: ...

    def get_card_by_iban(self, user_id: UUID, iban_normalized: str) -> CardRecord | None: ...

    def list_cards_for_user(self, user_id: UUID) -> list[CardRecord]: ...


@dataclass(frozen=True, slots=True)
class RegisterCardCommand:
    actor_user_id: UUID
    label: str
    iban: str


@dataclass(frozen=True, slots=True)
class MatchCardByIbanCommand:
    actor_user_id: UUID
    iban: str


@dataclass(frozen=True, slots=True)
class ListCardsCommand:
    actor_user_id: UUID


class RegisterCardService:
    """Register a new card — not idempotent; callers should match first (AC #2)."""

    def __init__(self, repo: CardRepository) -> None:
        self._repo = repo

    def execute(self, command: RegisterCardCommand) -> CardRecord:
        label = validate_card_label(command.label)
        iban = normalize_iban(command.iban)

        existing = self._repo.get_card_by_iban(command.actor_user_id, iban)
        if existing is not None:
            raise CardIbanAlreadyRegisteredError(existing.label)

        return self._repo.create_card(
            card_id=uuid4(),
            user_id=command.actor_user_id,
            label=label,
            iban=iban,
        )


class MatchCardByIbanService:
    """AC #1/#2 decision point: known card (hit) vs. unregistered IBAN (miss).

    In-process call for Story 4.6+ (AD-2) — no HTTP route in this story.
    """

    def __init__(self, repo: CardRepository) -> None:
        self._repo = repo

    def execute(self, command: MatchCardByIbanCommand) -> CardRecord | None:
        iban = normalize_iban(command.iban)
        return self._repo.get_card_by_iban(command.actor_user_id, iban)


class ListCardsService:
    """User's registered cards, newest-first, for the Cards management page."""

    def __init__(self, repo: CardRepository) -> None:
        self._repo = repo

    def execute(self, command: ListCardsCommand) -> list[CardRecord]:
        return self._repo.list_cards_for_user(command.actor_user_id)
