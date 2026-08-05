"""Postgres integration tests for signup (Story 1.2).

Requires DATABASE_URL (Compose db or CI Postgres 16). Skips when unset.
"""

from __future__ import annotations

import pytest
from adapters.persistence.models import ListMembershipModel, ListModel, SessionModel, UserModel
from adapters.persistence.password_hasher import Argon2PasswordHasher
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session
from tests.integration_db import database_url

pytestmark = pytest.mark.skipif(
    database_url() is None,
    reason="DATABASE_URL not set — Postgres 16 required for integration tests",
)


def test_register_hashes_password_sets_cookie_creates_personal_list(
    client: TestClient, db_session: Session
) -> None:
    response = client.post(
        "/auth/register",
        json={"email": "member@example.com", "password": "password1"},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["email"] == "member@example.com"
    assert body["list_name"] == "Personal"
    assert "password" not in body
    assert "password_hash" not in body

    assert "fh_session" in response.cookies
    cookie = response.cookies["fh_session"]
    assert cookie

    user = db_session.scalar(select(UserModel).where(UserModel.email == "member@example.com"))
    assert user is not None
    assert user.password_hash != "password1"
    assert user.password_hash.startswith("$argon2")
    assert Argon2PasswordHasher().verify("password1", user.password_hash)

    lists = list(db_session.scalars(select(ListModel).where(ListModel.owner_id == user.id)))
    assert len(lists) == 1
    memberships = list(
        db_session.scalars(
            select(ListMembershipModel).where(ListMembershipModel.user_id == user.id)
        )
    )
    assert len(memberships) == 1
    assert memberships[0].list_id == lists[0].id
    assert memberships[0].role == "owner"

    session_row = db_session.scalar(select(SessionModel).where(SessionModel.token == cookie))
    assert session_row is not None
    assert session_row.user_id == user.id


def test_register_rejects_duplicate_email(client: TestClient) -> None:
    first = client.post(
        "/auth/register",
        json={"email": "dup@example.com", "password": "password1"},
    )
    assert first.status_code == 201
    second = client.post(
        "/auth/register",
        json={"email": "Dup@Example.com", "password": "password2"},
    )
    assert second.status_code == 409
    assert second.json()["code"] == "duplicate_email"


def test_register_fr4_off_no_verification_step(client: TestClient) -> None:
    response = client.post(
        "/auth/register",
        json={"email": "ready@example.com", "password": "password1"},
    )
    assert response.status_code == 201
    # No verification challenge in body — immediately authenticated via cookie.
    assert "fh_session" in response.cookies
    assert "verification" not in response.text.lower()


def test_health_still_ok(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_session_endpoint_requires_cookie(client: TestClient) -> None:
    response = client.get("/auth/session")
    assert response.status_code == 401


def test_session_endpoint_returns_user_after_register(client: TestClient) -> None:
    registered = client.post(
        "/auth/register",
        json={"email": "sessioned@example.com", "password": "password1"},
    )
    assert registered.status_code == 201
    response = client.get("/auth/session")
    assert response.status_code == 200
    body = response.json()
    assert body["authenticated"] is True
    assert body["user_id"] == registered.json()["user_id"]


def test_password_never_logged_as_plaintext(
    client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level("INFO"):
        client.post(
            "/auth/register",
            json={"email": "logcheck@example.com", "password": "super-secret-pass"},
        )
    joined = " ".join(r.message for r in caplog.records)
    assert "super-secret-pass" not in joined
