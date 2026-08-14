"""Card register / list routes — Story 4.1 (FR-37, AD-20).

Gated on require_authenticated_user only, not require_user_alias: cards are
a personal resource, not a list-roster surface (see story Dev Notes "Alias
gating").
"""

from __future__ import annotations

import logging
import uuid

from adapters.persistence.cards import SqlAlchemyCardRepository
from application.cards import (
    CardRecord,
    ListCardsCommand,
    ListCardsService,
    RegisterCardCommand,
    RegisterCardService,
)
from domain.errors import (
    CardIbanAlreadyRegisteredError,
    InvalidCardIbanError,
    InvalidCardLabelError,
)
from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from api.deps import get_db, require_authenticated_user
from api.schemas.cards import CardResponse, CardsListResponse, RegisterCardBody

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/cards", tags=["cards"])


def _card_response(card: CardRecord) -> CardResponse:
    return CardResponse(id=card.id, label=card.label, iban=card.iban, created_at=card.created_at)


@router.get("", response_model=CardsListResponse)
def list_cards(
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> CardsListResponse:
    service = ListCardsService(SqlAlchemyCardRepository(db))
    cards = service.execute(ListCardsCommand(actor_user_id=user_id))
    return CardsListResponse(cards=[_card_response(c) for c in cards])


@router.post("", response_model=CardResponse, status_code=status.HTTP_201_CREATED)
def register_card(
    body: RegisterCardBody,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> CardResponse | JSONResponse:
    service = RegisterCardService(SqlAlchemyCardRepository(db))
    try:
        result = service.execute(
            RegisterCardCommand(actor_user_id=user_id, label=body.label, iban=body.iban)
        )
    except InvalidCardLabelError as exc:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content={"detail": str(exc), "code": "invalid_card_label"},
        )
    except InvalidCardIbanError as exc:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content={"detail": str(exc), "code": "invalid_card_iban"},
        )
    except CardIbanAlreadyRegisteredError as exc:
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={"detail": str(exc), "code": "card_iban_already_registered"},
        )
    logger.info("card_registered card_id=%s user_id=%s", result.id, user_id)
    return _card_response(result)
