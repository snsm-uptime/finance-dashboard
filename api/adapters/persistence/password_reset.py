"""Password-reset token persistence."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from application.password_reset import PasswordResetTokenRecord
from domain.errors import InvalidResetTokenError
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from adapters.persistence.models import PasswordResetTokenModel, UserModel
from adapters.persistence.sessions import revoke_all_sessions_for_user
from adapters.persistence.token_claim import claim_single_use_email_token


class SqlAlchemyPasswordResetTokenRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def invalidate_outstanding_for_user(self, user_id: UUID) -> None:
        now = datetime.now(UTC)
        self._session.execute(
            update(PasswordResetTokenModel)
            .where(
                PasswordResetTokenModel.user_id == user_id,
                PasswordResetTokenModel.used_at.is_(None),
            )
            .values(used_at=now)
        )

    def create_token(
        self,
        *,
        token_id: UUID,
        user_id: UUID,
        token_hash: str,
        expires_at: datetime,
    ) -> None:
        self._session.add(
            PasswordResetTokenModel(
                id=token_id,
                user_id=user_id,
                token_hash=token_hash,
                expires_at=expires_at,
                used_at=None,
            )
        )

    def get_by_token_hash(self, token_hash: str) -> PasswordResetTokenRecord | None:
        row = self._session.scalar(
            select(PasswordResetTokenModel)
            .where(PasswordResetTokenModel.token_hash == token_hash)
            .limit(1)
        )
        if row is None:
            return None
        return PasswordResetTokenRecord(
            id=row.id,
            user_id=row.user_id,
            token_hash=row.token_hash,
            expires_at=row.expires_at,
            used_at=row.used_at,
        )

    def claim_token(self, token_id: UUID, *, used_at: datetime) -> bool:
        return claim_single_use_email_token(
            self._session,
            PasswordResetTokenModel,
            token_id,
            used_at=used_at,
        )

    def update_password_hash(self, user_id: UUID, password_hash: str) -> None:
        row = self._session.get(UserModel, user_id)
        if row is None:
            raise InvalidResetTokenError()
        row.password_hash = password_hash

    def revoke_all_sessions_for_user(self, user_id: UUID) -> None:
        revoke_all_sessions_for_user(self._session, user_id)
