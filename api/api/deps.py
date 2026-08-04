"""FastAPI dependencies."""

from __future__ import annotations

import uuid
from collections.abc import Iterator

from adapters.persistence.db import get_session_factory
from adapters.persistence.password_hasher import Argon2PasswordHasher
from adapters.persistence.sessions import resolve_session_user_id
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from api.settings import AuthSettings, load_auth_settings


def get_db() -> Iterator[Session]:
    factory = get_session_factory()
    session = factory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_password_hasher() -> Argon2PasswordHasher:
    return Argon2PasswordHasher()


def get_auth_settings(request: Request) -> AuthSettings:
    cached = getattr(request.app.state, "auth_settings", None)
    if cached is None:
        cached = load_auth_settings()
        request.app.state.auth_settings = cached
    return cached


def require_authenticated_user(
    request: Request,
    db: Session = Depends(get_db),
    settings: AuthSettings = Depends(get_auth_settings),
) -> uuid.UUID:
    """Authentication gate for protected API routes (membership ACL = Epic 2)."""
    token = request.cookies.get(settings.session_cookie_name)
    user_id = resolve_session_user_id(db, token)
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated.",
        )
    return user_id
