"""Postgres integration tests for list create/rename (Story 2.1).

Requires DATABASE_URL (Compose db or CI Postgres 16). Skips when unset.
"""

from __future__ import annotations

import os
from collections.abc import Iterator
from uuid import UUID, uuid4

import pytest
from adapters.persistence.models import ListMembershipModel, ListModel
from api.app import create_app
from api.deps import get_db
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker


def _database_url() -> str | None:
    return (os.environ.get("DATABASE_URL") or "").strip() or None


pytestmark = pytest.mark.skipif(
    _database_url() is None,
    reason="DATABASE_URL not set — Postgres 16 required for integration tests",
)


@pytest.fixture(scope="module")
def engine() -> Iterator[Engine]:
    url = _database_url()
    assert url is not None
    eng = create_engine(url, pool_pre_ping=True)
    from alembic import command
    from alembic.config import Config

    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", url)
    command.upgrade(cfg, "head")
    yield eng
    eng.dispose()


@pytest.fixture
def db_session(engine: Engine) -> Iterator[Session]:
    connection = engine.connect()
    transaction = connection.begin()
    session = sessionmaker(bind=connection, autoflush=False, autocommit=False)()
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture
def client(db_session: Session, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    monkeypatch.setenv("SESSION_SECRET", "test-session-secret-not-for-prod")
    monkeypatch.setenv("SESSION_COOKIE_SECURE", "false")
    monkeypatch.setenv("EMAIL_VERIFICATION_REQUIRED", "false")
    monkeypatch.setenv("SESSION_COOKIE_NAME", "fh_session")

    app = create_app()

    def _override_db() -> Iterator[Session]:
        try:
            yield db_session
            db_session.flush()
        except Exception:
            db_session.rollback()
            raise

    app.dependency_overrides[get_db] = _override_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def _register(client: TestClient, email: str) -> None:
    response = client.post(
        "/auth/register",
        json={"email": email, "password": "password1"},
    )
    assert response.status_code == 201, response.text


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


def test_non_member_and_non_owner_rename_denied(
    client: TestClient, db_session: Session
) -> None:
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
    response = client.post("/lists", json={"name": "   "})
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_list_name"
