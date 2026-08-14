"""Unit tests for card register / match / list application services (Story 4.1)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from application.cards import (
    CardRecord,
    ListCardsCommand,
    ListCardsService,
    MatchCardByIbanCommand,
    MatchCardByIbanService,
    RegisterCardCommand,
    RegisterCardService,
)
from domain.errors import (
    CardIbanAlreadyRegisteredError,
    InvalidCardIbanError,
    InvalidCardLabelError,
)


@dataclass
class _FakeCardRepo:
    cards: list[CardRecord] = field(default_factory=list)

    def create_card(self, *, card_id: UUID, user_id: UUID, label: str, iban: str) -> CardRecord:
        record = CardRecord(
            id=card_id,
            user_id=user_id,
            label=label,
            iban=iban,
            created_at=datetime.now(UTC),
        )
        self.cards.append(record)
        return record

    def get_card_by_iban(self, user_id: UUID, iban_normalized: str) -> CardRecord | None:
        for card in self.cards:
            if card.user_id == user_id and card.iban == iban_normalized:
                return card
        return None

    def list_cards_for_user(self, user_id: UUID) -> list[CardRecord]:
        return sorted(
            (c for c in self.cards if c.user_id == user_id),
            key=lambda c: c.created_at,
            reverse=True,
        )


def test_register_card_success() -> None:
    repo = _FakeCardRepo()
    actor = uuid4()

    result = RegisterCardService(repo).execute(
        RegisterCardCommand(actor_user_id=actor, label="  My Visa  ", iban="cr05 0152 0200")
    )

    assert result.label == "My Visa"
    assert result.iban == "CR0501520200"
    assert result.user_id == actor
    assert len(repo.cards) == 1


def test_register_card_rejects_blank_label() -> None:
    repo = _FakeCardRepo()
    with pytest.raises(InvalidCardLabelError):
        RegisterCardService(repo).execute(
            RegisterCardCommand(actor_user_id=uuid4(), label="  ", iban="CR05")
        )


def test_register_card_rejects_blank_iban() -> None:
    repo = _FakeCardRepo()
    with pytest.raises(InvalidCardIbanError):
        RegisterCardService(repo).execute(
            RegisterCardCommand(actor_user_id=uuid4(), label="My Visa", iban="   ")
        )


def test_register_duplicate_iban_same_user_rejected() -> None:
    repo = _FakeCardRepo()
    actor = uuid4()
    RegisterCardService(repo).execute(
        RegisterCardCommand(actor_user_id=actor, label="My Visa", iban="CR05")
    )

    with pytest.raises(CardIbanAlreadyRegisteredError) as exc_info:
        RegisterCardService(repo).execute(
            RegisterCardCommand(actor_user_id=actor, label="Another Card", iban="cr05")
        )
    assert "My Visa" in str(exc_info.value)


def test_register_same_iban_different_users_both_succeed() -> None:
    repo = _FakeCardRepo()
    user_a = uuid4()
    user_b = uuid4()

    RegisterCardService(repo).execute(
        RegisterCardCommand(actor_user_id=user_a, label="A's Card", iban="CR05")
    )
    result_b = RegisterCardService(repo).execute(
        RegisterCardCommand(actor_user_id=user_b, label="B's Card", iban="CR05")
    )

    assert result_b.user_id == user_b
    assert len(repo.cards) == 2


def test_match_card_by_iban_hit() -> None:
    repo = _FakeCardRepo()
    actor = uuid4()
    registered = RegisterCardService(repo).execute(
        RegisterCardCommand(actor_user_id=actor, label="My Visa", iban="CR05 0152")
    )

    result = MatchCardByIbanService(repo).execute(
        MatchCardByIbanCommand(actor_user_id=actor, iban="cr050152")
    )

    assert result is not None
    assert result.id == registered.id


def test_match_card_by_iban_miss() -> None:
    repo = _FakeCardRepo()
    result = MatchCardByIbanService(repo).execute(
        MatchCardByIbanCommand(actor_user_id=uuid4(), iban="CR05")
    )
    assert result is None


def test_match_card_scoped_to_actor_user() -> None:
    repo = _FakeCardRepo()
    owner = uuid4()
    stranger = uuid4()
    RegisterCardService(repo).execute(
        RegisterCardCommand(actor_user_id=owner, label="My Visa", iban="CR05")
    )

    result = MatchCardByIbanService(repo).execute(
        MatchCardByIbanCommand(actor_user_id=stranger, iban="CR05")
    )
    assert result is None


def test_list_cards_newest_first() -> None:
    repo = _FakeCardRepo()
    actor = uuid4()
    older = CardRecord(
        id=uuid4(),
        user_id=actor,
        label="Older",
        iban="CR01",
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
    )
    newer = CardRecord(
        id=uuid4(),
        user_id=actor,
        label="Newer",
        iban="CR02",
        created_at=datetime(2026, 2, 1, tzinfo=UTC),
    )
    repo.cards = [older, newer]

    result = ListCardsService(repo).execute(ListCardsCommand(actor_user_id=actor))

    assert [c.label for c in result] == ["Newer", "Older"]


def test_list_cards_scoped_to_actor_user() -> None:
    repo = _FakeCardRepo()
    owner = uuid4()
    stranger = uuid4()
    RegisterCardService(repo).execute(
        RegisterCardCommand(actor_user_id=owner, label="My Visa", iban="CR05")
    )

    result = ListCardsService(repo).execute(ListCardsCommand(actor_user_id=stranger))
    assert result == []
