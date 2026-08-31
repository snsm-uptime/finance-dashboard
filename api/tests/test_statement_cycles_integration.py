"""Postgres integration tests for statement-cycle period selection (Story 5.9, FR-39).

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
    SamePriceConflictModel,
)
from domain.statement_cycles import current_calendar_month_window
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
    """Returns `(statement_id, session_id)` — a fresh import session backs
    each statement so both `import_statements.session_id` and
    `import_batches.session_id` FKs resolve."""
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
    origin_card_id: UUID | None = None,
    amount: Decimal = Decimal("10.00"),
    description: str = "Imported item",
) -> UUID:
    """A committed import-sourced ledger row, joined to `statement_id` via
    `import_batches` (matches the live commit shape from Story 4.x)."""
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
            line_type="purchase",
            posted_date=posted_date,
            import_batch_id=batch_id,
            origin_kind="card" if origin_card_id else None,
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
            amount_crc=amount,
            fx_rate=Decimal("1"),
            fx_rate_date=posted_date,
            fx_fallback=False,
            created_at=datetime.now(UTC),
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


def test_cycles_two_statements_most_recent_first(client: TestClient, db_session: Session) -> None:
    actor_id = _register(client, "cycles-two@example.com")
    list_id = UUID(client.post("/lists", json={"name": "Household"}).json()["id"])
    card_id = _seed_card(db_session, user_id=actor_id, label="BAC Visa", iban="CR11")

    older_statement, older_session = _seed_import_statement(
        db_session, actor_id=actor_id, card_id=card_id
    )
    newer_statement, newer_session = _seed_import_statement(
        db_session, actor_id=actor_id, card_id=card_id
    )
    _seed_committed_entry(
        db_session,
        list_id=list_id,
        actor_id=actor_id,
        statement_id=older_statement,
        session_id=older_session,
        posted_date=date(2026, 6, 5),
        origin_card_id=card_id,
    )
    _seed_committed_entry(
        db_session,
        list_id=list_id,
        actor_id=actor_id,
        statement_id=newer_statement,
        session_id=newer_session,
        posted_date=date(2026, 7, 10),
        origin_card_id=card_id,
    )

    response = client.get(f"/lists/{list_id}/cycles")
    assert response.status_code == 200, response.text
    body = response.json()
    assert [c["statement_id"] for c in body["cycles"]] == [
        str(newer_statement),
        str(older_statement),
    ]
    assert body["default_statement_id"] == str(newer_statement)
    assert body["fallback_period"] is None
    assert body["cycles"][0]["card_label"] == "BAC Visa"
    assert body["cycles"][0]["period_start"] == "2026-07-10"
    assert body["cycles"][0]["period_end"] == "2026-07-10"


def test_cycles_card_label_skips_null_first_entry(client: TestClient, db_session: Session) -> None:
    """A statement's first-posted entry can have `origin_card_id=None` (e.g. a
    hand-corrected row) while a later entry in the same statement carries the
    real card — the card label must still resolve from that later entry."""
    actor_id = _register(client, "cycles-null-first@example.com")
    list_id = UUID(client.post("/lists", json={"name": "Household"}).json()["id"])
    card_id = _seed_card(db_session, user_id=actor_id, label="BAC Visa", iban="CR12")
    statement_id, session_id = _seed_import_statement(
        db_session, actor_id=actor_id, card_id=card_id
    )
    _seed_committed_entry(
        db_session,
        list_id=list_id,
        actor_id=actor_id,
        statement_id=statement_id,
        session_id=session_id,
        posted_date=date(2026, 6, 1),
        origin_card_id=None,
    )
    _seed_committed_entry(
        db_session,
        list_id=list_id,
        actor_id=actor_id,
        statement_id=statement_id,
        session_id=session_id,
        posted_date=date(2026, 6, 15),
        origin_card_id=card_id,
    )

    response = client.get(f"/lists/{list_id}/cycles")
    assert response.status_code == 200, response.text
    body = response.json()
    assert len(body["cycles"]) == 1
    assert body["cycles"][0]["card_id"] == str(card_id)
    assert body["cycles"][0]["card_label"] == "BAC Visa"


def test_cycles_single_statement_yields_one_entry(client: TestClient, db_session: Session) -> None:
    actor_id = _register(client, "cycles-one@example.com")
    list_id = UUID(client.post("/lists", json={"name": "Household"}).json()["id"])
    statement_id, session_id = _seed_import_statement(db_session, actor_id=actor_id)
    _seed_committed_entry(
        db_session,
        list_id=list_id,
        actor_id=actor_id,
        statement_id=statement_id,
        session_id=session_id,
        posted_date=date(2026, 6, 15),
    )

    response = client.get(f"/lists/{list_id}/cycles")
    assert response.status_code == 200
    body = response.json()
    assert len(body["cycles"]) == 1
    assert body["default_statement_id"] == str(statement_id)


def test_cycles_empty_falls_back_to_calendar_month(client: TestClient, db_session: Session) -> None:
    actor_id = _register(client, "cycles-none@example.com")
    list_id = UUID(client.post("/lists", json={"name": "Household"}).json()["id"])
    _seed_hand_entry(db_session, list_id=list_id, actor_id=actor_id, posted_date=date(2026, 6, 1))

    # Captured immediately before the request (not after) to minimize the
    # already-negligible race with a midnight-in-America/Costa_Rica boundary.
    window = current_calendar_month_window()
    response = client.get(f"/lists/{list_id}/cycles")
    assert response.status_code == 200
    body = response.json()
    assert body["cycles"] == []
    assert body["default_statement_id"] is None
    assert body["fallback_period"] == {
        "start": window.period_start.isoformat(),
        "end": window.period_end.isoformat(),
    }


def test_balances_and_expenses_filtered_by_period_boundary_inclusive(
    client: TestClient, db_session: Session
) -> None:
    actor_id = _register(client, "period-filter@example.com")
    list_id = UUID(client.post("/lists", json={"name": "Household"}).json()["id"])
    statement_id, session_id = _seed_import_statement(db_session, actor_id=actor_id)
    _seed_committed_entry(
        db_session,
        list_id=list_id,
        actor_id=actor_id,
        statement_id=statement_id,
        session_id=session_id,
        posted_date=date(2026, 6, 1),
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
        amount=Decimal("30.00"),
        description="Outside window",
    )

    expenses = client.get(
        f"/lists/{list_id}/expenses",
        params={"period_start": "2026-06-01", "period_end": "2026-06-30"},
    )
    assert expenses.status_code == 200
    descriptions = {e["description"] for e in expenses.json()["expenses"]}
    assert descriptions == {"In window start", "In window end"}

    balances = client.get(
        f"/lists/{list_id}/balances",
        params={"period_start": "2026-06-01", "period_end": "2026-06-30"},
    )
    assert balances.status_code == 200
    assert balances.json()["balance_crc"] == "0.00"  # sole member — always net zero


def test_incomplete_disclosure_respects_selected_period(
    client: TestClient, db_session: Session
) -> None:
    actor_id = _register(client, "period-conflict@example.com")
    list_id = UUID(client.post("/lists", json={"name": "Household"}).json()["id"])

    manual_id = _seed_hand_entry(
        db_session, list_id=list_id, actor_id=actor_id, posted_date=date(2026, 6, 15)
    )
    statement_id, session_id = _seed_import_statement(db_session, actor_id=actor_id)
    parsed_id = _seed_committed_entry(
        db_session,
        list_id=list_id,
        actor_id=actor_id,
        statement_id=statement_id,
        session_id=session_id,
        posted_date=date(2026, 6, 15),
    )
    _seed_conflict(
        db_session,
        manual_entry_id=manual_id,
        parsed_entry_id=parsed_id,
        manual_list_id=list_id,
        parsed_list_id=list_id,
    )

    outside = client.get(
        f"/lists/{list_id}/balances",
        params={"period_start": "2026-07-01", "period_end": "2026-07-31"},
    )
    assert outside.status_code == 200
    assert outside.json()["balance_status"] == {"is_incomplete": False}

    inside = client.get(
        f"/lists/{list_id}/balances",
        params={"period_start": "2026-06-01", "period_end": "2026-06-30"},
    )
    assert inside.status_code == 200
    assert inside.json()["balance_status"] == {"is_incomplete": True}


def test_period_start_after_period_end_is_400(client: TestClient, db_session: Session) -> None:
    _register(client, "period-invalid@example.com")
    list_id = client.post("/lists", json={"name": "Household"}).json()["id"]

    balances = client.get(
        f"/lists/{list_id}/balances",
        params={"period_start": "2026-07-31", "period_end": "2026-07-01"},
    )
    assert balances.status_code == 400
    assert balances.json()["code"] == "invalid_period"

    expenses = client.get(
        f"/lists/{list_id}/expenses",
        params={"period_start": "2026-07-31", "period_end": "2026-07-01"},
    )
    assert expenses.status_code == 400
    assert expenses.json()["code"] == "invalid_period"


def test_non_member_cycles_access_denied(client: TestClient, db_session: Session) -> None:
    _register(client, "cycles-owner@example.com")
    list_id = client.post("/lists", json={"name": "Household"}).json()["id"]

    client.post("/auth/sign-out")
    _register(client, "cycles-stranger@example.com")
    response = client.get(f"/lists/{list_id}/cycles")
    assert response.status_code == 404, response.text
    assert response.json()["code"] == "list_not_found"
