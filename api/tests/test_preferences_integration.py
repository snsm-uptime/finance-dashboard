"""Postgres integration tests for account preferences (Story 1.6)."""

from __future__ import annotations

import pytest
from adapters.persistence.models import UserModel
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


def test_me_requires_session(client: TestClient) -> None:
    response = client.get("/auth/me")
    assert response.status_code == 401


def test_me_returns_null_prefs_when_unset(client: TestClient) -> None:
    _register(client, "prefs-default@example.com")
    response = client.get("/auth/me", headers={"Accept-Language": "es-CR,es;q=0.9"})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["language"] is None
    assert body["theme"] is None
    assert body["email"] == "prefs-default@example.com"


def test_patch_language_and_theme_persist(client: TestClient, db_session: Session) -> None:
    _register(client, "prefs-save@example.com")

    patched = client.patch("/auth/me", json={"language": "es", "theme": "dark"})
    assert patched.status_code == 200, patched.text
    body = patched.json()
    assert body["language"] == "es"
    assert body["theme"] == "dark"

    again = client.get("/auth/me", headers={"Accept-Language": "en-US"})
    assert again.status_code == 200
    assert again.json()["language"] == "es"
    assert again.json()["theme"] == "dark"

    row = db_session.scalar(select(UserModel).where(UserModel.email == "prefs-save@example.com"))
    assert row is not None
    assert row.language == "es"
    assert row.theme == "dark"


def test_patch_rejects_invalid_preferences(client: TestClient) -> None:
    _register(client, "prefs-bad@example.com")
    # Schema Literal rejects unknown values before domain (422).
    bad_lang = client.patch("/auth/me", json={"language": "fr"})
    assert bad_lang.status_code == 422

    bad_theme = client.patch("/auth/me", json={"theme": "neon"})
    assert bad_theme.status_code == 422


def test_patch_partial_preserves_other_field(client: TestClient, db_session: Session) -> None:
    _register(client, "prefs-partial@example.com")
    assert client.patch("/auth/me", json={"language": "es", "theme": "dark"}).status_code == 200

    lang_only = client.patch("/auth/me", json={"language": "en"})
    assert lang_only.status_code == 200, lang_only.text
    assert lang_only.json()["language"] == "en"
    assert lang_only.json()["theme"] == "dark"

    theme_only = client.patch("/auth/me", json={"theme": "light"})
    assert theme_only.status_code == 200, theme_only.text
    assert theme_only.json()["language"] == "en"
    assert theme_only.json()["theme"] == "light"

    row = db_session.scalar(select(UserModel).where(UserModel.email == "prefs-partial@example.com"))
    assert row is not None
    assert row.language == "en"
    assert row.theme == "light"


def test_patch_me_requires_session(client: TestClient) -> None:
    response = client.patch("/auth/me", json={"language": "en"})
    assert response.status_code == 401
