"""Email-verification token + verified-at persistence."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from application.email_verification import EmailVerificationTokenRecord
from domain.errors import InvalidVerificationTokenError
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from adapters.persistence.models import EmailVerificationTokenModel, UserModel
from adapters.persistence.token_claim import claim_single_use_email_token


class SqlAlchemyEmailVerificationRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get_user_verified_at(self, user_id: UUID) -> datetime | None:
        row = self._session.get(UserModel, user_id)
        if row is None:
            return None
        return row.email_verified_at

    def mark_email_verified(self, user_id: UUID, *, verified_at: datetime) -> None:
        row = self._session.get(UserModel, user_id)
        if row is None:
            raise InvalidVerificationTokenError()
        row.email_verified_at = verified_at

    def invalidate_outstanding_for_user(self, user_id: UUID) -> None:
        now = datetime.now(UTC)
        self._session.execute(
            update(EmailVerificationTokenModel)
            .where(
                EmailVerificationTokenModel.user_id == user_id,
                EmailVerificationTokenModel.used_at.is_(None),
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
            EmailVerificationTokenModel(
                id=token_id,
                user_id=user_id,
                token_hash=token_hash,
                expires_at=expires_at,
                used_at=None,
            )
        )

    def get_by_token_hash(self, token_hash: str) -> EmailVerificationTokenRecord | None:
        row = self._session.scalar(
            select(EmailVerificationTokenModel)
            .where(EmailVerificationTokenModel.token_hash == token_hash)
            .limit(1)
        )
        if row is None:
            return None
        return EmailVerificationTokenRecord(
            id=row.id,
            user_id=row.user_id,
            token_hash=row.token_hash,
            expires_at=row.expires_at,
            used_at=row.used_at,
        )

    def claim_token(self, token_id: UUID, *, used_at: datetime) -> bool:
        return claim_single_use_email_token(
            self._session,
            EmailVerificationTokenModel,
            token_id,
            used_at=used_at,
        )
