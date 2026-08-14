"""Shared helpers for Postgres integration tests (not pytest fixtures)."""

from __future__ import annotations

import os
import re
from collections.abc import Iterator

import pytest
from api.app import create_app
from api.deps import get_db
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session


def database_url() -> str | None:
    return (os.environ.get("DATABASE_URL") or "").strip() or None


def alias_from_email(email: str) -> str:
    """Deterministic generic alias for fixtures (alice@example.com → alice)."""
    local = email.split("@", 1)[0].lower()
    alias = re.sub(r"[^a-z0-9_]", "_", local)[:32]
    return alias if len(alias) >= 3 else f"u_{alias}"


def claim_alias(client: TestClient, email: str) -> str:
    """List surfaces are alias-gated — every registered fixture user claims one."""
    alias = alias_from_email(email)
    response = client.patch("/auth/me", json={"alias": alias})
    assert response.status_code == 200, response.text
    return alias


def apply_base_auth_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SESSION_SECRET", "test-session-secret-not-for-prod")
    monkeypatch.setenv("SESSION_COOKIE_SECURE", "false")
    monkeypatch.setenv("EMAIL_VERIFICATION_REQUIRED", "false")
    monkeypatch.setenv("SESSION_COOKIE_NAME", "fh_session")
    # Chatty auth suites must not trip production-default rate ceilings (1.5.6).
    monkeypatch.setenv("AUTH_RATE_LIMIT_REGISTER_MAX", "10000")
    monkeypatch.setenv("AUTH_RATE_LIMIT_SIGN_IN_MAX", "10000")
    monkeypatch.setenv("AUTH_RATE_LIMIT_PASSWORD_RESET_REQUEST_MAX", "10000")
    monkeypatch.setenv("AUTH_RATE_LIMIT_VERIFY_REQUEST_MAX", "10000")


def make_client(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
    *,
    smtp: bool = False,
    bccr_client: object | None = None,
) -> Iterator[TestClient]:
    """Factory for TestClient with get_db override. smtp=True sets PUBLIC_APP_URL + SMTP_*.

    bccr_client, when given, overrides get_bccr_client (Story 3.5) so tests can
    exercise the USD FX path without a real BCCR transport.
    """
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
    if bccr_client is not None:
        from api.deps import get_bccr_client

        app.dependency_overrides[get_bccr_client] = lambda: bccr_client
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
