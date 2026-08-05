"""Shared helpers for Postgres integration tests (not pytest fixtures)."""

from __future__ import annotations

import os
from collections.abc import Iterator

import pytest
from api.app import create_app
from api.deps import get_db
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session


def database_url() -> str | None:
    return (os.environ.get("DATABASE_URL") or "").strip() or None


def apply_base_auth_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SESSION_SECRET", "test-session-secret-not-for-prod")
    monkeypatch.setenv("SESSION_COOKIE_SECURE", "false")
    monkeypatch.setenv("EMAIL_VERIFICATION_REQUIRED", "false")
    monkeypatch.setenv("SESSION_COOKIE_NAME", "fh_session")


def make_client(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
    *,
    smtp: bool = False,
) -> Iterator[TestClient]:
    """Factory for TestClient with get_db override. smtp=True sets PUBLIC_APP_URL + SMTP_*."""
    apply_base_auth_env(monkeypatch)
    if smtp:
        monkeypatch.setenv("PUBLIC_APP_URL", "http://localhost:3000")
        monkeypatch.setenv("SMTP_HOST", "smtp.test")
        monkeypatch.setenv("SMTP_FROM", "noreply@example.com")

    app = create_app()

    def _override_db() -> Iterator[Session]:
        # Do not rollback here: this session is the shared outer test transaction.
        # RequestValidationError (422) is thrown into the generator and must not
        # wipe registration/session rows for later assertions in the same test.
        yield db_session
        db_session.flush()

    app.dependency_overrides[get_db] = _override_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
