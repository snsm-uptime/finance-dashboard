"""Postgres integration tests for list default split (Story 2.5).

Requires DATABASE_URL (Compose db or CI Postgres 16). Skips when unset.
"""

from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

import pytest
from adapters.persistence.models import ListMembershipModel, ListModel, UserModel
from domain.default_split import allocate_even_shares, allocate_percentage_shares
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
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
    claim_alias(client, email)


def test_unauthenticated_default_split_rejected(client: TestClient) -> None:
    assert client.get(f"/lists/{uuid4()}/default-split").status_code == 401
    assert (
        client.put(
            f"/lists/{uuid4()}/default-split",
            json={"mode": "even"},
        ).status_code
        == 401
    )


def test_even_default_after_create_and_owner_percentage(
    client: TestClient, db_session: Session
) -> None:
    _register(client, "split-owner@example.com")
    created = client.post("/lists", json={"name": "Household"})
    assert created.status_code == 201, created.text
    list_id = created.json()["id"]
    owner_id = created.json()["owner_id"]

    got = client.get(f"/lists/{list_id}/default-split")
    assert got.status_code == 200, got.text
    body = got.json()
    assert body["mode"] == "even"
    assert body["owner_id"] == owner_id
    assert len(body["shares"]) == 1
    assert body["shares"][0]["percentage"] in {"100", "100.00", "100.0000"}

    # Seed a second member directly (2.3 invite not implemented).
    member = UserModel(
        id=uuid4(),
        email="split-member@example.com",
        password_hash="x",
    )
    db_session.add(member)
    db_session.flush()
    db_session.add(
        ListMembershipModel(
            id=uuid4(),
            list_id=list_id,
            user_id=member.id,
            role="member",
        )
    )
    db_session.flush()

    bad = client.put(
        f"/lists/{list_id}/default-split",
        json={
            "mode": "percentage",
            "shares": [
                {"user_id": owner_id, "percentage": "60.00"},
                {"user_id": str(member.id), "percentage": "30.00"},
            ],
        },
    )
    assert bad.status_code == 422, bad.text
    assert bad.json()["code"] == "invalid_default_split"

    ok = client.put(
        f"/lists/{list_id}/default-split",
        json={
            "mode": "percentage",
            "shares": [
                {"user_id": owner_id, "percentage": "60.00"},
                {"user_id": str(member.id), "percentage": "40.00"},
            ],
        },
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["mode"] == "percentage"

    row = db_session.get(ListModel, list_id)
    assert row is not None
    assert row.default_split_mode == "percentage"


def test_non_owner_cannot_edit_default_split(
    client: TestClient, db_session: Session
) -> None:
    _register(client, "owner-acl@example.com")
    created = client.post("/lists", json={"name": "Shared"})
    list_id = created.json()["id"]
    owner_id = created.json()["owner_id"]

    client.post("/auth/sign-out")
    _register(client, "member-acl@example.com")
    me = client.get("/auth/me")
    assert me.status_code == 200
    member_id = me.json()["user_id"]
    db_session.add(
        ListMembershipModel(
            id=uuid4(),
            list_id=list_id,
            user_id=member_id,
            role="member",
        )
    )
    db_session.flush()

    denied = client.put(
        f"/lists/{list_id}/default-split",
        json={"mode": "even"},
    )
    assert denied.status_code == 403, denied.text
    assert denied.json()["code"] == "not_list_owner"

    # Member can still read
    readable = client.get(f"/lists/{list_id}/default-split")
    assert readable.status_code == 200
    assert readable.json()["owner_id"] == owner_id


def test_ad6_remainder_helper_on_sample_amounts() -> None:
    creator, a, b = uuid4(), uuid4(), uuid4()
    even = allocate_even_shares(Decimal("100.00"), [creator, a, b], creator)
    assert sum(even.values(), Decimal("0")) == Decimal("100.00")
    assert even[creator] == Decimal("33.34")

    pct = allocate_percentage_shares(
        Decimal("10.00"),
        {
            creator: Decimal("33.33"),
            a: Decimal("33.33"),
            b: Decimal("33.34"),
        },
        creator,
    )
    assert sum(pct.values(), Decimal("0")) == Decimal("10.00")
    assert pct[creator] == Decimal("3.34")


def test_membership_change_falls_back_to_even_on_read(
    client: TestClient, db_session: Session
) -> None:
    _register(client, "fallback-owner@example.com")
    created = client.post("/lists", json={"name": "Fallback"})
    list_id = created.json()["id"]
    owner_id = created.json()["owner_id"]

    member = UserModel(id=uuid4(), email="fallback-m@example.com", password_hash="x")
    db_session.add(member)
    db_session.flush()
    db_session.add(
        ListMembershipModel(
            id=uuid4(), list_id=list_id, user_id=member.id, role="member"
        )
    )
    db_session.flush()

    saved = client.put(
        f"/lists/{list_id}/default-split",
        json={
            "mode": "percentage",
            "shares": [
                {"user_id": owner_id, "percentage": "60.00"},
                {"user_id": str(member.id), "percentage": "40.00"},
            ],
        },
    )
    assert saved.status_code == 200

    extra = UserModel(id=uuid4(), email="fallback-x@example.com", password_hash="x")
    db_session.add(extra)
    db_session.flush()
    db_session.add(
        ListMembershipModel(
            id=uuid4(), list_id=list_id, user_id=extra.id, role="member"
        )
    )
    db_session.flush()

    got = client.get(f"/lists/{list_id}/default-split")
    assert got.status_code == 200
    assert got.json()["mode"] == "even"
    assert len(got.json()["member_ids"]) == 3
    row = db_session.get(ListModel, list_id)
    assert row is not None
    assert row.default_split_mode == "even"
