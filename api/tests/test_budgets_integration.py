"""Postgres integration tests for budget create/list (Story 6.3, FR-48).

Requires DATABASE_URL (Compose db or CI Postgres 16). Skips when unset.
"""

from __future__ import annotations

import uuid

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
    claim_alias(client, email)


def _own_list_id(client: TestClient) -> str:
    listed = client.get("/lists")
    assert listed.status_code == 200, listed.text
    return listed.json()["lists"][0]["id"]


def test_create_budget_valid(client: TestClient) -> None:
    _register(client, "budgetcreate@example.com")
    list_id = _own_list_id(client)

    created = client.post(
        f"/lists/{list_id}/budgets",
        json={"name": "Groceries", "cap": "500.00", "currency": "CRC"},
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["name"] == "Groceries"
    assert body["cap"] == "500.00"
    assert body["currency"] == "CRC"
    assert body["spent"] == "0"
    assert body["state"] == "ok"
    assert body["list_id"] == list_id


def test_create_budget_blank_name_rejected(client: TestClient) -> None:
    _register(client, "budgetblankname@example.com")
    list_id = _own_list_id(client)

    response = client.post(
        f"/lists/{list_id}/budgets",
        json={"name": "   ", "cap": "500.00", "currency": "CRC"},
    )
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_budget_name"


def test_create_budget_zero_cap_rejected(client: TestClient) -> None:
    _register(client, "budgetzerocap@example.com")
    list_id = _own_list_id(client)

    response = client.post(
        f"/lists/{list_id}/budgets",
        json={"name": "Groceries", "cap": "0", "currency": "CRC"},
    )
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_budget_cap"


def test_create_budget_too_many_decimals_rejected(client: TestClient) -> None:
    _register(client, "budgetdecimals@example.com")
    list_id = _own_list_id(client)

    response = client.post(
        f"/lists/{list_id}/budgets",
        json={"name": "Groceries", "cap": "10.999", "currency": "CRC"},
    )
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_budget_cap"


def test_create_budget_unsupported_currency_rejected(client: TestClient) -> None:
    _register(client, "budgeteur@example.com")
    list_id = _own_list_id(client)

    response = client.post(
        f"/lists/{list_id}/budgets",
        json={"name": "Groceries", "cap": "500.00", "currency": "EUR"},
    )
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_budget_currency"


def test_list_budgets_returns_all_with_zero_spent(client: TestClient) -> None:
    _register(client, "budgetlist@example.com")
    list_id = _own_list_id(client)

    for name in ("Groceries", "Transport", "Entertainment"):
        created = client.post(
            f"/lists/{list_id}/budgets",
            json={"name": name, "cap": "100.00", "currency": "CRC"},
        )
        assert created.status_code == 201, created.text

    listed = client.get(f"/lists/{list_id}/budgets")
    assert listed.status_code == 200, listed.text
    budgets = listed.json()["budgets"]
    assert len(budgets) == 3
    for budget in budgets:
        assert budget["spent"] == "0"
        assert budget["state"] == "ok"


def test_non_member_get_budgets_returns_404(client: TestClient) -> None:
    _register(client, "budgetownera@example.com")
    list_id = _own_list_id(client)

    client.post("/auth/sign-out")
    _register(client, "budgetownerb@example.com")

    response = client.get(f"/lists/{list_id}/budgets")
    assert response.status_code == 404
    assert response.json()["code"] == "list_not_found"


def test_non_member_post_budgets_returns_403(client: TestClient) -> None:
    _register(client, "budgetownerc@example.com")
    list_id = _own_list_id(client)

    client.post("/auth/sign-out")
    _register(client, "budgetownerd@example.com")

    response = client.post(
        f"/lists/{list_id}/budgets",
        json={"name": "Groceries", "cap": "500.00", "currency": "CRC"},
    )
    assert response.status_code == 403
    assert response.json()["code"] == "not_list_member"


def test_get_budget_detail_happy_path(client: TestClient) -> None:
    _register(client, "budgetdetailok@example.com")
    list_id = _own_list_id(client)

    created = client.post(
        f"/lists/{list_id}/budgets",
        json={"name": "Groceries", "cap": "500.00", "currency": "CRC"},
    )
    assert created.status_code == 201, created.text
    budget_id = created.json()["id"]

    detail = client.get(f"/lists/{list_id}/budgets/{budget_id}")
    assert detail.status_code == 200, detail.text
    body = detail.json()
    assert body["id"] == budget_id
    assert body["list_id"] == list_id
    assert body["name"] == "Groceries"
    assert body["cap"] == "500.00"
    assert body["currency"] == "CRC"
    assert body["spent"] == "0"
    assert body["state"] == "ok"
    assert body["history"] == []


def test_get_budget_detail_returns_404_for_budget_on_other_list(client: TestClient) -> None:
    _register(client, "budgetdetailownera@example.com")
    list_a_id = _own_list_id(client)
    created = client.post(
        f"/lists/{list_a_id}/budgets",
        json={"name": "Groceries", "cap": "500.00", "currency": "CRC"},
    )
    assert created.status_code == 201, created.text
    budget_on_a_id = created.json()["id"]

    create_response = client.post("/lists", json={"name": "Second list"})
    assert create_response.status_code == 201, create_response.text
    list_b_id = create_response.json()["id"]

    response = client.get(f"/lists/{list_b_id}/budgets/{budget_on_a_id}")
    assert response.status_code == 404
    assert response.json()["code"] == "budget_not_found"


def test_get_budget_detail_returns_404_for_nonexistent_budget(client: TestClient) -> None:
    _register(client, "budgetdetailmissing@example.com")
    list_id = _own_list_id(client)

    response = client.get(f"/lists/{list_id}/budgets/{uuid.uuid4()}")
    assert response.status_code == 404
    assert response.json()["code"] == "budget_not_found"


def test_get_budget_detail_non_member_returns_404(client: TestClient) -> None:
    _register(client, "budgetdetailownerc@example.com")
    list_id = _own_list_id(client)
    created = client.post(
        f"/lists/{list_id}/budgets",
        json={"name": "Groceries", "cap": "500.00", "currency": "CRC"},
    )
    assert created.status_code == 201, created.text
    budget_id = created.json()["id"]

    client.post("/auth/sign-out")
    _register(client, "budgetdetailownerd@example.com")

    response = client.get(f"/lists/{list_id}/budgets/{budget_id}")
    assert response.status_code == 404
    assert response.json()["code"] == "list_not_found"
