"""Postgres integration for statement reassignment (Story 5.3)."""

from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import UUID, uuid4

import pytest
from adapters.persistence.models import (
    ImportBatchModel,
    ImportCandidateRowModel,
    ImportSessionModel,
    ImportStatementModel,
    LedgerEntryModel,
)
from domain.import_session import ROW_STATUS_COMMITTED, STATEMENT_STATUS_COMMITTED
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


def _seed_committed_statement(
    db_session: Session,
    *,
    actor_id: UUID,
    list_id: UUID,
    amount: Decimal = Decimal("40.00"),
) -> tuple[UUID, UUID, UUID]:
    session_id = uuid4()
    statement_id = uuid4()
    batch_id = uuid4()
    candidate_id = uuid4()
    entry_id = uuid4()
    db_session.add(ImportSessionModel(id=session_id, user_id=actor_id, content_hash="a" * 64))
    db_session.add(
        ImportStatementModel(
            id=statement_id,
            session_id=session_id,
            product_id="bac_credit",
            status=STATEMENT_STATUS_COMMITTED,
        )
    )
    db_session.flush()
    db_session.add(
        ImportCandidateRowModel(
            id=candidate_id,
            statement_id=statement_id,
            posted_date=date(2026, 1, 15),
            amount=amount,
            currency="CRC",
            line_type="purchase",
            normalized_description="Imported grocery",
            provenance="parser",
            status=ROW_STATUS_COMMITTED,
            resolved_list_id=list_id,
            resolved_at=datetime.now(UTC),
            sequence=0,
        )
    )
    db_session.add(
        ImportBatchModel(
            id=batch_id,
            session_id=session_id,
            statement_id=statement_id,
            list_id=list_id,
            actor_user_id=actor_id,
        )
    )
    db_session.flush()
    db_session.add(
        LedgerEntryModel(
            id=entry_id,
            list_id=list_id,
            amount=amount,
            currency="CRC",
            normalized_description="Imported grocery",
            payer_id=actor_id,
            provenance="parser",
            line_type="purchase",
            posted_date=date(2026, 1, 15),
            import_batch_id=batch_id,
            import_candidate_row_id=candidate_id,
            import_identity="v1:crc:grocery",
            amount_crc=amount,
            fx_rate=Decimal("1"),
            fx_rate_date=date(2026, 1, 15),
            fx_fallback=False,
            created_at=datetime.now(UTC),
        )
    )
    db_session.flush()
    return statement_id, batch_id, entry_id


def test_reassign_moves_ledger_and_balances(client: TestClient, db_session: Session) -> None:
    actor_id = UUID(_register(client, "reassign-owner@example.com"))
    list_a = client.post("/lists", json={"name": "List A"}).json()["id"]
    list_b = client.post("/lists", json={"name": "List B"}).json()["id"]
    statement_id, batch_id, entry_id = _seed_committed_statement(
        db_session, actor_id=actor_id, list_id=UUID(list_a)
    )

    moved = client.post(
        f"/lists/{list_a}/statements/{statement_id}/reassign",
        json={"destination_list_id": list_b},
    )
    assert moved.status_code == 200, moved.text
    body = moved.json()
    assert body["destination_list_id"] == list_b
    assert body["ledger_entry_ids"] == [str(entry_id)]
    assert body["batch_ids"] == [str(batch_id)]
    assert body["from_list_ids"] == [list_a]

    ledger = db_session.get(LedgerEntryModel, entry_id)
    assert ledger is not None
    assert ledger.list_id == UUID(list_b)
    assert ledger.import_batch_id == batch_id
    assert ledger.amount_crc == Decimal("40.00")
    batch = db_session.get(ImportBatchModel, batch_id)
    assert batch is not None
    assert batch.list_id == UUID(list_b)
    assert batch.id == batch_id

    expenses_a = client.get(f"/lists/{list_a}/expenses")
    expenses_b = client.get(f"/lists/{list_b}/expenses")
    assert expenses_a.status_code == 200
    assert expenses_b.status_code == 200
    assert expenses_a.json()["expenses"] == []
    rows_b = expenses_b.json()["expenses"]
    assert len(rows_b) == 1
    assert rows_b[0]["id"] == str(entry_id)
    assert rows_b[0]["statement_id"] == str(statement_id)
    assert rows_b[0]["import_batch_id"] == str(batch_id)
    assert rows_b[0]["amount"] == "40.00"

    balances_a = client.get(f"/lists/{list_a}/balances")
    balances_b = client.get(f"/lists/{list_b}/balances")
    assert balances_a.status_code == 200
    assert balances_b.status_code == 200
    assert Decimal(balances_a.json()["balance_crc"]) == Decimal("0")
    assert Decimal(balances_b.json()["balance_crc"]) == Decimal("40.00")


def test_reassign_dest_non_member_forbidden(client: TestClient, db_session: Session) -> None:
    owner_a = UUID(_register(client, "reassign-src-member@example.com"))
    list_a = client.post("/lists", json={"name": "Source"}).json()["id"]
    statement_id, _, _ = _seed_committed_statement(
        db_session, actor_id=owner_a, list_id=UUID(list_a)
    )

    client.post("/auth/sign-out")
    _register(client, "reassign-dst-owner@example.com")
    list_b = client.post("/lists", json={"name": "Dest"}).json()["id"]

    client.post("/auth/sign-out")
    client.post(
        "/auth/sign-in",
        json={"email": "reassign-src-member@example.com", "password": "password1"},
    )
    forbidden_dest = client.post(
        f"/lists/{list_a}/statements/{statement_id}/reassign",
        json={"destination_list_id": list_b},
    )
    assert forbidden_dest.status_code == 403
    assert forbidden_dest.json()["code"] == "not_list_member"


def test_reassign_stranger_forbidden(client: TestClient, db_session: Session) -> None:
    owner_a = UUID(_register(client, "reassign-src@example.com"))
    list_a = client.post("/lists", json={"name": "Source"}).json()["id"]
    statement_id, _, _ = _seed_committed_statement(
        db_session, actor_id=owner_a, list_id=UUID(list_a)
    )

    client.post("/auth/sign-out")
    _register(client, "reassign-stranger@example.com")
    list_b = client.post("/lists", json={"name": "Stranger dest"}).json()["id"]
    stranger = client.post(
        f"/lists/{list_a}/statements/{statement_id}/reassign",
        json={"destination_list_id": list_b},
    )
    assert stranger.status_code == 403
    assert stranger.json()["code"] == "not_list_member"


def test_expenses_hand_rows_have_null_statement_id(client: TestClient) -> None:
    owner_id = _register(client, "reassign-hand@example.com")
    list_id = client.post("/lists", json={"name": "Hand"}).json()["id"]
    created = client.post(
        f"/lists/{list_id}/expenses",
        json={
            "amount": "5.00",
            "currency": "CRC",
            "description": "Cash snack",
            "payer_id": owner_id,
        },
    )
    assert created.status_code == 201, created.text
    listed = client.get(f"/lists/{list_id}/expenses")
    assert listed.status_code == 200
    row = listed.json()["expenses"][0]
    assert row["statement_id"] is None
    assert row["import_batch_id"] is None
