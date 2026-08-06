"""SQLAlchemy repository for list invite tokens (Story 2.3)."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from application.list_invite import ListInviteTokenRecord
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from adapters.persistence.models import ListInviteTokenModel


class SqlAlchemyListInviteTokenRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def invalidate_outstanding_for_list_email(self, list_id: UUID, email: str) -> None:
        now = datetime.now(UTC)
        self._session.execute(
            update(ListInviteTokenModel)
            .where(
                ListInviteTokenModel.list_id == list_id,
                ListInviteTokenModel.email == email,
                ListInviteTokenModel.used_at.is_(None),
            )
            .values(used_at=now)
        )

    def create_token(
        self,
        *,
        token_id: UUID,
        list_id: UUID,
        email: str,
        token_hash: str,
        inviter_user_id: UUID,
        locale: str,
        expires_at: datetime,
    ) -> None:
        self._session.add(
            ListInviteTokenModel(
                id=token_id,
                list_id=list_id,
                email=email,
                token_hash=token_hash,
                inviter_user_id=inviter_user_id,
                locale=locale,
                expires_at=expires_at,
            )
        )
        self._session.flush()

    def get_by_token_hash(self, token_hash: str) -> ListInviteTokenRecord | None:
        row = self._session.scalars(
            select(ListInviteTokenModel).where(ListInviteTokenModel.token_hash == token_hash)
        ).first()
        if row is None:
            return None
        return ListInviteTokenRecord(
            id=row.id,
            list_id=row.list_id,
            email=row.email,
            token_hash=row.token_hash,
            inviter_user_id=row.inviter_user_id,
            locale=row.locale,
            expires_at=row.expires_at,
            used_at=row.used_at,
        )
