"""Postgres integration tests for sign-in / sign-out (Story 1.3).

Requires DATABASE_URL (Compose db or CI Postgres 16). Skips when unset.
"""

from __future__ import annotations

import pytest
from adapters.persistence.models import SessionModel
from domain.errors import InvalidCredentialsError
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session
from tests.integration_db import database_url

pytestmark = pytest.mark.skipif(
    database_url() is None,
    reason="DATABASE_URL not set — Postgres 16 required for integration tests",
)


def _register(client: TestClient, email: str, password: str = "password1") -> None:
    response = client.post("/auth/register", json={"email": email, "password": password})
    assert response.status_code == 201, response.text
    # Clear jar so subsequent sign-in is a fresh session (register already set a cookie).
    client.cookies.clear()


def test_sign_in_sets_session_cookie(client: TestClient, db_session: Session) -> None:
    _register(client, "signin@example.com")

    response = client.post(
        "/auth/sign-in",
        json={"email": "SignIn@Example.com", "password": "password1"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["email"] == "signin@example.com"
    assert "password" not in body
    assert "fh_session" in response.cookies
    cookie = response.cookies["fh_session"]
    row = db_session.scalar(select(SessionModel).where(SessionModel.token == cookie))
    assert row is not None


def test_sign_in_invalid_credentials_are_generic(client: TestClient) -> None:
    _register(client, "known@example.com")

    unknown = client.post(
        "/auth/sign-in",
        json={"email": "ghost@example.com", "password": "password1"},
    )
    bad = client.post(
        "/auth/sign-in",
        json={"email": "known@example.com", "password": "wrong-password"},
    )
    empty = client.post(
        "/auth/sign-in",
        json={"email": "", "password": ""},
    )

    assert unknown.status_code == 401
    assert bad.status_code == 401
    assert empty.status_code == 401
    assert unknown.json() == bad.json() == empty.json()
    assert unknown.json()["code"] == "invalid_credentials"
    assert unknown.json()["detail"] == InvalidCredentialsError.MESSAGE
    assert "fh_session" not in unknown.cookies


def test_sign_out_revokes_session_and_protects_me(client: TestClient, db_session: Session) -> None:
    _register(client, "logout@example.com")
    signed_in = client.post(
        "/auth/sign-in",
        json={"email": "logout@example.com", "password": "password1"},
    )
    assert signed_in.status_code == 200
    token = signed_in.cookies["fh_session"]
    assert db_session.scalar(select(SessionModel).where(SessionModel.token == token)) is not None

    me_before = client.get("/auth/me")
    assert me_before.status_code == 200

    signed_out = client.post("/auth/sign-out")
    assert signed_out.status_code == 204

    assert db_session.scalar(select(SessionModel).where(SessionModel.token == token)) is None

    me_after = client.get("/auth/me")
    assert me_after.status_code == 401
    session_after = client.get("/auth/session")
    assert session_after.status_code == 401


def test_sign_out_is_idempotent(client: TestClient) -> None:
    first = client.post("/auth/sign-out")
    second = client.post("/auth/sign-out")
    assert first.status_code == 204
    assert second.status_code == 204


def test_sign_in_password_never_logged(
    client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    _register(client, "logsignin@example.com", password="super-secret-pass")
    with caplog.at_level("INFO"):
        client.post(
            "/auth/sign-in",
            json={"email": "logsignin@example.com", "password": "super-secret-pass"},
        )
    joined = " ".join(r.message for r in caplog.records)
    assert "super-secret-pass" not in joined


def test_me_requires_authentication(client: TestClient) -> None:
    response = client.get("/auth/me")
    assert response.status_code == 401


def test_sign_in_malformed_body_is_generic_401(client: TestClient) -> None:
    response = client.post(
        "/auth/sign-in",
        content=b"not-json",
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 401
    assert response.json()["code"] == "invalid_credentials"


def test_sign_in_revokes_prior_sessions(client: TestClient, db_session: Session) -> None:
    _register(client, "single@example.com")
    first = client.post(
        "/auth/sign-in",
        json={"email": "single@example.com", "password": "password1"},
    )
    assert first.status_code == 200
    old_token = first.cookies["fh_session"]
    client.cookies.clear()

    second = client.post(
        "/auth/sign-in",
        json={"email": "single@example.com", "password": "password1"},
    )
    assert second.status_code == 200
    new_token = second.cookies["fh_session"]
    assert new_token != old_token
    assert db_session.scalar(select(SessionModel).where(SessionModel.token == old_token)) is None
    assert (
        db_session.scalar(select(SessionModel).where(SessionModel.token == new_token)) is not None
    )
