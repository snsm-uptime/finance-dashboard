"""FastAPI dependencies."""

from __future__ import annotations

from collections.abc import Iterator

from adapters.persistence.db import get_session_factory
from adapters.persistence.password_hasher import Argon2PasswordHasher
from fastapi import Request
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
