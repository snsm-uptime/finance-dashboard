"""Postgres integration tests for item/receipt split overrides (Story 2.6).

Requires DATABASE_URL (Compose db or CI Postgres 16). Skips when unset.
"""

from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

import pytest
from adapters.persistence.models import (
    LedgerEntryModel,
    ListMembershipModel,
    ReceiptModel,
)
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


def _seed_item(
    db: Session,
    *,
    list_id: str,
    amount: str = "100.00",
    currency: str = "CRC",
    receipt_id=None,
):
    entry_id = uuid4()
    db.add(
        LedgerEntryModel(
            id=entry_id,
            list_id=list_id,
            amount=Decimal(amount),
            currency=currency,
            receipt_id=receipt_id,
        )
    )
    db.flush()
    return entry_id


def _seed_receipt(db: Session, *, list_id: str, amount: str = "100.00", currency: str = "CRC"):
    receipt_id = uuid4()
    db.add(
        ReceiptModel(
            id=receipt_id,
            list_id=list_id,
            amount=Decimal(amount),
            currency=currency,
        )
    )
    db.flush()
    return receipt_id


def test_member_sets_overrides_and_allocations_resolve(
    client: TestClient, db_session: Session
) -> None:
    owner_id = _register(client, "creator@example.com")
    created = client.post("/lists", json={"name": "Household"})
    assert created.status_code == 201, created.text
    list_id = created.json()["id"]

    client.post("/auth/sign-out")
    member_id = _register(client, "member-a@example.com")
    db_session.add(
        ListMembershipModel(
            id=uuid4(),
            list_id=list_id,
            user_id=member_id,
            role="member",
        )
    )
    db_session.flush()

    # Seed third member for N-way absolute/percentage cases.
    member_b = uuid4()
    from adapters.persistence.models import UserModel

    db_session.add(UserModel(id=member_b, email="member-b@example.com", password_hash="x"))
    db_session.flush()
    db_session.add(
        ListMembershipModel(
            id=uuid4(),
            list_id=list_id,
            user_id=member_b,
            role="member",
        )
    )
    db_session.flush()

    receipt_id = _seed_receipt(db_session, list_id=list_id, amount="100.00")
    item_id = _seed_item(db_session, list_id=list_id, amount="100.00", receipt_id=receipt_id)

    # No override → list default even (₡100 / 3 → creator gets remainder).
    base = client.get(f"/lists/{list_id}/subjects/item/{item_id}/share-allocations")
    assert base.status_code == 200, base.text
    body = base.json()
    assert body["resolved_from"] == "list_default"
    amounts = {row["member_id"]: Decimal(row["amount"]) for row in body["allocations"]}
    assert sum(amounts.values(), Decimal("0")) == Decimal("100.00")
    assert amounts[owner_id] == Decimal("33.34")

    # Member sets whole-assignee override on item.
    put = client.put(
        f"/lists/{list_id}/subjects/item/{item_id}/split-override",
        json={"kind": "whole_assignee", "assignee_id": member_id},
    )
    assert put.status_code == 200, put.text
    assert put.json()["kind"] == "whole_assignee"

    alloc = client.get(f"/lists/{list_id}/subjects/item/{item_id}/share-allocations")
    assert alloc.status_code == 200
    assert alloc.json()["resolved_from"] == "item"
    amap = {row["member_id"]: Decimal(row["amount"]) for row in alloc.json()["allocations"]}
    assert amap[member_id] == Decimal("100.00")
    assert amap[owner_id] == Decimal("0.00")

    # Clear → back to list default.
    cleared = client.delete(f"/lists/{list_id}/subjects/item/{item_id}/split-override")
    assert cleared.status_code == 204
    after_clear = client.get(f"/lists/{list_id}/subjects/item/{item_id}/share-allocations")
    assert after_clear.status_code == 200, after_clear.text
    assert after_clear.json()["resolved_from"] == "list_default"

    # Receipt absolute applies on the receipt subject; ignored for child items (decision A).
    abs_put = client.put(
        f"/lists/{list_id}/subjects/receipt/{receipt_id}/split-override",
        json={
            "kind": "absolute_amounts",
            "amounts": {
                owner_id: "50.00",
                member_id: "30.00",
                str(member_b): "20.00",
            },
        },
    )
    assert abs_put.status_code == 200, abs_put.text
    receipt_alloc = client.get(f"/lists/{list_id}/subjects/receipt/{receipt_id}/share-allocations")
    assert receipt_alloc.status_code == 200
    assert receipt_alloc.json()["resolved_from"] == "receipt"
    via_item = client.get(f"/lists/{list_id}/subjects/item/{item_id}/share-allocations")
    assert via_item.status_code == 200
    assert via_item.json()["resolved_from"] == "list_default"

    # Whole-assignee receipt override still applies to child items.
    whole_receipt = client.put(
        f"/lists/{list_id}/subjects/receipt/{receipt_id}/split-override",
        json={"kind": "whole_assignee", "assignee_id": owner_id},
    )
    assert whole_receipt.status_code == 200
    via_receipt = client.get(f"/lists/{list_id}/subjects/item/{item_id}/share-allocations")
    assert via_receipt.json()["resolved_from"] == "receipt"
    rmap = {row["member_id"]: Decimal(row["amount"]) for row in via_receipt.json()["allocations"]}
    assert rmap[owner_id] == Decimal("100.00")

    # Percentage on item wins over receipt.
    pct = client.put(
        f"/lists/{list_id}/subjects/item/{item_id}/split-override",
        json={
            "kind": "percentage",
            "percentages": {
                owner_id: "60.00",
                member_id: "40.00",
                str(member_b): "0.00",
            },
        },
    )
    assert pct.status_code == 200, pct.text
    got = client.get(f"/lists/{list_id}/subjects/item/{item_id}/split-override")
    assert got.status_code == 200
    assert got.json()["kind"] == "percentage"
    winner = client.get(f"/lists/{list_id}/subjects/item/{item_id}/share-allocations")
    assert winner.json()["resolved_from"] == "item"
    wmap = {row["member_id"]: Decimal(row["amount"]) for row in winner.json()["allocations"]}
    assert wmap[owner_id] == Decimal("60.00")
    assert wmap[member_id] == Decimal("40.00")


def test_absolute_and_percentage_validation_failures(
    client: TestClient, db_session: Session
) -> None:
    owner_id = _register(client, "validator@example.com")
    created = client.post("/lists", json={"name": "Validate"})
    list_id = created.json()["id"]
    item_id = _seed_item(db_session, list_id=list_id, amount="10.00")

    bad_abs = client.put(
        f"/lists/{list_id}/subjects/item/{item_id}/split-override",
        json={
            "kind": "absolute_amounts",
            "amounts": {owner_id: "6.00"},
        },
    )
    assert bad_abs.status_code == 422
    assert bad_abs.json()["code"] == "invalid_split_override"

    # Need a second member for percentage covering all members.
    member = uuid4()
    from adapters.persistence.models import UserModel

    db_session.add(UserModel(id=member, email="pct-member@example.com", password_hash="x"))
    db_session.flush()
    db_session.add(ListMembershipModel(id=uuid4(), list_id=list_id, user_id=member, role="member"))
    db_session.flush()

    bad_pct = client.put(
        f"/lists/{list_id}/subjects/item/{item_id}/split-override",
        json={
            "kind": "percentage",
            "percentages": {owner_id: "60.00", str(member): "30.00"},
        },
    )
    assert bad_pct.status_code == 422
    assert bad_pct.json()["code"] == "invalid_split_override"


def test_non_member_denied_on_override_and_allocations(
    client: TestClient, db_session: Session
) -> None:
    _register(client, "owner-split@example.com")
    created = client.post("/lists", json={"name": "Private"})
    list_id = created.json()["id"]
    item_id = _seed_item(db_session, list_id=list_id)

    client.post("/auth/sign-out")
    outsider_id = _register(client, "outsider@example.com")

    denied_put = client.put(
        f"/lists/{list_id}/subjects/item/{item_id}/split-override",
        json={"kind": "whole_assignee", "assignee_id": outsider_id},
    )
    assert denied_put.status_code == 403
    assert denied_put.json()["code"] == "not_list_member"

    denied_get = client.get(f"/lists/{list_id}/subjects/item/{item_id}/share-allocations")
    assert denied_get.status_code == 404
    assert denied_get.json()["code"] == "list_not_found"


def test_nan_amount_rejected_with_structured_code(client: TestClient, db_session: Session) -> None:
    owner_id = _register(client, "nan-owner@example.com")
    created = client.post("/lists", json={"name": "NaN"})
    list_id = created.json()["id"]
    item_id = _seed_item(db_session, list_id=list_id, amount="10.00")

    bad = client.put(
        f"/lists/{list_id}/subjects/item/{item_id}/split-override",
        json={
            "kind": "absolute_amounts",
            "amounts": {owner_id: "NaN"},
        },
    )
    assert bad.status_code == 422
    assert bad.json()["code"] == "invalid_split_override"


def test_stale_percentage_after_member_join_fails_loud(
    client: TestClient, db_session: Session
) -> None:
    owner_id = _register(client, "stale-owner@example.com")
    created = client.post("/lists", json={"name": "Stale"})
    list_id = created.json()["id"]
    item_id = _seed_item(db_session, list_id=list_id, amount="10.00")

    member = uuid4()
    from adapters.persistence.models import UserModel

    db_session.add(UserModel(id=member, email="stale-member@example.com", password_hash="x"))
    db_session.flush()
    db_session.add(ListMembershipModel(id=uuid4(), list_id=list_id, user_id=member, role="member"))
    db_session.flush()

    ok = client.put(
        f"/lists/{list_id}/subjects/item/{item_id}/split-override",
        json={
            "kind": "percentage",
            "percentages": {owner_id: "60.00", str(member): "40.00"},
        },
    )
    assert ok.status_code == 200, ok.text

    joiner = uuid4()
    db_session.add(UserModel(id=joiner, email="stale-joiner@example.com", password_hash="x"))
    db_session.flush()
    db_session.add(ListMembershipModel(id=uuid4(), list_id=list_id, user_id=joiner, role="member"))
    db_session.flush()

    alloc = client.get(f"/lists/{list_id}/subjects/item/{item_id}/share-allocations")
    assert alloc.status_code == 422
    assert alloc.json()["code"] == "invalid_split_override"
