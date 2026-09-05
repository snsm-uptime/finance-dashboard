"""Register / match / list cards by IBAN — Story 4.1 (FR-37, AD-20)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol
from uuid import UUID, uuid4

from domain.cards import normalize_iban, validate_card_label, validate_card_routing
from domain.errors import CardIbanAlreadyRegisteredError, CardNotFoundError

from application.list_access import (
    AuthorizeListAccessCommand,
    AuthorizeListAccessService,
    ListAccessLookup,
)


@dataclass(frozen=True, slots=True)
class CardRecord:
    id: UUID
    user_id: UUID
    label: str
    iban: str
    created_at: datetime
    routing_mode: str = "review"
    fixed_list_id: UUID | None = None
    is_archived: bool = False


class CardRepository(Protocol):
    def create_card(self, *, card_id: UUID, user_id: UUID, label: str, iban: str) -> CardRecord: ...

    def get_card_by_iban(self, user_id: UUID, iban_normalized: str) -> CardRecord | None: ...

    def list_cards_for_user(self, user_id: UUID, *, archived: bool = False) -> list[CardRecord]: ...

    def get_card(self, card_id: UUID, user_id: UUID) -> CardRecord | None: ...

    def update_routing(
        self, *, card_id: UUID, user_id: UUID, routing_mode: str, fixed_list_id: UUID | None
    ) -> CardRecord: ...

    def reset_routing_to_review_for_user(self, user_id: UUID) -> None: ...

    def archive_card(self, card_id: UUID, user_id: UUID) -> CardRecord: ...

    def unarchive_card(self, card_id: UUID, user_id: UUID) -> CardRecord: ...


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
    archived: bool = False


@dataclass(frozen=True, slots=True)
class ArchiveCardCommand:
    actor_user_id: UUID
    card_id: UUID


@dataclass(frozen=True, slots=True)
class UnarchiveCardCommand:
    actor_user_id: UUID
    card_id: UUID


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
        return self._repo.list_cards_for_user(command.actor_user_id, archived=command.archived)


@dataclass(frozen=True, slots=True)
class SetCardRoutingCommand:
    actor_user_id: UUID
    card_id: UUID
    routing_mode: str
    fixed_list_id: UUID | None = None


class SetCardRoutingService:
    """Fixed-list vs review-routing per card — Story 4.3 (FR-11/FR-16).

    Fixed mode requires actor membership on the target list (not ownership —
    "a list I belong to"); review mode always clears any fixed_list_id.
    """

    def __init__(self, card_repo: CardRepository, list_lookup: ListAccessLookup) -> None:
        self._card_repo = card_repo
        self._list_lookup = list_lookup

    def execute(self, command: SetCardRoutingCommand) -> CardRecord:
        mode, fixed_list_id = validate_card_routing(command.routing_mode, command.fixed_list_id)

        if fixed_list_id is not None:
            AuthorizeListAccessService(self._list_lookup).execute(
                AuthorizeListAccessCommand(
                    acting_user_id=command.actor_user_id,
                    list_id=fixed_list_id,
                    action="route_card_to_list",
                )
            )

        card = self._card_repo.get_card(command.card_id, command.actor_user_id)
        if card is None:
            raise CardNotFoundError()

        return self._card_repo.update_routing(
            card_id=command.card_id,
            user_id=command.actor_user_id,
            routing_mode=mode,
            fixed_list_id=fixed_list_id,
        )


class ArchiveCardService:
    """Archive a card — registering user only; any other user's card is 404."""

    def __init__(self, repo: CardRepository) -> None:
        self._repo = repo

    def execute(self, command: ArchiveCardCommand) -> CardRecord:
        card = self._repo.get_card(command.card_id, command.actor_user_id)
        if card is None:
            raise CardNotFoundError()

        return self._repo.archive_card(command.card_id, command.actor_user_id)


class UnarchiveCardService:
    """Unarchive a card — registering user only; any other user's card is 404."""

    def __init__(self, repo: CardRepository) -> None:
        self._repo = repo

    def execute(self, command: UnarchiveCardCommand) -> CardRecord:
        card = self._repo.get_card(command.card_id, command.actor_user_id)
        if card is None:
            raise CardNotFoundError()

        return self._repo.unarchive_card(command.card_id, command.actor_user_id)
