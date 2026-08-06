"""Postgres integration tests for list create/rename (Story 2.1).

Requires DATABASE_URL (Compose db or CI Postgres 16). Skips when unset.
"""

from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from adapters.persistence.models import ListMembershipModel, ListModel
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session
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


def test_unauthenticated_create_and_rename_rejected(client: TestClient) -> None:
    create = client.post("/lists", json={"name": "Household"})
    assert create.status_code == 401

    rename = client.patch(f"/lists/{uuid4()}", json={"name": "Nope"})
    assert rename.status_code == 401


def test_create_owned_list_membership_and_multi_own(
    client: TestClient, db_session: Session
) -> None:
    _register(client, "owner@example.com")

    first = client.get("/lists")
    assert first.status_code == 200
    personal = first.json()["lists"]
    assert len(personal) == 1
    assert personal[0]["name"] == "Personal"
    assert personal[0]["role"] == "owner"

    created = client.post("/lists", json={"name": "  Household  "})
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["name"] == "Household"
    assert "owner_id" in body

    listed = client.get("/lists")
    assert listed.status_code == 200
    names = {item["name"] for item in listed.json()["lists"]}
    assert names == {"Personal", "Household"}

    list_id = body["id"]
    row = db_session.get(ListModel, list_id)
    assert row is not None
    assert row.name == "Household"
    memberships = db_session.scalars(
        select(ListMembershipModel).where(ListMembershipModel.list_id == list_id)
    ).all()
    assert len(memberships) == 1
    assert memberships[0].role == "owner"
    assert str(memberships[0].user_id) == str(row.owner_id)


def test_owner_rename_persists(client: TestClient, db_session: Session) -> None:
    _register(client, "renamer@example.com")
    created = client.post("/lists", json={"name": "Trip"})
    list_id = created.json()["id"]

    renamed = client.patch(f"/lists/{list_id}", json={"name": "Trip with Alex"})
    assert renamed.status_code == 200, renamed.text
    assert renamed.json()["name"] == "Trip with Alex"

    db_session.expire_all()
    row = db_session.get(ListModel, list_id)
    assert row is not None
    assert row.name == "Trip with Alex"

    listed = client.get("/lists")
    match = next(item for item in listed.json()["lists"] if item["id"] == list_id)
    assert match["name"] == "Trip with Alex"


def test_non_member_and_non_owner_rename_denied(client: TestClient, db_session: Session) -> None:
    _register(client, "owner2@example.com")
    created = client.post("/lists", json={"name": "Household"})
    list_id = created.json()["id"]
    owner_id = created.json()["owner_id"]

    # Second user: member but not owner
    client.post("/auth/sign-out")
    _register(client, "member@example.com")
    member_me = client.get("/auth/me")
    assert member_me.status_code == 200
    member_id = UUID(member_me.json()["user_id"])
    list_uuid = UUID(list_id)

    db_session.add(
        ListMembershipModel(
            id=uuid4(),
            list_id=list_uuid,
            user_id=member_id,
            role="member",
        )
    )
    db_session.flush()

    denied_member = client.patch(f"/lists/{list_id}", json={"name": "Stolen"})
    assert denied_member.status_code == 403
    assert denied_member.json()["code"] == "not_list_owner"

    # Stranger (no membership)
    client.post("/auth/sign-out")
    _register(client, "stranger@example.com")
    denied_stranger = client.patch(f"/lists/{list_id}", json={"name": "Hacked"})
    assert denied_stranger.status_code == 403
    assert denied_stranger.json()["code"] == "not_list_member"

    db_session.expire_all()
    row = db_session.get(ListModel, list_id)
    assert row is not None
    assert row.name == "Household"
    assert str(row.owner_id) == str(owner_id)


def test_blank_name_rejected(client: TestClient) -> None:
    _register(client, "blank@example.com")
    for name in ("   ", ""):
        response = client.post("/lists", json={"name": name})
        assert response.status_code == 422, response.text
        assert response.json()["code"] == "invalid_list_name"


def test_rename_unknown_list_same_as_non_member(client: TestClient) -> None:
    _register(client, "prober@example.com")
    unknown = client.patch(f"/lists/{uuid4()}", json={"name": "Nope"})
    assert unknown.status_code == 403
    assert unknown.json()["code"] == "not_list_member"
    assert unknown.json()["detail"] == "You do not have access to this list."


def test_membership_listing_excludes_non_member_lists(client: TestClient) -> None:
    _register(client, "alice@example.com")
    created = client.post("/lists", json={"name": "Alice House"})
    alice_list = created.json()["id"]
    assert created.status_code == 201

    client.post("/auth/sign-out")
    _register(client, "bob@example.com")
    listed = client.get("/lists")
    assert listed.status_code == 200
    ids = {item["id"] for item in listed.json()["lists"]}
    assert alice_list not in ids
    for item in listed.json()["lists"]:
        assert "balance_crc" in item
        assert isinstance(item["balance_crc"], str)


def test_non_member_reads_return_list_not_found(client: TestClient) -> None:
    _register(client, "owner-acl@example.com")
    created = client.post("/lists", json={"name": "Secret"})
    list_id = created.json()["id"]

    client.post("/auth/sign-out")
    _register(client, "outsider@example.com")

    for path in (
        f"/lists/{list_id}",
        f"/lists/{list_id}/expenses",
        f"/lists/{list_id}/balances",
    ):
        response = client.get(path)
        assert response.status_code == 404, response.text
        body = response.json()
        assert body["code"] == "list_not_found"
        assert body["detail"] == "List not found."

    missing = client.get(f"/lists/{uuid4()}")
    assert missing.status_code == 404
    assert missing.json()["code"] == "list_not_found"


def test_member_detail_and_stubs_ok(client: TestClient) -> None:
    _register(client, "reader@example.com")
    created = client.post("/lists", json={"name": "Household"})
    list_id = created.json()["id"]

    detail = client.get(f"/lists/{list_id}")
    assert detail.status_code == 200, detail.text
    assert detail.json()["name"] == "Household"
    assert "owner_id" in detail.json()

    expenses = client.get(f"/lists/{list_id}/expenses")
    assert expenses.status_code == 200
    assert expenses.json()["expenses"] == []

    balances = client.get(f"/lists/{list_id}/balances")
    assert balances.status_code == 200
    assert balances.json()["balance_crc"] == "0"


def test_set_last_opened_list_member_and_non_member(client: TestClient) -> None:
    _register(client, "remember@example.com")
    created = client.post("/lists", json={"name": "Trip"})
    list_id = created.json()["id"]

    patched = client.patch("/auth/me", json={"last_opened_list_id": list_id})
    assert patched.status_code == 200, patched.text
    assert patched.json()["last_opened_list_id"] == list_id

    me = client.get("/auth/me")
    assert me.json()["last_opened_list_id"] == list_id

    client.post("/auth/sign-out")
    _register(client, "nosy@example.com")
    denied = client.patch("/auth/me", json={"last_opened_list_id": list_id})
    assert denied.status_code == 403
    assert denied.json()["code"] == "not_list_member"

    missing = client.patch("/auth/me", json={"last_opened_list_id": str(uuid4())})
    assert missing.status_code == 403
    assert missing.json()["code"] == "not_list_member"
    assert missing.json()["detail"] == "You do not have access to this list."
