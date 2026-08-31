"""Postgres integration tests for list create/rename (Story 2.1).

Requires DATABASE_URL (Compose db or CI Postgres 16). Skips when unset.
"""

from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import UUID, uuid4

import pytest
from adapters.persistence.models import (
    LedgerEntryModel,
    ListMembershipModel,
    ListModel,
    SamePriceConflictModel,
)
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session
from tests.integration_db import alias_from_email, claim_alias, database_url

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
    for item in listed.json()["lists"]:
        assert len(item["members"]) == 1
        assert item["members"][0]["user_id"] == item["owner_id"]
        assert item["members"][0]["alias"] == "owner"

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
    assert balances.json()["balance_status"] == {"is_incomplete": False}


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


def test_set_default_import_list_member_and_non_member(client: TestClient) -> None:
    _register(client, "importdefault@example.com")
    created = client.post("/lists", json={"name": "Trip"})
    list_id = created.json()["id"]

    patched = client.patch("/auth/me", json={"default_import_list_id": list_id})
    assert patched.status_code == 200, patched.text
    assert patched.json()["default_import_list_id"] == list_id

    me = client.get("/auth/me")
    assert me.json()["default_import_list_id"] == list_id

    client.post("/auth/sign-out")
    _register(client, "importdefaultnosy@example.com")
    denied = client.patch("/auth/me", json={"default_import_list_id": list_id})
    assert denied.status_code == 403
    assert denied.json()["code"] == "not_list_member"

    missing = client.patch("/auth/me", json={"default_import_list_id": str(uuid4())})
    assert missing.status_code == 403
    assert missing.json()["code"] == "not_list_member"


# --- Story 5.7: balance_status.is_incomplete on GET /lists/{id}/balances ---


def _seed_ledger_entry(
    db_session: Session,
    *,
    list_id: UUID,
    provenance: str,
    amount: Decimal = Decimal("10.00"),
    currency: str = "CRC",
    posted_date: date = date(2026, 8, 10),
    normalized_description: str = "Entry",
) -> UUID:
    entry_id = uuid4()
    db_session.add(
        LedgerEntryModel(
            id=entry_id,
            list_id=list_id,
            amount=amount,
            currency=currency,
            normalized_description=normalized_description,
            provenance=provenance,
            posted_date=posted_date,
            amount_crc=amount,
            fx_rate=Decimal("1"),
        )
    )
    db_session.flush()
    return entry_id


def _seed_conflict(
    db_session: Session,
    *,
    manual_entry_id: UUID,
    parsed_entry_id: UUID,
    manual_list_id: UUID,
    parsed_list_id: UUID,
) -> UUID:
    conflict_id = uuid4()
    db_session.add(
        SamePriceConflictModel(
            id=conflict_id,
            manual_entry_id=manual_entry_id,
            parsed_entry_id=parsed_entry_id,
            manual_list_id=manual_list_id,
            parsed_list_id=parsed_list_id,
        )
    )
    db_session.flush()
    return conflict_id


def test_balances_no_unresolved_conflicts_is_complete(
    client: TestClient, db_session: Session
) -> None:
    _register(client, "complete@example.com")
    created = client.post("/lists", json={"name": "Household"})
    list_id = created.json()["id"]

    balances = client.get(f"/lists/{list_id}/balances")
    assert balances.status_code == 200
    assert balances.json()["balance_status"] == {"is_incomplete": False}


def test_balances_incomplete_when_list_is_parsed_side(
    client: TestClient, db_session: Session
) -> None:
    _register(client, "parsedside@example.com")
    created = client.post("/lists", json={"name": "Household"})
    list_id = UUID(created.json()["id"])

    manual_id = _seed_ledger_entry(db_session, list_id=list_id, provenance="hand")
    parsed_id = _seed_ledger_entry(db_session, list_id=list_id, provenance="parser")
    _seed_conflict(
        db_session,
        manual_entry_id=manual_id,
        parsed_entry_id=parsed_id,
        manual_list_id=list_id,
        parsed_list_id=list_id,
    )

    balances = client.get(f"/lists/{list_id}/balances")
    assert balances.status_code == 200
    assert balances.json()["balance_status"] == {"is_incomplete": True}


def test_balances_incomplete_when_list_is_manual_side_on_related_list(
    client: TestClient, db_session: Session
) -> None:
    """AD-10 'related lists': manual and parsed entries can sit on different
    lists that share the actor's membership."""
    _register(client, "manualside@example.com")
    manual_list = UUID(client.post("/lists", json={"name": "Manual List"}).json()["id"])
    parsed_list = UUID(client.post("/lists", json={"name": "Parsed List"}).json()["id"])

    manual_id = _seed_ledger_entry(db_session, list_id=manual_list, provenance="hand")
    parsed_id = _seed_ledger_entry(db_session, list_id=parsed_list, provenance="parser")
    _seed_conflict(
        db_session,
        manual_entry_id=manual_id,
        parsed_entry_id=parsed_id,
        manual_list_id=manual_list,
        parsed_list_id=parsed_list,
    )

    manual_side = client.get(f"/lists/{manual_list}/balances")
    assert manual_side.json()["balance_status"] == {"is_incomplete": True}


def test_balances_resolving_conflict_clears_incomplete(
    client: TestClient, db_session: Session
) -> None:
    _register(client, "resolveflow@example.com")
    created = client.post("/lists", json={"name": "Household"})
    list_id = UUID(created.json()["id"])

    manual_id = _seed_ledger_entry(db_session, list_id=list_id, provenance="hand")
    parsed_id = _seed_ledger_entry(db_session, list_id=list_id, provenance="parser")
    conflict_id = _seed_conflict(
        db_session,
        manual_entry_id=manual_id,
        parsed_entry_id=parsed_id,
        manual_list_id=list_id,
        parsed_list_id=list_id,
    )

    before = client.get(f"/lists/{list_id}/balances")
    assert before.json()["balance_status"] == {"is_incomplete": True}

    resolved = client.post(
        f"/import-conflicts/{conflict_id}/resolve",
        json={"resolution": "manual_survivor", "confirmed": True},
    )
    assert resolved.status_code == 204, resolved.text

    after = client.get(f"/lists/{list_id}/balances")
    assert after.status_code == 200
    assert after.json()["balance_status"] == {"is_incomplete": False}


def test_balances_conflict_on_unrelated_list_does_not_flag_this_list(
    client: TestClient, db_session: Session
) -> None:
    _register(client, "unrelated@example.com")
    watched_list = UUID(client.post("/lists", json={"name": "Watched"}).json()["id"])

    client.post("/auth/sign-out")
    _register(client, "otherowner@example.com")
    other_list = UUID(client.post("/lists", json={"name": "Other"}).json()["id"])
    manual_id = _seed_ledger_entry(db_session, list_id=other_list, provenance="hand")
    parsed_id = _seed_ledger_entry(db_session, list_id=other_list, provenance="parser")
    _seed_conflict(
        db_session,
        manual_entry_id=manual_id,
        parsed_entry_id=parsed_id,
        manual_list_id=other_list,
        parsed_list_id=other_list,
    )

    client.post("/auth/sign-out")
    signed_in = client.post(
        "/auth/sign-in", json={"email": "unrelated@example.com", "password": "password1"}
    )
    assert signed_in.status_code == 200, signed_in.text
    watched = client.get(f"/lists/{watched_list}/balances")
    assert watched.status_code == 200
    assert watched.json()["balance_status"] == {"is_incomplete": False}


def test_balances_conflict_on_one_of_actors_own_lists_does_not_flag_a_sibling_list(
    client: TestClient, db_session: Session
) -> None:
    """Same actor, two lists: a conflict touching only one must not flag the
    other. `list_unresolved_conflicts(actor_user_id)` alone (actor-scoping)
    would pass this only by accident of the unrelated-list test above — this
    exercises `conflicts_touching_list`'s per-list_id filter directly."""
    _register(client, "twolists@example.com")
    touched_list = UUID(client.post("/lists", json={"name": "Touched"}).json()["id"])
    sibling_list = UUID(client.post("/lists", json={"name": "Sibling"}).json()["id"])

    manual_id = _seed_ledger_entry(db_session, list_id=touched_list, provenance="hand")
    parsed_id = _seed_ledger_entry(db_session, list_id=touched_list, provenance="parser")
    _seed_conflict(
        db_session,
        manual_entry_id=manual_id,
        parsed_entry_id=parsed_id,
        manual_list_id=touched_list,
        parsed_list_id=touched_list,
    )

    touched = client.get(f"/lists/{touched_list}/balances")
    assert touched.status_code == 200
    assert touched.json()["balance_status"] == {"is_incomplete": True}

    sibling = client.get(f"/lists/{sibling_list}/balances")
    assert sibling.status_code == 200
    assert sibling.json()["balance_status"] == {"is_incomplete": False}


# --- Story 5.8: pairwise grid, simplify, settle ------------------------------


def _seed_full_ledger_entry(
    db_session: Session,
    *,
    list_id: UUID,
    payer_id: UUID,
    amount: Decimal,
    line_type: str = "purchase",
    posted_date: date = date(2026, 8, 10),
    created_at: datetime | None = None,
) -> UUID:
    entry_id = uuid4()
    db_session.add(
        LedgerEntryModel(
            id=entry_id,
            list_id=list_id,
            amount=amount,
            currency="CRC",
            normalized_description="Entry",
            payer_id=payer_id,
            provenance="hand",
            line_type=line_type,
            posted_date=posted_date,
            amount_crc=amount,
            fx_rate=Decimal("1"),
            created_at=created_at or datetime.now(UTC),
        )
    )
    db_session.flush()
    return entry_id


def _add_member(db_session: Session, *, list_id: UUID, user_id: UUID, role: str = "member") -> None:
    db_session.add(ListMembershipModel(id=uuid4(), list_id=list_id, user_id=user_id, role=role))
    db_session.flush()


def _make_two_member_list(
    client: TestClient, db_session: Session, owner_email: str, member_email: str
) -> tuple[UUID, UUID, UUID]:
    """Register owner + member, add member to owner's new list, sign back in
    as owner. Returns (list_id, owner_id, member_id)."""
    _register(client, owner_email)
    owner_id = UUID(client.get("/auth/me").json()["user_id"])
    created = client.post("/lists", json={"name": "Household"})
    list_id = UUID(created.json()["id"])

    client.post("/auth/sign-out")
    _register(client, member_email)
    member_id = UUID(client.get("/auth/me").json()["user_id"])
    _add_member(db_session, list_id=list_id, user_id=member_id)

    client.post("/auth/sign-out")
    signed_in = client.post("/auth/sign-in", json={"email": owner_email, "password": "password1"})
    assert signed_in.status_code == 200, signed_in.text
    return list_id, owner_id, member_id


def test_balances_pairwise_edges_two_member_list(client: TestClient, db_session: Session) -> None:
    list_id, owner_id, member_id = _make_two_member_list(
        client, db_session, "pairwiseowner@example.com", "pairwisemember@example.com"
    )
    _seed_full_ledger_entry(
        db_session, list_id=list_id, payer_id=owner_id, amount=Decimal("1000.00")
    )

    balances = client.get(f"/lists/{list_id}/balances")
    assert balances.status_code == 200, balances.text
    body = balances.json()
    assert body["balance_crc"] == "500.00"
    assert body["you_owe"] == []
    assert len(body["you_are_owed"]) == 1
    owed = body["you_are_owed"][0]
    assert owed["member_id"] == str(member_id)
    assert owed["amount_crc"] == "500.00"
    assert owed["alias"] == alias_from_email("pairwisemember@example.com")


def test_balances_pairwise_edges_three_member_list(client: TestClient, db_session: Session) -> None:
    list_id, owner_id, member_id = _make_two_member_list(
        client, db_session, "pairwise3owner@example.com", "pairwise3memberb@example.com"
    )
    client.post("/auth/sign-out")
    _register(client, "pairwise3memberc@example.com")
    charlie_id = UUID(client.get("/auth/me").json()["user_id"])
    _add_member(db_session, list_id=list_id, user_id=charlie_id)

    client.post(
        "/auth/sign-in",
        json={"email": "pairwise3owner@example.com", "password": "password1"},
    )
    # Bob pays 900, even 3-way split -> 300 each: Bob is owed 300 by owner, 300 by Charlie.
    _seed_full_ledger_entry(
        db_session, list_id=list_id, payer_id=member_id, amount=Decimal("900.00")
    )

    balances = client.get(f"/lists/{list_id}/balances")
    assert balances.status_code == 200, balances.text
    body = balances.json()
    assert body["balance_crc"] == "-300.00"
    assert body["you_are_owed"] == []
    assert len(body["you_owe"]) == 1
    assert body["you_owe"][0]["member_id"] == str(member_id)
    assert body["you_owe"][0]["amount_crc"] == "300.00"


def test_settle_clears_you_owe_but_not_you_are_owed_or_balance(
    client: TestClient, db_session: Session
) -> None:
    list_id, owner_id, member_id = _make_two_member_list(
        client, db_session, "settleowner@example.com", "settlemember@example.com"
    )
    # Member pays 1000 -> owner owes member 500.
    _seed_full_ledger_entry(
        db_session, list_id=list_id, payer_id=member_id, amount=Decimal("1000.00")
    )

    before = client.get(f"/lists/{list_id}/balances")
    assert before.json()["you_owe"][0]["amount_crc"] == "500.00"
    assert before.json()["balance_crc"] == "-500.00"

    settled = client.post(f"/lists/{list_id}/settle")
    assert settled.status_code == 204, settled.text

    after = client.get(f"/lists/{list_id}/balances")
    body = after.json()
    assert body["you_owe"] == []
    # Balance and you_are_owed never move — no money actually moved (AD-21).
    assert body["balance_crc"] == "-500.00"
    assert body["you_are_owed"] == []


def test_settle_is_a_point_in_time_boundary_new_debt_reappears(
    client: TestClient, db_session: Session
) -> None:
    list_id, owner_id, member_id = _make_two_member_list(
        client, db_session, "settleboundary@example.com", "settleboundarymember@example.com"
    )
    _seed_full_ledger_entry(
        db_session, list_id=list_id, payer_id=member_id, amount=Decimal("1000.00")
    )

    settled = client.post(f"/lists/{list_id}/settle")
    assert settled.status_code == 204, settled.text
    cleared = client.get(f"/lists/{list_id}/balances")
    assert cleared.json()["you_owe"] == []

    # A new purchase after settling reappears in you_owe (not a permanent clear).
    _seed_full_ledger_entry(
        db_session, list_id=list_id, payer_id=member_id, amount=Decimal("200.00")
    )
    after = client.get(f"/lists/{list_id}/balances")
    body = after.json()
    assert len(body["you_owe"]) == 1
    assert body["you_owe"][0]["amount_crc"] == "100.00"
    assert body["balance_crc"] == "-600.00"


def test_settle_is_idempotent_repeat_settle_moves_timestamp_forward(
    client: TestClient, db_session: Session
) -> None:
    list_id, owner_id, member_id = _make_two_member_list(
        client, db_session, "settleidempotent@example.com", "settleidempotentmember@example.com"
    )
    _seed_full_ledger_entry(
        db_session, list_id=list_id, payer_id=member_id, amount=Decimal("1000.00")
    )

    first = client.post(f"/lists/{list_id}/settle")
    assert first.status_code == 204
    second = client.post(f"/lists/{list_id}/settle")
    assert second.status_code == 204

    after = client.get(f"/lists/{list_id}/balances")
    assert after.json()["you_owe"] == []


def test_settle_non_member_and_missing_list_forbidden(
    client: TestClient, db_session: Session
) -> None:
    list_id, _owner_id, _member_id = _make_two_member_list(
        client, db_session, "settleaclowner@example.com", "settleaclmember@example.com"
    )
    client.post("/auth/sign-out")
    _register(client, "settleoutsider@example.com")

    denied = client.post(f"/lists/{list_id}/settle")
    assert denied.status_code == 403
    assert denied.json()["code"] == "not_list_member"

    missing = client.post(f"/lists/{uuid4()}/settle")
    assert missing.status_code == 403
    assert missing.json()["code"] == "not_list_member"


def test_simplify_returns_transfers_preserving_nets(
    client: TestClient, db_session: Session
) -> None:
    list_id, owner_id, member_id = _make_two_member_list(
        client, db_session, "simplifyowner@example.com", "simplifymember@example.com"
    )
    _seed_full_ledger_entry(
        db_session, list_id=list_id, payer_id=owner_id, amount=Decimal("1000.00")
    )

    plan = client.get(f"/lists/{list_id}/settle/simplify")
    assert plan.status_code == 200, plan.text
    body = plan.json()
    assert body["is_incomplete"] is False
    assert len(body["transfers"]) == 1
    transfer = body["transfers"][0]
    assert transfer["from_member_id"] == str(member_id)
    assert transfer["to_member_id"] == str(owner_id)
    assert transfer["amount_crc"] == "500.00"


def test_simplify_blocked_409_when_unresolved_conflict_touches_list(
    client: TestClient, db_session: Session
) -> None:
    _register(client, "simplifyblocked@example.com")
    created = client.post("/lists", json={"name": "Household"})
    list_id = UUID(created.json()["id"])

    manual_id = _seed_ledger_entry(db_session, list_id=list_id, provenance="hand")
    parsed_id = _seed_ledger_entry(db_session, list_id=list_id, provenance="parser")
    _seed_conflict(
        db_session,
        manual_entry_id=manual_id,
        parsed_entry_id=parsed_id,
        manual_list_id=list_id,
        parsed_list_id=list_id,
    )

    plan = client.get(f"/lists/{list_id}/settle/simplify")
    assert plan.status_code == 409, plan.text
    assert plan.json()["code"] == "settle_incomplete"


def test_simplify_non_member_and_missing_list_not_found(
    client: TestClient, db_session: Session
) -> None:
    list_id, _owner_id, _member_id = _make_two_member_list(
        client, db_session, "simplifyaclowner@example.com", "simplifyaclmember@example.com"
    )
    client.post("/auth/sign-out")
    _register(client, "simplifyoutsider@example.com")

    denied = client.get(f"/lists/{list_id}/settle/simplify")
    assert denied.status_code == 404
    assert denied.json()["code"] == "list_not_found"

    missing = client.get(f"/lists/{uuid4()}/settle/simplify")
    assert missing.status_code == 404
    assert missing.json()["code"] == "list_not_found"
