"""FastAPI dependencies."""

from __future__ import annotations

import uuid
from collections.abc import Iterator

from adapters.persistence.db import get_session_factory
from adapters.persistence.password_hasher import Argon2PasswordHasher
from adapters.persistence.repositories import SqlAlchemyAuthUserRepository
from adapters.persistence.sessions import SqlAlchemySessionStore
from application.ports import PasswordHasher, PreferencesRepository, SessionStore
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


def get_password_hasher() -> PasswordHasher:
    return Argon2PasswordHasher()


def get_session_store(db: Session = Depends(get_db)) -> SessionStore:
    return SqlAlchemySessionStore(db)


def get_preferences_repository(db: Session = Depends(get_db)) -> PreferencesRepository:
    return SqlAlchemyAuthUserRepository(db)


def get_auth_settings(request: Request) -> AuthSettings:
    cached = getattr(request.app.state, "auth_settings", None)
    if cached is None:
        cached = load_auth_settings()
        request.app.state.auth_settings = cached
    return cached


def require_authenticated_user(
    request: Request,
    sessions: SessionStore = Depends(get_session_store),
    settings: AuthSettings = Depends(get_auth_settings),
) -> uuid.UUID:
    """Authentication gate for protected API routes (membership ACL = Epic 2)."""
    token = request.cookies.get(settings.session_cookie_name)
    user_id = sessions.resolve_user_id(token)
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated.",
        )
    return user_id
