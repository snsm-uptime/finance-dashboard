"""Postgres integration tests for manual expense create + list (Story 3.2).

Requires DATABASE_URL (Compose db or CI Postgres 16). Skips when unset.
"""

from __future__ import annotations

from collections.abc import Iterator
from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from tests.integration_db import claim_alias, database_url, make_client

pytestmark = pytest.mark.skipif(
    database_url() is None,
    reason="DATABASE_URL not set — Postgres 16 required for integration tests",
)


class FakeUsdBccrClient:
    """Deterministic BCCR double for USD FX integration tests (Story 3.5)."""

    def get_rate(self, rate_date: date, currency: str) -> Decimal | None:
        if currency == "USD":
            return Decimal("525.00")
        return None

    def get_nearest_prior_rate(self, rate_date: date, currency: str):
        return None

    def supported_currencies(self) -> list[str]:
        return ["USD"]


@pytest.fixture
def client_with_fx(db_session: Session, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    yield from make_client(db_session, monkeypatch, smtp=False, bccr_client=FakeUsdBccrClient())


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


def test_unsupported_currency_rejected(client: TestClient) -> None:
    """v1 FX scope is CRC+USD only (AD-7) — other currencies are deferred."""
    owner_id = _register(client, "owner-eur@example.com")
    created = client.post("/lists", json={"name": "FX later"})
    list_id = created.json()["id"]

    bad = client.post(
        f"/lists/{list_id}/expenses",
        json={
            "amount": "1.00",
            "currency": "EUR",
            "description": "Euros",
            "payer_id": owner_id,
        },
    )
    assert bad.status_code == 422
    assert bad.json()["code"] == "invalid_manual_expense"


def test_usd_without_bccr_wired_fails_loud(client: TestClient) -> None:
    """No live BCCR adapter yet (Dev Notes) — USD must 503, never silently use 1:1."""
    owner_id = _register(client, "owner-usd-unwired@example.com")
    created = client.post("/lists", json={"name": "FX unwired"})
    list_id = created.json()["id"]

    resp = client.post(
        f"/lists/{list_id}/expenses",
        json={
            "amount": "1.00",
            "currency": "USD",
            "description": "Dollars",
            "payer_id": owner_id,
        },
    )
    assert resp.status_code == 503, resp.text
    assert resp.json()["code"] == "fx_service_unavailable"


def test_usd_expense_materializes_fx_and_audit_trail(client_with_fx: TestClient) -> None:
    owner_id = _register(client_with_fx, "owner-usd-fx@example.com")
    created = client_with_fx.post("/lists", json={"name": "FX materialized"})
    list_id = created.json()["id"]

    expense = client_with_fx.post(
        f"/lists/{list_id}/expenses",
        json={
            "amount": "100.00",
            "currency": "USD",
            "description": "Dinner",
            "payer_id": owner_id,
        },
    )
    assert expense.status_code == 201, expense.text
    body = expense.json()
    assert body["currency"] == "USD"
    assert body["amount"] == "100.00"
    assert body["amount_crc"] == "52500.00"
    assert body["fx_rate"] == "525.0000"
    assert body["fx_fallback"] is False

    listing = client_with_fx.get(f"/lists/{list_id}/expenses")
    assert listing.status_code == 200, listing.text
    row = listing.json()["expenses"][0]
    assert row["amount_crc"] == "52500.00"
    assert row["fx_rate"] == "525.0000"
    assert row["fx_rate_date"]
    assert row["fx_fallback"] is False


def test_crc_expense_fx_passthrough(client_with_fx: TestClient) -> None:
    owner_id = _register(client_with_fx, "owner-crc-fx@example.com")
    created = client_with_fx.post("/lists", json={"name": "CRC passthrough"})
    list_id = created.json()["id"]

    expense = client_with_fx.post(
        f"/lists/{list_id}/expenses",
        json={
            "amount": "10.00",
            "currency": "CRC",
            "description": "Coffee",
            "payer_id": owner_id,
        },
    )
    assert expense.status_code == 201, expense.text
    body = expense.json()
    assert body["amount_crc"] == "10.00"
    assert body["fx_rate"] == "1.0000"
    assert body["fx_fallback"] is False


def _register_card(client: TestClient, *, label: str = "My Visa", iban: str = "CR05") -> str:
    created = client.post("/cards", json={"label": label, "iban": iban})
    assert created.status_code == 201, created.text
    return created.json()["id"]


def test_create_expense_with_card_origin(client: TestClient) -> None:
    owner_id = _register(client, "owner-origin-card@example.com")
    card_id = _register_card(client)
    created = client.post("/lists", json={"name": "Origin card"})
    list_id = created.json()["id"]

    expense = client.post(
        f"/lists/{list_id}/expenses",
        json={
            "amount": "10.00",
            "currency": "CRC",
            "description": "Groceries",
            "payer_id": owner_id,
            "origin_kind": "card",
            "origin_card_id": card_id,
        },
    )
    assert expense.status_code == 201, expense.text
    assert expense.json()["origin_kind"] == "card"
    assert expense.json()["origin_card_id"] == card_id


def test_create_expense_with_foreign_card_origin_rejected(client: TestClient) -> None:
    owner_id = _register(client, "owner-origin-foreign@example.com")
    created = client.post("/lists", json={"name": "Origin foreign card"})
    list_id = created.json()["id"]

    client.post("/auth/sign-out")
    _register(client, "stranger-origin@example.com")
    foreign_card_id = _register_card(client, label="Stranger's Card", iban="CR06")
    client.post("/auth/sign-out")
    client.post(
        "/auth/sign-in",
        json={"email": "owner-origin-foreign@example.com", "password": "password1"},
    )

    expense = client.post(
        f"/lists/{list_id}/expenses",
        json={
            "amount": "10.00",
            "currency": "CRC",
            "description": "Groceries",
            "payer_id": owner_id,
            "origin_kind": "card",
            "origin_card_id": foreign_card_id,
        },
    )
    assert expense.status_code == 422, expense.text
    assert expense.json()["code"] == "invalid_manual_expense"


def test_create_expense_with_cash_origin(client: TestClient) -> None:
    owner_id = _register(client, "owner-origin-cash@example.com")
    created = client.post("/lists", json={"name": "Origin cash"})
    list_id = created.json()["id"]

    expense = client.post(
        f"/lists/{list_id}/expenses",
        json={
            "amount": "10.00",
            "currency": "CRC",
            "description": "Groceries",
            "payer_id": owner_id,
            "origin_kind": "cash",
        },
    )
    assert expense.status_code == 201, expense.text
    assert expense.json()["origin_kind"] == "cash"
    assert expense.json()["origin_card_id"] is None


def test_create_expense_without_origin_fields_defaults_blank(client: TestClient) -> None:
    """Backward-compatible with Story 3.2's request shape — origin is optional."""
    owner_id = _register(client, "owner-origin-blank@example.com")
    created = client.post("/lists", json={"name": "Origin blank"})
    list_id = created.json()["id"]

    expense = client.post(
        f"/lists/{list_id}/expenses",
        json={
            "amount": "10.00",
            "currency": "CRC",
            "description": "Groceries",
            "payer_id": owner_id,
        },
    )
    assert expense.status_code == 201, expense.text
    assert expense.json()["origin_kind"] is None
    assert expense.json()["origin_card_id"] is None


def test_patch_expense_origin_blank_card_cash_blank(client: TestClient) -> None:
    owner_id = _register(client, "owner-origin-patch@example.com")
    card_id = _register_card(client)
    created = client.post("/lists", json={"name": "Origin patch"})
    list_id = created.json()["id"]

    expense = client.post(
        f"/lists/{list_id}/expenses",
        json={
            "amount": "10.00",
            "currency": "CRC",
            "description": "Groceries",
            "payer_id": owner_id,
        },
    )
    entry_id = expense.json()["id"]

    to_card = client.patch(
        f"/lists/{list_id}/expenses/{entry_id}/origin",
        json={"origin_kind": "card", "origin_card_id": card_id},
    )
    assert to_card.status_code == 200, to_card.text
    assert to_card.json()["origin_kind"] == "card"
    assert to_card.json()["origin_card_id"] == card_id

    to_cash = client.patch(
        f"/lists/{list_id}/expenses/{entry_id}/origin",
        json={"origin_kind": "cash"},
    )
    assert to_cash.status_code == 200, to_cash.text
    assert to_cash.json()["origin_kind"] == "cash"
    assert to_cash.json()["origin_card_id"] is None

    to_blank = client.patch(
        f"/lists/{list_id}/expenses/{entry_id}/origin",
        json={},
    )
    assert to_blank.status_code == 200, to_blank.text
    assert to_blank.json()["origin_kind"] is None
    assert to_blank.json()["origin_card_id"] is None


def test_patch_expense_origin_wrong_list_returns_404(client: TestClient) -> None:
    owner_id = _register(client, "owner-origin-wronglist@example.com")
    created_a = client.post("/lists", json={"name": "List A"})
    list_a = created_a.json()["id"]
    created_b = client.post("/lists", json={"name": "List B"})
    list_b = created_b.json()["id"]

    expense = client.post(
        f"/lists/{list_a}/expenses",
        json={
            "amount": "10.00",
            "currency": "CRC",
            "description": "Groceries",
            "payer_id": owner_id,
        },
    )
    entry_id = expense.json()["id"]

    resp = client.patch(
        f"/lists/{list_b}/expenses/{entry_id}/origin",
        json={"origin_kind": "cash"},
    )
    assert resp.status_code == 404, resp.text
    assert resp.json()["code"] == "subject_not_found"


def test_patch_expense_origin_by_non_member_forbidden(client: TestClient) -> None:
    owner_id = _register(client, "owner-origin-acl@example.com")
    created = client.post("/lists", json={"name": "Origin ACL"})
    list_id = created.json()["id"]
    expense = client.post(
        f"/lists/{list_id}/expenses",
        json={
            "amount": "10.00",
            "currency": "CRC",
            "description": "Groceries",
            "payer_id": owner_id,
        },
    )
    entry_id = expense.json()["id"]

    client.post("/auth/sign-out")
    _register(client, "stranger-origin-acl@example.com")

    resp = client.patch(
        f"/lists/{list_id}/expenses/{entry_id}/origin",
        json={"origin_kind": "cash"},
    )
    assert resp.status_code == 403, resp.text
    assert resp.json()["code"] == "not_list_member"


def test_create_expense_with_non_self_payer_forces_origin_blank(
    client: TestClient, db_session: Session
) -> None:
    """Origin belongs to the payer — an actor entering an expense for another
    member can't attach their own card as its origin (Story 4.2 follow-up)."""
    from uuid import UUID

    from adapters.persistence.models import ListMembershipModel

    _register(client, "owner-origin-non-self@example.com")
    card_id = _register_card(client)
    created = client.post("/lists", json={"name": "Origin non-self payer"})
    list_id = created.json()["id"]

    # Add second member directly (invite flow is heavier than needed here).
    payer_id = _register(client, "payer-origin-non-self@example.com")
    db_session.add(
        ListMembershipModel(
            id=uuid4(),
            list_id=UUID(list_id),
            user_id=UUID(payer_id),
            role="member",
        )
    )
    db_session.flush()

    client.post("/auth/sign-out")
    client.post(
        "/auth/sign-in",
        json={"email": "owner-origin-non-self@example.com", "password": "password1"},
    )

    expense = client.post(
        f"/lists/{list_id}/expenses",
        json={
            "amount": "10.00",
            "currency": "CRC",
            "description": "Groceries",
            "payer_id": payer_id,
            "origin_kind": "card",
            "origin_card_id": card_id,
        },
    )
    assert expense.status_code == 201, expense.text
    assert expense.json()["payer_id"] == payer_id
    assert expense.json()["origin_kind"] is None
    assert expense.json()["origin_card_id"] is None


def test_patch_expense_origin_by_non_payer_member_forbidden(
    client: TestClient, db_session: Session
) -> None:
    """Even a fellow list member can't set origin on an entry they didn't pay."""
    from uuid import UUID

    from adapters.persistence.models import ListMembershipModel

    owner_id = _register(client, "owner-origin-nonpayer@example.com")
    created = client.post("/lists", json={"name": "Origin non-payer"})
    list_id = created.json()["id"]

    member_id = _register(client, "member-origin-nonpayer@example.com")
    db_session.add(
        ListMembershipModel(
            id=uuid4(),
            list_id=UUID(list_id),
            user_id=UUID(member_id),
            role="member",
        )
    )
    db_session.flush()

    client.post("/auth/sign-out")
    client.post(
        "/auth/sign-in",
        json={"email": "owner-origin-nonpayer@example.com", "password": "password1"},
    )

    expense = client.post(
        f"/lists/{list_id}/expenses",
        json={
            "amount": "10.00",
            "currency": "CRC",
            "description": "Groceries",
            "payer_id": owner_id,
        },
    )
    entry_id = expense.json()["id"]

    client.post("/auth/sign-out")
    client.post(
        "/auth/sign-in",
        json={"email": "member-origin-nonpayer@example.com", "password": "password1"},
    )

    resp = client.patch(
        f"/lists/{list_id}/expenses/{entry_id}/origin",
        json={"origin_kind": "cash"},
    )
    assert resp.status_code == 403, resp.text
    assert resp.json()["code"] == "not_entry_payer"

    # The rejected PATCH must not have mutated the row.
    listing = client.get(f"/lists/{list_id}/expenses")
    assert listing.status_code == 200, listing.text
    persisted = next(e for e in listing.json()["expenses"] if e["id"] == entry_id)
    assert persisted["origin_kind"] is None


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


def _add_member(db_session: Session, list_id: str, user_id: str) -> None:
    from uuid import UUID

    from adapters.persistence.models import ListMembershipModel

    db_session.add(
        ListMembershipModel(
            id=uuid4(),
            list_id=UUID(list_id),
            user_id=UUID(user_id),
            role="member",
        )
    )
    db_session.flush()


def test_list_expenses_viewer_lens_percentage_payer_and_member(
    client: TestClient, db_session: Session
) -> None:
    owner_id = _register(client, "owner-lens-pct@example.com")
    created = client.post("/lists", json={"name": "Lens pct"})
    list_id = created.json()["id"]
    friend_id = _register(client, "friend-lens-pct@example.com")
    _add_member(db_session, list_id, friend_id)

    client.post("/auth/sign-out")
    client.post(
        "/auth/sign-in",
        json={"email": "owner-lens-pct@example.com", "password": "password1"},
    )
    expense = client.post(
        f"/lists/{list_id}/expenses",
        json={
            "amount": "1000.00",
            "currency": "CRC",
            "description": "Dinner",
            "payer_id": owner_id,
            "split_override": {
                "kind": "percentage",
                "percentages": {owner_id: "10.00", friend_id: "90.00"},
            },
        },
    )
    assert expense.status_code == 201, expense.text

    as_payer = client.get(f"/lists/{list_id}/expenses")
    assert as_payer.status_code == 200, as_payer.text
    row = as_payer.json()["expenses"][0]
    assert row["viewer_share_kind"] == "percentage"
    assert Decimal(row["viewer_share_value"]) == Decimal("10.00")
    assert Decimal(row["viewer_net_crc"]) == Decimal("900.00")
    assert row["viewer_net_polarity"] == "owed"

    client.post("/auth/sign-out")
    client.post(
        "/auth/sign-in",
        json={"email": "friend-lens-pct@example.com", "password": "password1"},
    )
    as_friend = client.get(f"/lists/{list_id}/expenses")
    assert as_friend.status_code == 200, as_friend.text
    friend_row = as_friend.json()["expenses"][0]
    assert Decimal(friend_row["viewer_share_value"]) == Decimal("90.00")
    assert Decimal(friend_row["viewer_net_crc"]) == Decimal("900.00")
    assert friend_row["viewer_net_polarity"] == "owe"


def test_list_expenses_viewer_lens_absolute_non_payer(
    client: TestClient, db_session: Session
) -> None:
    owner_id = _register(client, "owner-lens-abs@example.com")
    created = client.post("/lists", json={"name": "Lens abs"})
    list_id = created.json()["id"]
    friend_id = _register(client, "friend-lens-abs@example.com")
    _add_member(db_session, list_id, friend_id)

    client.post("/auth/sign-out")
    client.post(
        "/auth/sign-in",
        json={"email": "friend-lens-abs@example.com", "password": "password1"},
    )
    expense = client.post(
        f"/lists/{list_id}/expenses",
        json={
            "amount": "1000.00",
            "currency": "CRC",
            "description": "Lunch",
            "payer_id": friend_id,
            "split_override": {
                "kind": "absolute_amounts",
                "amounts": {owner_id: "400.00", friend_id: "600.00"},
            },
        },
    )
    assert expense.status_code == 201, expense.text

    client.post("/auth/sign-out")
    client.post(
        "/auth/sign-in",
        json={"email": "owner-lens-abs@example.com", "password": "password1"},
    )
    listing = client.get(f"/lists/{list_id}/expenses")
    assert listing.status_code == 200, listing.text
    row = listing.json()["expenses"][0]
    assert row["viewer_share_kind"] == "absolute"
    assert Decimal(row["viewer_share_value"]) == Decimal("400.00")
    assert Decimal(row["viewer_net_crc"]) == Decimal("400.00")
    assert row["viewer_net_polarity"] == "owe"


def test_list_expenses_even_default_two_members(client: TestClient, db_session: Session) -> None:
    owner_id = _register(client, "owner-lens-even@example.com")
    created = client.post("/lists", json={"name": "Lens even"})
    list_id = created.json()["id"]
    friend_id = _register(client, "friend-lens-even@example.com")
    _add_member(db_session, list_id, friend_id)

    client.post("/auth/sign-out")
    client.post(
        "/auth/sign-in",
        json={"email": "owner-lens-even@example.com", "password": "password1"},
    )
    expense = client.post(
        f"/lists/{list_id}/expenses",
        json={
            "amount": "1000.00",
            "currency": "CRC",
            "description": "Even split",
            "payer_id": owner_id,
        },
    )
    assert expense.status_code == 201, expense.text
    row = client.get(f"/lists/{list_id}/expenses").json()["expenses"][0]
    assert Decimal(row["viewer_share_value"]) == Decimal("50.00")
    assert Decimal(row["viewer_net_crc"]) == Decimal("500.00")
    assert row["viewer_net_polarity"] == "owed"

    client.post("/auth/sign-out")
    client.post(
        "/auth/sign-in",
        json={"email": "friend-lens-even@example.com", "password": "password1"},
    )
    friend_row = client.get(f"/lists/{list_id}/expenses").json()["expenses"][0]
    assert Decimal(friend_row["viewer_share_value"]) == Decimal("50.00")
    assert friend_row["viewer_net_polarity"] == "owe"


def test_list_expenses_origin_chip_card_privacy_and_cash(
    client: TestClient, db_session: Session
) -> None:
    owner_id = _register(client, "owner-lens-chip@example.com")
    card_id = _register_card(client, label="Kitchen card")
    created = client.post("/lists", json={"name": "Lens chip"})
    list_id = created.json()["id"]
    friend_id = _register(client, "friend-lens-chip@example.com")
    _add_member(db_session, list_id, friend_id)

    client.post("/auth/sign-out")
    client.post(
        "/auth/sign-in",
        json={"email": "owner-lens-chip@example.com", "password": "password1"},
    )
    card_expense = client.post(
        f"/lists/{list_id}/expenses",
        json={
            "amount": "10.00",
            "currency": "CRC",
            "description": "Card item",
            "payer_id": owner_id,
            "origin_kind": "card",
            "origin_card_id": card_id,
        },
    )
    assert card_expense.status_code == 201, card_expense.text
    cash_expense = client.post(
        f"/lists/{list_id}/expenses",
        json={
            "amount": "10.00",
            "currency": "CRC",
            "description": "Cash item",
            "payer_id": owner_id,
            "origin_kind": "cash",
        },
    )
    assert cash_expense.status_code == 201, cash_expense.text

    as_payer = {
        row["description"]: row
        for row in client.get(f"/lists/{list_id}/expenses").json()["expenses"]
    }
    assert as_payer["Card item"]["origin_card_label"] == "Kitchen card"
    assert as_payer["Cash item"]["origin_kind"] == "cash"
    assert as_payer["Cash item"]["origin_card_label"] is None

    client.post("/auth/sign-out")
    client.post(
        "/auth/sign-in",
        json={"email": "friend-lens-chip@example.com", "password": "password1"},
    )
    as_friend = {
        row["description"]: row
        for row in client.get(f"/lists/{list_id}/expenses").json()["expenses"]
    }
    assert as_friend["Card item"]["origin_kind"] == "card"
    assert as_friend["Card item"]["origin_card_label"] is None


def test_list_expenses_omits_lens_when_allocation_fails(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from domain.errors import InvalidSplitOverrideError

    owner_id = _register(client, "owner-lens-fail@example.com")
    created = client.post("/lists", json={"name": "Lens fail"})
    list_id = created.json()["id"]
    expense = client.post(
        f"/lists/{list_id}/expenses",
        json={
            "amount": "10.00",
            "currency": "CRC",
            "description": "Broken split",
            "payer_id": owner_id,
        },
    )
    assert expense.status_code == 201, expense.text

    def _boom(*_args, **_kwargs):
        raise InvalidSplitOverrideError("forced")

    monkeypatch.setattr("application.expenses.compute_share_allocations", _boom)
    listing = client.get(f"/lists/{list_id}/expenses")
    assert listing.status_code == 200, listing.text
    row = listing.json()["expenses"][0]
    assert row["description"] == "Broken split"
    assert Decimal(row["amount_crc"]) == Decimal("10.00")
    assert row["viewer_share_kind"] is None
    assert row["viewer_share_value"] is None
    assert row["viewer_net_crc"] is None
    assert row["viewer_net_polarity"] is None


def test_list_expenses_single_member_hides_zero_net(client: TestClient) -> None:
    owner_id = _register(client, "owner-lens-zero@example.com")
    created = client.post("/lists", json={"name": "Lens zero"})
    list_id = created.json()["id"]
    expense = client.post(
        f"/lists/{list_id}/expenses",
        json={
            "amount": "1000.00",
            "currency": "CRC",
            "description": "Solo",
            "payer_id": owner_id,
        },
    )
    assert expense.status_code == 201, expense.text
    row = client.get(f"/lists/{list_id}/expenses").json()["expenses"][0]
    assert Decimal(row["viewer_share_value"]) == Decimal("100.00")
    assert row["viewer_net_polarity"] == "zero"
    assert Decimal(row["viewer_net_crc"]) == Decimal("0")


def _seed_parser_expense(
    db: Session,
    *,
    list_id: str,
    payer_id: str,
    description: str = "Imported coffee",
) -> str:
    from datetime import UTC, date, datetime
    from uuid import UUID

    from adapters.persistence.models import LedgerEntryModel

    entry_id = uuid4()
    db.add(
        LedgerEntryModel(
            id=entry_id,
            list_id=UUID(list_id),
            amount=Decimal("10.00"),
            currency="CRC",
            normalized_description=description,
            payer_id=UUID(payer_id),
            provenance="parser",
            line_type="purchase",
            posted_date=date(2026, 8, 1),
            amount_crc=Decimal("10.00"),
            fx_rate=Decimal("1"),
            fx_fallback=False,
            created_at=datetime.now(UTC),
        )
    )
    db.flush()
    return str(entry_id)


def test_patch_origin_on_parser_row_sets_import_reviewed_at(
    client: TestClient, db_session: Session
) -> None:
    owner_id = _register(client, "owner-origin-parser-reviewed@example.com")
    created = client.post("/lists", json={"name": "Parser origin review"})
    list_id = created.json()["id"]
    entry_id = _seed_parser_expense(db_session, list_id=list_id, payer_id=owner_id)

    listing = client.get(f"/lists/{list_id}/expenses")
    assert listing.status_code == 200, listing.text
    seeded = next(e for e in listing.json()["expenses"] if e["id"] == entry_id)
    assert seeded["provenance"] == "parser"
    assert seeded["import_reviewed_at"] is None

    patched = client.patch(
        f"/lists/{list_id}/expenses/{entry_id}/origin",
        json={"origin_kind": "cash"},
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["import_reviewed_at"] is not None
    assert patched.json()["origin_kind"] == "cash"


def test_patch_expense_reviewed_happy_path_allows_non_payer_member(
    client: TestClient, db_session: Session
) -> None:
    from uuid import UUID

    from adapters.persistence.models import ListMembershipModel

    owner_id = _register(client, "owner-reviewed-nonpayer@example.com")
    created = client.post("/lists", json={"name": "Reviewed non-payer"})
    list_id = created.json()["id"]
    entry_id = _seed_parser_expense(db_session, list_id=list_id, payer_id=owner_id)

    member_id = _register(client, "member-reviewed-nonpayer@example.com")
    db_session.add(
        ListMembershipModel(
            id=uuid4(),
            list_id=UUID(list_id),
            user_id=UUID(member_id),
            role="member",
        )
    )
    db_session.flush()

    resp = client.patch(f"/lists/{list_id}/expenses/{entry_id}/reviewed")
    assert resp.status_code == 200, resp.text
    assert resp.json()["import_reviewed_at"] is not None
    assert resp.json()["id"] == entry_id


def test_patch_expense_reviewed_wrong_list_returns_404(
    client: TestClient, db_session: Session
) -> None:
    owner_id = _register(client, "owner-reviewed-wronglist@example.com")
    created_a = client.post("/lists", json={"name": "Reviewed A"})
    list_a = created_a.json()["id"]
    created_b = client.post("/lists", json={"name": "Reviewed B"})
    list_b = created_b.json()["id"]
    entry_id = _seed_parser_expense(db_session, list_id=list_a, payer_id=owner_id)

    resp = client.patch(f"/lists/{list_b}/expenses/{entry_id}/reviewed")
    assert resp.status_code == 404, resp.text
    assert resp.json()["code"] == "subject_not_found"


def test_patch_expense_reviewed_by_non_member_forbidden(
    client: TestClient, db_session: Session
) -> None:
    owner_id = _register(client, "owner-reviewed-acl@example.com")
    created = client.post("/lists", json={"name": "Reviewed ACL"})
    list_id = created.json()["id"]
    entry_id = _seed_parser_expense(db_session, list_id=list_id, payer_id=owner_id)

    client.post("/auth/sign-out")
    _register(client, "stranger-reviewed-acl@example.com")

    resp = client.patch(f"/lists/{list_id}/expenses/{entry_id}/reviewed")
    assert resp.status_code == 403, resp.text
    assert resp.json()["code"] == "not_list_member"


def test_patch_expense_reviewed_unauthenticated(client: TestClient, db_session: Session) -> None:
    owner_id = _register(client, "owner-reviewed-unauth@example.com")
    created = client.post("/lists", json={"name": "Reviewed unauth"})
    list_id = created.json()["id"]
    entry_id = _seed_parser_expense(db_session, list_id=list_id, payer_id=owner_id)

    client.post("/auth/sign-out")
    resp = client.patch(f"/lists/{list_id}/expenses/{entry_id}/reviewed")
    assert resp.status_code == 401
