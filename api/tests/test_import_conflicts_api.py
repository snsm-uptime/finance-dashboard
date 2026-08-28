"""Postgres integration for the /import-conflicts routes (Story 5.5)."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import UUID, uuid4

import pytest
from adapters.persistence.models import LedgerEntryModel
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from tests.integration_db import claim_alias, database_url

pytestmark = pytest.mark.skipif(
    database_url() is None,
    reason="DATABASE_URL not set — Postgres 16 required for integration tests",
)


def _register(client: TestClient, email: str) -> str:
    response = client.post("/auth/register", json={"email": email, "password": "password1"})
    assert response.status_code == 201, response.text
    claim_alias(client, email)
    me = client.get("/auth/me")
    assert me.status_code == 200
    return me.json()["user_id"]


def _seed_conflict(
    db_session: Session, *, actor_id: UUID, list_id: UUID
) -> tuple[UUID, UUID, UUID]:
    manual_id, parsed_id = uuid4(), uuid4()
    db_session.add(
        LedgerEntryModel(
            id=manual_id,
            list_id=list_id,
            amount=Decimal("10.00"),
            currency="CRC",
            normalized_description="Manual",
            provenance="hand",
            posted_date=date(2026, 8, 10),
            amount_crc=Decimal("10.00"),
            fx_rate=Decimal("1"),
        )
    )
    db_session.add(
        LedgerEntryModel(
            id=parsed_id,
            list_id=list_id,
            amount=Decimal("10.00"),
            currency="CRC",
            normalized_description="Parsed",
            provenance="parser",
            posted_date=date(2026, 8, 10),
            amount_crc=Decimal("10.00"),
            fx_rate=Decimal("1"),
        )
    )
    db_session.flush()

    from adapters.persistence.same_price_conflicts import SqlAlchemySamePriceConflictRepository
    from application.same_price_conflicts import (
        DetectSamePriceConflictsCommand,
        DetectSamePriceConflictsService,
    )

    repo = SqlAlchemySamePriceConflictRepository(db_session)
    DetectSamePriceConflictsService(repo).execute(
        DetectSamePriceConflictsCommand(
            actor_user_id=actor_id,
            parsed_entry_id=parsed_id,
            parsed_list_id=list_id,
            amount=Decimal("10.00"),
            currency="CRC",
            posted_date=date(2026, 8, 10),
        )
    )
    conflict = repo.list_unresolved_conflicts(actor_id)[0]
    return conflict.id, manual_id, parsed_id


def test_unauthenticated_rejected(client: TestClient) -> None:
    assert client.get("/import-conflicts").status_code == 401
    assert client.post(f"/import-conflicts/{uuid4()}/resolve", json={"resolution": "manual_survivor"}).status_code == 401


def test_list_and_resolve_manual_survivor(client: TestClient, db_session: Session) -> None:
    actor_id = UUID(_register(client, "conflict-owner@example.com"))
    list_id = client.post("/lists", json={"name": "L"}).json()["id"]
    conflict_id, manual_id, parsed_id = _seed_conflict(
        db_session, actor_id=actor_id, list_id=UUID(list_id)
    )

    queue = client.get("/import-conflicts")
    assert queue.status_code == 200, queue.text
    body = queue.json()
    assert len(body["conflicts"]) == 1
    entry = body["conflicts"][0]
    assert entry["id"] == str(conflict_id)
    assert Decimal(entry["manual"]["amount"]) == Decimal("10.00")
    assert entry["parsed"]["entry_id"] == str(parsed_id)

    resolved = client.post(
        f"/import-conflicts/{conflict_id}/resolve", json={"resolution": "manual_survivor"}
    )
    assert resolved.status_code == 204, resolved.text

    assert db_session.get(LedgerEntryModel, parsed_id) is None
    assert db_session.get(LedgerEntryModel, manual_id) is not None

    queue_after = client.get("/import-conflicts").json()
    assert queue_after["conflicts"] == []


def test_resolve_not_same_expense_without_confirm_is_422(
    client: TestClient, db_session: Session
) -> None:
    actor_id = UUID(_register(client, "conflict-escape@example.com"))
    list_id = client.post("/lists", json={"name": "L"}).json()["id"]
    conflict_id, _manual_id, _parsed_id = _seed_conflict(
        db_session, actor_id=actor_id, list_id=UUID(list_id)
    )

    resp = client.post(
        f"/import-conflicts/{conflict_id}/resolve", json={"resolution": "not_same_expense"}
    )
    assert resp.status_code == 422, resp.text


def test_resolve_unknown_conflict_is_404(client: TestClient) -> None:
    _register(client, "conflict-404@example.com")
    resp = client.post(
        f"/import-conflicts/{uuid4()}/resolve", json={"resolution": "manual_survivor"}
    )
    assert resp.status_code == 404
