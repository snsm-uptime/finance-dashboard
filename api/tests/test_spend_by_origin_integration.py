"""Postgres integration tests for the spend-by-origin read (Story 6.2, FR-47).

Requires DATABASE_URL (Compose db or CI Postgres 16). Skips when unset.
"""

from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import UUID, uuid4

import pytest
from adapters.persistence.models import (
    CardModel,
    ImportBatchModel,
    ImportSessionModel,
    ImportStatementModel,
    LedgerEntryModel,
)
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from tests.integration_db import claim_alias, database_url

pytestmark = pytest.mark.skipif(
    database_url() is None,
    reason="DATABASE_URL not set — Postgres 16 required for integration tests",
)


def _register(client: TestClient, email: str) -> UUID:
    response = client.post("/auth/register", json={"email": email, "password": "password1"})
    assert response.status_code == 201, response.text
    claim_alias(client, email)
    me = client.get("/auth/me")
    assert me.status_code == 200
    return UUID(me.json()["user_id"])


def _seed_card(db_session: Session, *, user_id: UUID, label: str, iban: str) -> UUID:
    card_id = uuid4()
    db_session.add(CardModel(id=card_id, user_id=user_id, label=label, iban=iban))
    db_session.flush()
    return card_id


def _seed_import_session(db_session: Session, *, actor_id: UUID) -> UUID:
    session_id = uuid4()
    db_session.add(ImportSessionModel(id=session_id, user_id=actor_id, content_hash="a" * 64))
    db_session.flush()
    return session_id


def _seed_import_statement(
    db_session: Session,
    *,
    actor_id: UUID,
    card_id: UUID | None = None,
    product_id: str = "bac_credit",
) -> tuple[UUID, UUID]:
    session_id = _seed_import_session(db_session, actor_id=actor_id)
    statement_id = uuid4()
    db_session.add(
        ImportStatementModel(
            id=statement_id,
            session_id=session_id,
            product_id=product_id,
            status="committed",
            card_id=card_id,
        )
    )
    db_session.flush()
    return statement_id, session_id


def _seed_committed_entry(
    db_session: Session,
    *,
    list_id: UUID,
    actor_id: UUID,
    statement_id: UUID,
    session_id: UUID,
    posted_date: date,
    origin_kind: str | None = None,
    origin_card_id: UUID | None = None,
    line_type: str = "purchase",
    amount: Decimal = Decimal("10.00"),
    description: str = "Imported item",
) -> UUID:
    batch_id = uuid4()
    entry_id = uuid4()
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
            normalized_description=description,
            payer_id=actor_id,
            provenance="parser",
            line_type=line_type,
            posted_date=posted_date,
            import_batch_id=batch_id,
            origin_kind=origin_kind,
            origin_card_id=origin_card_id,
            amount_crc=amount,
            fx_rate=Decimal("1"),
            fx_rate_date=posted_date,
            fx_fallback=False,
            created_at=datetime.now(UTC),
        )
    )
    db_session.flush()
    return entry_id


def _seed_hand_entry(
    db_session: Session,
    *,
    list_id: UUID,
    actor_id: UUID,
    posted_date: date,
    origin_kind: str | None = None,
    origin_card_id: UUID | None = None,
    amount: Decimal = Decimal("5.00"),
    description: str = "Hand entry",
) -> UUID:
    entry_id = uuid4()
    db_session.add(
        LedgerEntryModel(
            id=entry_id,
            list_id=list_id,
            amount=amount,
            currency="CRC",
            normalized_description=description,
            payer_id=actor_id,
            provenance="hand",
            line_type="purchase",
            posted_date=posted_date,
            origin_kind=origin_kind,
            origin_card_id=origin_card_id,
            amount_crc=amount,
            fx_rate=Decimal("1"),
            fx_rate_date=posted_date,
            fx_fallback=False,
            created_at=datetime.now(UTC),
        )
    )
    db_session.flush()
    return entry_id


def test_origin_spend_four_groups_with_correct_totals(
    client: TestClient, db_session: Session
) -> None:
    actor_id = _register(client, "origin-spend@example.com")
    list_id = UUID(client.post("/lists", json={"name": "Solo"}).json()["id"])
    card_a = _seed_card(db_session, user_id=actor_id, label="BAC Visa", iban="CR21")
    card_b = _seed_card(db_session, user_id=actor_id, label="Promerica MC", iban="CR22")

    statement_a, session_a = _seed_import_statement(db_session, actor_id=actor_id, card_id=card_a)
    statement_b, session_b = _seed_import_statement(db_session, actor_id=actor_id, card_id=card_b)

    _seed_committed_entry(
        db_session,
        list_id=list_id,
        actor_id=actor_id,
        statement_id=statement_a,
        session_id=session_a,
        posted_date=date(2026, 6, 5),
        origin_kind="card",
        origin_card_id=card_a,
        amount=Decimal("100.00"),
    )
    _seed_committed_entry(
        db_session,
        list_id=list_id,
        actor_id=actor_id,
        statement_id=statement_b,
        session_id=session_b,
        posted_date=date(2026, 6, 6),
        origin_kind="card",
        origin_card_id=card_b,
        amount=Decimal("40.00"),
    )
    _seed_hand_entry(
        db_session,
        list_id=list_id,
        actor_id=actor_id,
        posted_date=date(2026, 6, 7),
        origin_kind="cash",
        amount=Decimal("20.00"),
    )
    _seed_hand_entry(
        db_session,
        list_id=list_id,
        actor_id=actor_id,
        posted_date=date(2026, 6, 8),
        origin_kind=None,
        amount=Decimal("5.00"),
    )

    response = client.get(f"/lists/{list_id}/origin-spend")
    assert response.status_code == 200, response.text
    body = response.json()
    assert len(body["origins"]) == 4

    card_groups = {o["card_id"]: o["total_crc"] for o in body["origins"] if o["kind"] == "card"}
    assert card_groups == {str(card_a): "100.00", str(card_b): "40.00"}
    cash_group = next(o for o in body["origins"] if o["kind"] == "cash")
    assert cash_group["total_crc"] == "20.00"
    blank_group = next(o for o in body["origins"] if o["kind"] == "blank")
    assert blank_group["total_crc"] == "5.00"

    labels = {o["card_id"]: o["card_label"] for o in body["origins"] if o["kind"] == "card"}
    assert labels == {str(card_a): "BAC Visa", str(card_b): "Promerica MC"}


def test_non_included_line_type_excluded_from_totals(
    client: TestClient, db_session: Session
) -> None:
    actor_id = _register(client, "origin-spend-excl@example.com")
    list_id = UUID(client.post("/lists", json={"name": "Solo"}).json()["id"])
    card_id = _seed_card(db_session, user_id=actor_id, label="BAC Visa", iban="CR23")
    statement_id, session_id = _seed_import_statement(
        db_session, actor_id=actor_id, card_id=card_id
    )

    _seed_committed_entry(
        db_session,
        list_id=list_id,
        actor_id=actor_id,
        statement_id=statement_id,
        session_id=session_id,
        posted_date=date(2026, 6, 5),
        origin_kind="card",
        origin_card_id=card_id,
        line_type="purchase",
        amount=Decimal("100.00"),
    )
    _seed_committed_entry(
        db_session,
        list_id=list_id,
        actor_id=actor_id,
        statement_id=statement_id,
        session_id=session_id,
        posted_date=date(2026, 6, 6),
        origin_kind="card",
        origin_card_id=card_id,
        line_type="payment",
        amount=Decimal("500.00"),
    )
    _seed_committed_entry(
        db_session,
        list_id=list_id,
        actor_id=actor_id,
        statement_id=statement_id,
        session_id=session_id,
        posted_date=date(2026, 6, 7),
        origin_kind="card",
        origin_card_id=card_id,
        line_type="fee",
        amount=Decimal("2.00"),
    )

    response = client.get(f"/lists/{list_id}/origin-spend")
    assert response.status_code == 200, response.text
    body = response.json()
    assert len(body["origins"]) == 1
    assert body["origins"][0]["total_crc"] == "100.00"


def test_origin_spend_narrowed_by_period_boundary_inclusive(
    client: TestClient, db_session: Session
) -> None:
    actor_id = _register(client, "origin-spend-period@example.com")
    list_id = UUID(client.post("/lists", json={"name": "Solo"}).json()["id"])
    statement_id, session_id = _seed_import_statement(db_session, actor_id=actor_id)

    _seed_committed_entry(
        db_session,
        list_id=list_id,
        actor_id=actor_id,
        statement_id=statement_id,
        session_id=session_id,
        posted_date=date(2026, 6, 1),
        origin_kind="cash",
        amount=Decimal("10.00"),
        description="In window start",
    )
    _seed_committed_entry(
        db_session,
        list_id=list_id,
        actor_id=actor_id,
        statement_id=statement_id,
        session_id=session_id,
        posted_date=date(2026, 6, 30),
        origin_kind="cash",
        amount=Decimal("20.00"),
        description="In window end",
    )
    _seed_committed_entry(
        db_session,
        list_id=list_id,
        actor_id=actor_id,
        statement_id=statement_id,
        session_id=session_id,
        posted_date=date(2026, 7, 1),
        origin_kind="cash",
        amount=Decimal("30.00"),
        description="Outside window",
    )

    narrowed = client.get(
        f"/lists/{list_id}/origin-spend",
        params={"period_start": "2026-06-01", "period_end": "2026-06-30"},
    )
    assert narrowed.status_code == 200, narrowed.text
    body = narrowed.json()
    assert len(body["origins"]) == 1
    assert body["origins"][0]["total_crc"] == "30.00"
    assert body["period_start"] == "2026-06-01"
    assert body["period_end"] == "2026-06-30"

    full = client.get(f"/lists/{list_id}/origin-spend")
    assert full.status_code == 200
    full_body = full.json()
    assert len(full_body["origins"]) == 1
    assert full_body["origins"][0]["total_crc"] == "60.00"


def test_origin_spend_no_purchases_in_period_yields_empty_origins(
    client: TestClient, db_session: Session
) -> None:
    actor_id = _register(client, "origin-spend-empty@example.com")
    list_id = UUID(client.post("/lists", json={"name": "Solo"}).json()["id"])
    statement_id, session_id = _seed_import_statement(db_session, actor_id=actor_id)
    _seed_committed_entry(
        db_session,
        list_id=list_id,
        actor_id=actor_id,
        statement_id=statement_id,
        session_id=session_id,
        posted_date=date(2026, 6, 1),
        origin_kind="cash",
        amount=Decimal("10.00"),
    )

    response = client.get(
        f"/lists/{list_id}/origin-spend",
        params={"period_start": "2026-08-01", "period_end": "2026-08-31"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["origins"] == []


def test_non_member_origin_spend_access_denied(client: TestClient, db_session: Session) -> None:
    _register(client, "origin-spend-owner@example.com")
    list_id = client.post("/lists", json={"name": "Household"}).json()["id"]

    client.post("/auth/sign-out")
    _register(client, "origin-spend-stranger@example.com")
    response = client.get(f"/lists/{list_id}/origin-spend")
    assert response.status_code == 404, response.text
    assert response.json()["code"] == "list_not_found"


def test_origin_spend_period_start_after_period_end_is_400(
    client: TestClient, db_session: Session
) -> None:
    _register(client, "origin-spend-invalid-period@example.com")
    list_id = client.post("/lists", json={"name": "Household"}).json()["id"]

    response = client.get(
        f"/lists/{list_id}/origin-spend",
        params={"period_start": "2026-07-31", "period_end": "2026-07-01"},
    )
    assert response.status_code == 400
    assert response.json()["code"] == "invalid_period"
