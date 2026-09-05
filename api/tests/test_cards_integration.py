"""Postgres integration tests for card register/list (Story 4.1).

Requires DATABASE_URL (Compose db or CI Postgres 16). Skips when unset.
"""

from __future__ import annotations

from uuid import uuid4

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


def _own_list_id(client: TestClient) -> str:
    listed = client.get("/lists")
    assert listed.status_code == 200, listed.text
    return listed.json()["lists"][0]["id"]


def test_registered_card_defaults_to_review_routing(client: TestClient) -> None:
    _register(client, "routingdefault@example.com")
    created = client.post("/cards", json={"label": "My Visa", "iban": "CR20"})
    assert created.status_code == 201, created.text
    assert created.json()["routing_mode"] == "review"
    assert created.json()["fixed_list_id"] is None

    listed = client.get("/cards")
    assert listed.json()["cards"][0]["routing_mode"] == "review"
    assert listed.json()["cards"][0]["fixed_list_id"] is None


def test_set_card_routing_fixed_to_own_list(client: TestClient) -> None:
    _register(client, "routingfixed@example.com")
    list_id = _own_list_id(client)
    created = client.post("/cards", json={"label": "My Visa", "iban": "CR21"})
    card_id = created.json()["id"]

    patched = client.patch(
        f"/cards/{card_id}/routing",
        json={"routing_mode": "fixed", "fixed_list_id": list_id},
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["routing_mode"] == "fixed"
    assert patched.json()["fixed_list_id"] == list_id


def test_set_card_routing_fixed_to_non_member_list_denied(client: TestClient) -> None:
    _register(client, "routingownera@example.com")
    other_list_id = _own_list_id(client)

    client.post("/auth/sign-out")
    _register(client, "routingownerb@example.com")
    created = client.post("/cards", json={"label": "My Visa", "iban": "CR22"})
    card_id = created.json()["id"]

    denied = client.patch(
        f"/cards/{card_id}/routing",
        json={"routing_mode": "fixed", "fixed_list_id": other_list_id},
    )
    assert denied.status_code == 403
    assert denied.json()["code"] == "not_list_member"


def test_set_card_routing_review_clears_fixed_list(client: TestClient) -> None:
    _register(client, "routingclear@example.com")
    list_id = _own_list_id(client)
    created = client.post("/cards", json={"label": "My Visa", "iban": "CR23"})
    card_id = created.json()["id"]

    client.patch(
        f"/cards/{card_id}/routing",
        json={"routing_mode": "fixed", "fixed_list_id": list_id},
    )
    reverted = client.patch(f"/cards/{card_id}/routing", json={"routing_mode": "review"})
    assert reverted.status_code == 200, reverted.text
    assert reverted.json()["routing_mode"] == "review"
    assert reverted.json()["fixed_list_id"] is None


def test_set_card_routing_unauthenticated_rejected(client: TestClient) -> None:
    response = client.patch(f"/cards/{uuid4()}/routing", json={"routing_mode": "review"})
    assert response.status_code == 401


def test_set_card_routing_unknown_card_not_found(client: TestClient) -> None:
    _register(client, "routingnotfound@example.com")
    response = client.patch(f"/cards/{uuid4()}/routing", json={"routing_mode": "review"})
    assert response.status_code == 404
    assert response.json()["code"] == "card_not_found"


def test_set_card_routing_invalid_mode_rejected(client: TestClient) -> None:
    _register(client, "routinginvalid@example.com")
    created = client.post("/cards", json={"label": "My Visa", "iban": "CR24"})
    card_id = created.json()["id"]

    response = client.patch(f"/cards/{card_id}/routing", json={"routing_mode": "bogus"})
    assert response.status_code == 422


def test_archive_and_unarchive_card_round_trip(client: TestClient) -> None:
    _register(client, "cardarchive@example.com")
    created = client.post("/cards", json={"label": "My Visa", "iban": "CR30"})
    card_id = created.json()["id"]

    archived = client.post(f"/cards/{card_id}/archive")
    assert archived.status_code == 200, archived.text
    assert archived.json()["is_archived"] is True

    default_list = client.get("/cards")
    assert [c["id"] for c in default_list.json()["cards"]] == []

    archived_list = client.get("/cards", params={"archived": "true"})
    assert [c["id"] for c in archived_list.json()["cards"]] == [card_id]

    unarchived = client.post(f"/cards/{card_id}/unarchive")
    assert unarchived.status_code == 200, unarchived.text
    assert unarchived.json()["is_archived"] is False

    default_list_again = client.get("/cards")
    assert [c["id"] for c in default_list_again.json()["cards"]] == [card_id]


def test_archive_card_preserves_routing(client: TestClient) -> None:
    _register(client, "cardarchiveroute@example.com")
    list_id = _own_list_id(client)
    created = client.post("/cards", json={"label": "My Visa", "iban": "CR31"})
    card_id = created.json()["id"]
    client.patch(
        f"/cards/{card_id}/routing",
        json={"routing_mode": "fixed", "fixed_list_id": list_id},
    )

    archived = client.post(f"/cards/{card_id}/archive")
    assert archived.status_code == 200, archived.text
    assert archived.json()["routing_mode"] == "fixed"
    assert archived.json()["fixed_list_id"] == list_id


def test_archive_unowned_card_not_found(client: TestClient) -> None:
    _register(client, "cardarchiveownera@example.com")
    created = client.post("/cards", json={"label": "My Visa", "iban": "CR32"})
    card_id = created.json()["id"]

    client.post("/auth/sign-out")
    _register(client, "cardarchiveownerb@example.com")
    response = client.post(f"/cards/{card_id}/archive")
    assert response.status_code == 404
    assert response.json()["code"] == "card_not_found"
