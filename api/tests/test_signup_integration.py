"""Postgres integration tests for signup (Story 1.2).

Requires DATABASE_URL (Compose db or CI Postgres 16). Skips when unset.
"""

from __future__ import annotations

import os
from collections.abc import Iterator

import pytest
from adapters.persistence.models import ListMembershipModel, ListModel, SessionModel, UserModel
from adapters.persistence.password_hasher import Argon2PasswordHasher
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
    monkeypatch.setenv("AUTH_RATE_LIMIT_REGISTER_MAX", "10000")
    monkeypatch.setenv("AUTH_RATE_LIMIT_SIGN_IN_MAX", "10000")
    monkeypatch.setenv("AUTH_RATE_LIMIT_PASSWORD_RESET_REQUEST_MAX", "10000")
    monkeypatch.setenv("AUTH_RATE_LIMIT_VERIFY_REQUEST_MAX", "10000")

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


def test_register_hashes_password_sets_cookie_creates_personal_list(
    client: TestClient, db_session: Session
) -> None:
    response = client.post(
        "/auth/register",
        json={"email": "member@example.com", "password": "password1"},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["email"] == "member@example.com"
    assert body["list_name"] == "Personal"
    assert "password" not in body
    assert "password_hash" not in body

    assert "fh_session" in response.cookies
    cookie = response.cookies["fh_session"]
    assert cookie

    user = db_session.scalar(select(UserModel).where(UserModel.email == "member@example.com"))
    assert user is not None
    assert user.password_hash != "password1"
    assert user.password_hash.startswith("$argon2")
    assert Argon2PasswordHasher().verify("password1", user.password_hash)

    lists = list(db_session.scalars(select(ListModel).where(ListModel.owner_id == user.id)))
    assert len(lists) == 1
    memberships = list(
        db_session.scalars(
            select(ListMembershipModel).where(ListMembershipModel.user_id == user.id)
        )
    )
    assert len(memberships) == 1
    assert memberships[0].list_id == lists[0].id
    assert memberships[0].role == "owner"

    session_row = db_session.scalar(select(SessionModel).where(SessionModel.token == cookie))
    assert session_row is not None
    assert session_row.user_id == user.id


def test_register_rejects_duplicate_email(client: TestClient) -> None:
    first = client.post(
        "/auth/register",
        json={"email": "dup@example.com", "password": "password1"},
    )
    assert first.status_code == 201
    second = client.post(
        "/auth/register",
        json={"email": "Dup@Example.com", "password": "password2"},
    )
    assert second.status_code == 409
    assert second.json()["code"] == "duplicate_email"


def test_register_fr4_off_no_verification_step(client: TestClient) -> None:
    response = client.post(
        "/auth/register",
        json={"email": "ready@example.com", "password": "password1"},
    )
    assert response.status_code == 201
    # No verification challenge in body — immediately authenticated via cookie.
    assert "fh_session" in response.cookies
    assert "verification" not in response.text.lower()


def test_health_still_ok(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_session_endpoint_requires_cookie(client: TestClient) -> None:
    response = client.get("/auth/session")
    assert response.status_code == 401


def test_session_endpoint_returns_user_after_register(client: TestClient) -> None:
    registered = client.post(
        "/auth/register",
        json={"email": "sessioned@example.com", "password": "password1"},
    )
    assert registered.status_code == 201
    response = client.get("/auth/session")
    assert response.status_code == 200
    body = response.json()
    assert body["authenticated"] is True
    assert body["user_id"] == registered.json()["user_id"]


def test_password_never_logged_as_plaintext(
    client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level("INFO"):
        client.post(
            "/auth/register",
            json={"email": "logcheck@example.com", "password": "super-secret-pass"},
        )
    joined = " ".join(r.message for r in caplog.records)
    assert "super-secret-pass" not in joined
