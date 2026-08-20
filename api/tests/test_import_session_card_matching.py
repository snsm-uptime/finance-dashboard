"""Tests for card identification at review start (Story 4.8.1)."""

from __future__ import annotations

from uuid import uuid4

import pytest
from application.cards import CardRecord, MatchCardByIbanService
from application.import_session import (
    MatchStatementCardCommand,
    MatchStatementCardResult,
    MatchStatementCardService,
)
from datetime import datetime, timezone


class MockCardRepository:
    """Stub CardRepository for testing card matching."""

    def __init__(self, cards: dict[tuple[str, str], CardRecord] | None = None):
        self.cards = cards or {}

    def get_card_by_iban(self, user_id, iban_normalized: str) -> CardRecord | None:
        key = (str(user_id), iban_normalized)
        return self.cards.get(key)


@pytest.fixture
def user_id():
    return uuid4()


@pytest.fixture
def user_card(user_id):
    return CardRecord(
        id=uuid4(),
        user_id=user_id,
        label="My Visa",
        iban="CR03010202412935924228",
        created_at=datetime.now(timezone.utc),
    )


def test_match_statement_card_known_iban_returns_card(user_id, user_card):
    """AC #2: Known IBAN matches registered card."""
    repo = MockCardRepository(
        {(str(user_id), user_card.iban): user_card}
    )
    card_match_service = MatchCardByIbanService(repo)
    service = MatchStatementCardService(card_match_service)

    result = service.execute(
        MatchStatementCardCommand(actor_user_id=user_id, iban=user_card.iban)
    )

    assert result.matched_card is not None
    assert result.matched_card.id == user_card.id
    assert result.matched_card.label == user_card.label


def test_match_statement_card_unknown_iban_returns_none(user_id):
    """AC #3: Unknown IBAN returns None (prompts registration)."""
    repo = MockCardRepository()
    card_match_service = MatchCardByIbanService(repo)
    service = MatchStatementCardService(card_match_service)

    result = service.execute(
        MatchStatementCardCommand(
            actor_user_id=user_id, iban="CR99999999999999999999"
        )
    )

    assert result.matched_card is None


def test_match_statement_card_empty_iban_returns_none(user_id):
    """AC #5: Missing/empty IBAN gracefully degrades."""
    repo = MockCardRepository()
    card_match_service = MatchCardByIbanService(repo)
    service = MatchStatementCardService(card_match_service)

    result = service.execute(
        MatchStatementCardCommand(actor_user_id=user_id, iban="")
    )

    assert result.matched_card is None


def test_match_result_is_dataclass():
    """MatchStatementCardResult is a simple data container."""
    card = CardRecord(
        id=uuid4(),
        user_id=uuid4(),
        label="Test",
        iban="CR123",
        created_at=datetime.now(timezone.utc),
    )
    result = MatchStatementCardResult(matched_card=card)
    
    assert result.matched_card is card
    
    result_none = MatchStatementCardResult(matched_card=None)
    assert result_none.matched_card is None
