"""Postgres integration tests for alias claim + alias gate.

Requires DATABASE_URL (Compose db or CI Postgres 16). Skips when unset.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from tests.integration_db import database_url

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


def test_me_reports_null_alias_until_claimed(client: TestClient) -> None:
    _register(client, "alice-alias@example.com")

    me = client.get("/auth/me")
    assert me.status_code == 200, me.text
    assert me.json()["alias"] is None

    claimed = client.patch("/auth/me", json={"alias": "Alice"})
    assert claimed.status_code == 200, claimed.text
    assert claimed.json()["alias"] == "alice"
    assert client.get("/auth/me").json()["alias"] == "alice"


def test_alias_taken_is_case_insensitive(client: TestClient) -> None:
    _register(client, "alice-taken@example.com")
    assert client.patch("/auth/me", json={"alias": "alice"}).status_code == 200

    client.post("/auth/sign-out")
    _register(client, "bob-taken@example.com")

    conflict = client.patch("/auth/me", json={"alias": "ALICE"})
    assert conflict.status_code == 409, conflict.text
    assert conflict.json()["code"] == "alias_taken"
    assert client.get("/auth/me").json()["alias"] is None


@pytest.mark.parametrize("bad", ["ab", "a" * 33, "has space", "dash-no", ""])
def test_invalid_alias_format_rejected(client: TestClient, bad: str) -> None:
    _register(client, "carol-format@example.com")

    response = client.patch("/auth/me", json={"alias": bad})
    assert response.status_code == 422, response.text
    assert response.json()["code"] == "invalid_alias"


def test_alias_change_rejected_once_set(client: TestClient) -> None:
    _register(client, "dave-once@example.com")
    assert client.patch("/auth/me", json={"alias": "dave"}).status_code == 200

    again = client.patch("/auth/me", json={"alias": "dave2"})
    assert again.status_code == 409, again.text
    assert again.json()["code"] == "alias_already_set"
    assert client.get("/auth/me").json()["alias"] == "dave"


def test_lists_are_gated_until_alias_is_set(client: TestClient) -> None:
    _register(client, "erin-gate@example.com")

    blocked = client.get("/lists")
    assert blocked.status_code == 403, blocked.text
    assert blocked.json()["code"] == "alias_required"

    created_blocked = client.post("/lists", json={"name": "Household"})
    assert created_blocked.status_code == 403
    assert created_blocked.json()["code"] == "alias_required"

    assert client.patch("/auth/me", json={"alias": "erin"}).status_code == 200
    assert client.get("/lists").status_code == 200
    assert client.post("/lists", json={"name": "Household"}).status_code == 201


def test_alias_gate_does_not_block_account_surfaces(client: TestClient) -> None:
    _register(client, "frank-gate@example.com")

    # Setup surfaces must stay reachable, otherwise the gate deadlocks.
    assert client.get("/auth/session").status_code == 200
    assert client.get("/auth/me").status_code == 200
    assert client.patch("/auth/me", json={"language": "es"}).status_code == 200


def test_alias_claim_requires_authentication(client: TestClient) -> None:
    response = client.patch("/auth/me", json={"alias": "nobody"})
    assert response.status_code == 401
