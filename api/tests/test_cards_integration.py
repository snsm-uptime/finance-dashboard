"""Postgres integration tests for card register/list (Story 4.1).

Requires DATABASE_URL (Compose db or CI Postgres 16). Skips when unset.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from tests.integration_db import claim_alias, database_url

pytestmark = pytest.mark.skipif(
    database_url() is None,
    reason="DATABASE_URL not set — Postgres 16 required for integration tests",
)


def _register(client: TestClient, email: str) -> None:
    response = client.post(
        "/auth/register",
        json={"email": email, "password": "password1"},
    )
    assert response.status_code == 201, response.text
    # cards endpoint itself doesn't require an alias, but this test harness's
    # fixture users claim one to exist as a signed-up user (Dev Notes).
    claim_alias(client, email)


def test_unauthenticated_cards_rejected(client: TestClient) -> None:
    list_resp = client.get("/cards")
    assert list_resp.status_code == 401

    create_resp = client.post("/cards", json={"label": "My Visa", "iban": "CR05"})
    assert create_resp.status_code == 401


def test_register_and_list_card(client: TestClient) -> None:
    _register(client, "carduser@example.com")

    empty = client.get("/cards")
    assert empty.status_code == 200
    assert empty.json()["cards"] == []

    created = client.post("/cards", json={"label": "My Visa", "iban": "cr05 0152 0200"})
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["label"] == "My Visa"
    assert body["iban"] == "CR0501520200"

    listed = client.get("/cards")
    assert listed.status_code == 200
    cards = listed.json()["cards"]
    assert len(cards) == 1
    assert cards[0]["id"] == body["id"]


def test_duplicate_iban_same_user_conflicts(client: TestClient) -> None:
    _register(client, "duplicate@example.com")

    first = client.post("/cards", json={"label": "My Visa", "iban": "CR05"})
    assert first.status_code == 201, first.text

    second = client.post("/cards", json={"label": "Another Card", "iban": "cr05"})
    assert second.status_code == 409
    assert second.json()["code"] == "card_iban_already_registered"
    assert "My Visa" in second.json()["detail"]


def test_same_iban_different_users_both_succeed(client: TestClient) -> None:
    _register(client, "usera@example.com")
    first = client.post("/cards", json={"label": "A's Card", "iban": "CR09"})
    assert first.status_code == 201, first.text

    # Reuse the same TestClient instance but sign out and register a second user.
    client.post("/auth/sign-out")
    _register(client, "userb@example.com")
    second = client.post("/cards", json={"label": "B's Card", "iban": "CR09"})
    assert second.status_code == 201, second.text


def test_blank_label_rejected(client: TestClient) -> None:
    _register(client, "blanklabel@example.com")
    response = client.post("/cards", json={"label": "   ", "iban": "CR05"})
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_card_label"


def test_blank_iban_rejected(client: TestClient) -> None:
    _register(client, "blankiban@example.com")
    response = client.post("/cards", json={"label": "My Visa", "iban": "   "})
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_card_iban"
