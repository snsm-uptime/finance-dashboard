"""Postgres integration tests for account preferences (Story 1.6)."""

from __future__ import annotations

import os
from collections.abc import Iterator

import pytest
from adapters.persistence.models import UserModel
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
        # Do not rollback here: this session is the shared outer test transaction.
        # RequestValidationError (422) is thrown into the generator and must not
        # wipe registration/session rows for later assertions in the same test.
        yield db_session
        db_session.flush()

    app.dependency_overrides[get_db] = _override_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def _register(client: TestClient, email: str, password: str = "password1") -> None:
    response = client.post("/auth/register", json={"email": email, "password": password})
    assert response.status_code == 201, response.text


def test_me_requires_session(client: TestClient) -> None:
    response = client.get("/auth/me")
    assert response.status_code == 401


def test_me_returns_null_prefs_when_unset(client: TestClient) -> None:
    _register(client, "prefs-default@example.com")
    response = client.get("/auth/me", headers={"Accept-Language": "es-CR,es;q=0.9"})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["language"] is None
    assert body["theme"] is None
    assert body["email"] == "prefs-default@example.com"


def test_patch_language_and_theme_persist(client: TestClient, db_session: Session) -> None:
    _register(client, "prefs-save@example.com")

    patched = client.patch("/auth/me", json={"language": "es", "theme": "dark"})
    assert patched.status_code == 200, patched.text
    body = patched.json()
    assert body["language"] == "es"
    assert body["theme"] == "dark"

    again = client.get("/auth/me", headers={"Accept-Language": "en-US"})
    assert again.status_code == 200
    assert again.json()["language"] == "es"
    assert again.json()["theme"] == "dark"

    row = db_session.scalar(select(UserModel).where(UserModel.email == "prefs-save@example.com"))
    assert row is not None
    assert row.language == "es"
    assert row.theme == "dark"


def test_patch_rejects_invalid_preferences(client: TestClient) -> None:
    _register(client, "prefs-bad@example.com")
    # Schema Literal rejects unknown values before domain (422).
    bad_lang = client.patch("/auth/me", json={"language": "fr"})
    assert bad_lang.status_code == 422

    bad_theme = client.patch("/auth/me", json={"theme": "neon"})
    assert bad_theme.status_code == 422


def test_patch_partial_preserves_other_field(client: TestClient, db_session: Session) -> None:
    _register(client, "prefs-partial@example.com")
    assert client.patch("/auth/me", json={"language": "es", "theme": "dark"}).status_code == 200

    lang_only = client.patch("/auth/me", json={"language": "en"})
    assert lang_only.status_code == 200, lang_only.text
    assert lang_only.json()["language"] == "en"
    assert lang_only.json()["theme"] == "dark"

    theme_only = client.patch("/auth/me", json={"theme": "light"})
    assert theme_only.status_code == 200, theme_only.text
    assert theme_only.json()["language"] == "en"
    assert theme_only.json()["theme"] == "light"

    row = db_session.scalar(select(UserModel).where(UserModel.email == "prefs-partial@example.com"))
    assert row is not None
    assert row.language == "en"
    assert row.theme == "light"


def test_patch_me_requires_session(client: TestClient) -> None:
    response = client.patch("/auth/me", json={"language": "en"})
    assert response.status_code == 401
