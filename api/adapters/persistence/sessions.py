"""Opaque session token persistence."""

from __future__ import annotations

import secrets
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from adapters.persistence.models import SessionModel

DEFAULT_SESSION_TTL = timedelta(days=30)


def create_session(
    db: Session,
    *,
    user_id: uuid.UUID,
    ttl: timedelta = DEFAULT_SESSION_TTL,
) -> str:
    token = secrets.token_urlsafe(32)
    db.add(
        SessionModel(
            id=uuid.uuid4(),
            token=token,
            user_id=user_id,
            expires_at=datetime.now(UTC) + ttl,
        )
    )
    return token


def resolve_session_user_id(db: Session, token: str | None) -> uuid.UUID | None:
    if not token:
        return None
    row = db.scalar(select(SessionModel).where(SessionModel.token == token).limit(1))
    if row is None:
        return None
    expires = row.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
    if expires <= datetime.now(UTC):
        return None
    return row.user_id


def revoke_session(db: Session, token: str | None) -> bool:
    """Delete the opaque session row. Returns True if a row was removed."""
    if not token:
        return False
    row = db.scalar(select(SessionModel).where(SessionModel.token == token).limit(1))
    if row is None:
        return False
    db.delete(row)
    return True


def revoke_all_sessions_for_user(db: Session, user_id: uuid.UUID) -> int:
    """Delete every opaque session for the user. Returns number of rows removed."""
    rows = list(db.scalars(select(SessionModel).where(SessionModel.user_id == user_id)))
    for row in rows:
        db.delete(row)
    return len(rows)
