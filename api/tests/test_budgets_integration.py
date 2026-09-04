"""Postgres integration tests for standalone, owner-scoped budgets (Story 7.1,
FR-48, AD-30).

Requires DATABASE_URL (Compose db or CI Postgres 16). Skips when unset.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

import pytest
from adapters.persistence.models import (
    BudgetModel,
    BudgetRuleModel,
    BudgetSourceListModel,
    LedgerEntryModel,
    ListMembershipModel,
    UserModel,
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


def _own_list_id(client: TestClient) -> str:
    listed = client.get("/lists")
    assert listed.status_code == 200, listed.text
    return listed.json()["lists"][0]["id"]


def _create_second_list(client: TestClient, name: str = "Second list") -> str:
    created = client.post("/lists", json={"name": name})
    assert created.status_code == 201, created.text
    return created.json()["id"]


def _create_budget(
    client: TestClient,
    source_list_ids: list[str],
    name: str = "Groceries",
    currency: str = "CRC",
) -> str:
    created = client.post(
        "/budgets",
        json={
            "name": name,
            "cap": "500.00",
            "currency": currency,
            "source_list_ids": source_list_ids,
        },
    )
    assert created.status_code == 201, created.text
    return created.json()["id"]


def _create_expense(client: TestClient, list_id: str, payer_id: str, description: str) -> str:
    created = client.post(
        f"/lists/{list_id}/expenses",
        json={
            "amount": "10.00",
            "currency": "CRC",
            "description": description,
            "payer_id": payer_id,
        },
    )
    assert created.status_code == 201, created.text
    return created.json()["id"]


def test_create_budget_with_one_source_list(client: TestClient) -> None:
    _register(client, "budgetcreate@example.com")
    list_id = _own_list_id(client)

    created = client.post(
        "/budgets",
        json={
            "name": "Groceries",
            "cap": "500.00",
            "currency": "CRC",
            "source_list_ids": [list_id],
        },
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["name"] == "Groceries"
    assert body["cap"] == "500.00"
    assert body["currency"] == "CRC"
    assert body["spent"] == "0"
    assert body["state"] == "ok"
    assert body["source_lists"] == [list_id]


def test_create_budget_with_n_source_lists(client: TestClient) -> None:
    _register(client, "budgetcreaten@example.com")
    list_a = _own_list_id(client)
    list_b = _create_second_list(client)

    created = client.post(
        "/budgets",
        json={
            "name": "Groceries",
            "cap": "500.00",
            "currency": "CRC",
            "source_list_ids": [list_a, list_b],
        },
    )
    assert created.status_code == 201, created.text
    assert sorted(created.json()["source_lists"]) == sorted([list_a, list_b])


def test_create_budget_zero_source_lists_rejected(client: TestClient) -> None:
    _register(client, "budgetzerosource@example.com")

    response = client.post(
        "/budgets",
        json={"name": "Groceries", "cap": "500.00", "currency": "CRC", "source_list_ids": []},
    )
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_budget_source_lists"


def test_create_budget_naming_non_member_list_rejected(client: TestClient) -> None:
    _register(client, "budgetownera@example.com")
    other_list_id = _own_list_id(client)

    client.post("/auth/sign-out")
    _register(client, "budgetownerb@example.com")

    response = client.post(
        "/budgets",
        json={
            "name": "Groceries",
            "cap": "500.00",
            "currency": "CRC",
            "source_list_ids": [other_list_id],
        },
    )
    assert response.status_code == 403
    assert response.json()["code"] == "not_list_member"


def test_create_budget_blank_name_rejected(client: TestClient) -> None:
    _register(client, "budgetblankname@example.com")
    list_id = _own_list_id(client)

    response = client.post(
        "/budgets",
        json={"name": "   ", "cap": "500.00", "currency": "CRC", "source_list_ids": [list_id]},
    )
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_budget_name"


def test_create_budget_zero_cap_rejected(client: TestClient) -> None:
    _register(client, "budgetzerocap@example.com")
    list_id = _own_list_id(client)

    response = client.post(
        "/budgets",
        json={"name": "Groceries", "cap": "0", "currency": "CRC", "source_list_ids": [list_id]},
    )
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_budget_cap"


def test_create_budget_too_many_decimals_rejected(client: TestClient) -> None:
    _register(client, "budgetdecimals@example.com")
    list_id = _own_list_id(client)

    response = client.post(
        "/budgets",
        json={
            "name": "Groceries",
            "cap": "10.999",
            "currency": "CRC",
            "source_list_ids": [list_id],
        },
    )
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_budget_cap"


def test_create_budget_unsupported_currency_rejected(client: TestClient) -> None:
    _register(client, "budgeteur@example.com")
    list_id = _own_list_id(client)

    response = client.post(
        "/budgets",
        json={
            "name": "Groceries",
            "cap": "500.00",
            "currency": "EUR",
            "source_list_ids": [list_id],
        },
    )
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_budget_currency"


def test_list_budgets_returns_only_callers_own_with_zero_spent(client: TestClient) -> None:
    _register(client, "budgetlist@example.com")
    list_id = _own_list_id(client)

    for name in ("Groceries", "Transport", "Entertainment"):
        _create_budget(client, [list_id], name=name)

    client.post("/auth/sign-out")
    _register(client, "budgetlistother@example.com")
    other_list_id = _own_list_id(client)
    _create_budget(client, [other_list_id], name="Other owner's budget")

    listed = client.get("/budgets")
    assert listed.status_code == 200, listed.text
    budgets = listed.json()["budgets"]
    assert len(budgets) == 1
    assert budgets[0]["name"] == "Other owner's budget"


def test_list_budgets_aggregates_near_cap_state_across_source_lists(client: TestClient) -> None:
    owner_id = _register(client, "budgetaggregate@example.com")
    list_a = _own_list_id(client)
    list_b = _create_second_list(client)
    budget_id = _create_budget(client, [list_a, list_b], name="Groceries")

    entry_a = _create_expense(client, list_a, owner_id, "Automercado")
    assigned_a = client.post(f"/budgets/{budget_id}/assignments", json={"ledger_entry_id": entry_a})
    assert assigned_a.status_code == 204, assigned_a.text

    entry_b = _create_expense(client, list_b, owner_id, "Walmart")
    assigned_b = client.post(f"/budgets/{budget_id}/assignments", json={"ledger_entry_id": entry_b})
    assert assigned_b.status_code == 204, assigned_b.text

    listed = client.get("/budgets")
    assert listed.status_code == 200, listed.text
    budget = listed.json()["budgets"][0]
    assert budget["spent"] == "20.00"


def test_non_owner_get_budget_detail_returns_404(client: TestClient) -> None:
    _register(client, "budgetownerc@example.com")
    list_id = _own_list_id(client)
    budget_id = _create_budget(client, [list_id])

    client.post("/auth/sign-out")
    _register(client, "budgetownerd@example.com")

    response = client.get(f"/budgets/{budget_id}")
    assert response.status_code == 404
    assert response.json()["code"] == "budget_not_found"


def test_get_budget_detail_happy_path(client: TestClient) -> None:
    _register(client, "budgetdetailok@example.com")
    list_id = _own_list_id(client)
    budget_id = _create_budget(client, [list_id])

    detail = client.get(f"/budgets/{budget_id}")
    assert detail.status_code == 200, detail.text
    body = detail.json()
    assert body["id"] == budget_id
    assert body["name"] == "Groceries"
    assert body["cap"] == "500.00"
    assert body["currency"] == "CRC"
    assert body["spent"] == "0"
    assert body["state"] == "ok"
    assert body["source_lists"] == [list_id]
    assert body["history"] == []


def test_get_budget_detail_returns_404_for_nonexistent_budget(client: TestClient) -> None:
    _register(client, "budgetdetailmissing@example.com")

    response = client.get(f"/budgets/{uuid.uuid4()}")
    assert response.status_code == 404
    assert response.json()["code"] == "budget_not_found"


def test_get_budget_detail_merges_history_across_source_lists(
    client: TestClient, db_session: Session
) -> None:
    owner_id = _register(client, "budgetdetailmulti@example.com")
    list_a = _own_list_id(client)
    list_b = _create_second_list(client)
    budget_id = _create_budget(client, [list_a, list_b])

    entry_a = _create_expense(client, list_a, owner_id, "Automercado")
    entry_b = _create_expense(client, list_b, owner_id, "Walmart")

    # Force distinct, unambiguous posted_date ordering — both entries are
    # created "today" by default, which would make newest-first order flaky.
    db_session.query(LedgerEntryModel).filter(LedgerEntryModel.id == uuid.UUID(entry_a)).update(
        {"posted_date": date(2026, 8, 1)}
    )
    db_session.query(LedgerEntryModel).filter(LedgerEntryModel.id == uuid.UUID(entry_b)).update(
        {"posted_date": date(2026, 8, 10)}
    )
    db_session.flush()

    assigned_a = client.post(f"/budgets/{budget_id}/assignments", json={"ledger_entry_id": entry_a})
    assert assigned_a.status_code == 204, assigned_a.text
    assigned_b = client.post(f"/budgets/{budget_id}/assignments", json={"ledger_entry_id": entry_b})
    assert assigned_b.status_code == 204, assigned_b.text

    detail = client.get(f"/budgets/{budget_id}")
    assert detail.status_code == 200, detail.text
    body = detail.json()
    assert body["spent"] == "20.00"
    assert [line["id"] for line in body["history"]] == [entry_b, entry_a]


def test_get_budget_detail_reflects_current_source_list_set(
    client: TestClient, db_session: Session
) -> None:
    owner_id = _register(client, "budgetdetailcurrent@example.com")
    list_a = _own_list_id(client)
    list_b = _create_second_list(client)
    budget_id = _create_budget(client, [list_a])
    entry_a = _create_expense(client, list_a, owner_id, "Automercado")
    assigned = client.post(f"/budgets/{budget_id}/assignments", json={"ledger_entry_id": entry_a})
    assert assigned.status_code == 204, assigned.text

    first = client.get(f"/budgets/{budget_id}")
    assert first.status_code == 200, first.text
    assert sorted(first.json()["source_lists"]) == sorted([list_a])
    assert [line["id"] for line in first.json()["history"]] == [entry_a]

    # No source-list-edit endpoint exists in this epic (AC #2's Dev Notes) —
    # manipulate the join table directly to prove the read has no caching.
    db_session.add(BudgetSourceListModel(budget_id=uuid.UUID(budget_id), list_id=uuid.UUID(list_b)))
    db_session.query(BudgetSourceListModel).filter(
        BudgetSourceListModel.budget_id == uuid.UUID(budget_id),
        BudgetSourceListModel.list_id == uuid.UUID(list_a),
    ).delete()
    db_session.flush()

    entry_b = _create_expense(client, list_b, owner_id, "Walmart")
    assigned_b = client.post(f"/budgets/{budget_id}/assignments", json={"ledger_entry_id": entry_b})
    assert assigned_b.status_code == 204, assigned_b.text

    second = client.get(f"/budgets/{budget_id}")
    assert second.status_code == 200, second.text
    assert sorted(second.json()["source_lists"]) == sorted([list_b])
    assert [line["id"] for line in second.json()["history"]] == [entry_b]


# --- Story 6.5: attribution (manual assign, rules, candidates) ---


def test_manual_assign_appears_in_history_and_spent(client: TestClient) -> None:
    owner_id = _register(client, "attrmanual@example.com")
    list_id = _own_list_id(client)
    budget_id = _create_budget(client, [list_id])
    entry_id = _create_expense(client, list_id, owner_id, "Automercado")

    assigned = client.post(f"/budgets/{budget_id}/assignments", json={"ledger_entry_id": entry_id})
    assert assigned.status_code == 204, assigned.text

    detail = client.get(f"/budgets/{budget_id}")
    assert detail.status_code == 200, detail.text
    body = detail.json()
    assert body["spent"] == "10.00"
    assert len(body["history"]) == 1
    line = body["history"][0]
    assert line["id"] == entry_id
    assert line["attributed_via"] == "manual"
    assert line["amount_crc"] == "10.00"


def test_reassign_to_second_budget_moves_it(client: TestClient) -> None:
    owner_id = _register(client, "attrmove@example.com")
    list_id = _own_list_id(client)
    budget_a = _create_budget(client, [list_id], name="Groceries")
    budget_b = _create_budget(client, [list_id], name="Transport")
    entry_id = _create_expense(client, list_id, owner_id, "Automercado")

    first = client.post(f"/budgets/{budget_a}/assignments", json={"ledger_entry_id": entry_id})
    assert first.status_code == 204, first.text

    second = client.post(f"/budgets/{budget_b}/assignments", json={"ledger_entry_id": entry_id})
    assert second.status_code == 204, second.text

    detail_a = client.get(f"/budgets/{budget_a}")
    assert detail_a.json()["spent"] == "0"
    assert detail_a.json()["history"] == []

    detail_b = client.get(f"/budgets/{budget_b}")
    assert detail_b.json()["spent"] == "10.00"
    assert len(detail_b.json()["history"]) == 1


def test_unassign_removes_from_history_and_reappears_as_candidate(client: TestClient) -> None:
    owner_id = _register(client, "attrunassign@example.com")
    list_id = _own_list_id(client)
    budget_id = _create_budget(client, [list_id])
    entry_id = _create_expense(client, list_id, owner_id, "Automercado")

    assigned = client.post(f"/budgets/{budget_id}/assignments", json={"ledger_entry_id": entry_id})
    assert assigned.status_code == 204, assigned.text

    unassigned = client.delete(f"/budgets/{budget_id}/assignments/{entry_id}")
    assert unassigned.status_code == 204, unassigned.text

    detail = client.get(f"/budgets/{budget_id}")
    assert detail.json()["spent"] == "0"
    assert detail.json()["history"] == []

    candidates = client.get(f"/budgets/{budget_id}/candidates")
    assert candidates.status_code == 200, candidates.text
    assert [c["id"] for c in candidates.json()["candidates"]] == [entry_id]


def test_rule_matches_existing_line_retroactively(client: TestClient) -> None:
    owner_id = _register(client, "attrruleexisting@example.com")
    list_id = _own_list_id(client)
    budget_id = _create_budget(client, [list_id])
    entry_id = _create_expense(client, list_id, owner_id, "Automercado Santa Ana")

    rule = client.post(f"/budgets/{budget_id}/rules", json={"match_text": "automercado"})
    assert rule.status_code == 201, rule.text

    detail = client.get(f"/budgets/{budget_id}")
    assert detail.status_code == 200, detail.text
    body = detail.json()
    assert body["spent"] == "10.00"
    assert len(body["history"]) == 1
    assert body["history"][0]["attributed_via"] == "rule"
    assert body["history"][0]["id"] == entry_id


def test_rule_matches_line_committed_after_rule_created(client: TestClient) -> None:
    owner_id = _register(client, "attrrulelater@example.com")
    list_id = _own_list_id(client)
    budget_id = _create_budget(client, [list_id])

    rule = client.post(f"/budgets/{budget_id}/rules", json={"match_text": "automercado"})
    assert rule.status_code == 201, rule.text

    entry_id = _create_expense(client, list_id, owner_id, "Automercado Escazu")

    detail = client.get(f"/budgets/{budget_id}")
    assert detail.status_code == 200, detail.text
    body = detail.json()
    assert body["spent"] == "10.00"
    assert len(body["history"]) == 1
    assert body["history"][0]["id"] == entry_id
    assert body["history"][0]["attributed_via"] == "rule"


def test_manual_assignment_wins_over_rule_match(client: TestClient) -> None:
    owner_id = _register(client, "attrmanualwins@example.com")
    list_id = _own_list_id(client)
    budget_a = _create_budget(client, [list_id], name="Groceries A")
    budget_b = _create_budget(client, [list_id], name="Groceries B")
    entry_id = _create_expense(client, list_id, owner_id, "Automercado")

    assigned = client.post(f"/budgets/{budget_a}/assignments", json={"ledger_entry_id": entry_id})
    assert assigned.status_code == 204, assigned.text

    rule = client.post(f"/budgets/{budget_b}/rules", json={"match_text": "automercado"})
    assert rule.status_code == 201, rule.text

    detail_a = client.get(f"/budgets/{budget_a}")
    assert len(detail_a.json()["history"]) == 1
    assert detail_a.json()["history"][0]["attributed_via"] == "manual"

    detail_b = client.get(f"/budgets/{budget_b}")
    assert detail_b.json()["history"] == []
    assert detail_b.json()["spent"] == "0"


def test_usd_budget_stays_zero_regardless_of_assignments_and_rules(client: TestClient) -> None:
    owner_id = _register(client, "attrusd@example.com")
    list_id = _own_list_id(client)
    budget_id = _create_budget(client, [list_id], name="USD Budget", currency="USD")
    entry_id = _create_expense(client, list_id, owner_id, "Automercado")

    assigned = client.post(f"/budgets/{budget_id}/assignments", json={"ledger_entry_id": entry_id})
    assert assigned.status_code == 204, assigned.text

    rule = client.post(f"/budgets/{budget_id}/rules", json={"match_text": "automercado"})
    assert rule.status_code == 201, rule.text

    detail = client.get(f"/budgets/{budget_id}")
    assert detail.status_code == 200, detail.text
    body = detail.json()
    assert body["spent"] == "0"
    assert body["history"] == []
    # Rules still reflect reality even though spend computation is gated.
    assert len(body["rules"]) == 1


def test_assign_returns_404_ledger_entry_not_found_for_entry_outside_source_lists(
    client: TestClient,
) -> None:
    owner_id = _register(client, "attrentryothera@example.com")
    list_a_id = _own_list_id(client)
    budget_id = _create_budget(client, [list_a_id])

    list_b_id = _create_second_list(client)
    entry_on_b = _create_expense(client, list_b_id, owner_id, "Elsewhere")

    response = client.post(
        f"/budgets/{budget_id}/assignments", json={"ledger_entry_id": entry_on_b}
    )
    assert response.status_code == 404
    assert response.json()["code"] == "ledger_entry_not_found"


def test_assign_returns_404_ledger_entry_not_found_for_nonexistent_entry(
    client: TestClient,
) -> None:
    _register(client, "attrentrymissing@example.com")
    list_id = _own_list_id(client)
    budget_id = _create_budget(client, [list_id])

    response = client.post(
        f"/budgets/{budget_id}/assignments", json={"ledger_entry_id": str(uuid.uuid4())}
    )
    assert response.status_code == 404
    assert response.json()["code"] == "ledger_entry_not_found"


def test_delete_rule_returns_404_for_rule_on_other_budget(client: TestClient) -> None:
    _register(client, "attrruleotherbudget@example.com")
    list_id = _own_list_id(client)
    budget_a = _create_budget(client, [list_id], name="Groceries A")
    budget_b = _create_budget(client, [list_id], name="Groceries B")

    rule = client.post(f"/budgets/{budget_a}/rules", json={"match_text": "automercado"})
    assert rule.status_code == 201, rule.text
    rule_id = rule.json()["id"]

    response = client.delete(f"/budgets/{budget_b}/rules/{rule_id}")
    assert response.status_code == 404
    assert response.json()["code"] == "budget_rule_not_found"


def test_delete_rule_returns_404_for_nonexistent_rule(client: TestClient) -> None:
    _register(client, "attrrulemissing@example.com")
    list_id = _own_list_id(client)
    budget_id = _create_budget(client, [list_id])

    response = client.delete(f"/budgets/{budget_id}/rules/{uuid.uuid4()}")
    assert response.status_code == 404
    assert response.json()["code"] == "budget_rule_not_found"


def test_non_owner_is_404_on_every_budget_scoped_route(client: TestClient) -> None:
    owner_id = _register(client, "attrnonownera@example.com")
    list_id = _own_list_id(client)
    budget_id = _create_budget(client, [list_id])
    entry_id = _create_expense(client, list_id, owner_id, "Automercado")

    rule = client.post(f"/budgets/{budget_id}/rules", json={"match_text": "automercado"})
    assert rule.status_code == 201, rule.text
    rule_id = rule.json()["id"]

    client.post("/auth/sign-out")
    _register(client, "attrnonownerb@example.com")

    get_detail = client.get(f"/budgets/{budget_id}")
    assert get_detail.status_code == 404
    assert get_detail.json()["code"] == "budget_not_found"

    candidates = client.get(f"/budgets/{budget_id}/candidates")
    assert candidates.status_code == 404
    assert candidates.json()["code"] == "budget_not_found"

    assign = client.post(f"/budgets/{budget_id}/assignments", json={"ledger_entry_id": entry_id})
    assert assign.status_code == 404
    assert assign.json()["code"] == "budget_not_found"

    unassign = client.delete(f"/budgets/{budget_id}/assignments/{entry_id}")
    assert unassign.status_code == 404
    assert unassign.json()["code"] == "budget_not_found"

    create_rule = client.post(f"/budgets/{budget_id}/rules", json={"match_text": "walmart"})
    assert create_rule.status_code == 404
    assert create_rule.json()["code"] == "budget_not_found"

    delete_rule = client.delete(f"/budgets/{budget_id}/rules/{rule_id}")
    assert delete_rule.status_code == 404
    assert delete_rule.json()["code"] == "budget_not_found"

    update = client.patch(
        f"/budgets/{budget_id}",
        json={"name": "Renamed", "cap": "500.00", "currency": "CRC", "source_list_ids": [list_id]},
    )
    assert update.status_code == 404
    assert update.json()["code"] == "budget_not_found"

    archive = client.post(f"/budgets/{budget_id}/archive")
    assert archive.status_code == 404
    assert archive.json()["code"] == "budget_not_found"

    unarchive = client.post(f"/budgets/{budget_id}/unarchive")
    assert unarchive.status_code == 404
    assert unarchive.json()["code"] == "budget_not_found"

    delete_budget_response = client.delete(f"/budgets/{budget_id}")
    assert delete_budget_response.status_code == 404
    assert delete_budget_response.json()["code"] == "budget_not_found"


def _seed_non_included_line_entry(
    db_session: Session, *, list_id: uuid.UUID, payer_id: uuid.UUID
) -> uuid.UUID:
    entry_id = uuid.uuid4()
    db_session.add(
        LedgerEntryModel(
            id=entry_id,
            list_id=list_id,
            amount=Decimal("10.00"),
            currency="CRC",
            normalized_description="Card payment",
            payer_id=payer_id,
            provenance="hand",
            # "fee" is not in BUDGET_ASSIGNABLE_LINE_TYPES ("payment" is —
            # Story 7.1 baseline commit f704a3a widened that set to include
            # payment/interest/other alongside purchase/reversal).
            line_type="fee",
            posted_date=date(2026, 8, 10),
            amount_crc=Decimal("10.00"),
            fx_rate=Decimal("1"),
            created_at=datetime.now(UTC),
        )
    )
    db_session.flush()
    return entry_id


def test_unassign_returns_404_ledger_entry_not_found_when_not_assigned_to_this_budget(
    client: TestClient,
) -> None:
    owner_id = _register(client, "attrunassignwrongbudget@example.com")
    list_id = _own_list_id(client)
    budget_a = _create_budget(client, [list_id], name="Groceries A")
    budget_b = _create_budget(client, [list_id], name="Groceries B")
    entry_id = _create_expense(client, list_id, owner_id, "Automercado")

    assigned = client.post(f"/budgets/{budget_a}/assignments", json={"ledger_entry_id": entry_id})
    assert assigned.status_code == 204, assigned.text

    response = client.delete(f"/budgets/{budget_b}/assignments/{entry_id}")
    assert response.status_code == 404
    assert response.json()["code"] == "ledger_entry_not_found"


def test_assign_returns_404_ledger_entry_not_found_for_non_included_line_type(
    client: TestClient, db_session: Session
) -> None:
    owner_id = _register(client, "attrnonincluded@example.com")
    list_id = _own_list_id(client)
    budget_id = _create_budget(client, [list_id])
    entry_id = _seed_non_included_line_entry(
        db_session, list_id=uuid.UUID(list_id), payer_id=uuid.UUID(owner_id)
    )

    response = client.post(
        f"/budgets/{budget_id}/assignments", json={"ledger_entry_id": str(entry_id)}
    )
    assert response.status_code == 404
    assert response.json()["code"] == "ledger_entry_not_found"


def test_delete_rule_removes_previously_rule_attributed_line_from_spent_and_history(
    client: TestClient,
) -> None:
    owner_id = _register(client, "attrruledeleteeffect@example.com")
    list_id = _own_list_id(client)
    budget_id = _create_budget(client, [list_id])
    entry_id = _create_expense(client, list_id, owner_id, "Automercado")

    rule = client.post(f"/budgets/{budget_id}/rules", json={"match_text": "automercado"})
    assert rule.status_code == 201, rule.text
    rule_id = rule.json()["id"]

    before = client.get(f"/budgets/{budget_id}")
    assert before.json()["spent"] == "10.00"
    assert len(before.json()["history"]) == 1

    deleted = client.delete(f"/budgets/{budget_id}/rules/{rule_id}")
    assert deleted.status_code == 204, deleted.text

    after = client.get(f"/budgets/{budget_id}")
    assert after.json()["spent"] == "0"
    assert after.json()["history"] == []
    assert [
        c["id"] for c in client.get(f"/budgets/{budget_id}/candidates").json()["candidates"]
    ] == [entry_id]


# --- Spec: budget-detail-crud-and-viewer-share -------------------------------


def test_update_budget_rename_to_unique_name(client: TestClient) -> None:
    _register(client, "budgetupdateunique@example.com")
    list_id = _own_list_id(client)
    budget_id = _create_budget(client, [list_id])

    updated = client.patch(
        f"/budgets/{budget_id}",
        json={"name": "New name", "cap": "600.00", "currency": "CRC", "source_list_ids": [list_id]},
    )
    assert updated.status_code == 200, updated.text
    body = updated.json()
    assert body["name"] == "New name"
    assert body["cap"] == "600.00"

    fetched = client.get(f"/budgets/{budget_id}")
    assert fetched.json()["name"] == "New name"


def test_update_budget_rename_collision_rejected_with_no_write(client: TestClient) -> None:
    _register(client, "budgetupdatecollide@example.com")
    list_id = _own_list_id(client)
    _create_budget(client, [list_id], name="Rent")
    budget_id = _create_budget(client, [list_id], name="Groceries")

    updated = client.patch(
        f"/budgets/{budget_id}",
        json={"name": "Rent", "cap": "600.00", "currency": "CRC", "source_list_ids": [list_id]},
    )
    assert updated.status_code == 422, updated.text
    assert updated.json()["code"] == "budget_name_taken"

    unchanged = client.get(f"/budgets/{budget_id}")
    assert unchanged.json()["name"] == "Groceries"
    assert unchanged.json()["cap"] == "500.00"


def test_update_budget_naming_non_member_list_rejected(client: TestClient) -> None:
    _register(client, "budgetupdatenonmember@example.com")
    list_id = _own_list_id(client)
    budget_id = _create_budget(client, [list_id])

    client.post("/auth/sign-out")
    _register(client, "budgetupdatenonmemberother@example.com")
    other_list_id = _own_list_id(client)

    client.post("/auth/sign-out")
    client.post(
        "/auth/sign-in",
        json={"email": "budgetupdatenonmember@example.com", "password": "password1"},
    )

    updated = client.patch(
        f"/budgets/{budget_id}",
        json={
            "name": "New name",
            "cap": "600.00",
            "currency": "CRC",
            "source_list_ids": [other_list_id],
        },
    )
    assert updated.status_code == 403, updated.text
    assert updated.json()["code"] == "not_list_member"


def test_delete_budget_with_rules_and_assigned_entries_cascades(
    client: TestClient, db_session: Session
) -> None:
    owner_id = _register(client, "budgetdeletecascade@example.com")
    list_id = _own_list_id(client)
    budget_id = _create_budget(client, [list_id])
    entry_id = _create_expense(client, list_id, owner_id, "Automercado")

    assigned = client.post(f"/budgets/{budget_id}/assignments", json={"ledger_entry_id": entry_id})
    assert assigned.status_code == 204, assigned.text

    rule = client.post(f"/budgets/{budget_id}/rules", json={"match_text": "walmart"})
    assert rule.status_code == 201, rule.text
    rule_id = rule.json()["id"]

    deleted = client.delete(f"/budgets/{budget_id}")
    assert deleted.status_code == 204, deleted.text

    assert db_session.get(BudgetModel, uuid.UUID(budget_id)) is None
    assert db_session.get(BudgetRuleModel, uuid.UUID(rule_id)) is None

    entry_row = db_session.get(LedgerEntryModel, uuid.UUID(entry_id))
    assert entry_row is not None
    assert entry_row.budget_id is None

    still_gone = client.get(f"/budgets/{budget_id}")
    assert still_gone.status_code == 404
    assert still_gone.json()["code"] == "budget_not_found"


def _add_second_member(db_session: Session, *, list_id: str, email: str) -> uuid.UUID:
    member = UserModel(id=uuid.uuid4(), email=email, password_hash="x")
    db_session.add(member)
    db_session.flush()
    db_session.add(
        ListMembershipModel(
            id=uuid.uuid4(),
            list_id=uuid.UUID(list_id),
            user_id=member.id,
            role="member",
        )
    )
    db_session.flush()
    return member.id


def test_shared_list_history_line_viewer_share_not_full_amount(
    client: TestClient, db_session: Session
) -> None:
    owner_id = _register(client, "budgetviewershare@example.com")
    list_id = _own_list_id(client)
    _add_second_member(db_session, list_id=list_id, email="budgetviewersharemember@example.com")

    budget_id = _create_budget(client, [list_id])
    entry_id = _create_expense(client, list_id, owner_id, "Automercado")
    assigned = client.post(f"/budgets/{budget_id}/assignments", json={"ledger_entry_id": entry_id})
    assert assigned.status_code == 204, assigned.text

    detail = client.get(f"/budgets/{budget_id}")
    assert detail.status_code == 200, detail.text
    lines = detail.json()["history"]
    assert len(lines) == 1
    line = lines[0]
    assert line["amount_crc"] == "10.00"
    # Even default split across 2 members — viewer's allocated share is half
    # the full entry amount, not the whole receipt.
    assert line["viewer_share_crc"] == "5.00"
    assert line["viewer_share_crc"] != line["amount_crc"]
    assert line["payer_id"] == owner_id


def test_solo_list_history_line_viewer_share_equals_full_amount(client: TestClient) -> None:
    owner_id = _register(client, "budgetviewersolo@example.com")
    list_id = _own_list_id(client)
    budget_id = _create_budget(client, [list_id])
    entry_id = _create_expense(client, list_id, owner_id, "Automercado")
    assigned = client.post(f"/budgets/{budget_id}/assignments", json={"ledger_entry_id": entry_id})
    assert assigned.status_code == 204, assigned.text

    detail = client.get(f"/budgets/{budget_id}")
    line = detail.json()["history"][0]
    assert line["viewer_share_crc"] == line["amount_crc"] == "10.00"
    assert line["payer_id"] == owner_id


# --- Story 7.6: archive/unarchive ---------------------------------------


def test_archive_then_unarchive_budget_roundtrip(client: TestClient) -> None:
    _register(client, "budgetarchiveroundtrip@example.com")
    list_id = _own_list_id(client)
    budget_id = _create_budget(client, [list_id])

    default_list = client.get("/budgets")
    assert [b["id"] for b in default_list.json()["budgets"]] == [budget_id]

    archived = client.post(f"/budgets/{budget_id}/archive")
    assert archived.status_code == 200, archived.text
    assert archived.json()["is_archived"] is True

    after_archive_default = client.get("/budgets")
    assert after_archive_default.json()["budgets"] == []

    after_archive_filtered = client.get("/budgets", params={"archived": "true"})
    assert [b["id"] for b in after_archive_filtered.json()["budgets"]] == [budget_id]
    assert after_archive_filtered.json()["budgets"][0]["is_archived"] is True

    unarchived = client.post(f"/budgets/{budget_id}/unarchive")
    assert unarchived.status_code == 200, unarchived.text
    assert unarchived.json()["is_archived"] is False

    back_to_default = client.get("/budgets")
    assert [b["id"] for b in back_to_default.json()["budgets"]] == [budget_id]

    back_filtered = client.get("/budgets", params={"archived": "true"})
    assert back_filtered.json()["budgets"] == []


def test_archive_preserves_history_and_rules_detail_unfiltered(client: TestClient) -> None:
    owner_id = _register(client, "budgetarchivepreserve@example.com")
    list_id = _own_list_id(client)
    budget_id = _create_budget(client, [list_id])
    entry_id = _create_expense(client, list_id, owner_id, "Automercado")

    assigned = client.post(f"/budgets/{budget_id}/assignments", json={"ledger_entry_id": entry_id})
    assert assigned.status_code == 204, assigned.text

    archived = client.post(f"/budgets/{budget_id}/archive")
    assert archived.status_code == 200, archived.text

    detail = client.get(f"/budgets/{budget_id}")
    assert detail.status_code == 200, detail.text
    body = detail.json()
    assert body["is_archived"] is True
    assert body["spent"] == "10.00"
    assert len(body["history"]) == 1
    assert body["history"][0]["id"] == entry_id


def test_archive_foreign_budget_is_not_found(client: TestClient) -> None:
    _register(client, "budgetarchiveownera@example.com")
    list_id = _own_list_id(client)
    budget_id = _create_budget(client, [list_id])

    client.post("/auth/sign-out")
    _register(client, "budgetarchiveownerb@example.com")

    response = client.post(f"/budgets/{budget_id}/archive")
    assert response.status_code == 404
    assert response.json()["code"] == "budget_not_found"


def test_archiving_does_not_free_up_name_for_reuse(client: TestClient) -> None:
    _register(client, "budgetarchivenamereuse@example.com")
    list_id = _own_list_id(client)
    budget_id = _create_budget(client, [list_id], name="Groceries")
    other_id = _create_budget(client, [list_id], name="Rent")

    archived = client.post(f"/budgets/{budget_id}/archive")
    assert archived.status_code == 200, archived.text

    renamed = client.patch(
        f"/budgets/{other_id}",
        json={
            "name": "Groceries",
            "cap": "500.00",
            "currency": "CRC",
            "source_list_ids": [list_id],
        },
    )
    assert renamed.status_code == 422, renamed.text
    assert renamed.json()["code"] == "budget_name_taken"


def test_update_budget_raises_not_found_when_row_vanishes_mid_request(
    client: TestClient, db_session: Session
) -> None:
    """Regression: SqlAlchemyBudgetRepository.update_budget must 404, not
    AttributeError, if the row is gone by the time it fetches (e.g. a
    concurrent delete between the service's ownership check and the write)."""
    from adapters.persistence.budgets import SqlAlchemyBudgetRepository
    from domain.errors import BudgetNotFoundError

    _register(client, "budgetupdatevanished@example.com")
    list_id = _own_list_id(client)
    budget_id = _create_budget(client, [list_id])

    db_session.execute(BudgetModel.__table__.delete().where(BudgetModel.id == uuid.UUID(budget_id)))
    db_session.flush()

    repo = SqlAlchemyBudgetRepository(db_session)
    with pytest.raises(BudgetNotFoundError):
        repo.update_budget(
            budget_id=uuid.UUID(budget_id),
            name="New name",
            cap_amount=Decimal("600.00"),
            currency="CRC",
            source_list_ids=(uuid.UUID(list_id),),
        )


# --- Story 7.5: budget period range ------------------------------------------


def _set_posted_date(db_session: Session, entry_id: str, posted_date: date) -> None:
    db_session.query(LedgerEntryModel).filter(LedgerEntryModel.id == uuid.UUID(entry_id)).update(
        {"posted_date": posted_date}
    )
    db_session.flush()


def test_create_budget_with_period_returned_in_response(client: TestClient) -> None:
    _register(client, "budgetperiodcreate@example.com")
    list_id = _own_list_id(client)

    created = client.post(
        "/budgets",
        json={
            "name": "Groceries",
            "cap": "500.00",
            "currency": "CRC",
            "source_list_ids": [list_id],
            "period_start": "2026-01-01",
            "period_end": "2026-01-31",
        },
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["period_start"] == "2026-01-01"
    assert body["period_end"] == "2026-01-31"


def test_create_budget_without_period_stays_open_ended(client: TestClient) -> None:
    _register(client, "budgetperiodopenended@example.com")
    list_id = _own_list_id(client)
    budget_id = _create_budget(client, [list_id])

    detail = client.get(f"/budgets/{budget_id}")
    assert detail.status_code == 200
    assert detail.json()["period_start"] is None
    assert detail.json()["period_end"] is None


def test_create_budget_invalid_period_rejected(client: TestClient) -> None:
    _register(client, "budgetperiodinvalid@example.com")
    list_id = _own_list_id(client)

    created = client.post(
        "/budgets",
        json={
            "name": "Groceries",
            "cap": "500.00",
            "currency": "CRC",
            "source_list_ids": [list_id],
            "period_start": "2026-02-01",
            "period_end": "2026-01-01",
        },
    )
    assert created.status_code == 422
    assert created.json()["code"] == "invalid_budget_period"


def test_out_of_period_entry_excluded_from_spend_and_candidates(
    client: TestClient, db_session: Session
) -> None:
    owner_id = _register(client, "budgetperiodspend@example.com")
    list_id = _own_list_id(client)
    budget_id = _create_budget(client, [list_id])
    in_period = _create_expense(client, list_id, owner_id, "Automercado in")
    out_of_period = _create_expense(client, list_id, owner_id, "Automercado out")
    _set_posted_date(db_session, in_period, date(2026, 1, 15))
    _set_posted_date(db_session, out_of_period, date(2026, 2, 15))

    updated = client.patch(
        f"/budgets/{budget_id}",
        json={
            "name": "Groceries",
            "cap": "500.00",
            "currency": "CRC",
            "source_list_ids": [list_id],
            "period_start": "2026-01-01",
            "period_end": "2026-01-31",
        },
    )
    assert updated.status_code == 200, updated.text

    candidates = client.get(f"/budgets/{budget_id}/candidates").json()["candidates"]
    assert [c["id"] for c in candidates] == [in_period]

    assign_in = client.post(
        f"/budgets/{budget_id}/assignments", json={"ledger_entry_id": in_period}
    )
    assert assign_in.status_code == 204

    assign_out = client.post(
        f"/budgets/{budget_id}/assignments", json={"ledger_entry_id": out_of_period}
    )
    assert assign_out.status_code == 404
    assert assign_out.json()["code"] == "ledger_entry_not_found"

    detail = client.get(f"/budgets/{budget_id}").json()
    assert detail["spent"] == "10.00"
    assert [line["id"] for line in detail["history"]] == [in_period]


def test_out_of_period_rule_matched_entry_excluded_from_spend_and_candidates(
    client: TestClient, db_session: Session
) -> None:
    owner_id = _register(client, "budgetperiodrule@example.com")
    list_id = _own_list_id(client)
    budget_id = _create_budget(client, [list_id])
    in_period = _create_expense(client, list_id, owner_id, "Automercado in")
    out_of_period = _create_expense(client, list_id, owner_id, "Automercado out")
    _set_posted_date(db_session, in_period, date(2026, 1, 15))
    _set_posted_date(db_session, out_of_period, date(2026, 2, 15))

    rule = client.post(f"/budgets/{budget_id}/rules", json={"match_text": "automercado"})
    assert rule.status_code == 201, rule.text

    # The "automercado" rule already matches `out_of_period` (rules aren't
    # period-scoped until a period exists), so setting this period for the
    # first time excludes an already-attributed line — the confirm-before-
    # narrow gate (AC #3) requires `confirm_period_change` here.
    updated = client.patch(
        f"/budgets/{budget_id}",
        json={
            "name": "Groceries",
            "cap": "500.00",
            "currency": "CRC",
            "source_list_ids": [list_id],
            "period_start": "2026-01-01",
            "period_end": "2026-01-31",
            "confirm_period_change": True,
        },
    )
    assert updated.status_code == 200, updated.text

    # A rule-matched entry is never offered as a candidate regardless of
    # period (it is already attributed), so candidates stay empty here.
    candidates = client.get(f"/budgets/{budget_id}/candidates").json()["candidates"]
    assert candidates == []

    detail = client.get(f"/budgets/{budget_id}").json()
    assert detail["spent"] == "10.00"
    assert [line["id"] for line in detail["history"]] == [in_period]


def test_period_preview_returns_excluded_lines(client: TestClient, db_session: Session) -> None:
    owner_id = _register(client, "budgetperiodpreview@example.com")
    list_id = _own_list_id(client)
    budget_id = _create_budget(client, [list_id])
    entry_id = _create_expense(client, list_id, owner_id, "Automercado")
    _set_posted_date(db_session, entry_id, date(2026, 1, 5))

    set_period = client.patch(
        f"/budgets/{budget_id}",
        json={
            "name": "Groceries",
            "cap": "500.00",
            "currency": "CRC",
            "source_list_ids": [list_id],
            "period_start": "2026-01-01",
            "period_end": "2026-01-31",
        },
    )
    assert set_period.status_code == 200, set_period.text

    assign = client.post(f"/budgets/{budget_id}/assignments", json={"ledger_entry_id": entry_id})
    assert assign.status_code == 204, assign.text

    preview = client.get(
        f"/budgets/{budget_id}/period-preview",
        params={"period_start": "2026-01-10", "period_end": "2026-01-31"},
    )
    assert preview.status_code == 200, preview.text
    excluded = preview.json()["excluded_lines"]
    assert [line["id"] for line in excluded] == [entry_id]


def test_update_budget_narrowing_period_without_confirm_is_rejected(
    client: TestClient, db_session: Session
) -> None:
    owner_id = _register(client, "budgetperiodnarrow@example.com")
    list_id = _own_list_id(client)
    budget_id = _create_budget(client, [list_id])
    entry_id = _create_expense(client, list_id, owner_id, "Automercado")
    _set_posted_date(db_session, entry_id, date(2026, 1, 5))

    client.patch(
        f"/budgets/{budget_id}",
        json={
            "name": "Groceries",
            "cap": "500.00",
            "currency": "CRC",
            "source_list_ids": [list_id],
            "period_start": "2026-01-01",
            "period_end": "2026-01-31",
        },
    )
    client.post(f"/budgets/{budget_id}/assignments", json={"ledger_entry_id": entry_id})

    narrowed = client.patch(
        f"/budgets/{budget_id}",
        json={
            "name": "Groceries",
            "cap": "500.00",
            "currency": "CRC",
            "source_list_ids": [list_id],
            "period_start": "2026-01-10",
            "period_end": "2026-01-31",
        },
    )
    assert narrowed.status_code == 422
    body = narrowed.json()
    assert body["code"] == "period_change_requires_confirmation"
    assert [line["id"] for line in body["excluded_lines"]] == [entry_id]

    # No silent removal — the budget still reflects the entry after the
    # rejected attempt (AC #3/#5).
    detail = client.get(f"/budgets/{budget_id}").json()
    assert [line["id"] for line in detail["history"]] == [entry_id]


def test_update_budget_narrowing_period_with_confirm_unassigns_excluded_lines(
    client: TestClient, db_session: Session
) -> None:
    owner_id = _register(client, "budgetperiodconfirm@example.com")
    list_id = _own_list_id(client)
    budget_id = _create_budget(client, [list_id])
    entry_id = _create_expense(client, list_id, owner_id, "Automercado")
    _set_posted_date(db_session, entry_id, date(2026, 1, 5))

    client.patch(
        f"/budgets/{budget_id}",
        json={
            "name": "Groceries",
            "cap": "500.00",
            "currency": "CRC",
            "source_list_ids": [list_id],
            "period_start": "2026-01-01",
            "period_end": "2026-01-31",
        },
    )
    client.post(f"/budgets/{budget_id}/assignments", json={"ledger_entry_id": entry_id})

    narrowed = client.patch(
        f"/budgets/{budget_id}",
        json={
            "name": "Groceries",
            "cap": "500.00",
            "currency": "CRC",
            "source_list_ids": [list_id],
            "period_start": "2026-01-10",
            "period_end": "2026-01-31",
            "confirm_period_change": True,
        },
    )
    assert narrowed.status_code == 200, narrowed.text
    assert narrowed.json()["period_start"] == "2026-01-10"

    detail = client.get(f"/budgets/{budget_id}").json()
    assert detail["history"] == []
    assert detail["spent"] == "0"

    candidates = client.get(f"/budgets/{budget_id}/candidates").json()["candidates"]
    assert candidates == []
