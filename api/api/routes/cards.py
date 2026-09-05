"""Card register / list routes — Story 4.1 (FR-37, AD-20).

Gated on require_authenticated_user only, not require_user_alias: cards are
a personal resource, not a list-roster surface (see story Dev Notes "Alias
gating").
"""

from __future__ import annotations

import logging
import uuid

from adapters.persistence.cards import SqlAlchemyCardRepository
from adapters.persistence.repositories import SqlAlchemyListRepository
from application.cards import (
    ArchiveCardCommand,
    ArchiveCardService,
    CardRecord,
    ListCardsCommand,
    ListCardsService,
    RegisterCardCommand,
    RegisterCardService,
    SetCardRoutingCommand,
    SetCardRoutingService,
    UnarchiveCardCommand,
    UnarchiveCardService,
)
from domain.errors import (
    CardIbanAlreadyRegisteredError,
    CardNotFoundError,
    InvalidCardIbanError,
    InvalidCardLabelError,
    InvalidCardRoutingModeError,
    NotListMemberError,
)
from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from api.deps import get_db, require_authenticated_user
from api.schemas.cards import (
    CardResponse,
    CardsListResponse,
    RegisterCardBody,
    SetCardRoutingBody,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/cards", tags=["cards"])


def _card_response(card: CardRecord) -> CardResponse:
    return CardResponse(
        id=card.id,
        label=card.label,
        iban=card.iban,
        created_at=card.created_at,
        routing_mode=card.routing_mode,
        fixed_list_id=card.fixed_list_id,
        is_archived=card.is_archived,
    )


@router.get("", response_model=CardsListResponse)
def list_cards(
    archived: bool = Query(default=False),
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> CardsListResponse:
    service = ListCardsService(SqlAlchemyCardRepository(db))
    cards = service.execute(ListCardsCommand(actor_user_id=user_id, archived=archived))
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


@router.patch("/{card_id}/routing", response_model=CardResponse)
def set_card_routing(
    card_id: uuid.UUID,
    body: SetCardRoutingBody,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> CardResponse | JSONResponse:
    service = SetCardRoutingService(SqlAlchemyCardRepository(db), SqlAlchemyListRepository(db))
    try:
        result = service.execute(
            SetCardRoutingCommand(
                actor_user_id=user_id,
                card_id=card_id,
                routing_mode=body.routing_mode,
                fixed_list_id=body.fixed_list_id,
            )
        )
    except InvalidCardRoutingModeError as exc:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content={"detail": str(exc), "code": "invalid_card_routing_mode"},
        )
    except CardNotFoundError as exc:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": str(exc), "code": "card_not_found"},
        )
    except NotListMemberError as exc:
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={"detail": str(exc), "code": "not_list_member"},
        )
    logger.info(
        "card_routing_updated card_id=%s user_id=%s routing_mode=%s",
        result.id,
        user_id,
        result.routing_mode,
    )
    return _card_response(result)


@router.post("/{card_id}/archive", response_model=CardResponse)
def archive_card(
    card_id: uuid.UUID,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> CardResponse | JSONResponse:
    service = ArchiveCardService(SqlAlchemyCardRepository(db))
    try:
        result = service.execute(ArchiveCardCommand(actor_user_id=user_id, card_id=card_id))
    except CardNotFoundError as exc:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": str(exc), "code": "card_not_found"},
        )
    logger.info("card_archived card_id=%s user_id=%s", result.id, user_id)
    return _card_response(result)


@router.post("/{card_id}/unarchive", response_model=CardResponse)
def unarchive_card(
    card_id: uuid.UUID,
    user_id: uuid.UUID = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> CardResponse | JSONResponse:
    service = UnarchiveCardService(SqlAlchemyCardRepository(db))
    try:
        result = service.execute(UnarchiveCardCommand(actor_user_id=user_id, card_id=card_id))
    except CardNotFoundError as exc:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": str(exc), "code": "card_not_found"},
        )
    logger.info("card_unarchived card_id=%s user_id=%s", result.id, user_id)
    return _card_response(result)
