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


def test_me_default_origin_kind_defaults_to_cash(client: TestClient) -> None:
    _register(client, "origin-default@example.com")
    response = client.get("/auth/me")
    assert response.status_code == 200, response.text
    assert response.json()["default_origin_kind"] == "cash"


def test_patch_default_origin_kind_to_blank_persists(
    client: TestClient, db_session: Session
) -> None:
    _register(client, "origin-blank@example.com")

    patched = client.patch("/auth/me", json={"default_origin_kind": "blank"})
    assert patched.status_code == 200, patched.text
    assert patched.json()["default_origin_kind"] == "blank"

    again = client.get("/auth/me")
    assert again.json()["default_origin_kind"] == "blank"

    row = db_session.scalar(select(UserModel).where(UserModel.email == "origin-blank@example.com"))
    assert row is not None
    assert row.default_origin_kind == "blank"


def test_patch_rejects_invalid_default_origin_kind(client: TestClient) -> None:
    _register(client, "origin-bad@example.com")
    response = client.patch("/auth/me", json={"default_origin_kind": "cheque"})
    assert response.status_code == 422


def test_patch_rejects_card_kind_without_card_id(client: TestClient) -> None:
    _register(client, "origin-card-missing@example.com")
    response = client.patch("/auth/me", json={"default_origin_kind": "card"})
    assert response.status_code == 400, response.text
    assert response.json()["code"] == "invalid_preferences"


def test_patch_rejects_card_id_not_owned(client: TestClient) -> None:
    _register(client, "origin-card-foreign@example.com")
    response = client.patch(
        "/auth/me",
        json={
            "default_origin_kind": "card",
            "default_origin_card_id": "00000000-0000-0000-0000-000000000000",
        },
    )
    assert response.status_code == 404
    assert response.json()["code"] == "card_not_found"


def test_patch_default_origin_kind_to_card_persists(
    client: TestClient, db_session: Session
) -> None:
    _register(client, "origin-card@example.com")
    card = client.post("/cards", json={"label": "My Visa", "iban": "CR05 0152 0200"})
    assert card.status_code == 201, card.text
    card_id = card.json()["id"]

    patched = client.patch(
        "/auth/me",
        json={"default_origin_kind": "card", "default_origin_card_id": card_id},
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["default_origin_kind"] == "card"
    assert patched.json()["default_origin_card_id"] == card_id

    again = client.get("/auth/me")
    assert again.json()["default_origin_kind"] == "card"
    assert again.json()["default_origin_card_id"] == card_id

    row = db_session.scalar(select(UserModel).where(UserModel.email == "origin-card@example.com"))
    assert row is not None
    assert str(row.default_origin_card_id) == card_id

    # Switching back to cash clears the stored card reference.
    reverted = client.patch("/auth/me", json={"default_origin_kind": "cash"})
    assert reverted.status_code == 200, reverted.text
    assert reverted.json()["default_origin_card_id"] is None
