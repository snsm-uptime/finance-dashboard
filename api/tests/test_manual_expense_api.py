"""Postgres integration tests for manual expense create + list (Story 3.2).

Requires DATABASE_URL (Compose db or CI Postgres 16). Skips when unset.
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from tests.integration_db import claim_alias, database_url

pytestmark = pytest.mark.skipif(
    database_url() is None,
    reason="DATABASE_URL not set — Postgres 16 required for integration tests",
)


def _register(client: TestClient, email: str) -> str:
    response = client.post(
        "/auth/register",
        json={"email": email, "password": "password1"},
    )
    assert response.status_code == 201, response.text
    claim_alias(client, email)
    me = client.get("/auth/me")
    assert me.status_code == 200
    return me.json()["user_id"]


def test_create_and_list_expenses_newest_first(client: TestClient) -> None:
    owner_id = _register(client, "owner-exp@example.com")
    created = client.post("/lists", json={"name": "Household"})
    assert created.status_code == 201, created.text
    list_id = created.json()["id"]

    first = client.post(
        f"/lists/{list_id}/expenses",
        json={
            "amount": "10.00",
            "currency": "CRC",
            "description": "Older coffee",
            "payer_id": owner_id,
        },
    )
    assert first.status_code == 201, first.text
    assert first.json()["provenance"] == "hand"
    assert first.json()["line_type"] == "purchase"
    assert first.json()["description"] == "Older coffee"
    assert first.json()["currency"] == "CRC"

    second = client.post(
        f"/lists/{list_id}/expenses",
        json={
            "amount": "25.50",
            "currency": "CRC",
            "description": "Newer lunch",
            "payer_id": owner_id,
        },
    )
    assert second.status_code == 201, second.text

    listing = client.get(f"/lists/{list_id}/expenses")
    assert listing.status_code == 200, listing.text
    expenses = listing.json()["expenses"]
    assert len(expenses) == 2
    assert expenses[0]["id"] == second.json()["id"]
    assert expenses[1]["id"] == first.json()["id"]
    assert expenses[0]["description"] == "Newer lunch"


def test_create_without_override_resolves_list_default(client: TestClient) -> None:
    owner_id = _register(client, "owner-default@example.com")
    created = client.post("/lists", json={"name": "Split Default"})
    list_id = created.json()["id"]

    expense = client.post(
        f"/lists/{list_id}/expenses",
        json={
            "amount": "100.00",
            "currency": "CRC",
            "description": "Default split item",
            "payer_id": owner_id,
        },
    )
    assert expense.status_code == 201, expense.text
    entry_id = expense.json()["id"]

    alloc = client.get(f"/lists/{list_id}/subjects/item/{entry_id}/share-allocations")
    assert alloc.status_code == 200, alloc.text
    assert alloc.json()["resolved_from"] == "list_default"


def test_create_with_percentage_override(client: TestClient) -> None:
    owner_id = _register(client, "owner-pct@example.com")
    created = client.post("/lists", json={"name": "Pct"})
    list_id = created.json()["id"]

    # Invite isn't needed for single-member percentage — 100% to owner.
    expense = client.post(
        f"/lists/{list_id}/expenses",
        json={
            "amount": "40.00",
            "currency": "CRC",
            "description": "Whole percent",
            "payer_id": owner_id,
            "split_override": {
                "kind": "percentage",
                "percentages": {owner_id: "100.00"},
            },
        },
    )
    assert expense.status_code == 201, expense.text
    entry_id = expense.json()["id"]
    alloc = client.get(f"/lists/{list_id}/subjects/item/{entry_id}/share-allocations")
    assert alloc.status_code == 200
    assert alloc.json()["resolved_from"] == "item"


def test_bad_override_rolls_back_entry(client: TestClient, db_session: Session) -> None:
    owner_id = _register(client, "owner-rollback@example.com")
    created = client.post("/lists", json={"name": "Rollback"})
    list_id = created.json()["id"]

    bad = client.post(
        f"/lists/{list_id}/expenses",
        json={
            "amount": "50.00",
            "currency": "CRC",
            "description": "Should not persist",
            "payer_id": owner_id,
            "split_override": {
                "kind": "percentage",
                "percentages": {owner_id: "40.00"},
            },
        },
    )
    assert bad.status_code == 422, bad.text
    assert bad.json()["code"] == "invalid_split_override"

    listing = client.get(f"/lists/{list_id}/expenses")
    assert listing.status_code == 200
    assert listing.json()["expenses"] == []


def test_non_member_create_forbidden(client: TestClient) -> None:
    owner_id = _register(client, "owner-acl@example.com")
    created = client.post("/lists", json={"name": "Private"})
    list_id = created.json()["id"]

    client.post("/auth/sign-out")
    stranger_id = _register(client, "stranger-acl@example.com")

    denied = client.post(
        f"/lists/{list_id}/expenses",
        json={
            "amount": "1.00",
            "currency": "CRC",
            "description": "Nope",
            "payer_id": stranger_id,
        },
    )
    assert denied.status_code == 403
    assert denied.json()["code"] == "not_list_member"
    assert owner_id  # used


def test_non_crc_rejected(client: TestClient) -> None:
    owner_id = _register(client, "owner-usd@example.com")
    created = client.post("/lists", json={"name": "FX later"})
    list_id = created.json()["id"]

    bad = client.post(
        f"/lists/{list_id}/expenses",
        json={
            "amount": "1.00",
            "currency": "USD",
            "description": "Dollars",
            "payer_id": owner_id,
        },
    )
    assert bad.status_code == 422
    assert bad.json()["code"] == "invalid_manual_expense"


def test_list_members_roster_labels_with_alias(client: TestClient, db_session: Session) -> None:
    from uuid import UUID

    from adapters.persistence.models import ListMembershipModel

    _register(client, "owner-members@example.com")
    created = client.post("/lists", json={"name": "Roster"})
    list_id = created.json()["id"]

    # Add second member directly (invite flow is heavier than needed here).
    member_id = _register(client, "member-roster@example.com")
    # Seed membership for owner list.
    db_session.add(
        ListMembershipModel(
            id=uuid4(),
            list_id=UUID(list_id),
            user_id=UUID(member_id),
            role="member",
        )
    )
    db_session.flush()

    # Sign back in as owner
    client.post("/auth/sign-out")
    sign_in = client.post(
        "/auth/sign-in",
        json={"email": "owner-members@example.com", "password": "password1"},
    )
    assert sign_in.status_code == 200, sign_in.text

    roster = client.get(f"/lists/{list_id}/members")
    assert roster.status_code == 200, roster.text
    members = roster.json()["members"]
    aliases = {m["alias"] for m in members}
    assert aliases == {"owner_members", "member_roster"}
    # Email is an identity surface — it must never appear on the roster.
    assert all("email" not in m for m in members)
