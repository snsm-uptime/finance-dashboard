"""SQLAlchemy repository for user-owned cards (Story 4.1)."""

from __future__ import annotations

from uuid import UUID

from application.cards import CardRecord
from domain.errors import CardIbanAlreadyRegisteredError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from adapters.persistence.models import CardModel


def _card_record(row: CardModel) -> CardRecord:
    return CardRecord(
        id=row.id,
        user_id=row.user_id,
        label=row.label,
        iban=row.iban,
        created_at=row.created_at,
    )


class SqlAlchemyCardRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def create_card(self, *, card_id: UUID, user_id: UUID, label: str, iban: str) -> CardRecord:
        row = CardModel(id=card_id, user_id=user_id, label=label, iban=iban)
        try:
            with self._session.begin_nested():
                self._session.add(row)
                self._session.flush()
        except IntegrityError as exc:
            existing = self.get_card_by_iban(user_id, iban)
            if existing is None:
                raise
            raise CardIbanAlreadyRegisteredError(existing.label) from exc
        return _card_record(row)

    def get_card_by_iban(self, user_id: UUID, iban_normalized: str) -> CardRecord | None:
        row = self._session.scalar(
            select(CardModel)
            .where(CardModel.user_id == user_id, CardModel.iban == iban_normalized)
            .limit(1)
        )
        if row is None:
            return None
        return _card_record(row)

    def list_cards_for_user(self, user_id: UUID) -> list[CardRecord]:
        stmt = (
            select(CardModel)
            .where(CardModel.user_id == user_id)
            .order_by(CardModel.created_at.desc(), CardModel.id.desc())
        )
        rows = self._session.scalars(stmt).all()
        return [_card_record(row) for row in rows]
