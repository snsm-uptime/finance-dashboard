"""Postgres integration tests for password reset (Story 1.4).

Requires DATABASE_URL (Compose db or CI Postgres 16). Skips when unset.
"""

from __future__ import annotations

import os
from collections.abc import Iterator

import pytest
from adapters.persistence.models import PasswordResetTokenModel, SessionModel, UserModel
from api.app import create_app
from api.deps import get_db
from application.ports import EmailMessage
from domain.password_reset import hash_reset_token
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


class CapturingMailer:
    def __init__(self) -> None:
        self.sent: list[EmailMessage] = []
        self.fail: Exception | None = None

    def send(self, message: EmailMessage) -> None:
        if self.fail is not None:
            raise self.fail
        self.sent.append(message)


@pytest.fixture
def mailer() -> CapturingMailer:
    return CapturingMailer()


@pytest.fixture
def client(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
    mailer: CapturingMailer,
) -> Iterator[TestClient]:
    monkeypatch.setenv("SESSION_SECRET", "test-session-secret-not-for-prod")
    monkeypatch.setenv("SESSION_COOKIE_SECURE", "false")
    monkeypatch.setenv("EMAIL_VERIFICATION_REQUIRED", "false")
    monkeypatch.setenv("SESSION_COOKIE_NAME", "fh_session")
    monkeypatch.setenv("PUBLIC_APP_URL", "http://localhost:3000")
    monkeypatch.setenv("SMTP_HOST", "smtp.test")
    monkeypatch.setenv("SMTP_FROM", "noreply@example.com")

    from adapters import email as email_pkg
    from adapters.email import settings as email_settings
    from api.routes import auth as auth_routes

    monkeypatch.setattr(
        auth_routes,
        "SmtpEmailSender",
        lambda _settings: mailer,
    )
    monkeypatch.setattr(
        auth_routes,
        "load_smtp_settings",
        email_settings.load_smtp_settings,
    )
    # Keep import surface stable if routes import SmtpEmailSender from package.
    monkeypatch.setattr(email_pkg, "SmtpEmailSender", lambda _settings: mailer)

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


def _register(client: TestClient, email: str, password: str = "password1") -> None:
    response = client.post("/auth/register", json={"email": email, "password": password})
    assert response.status_code == 201, response.text
    client.cookies.clear()


def _extract_token(mailer: CapturingMailer) -> str:
    assert len(mailer.sent) == 1
    body = mailer.sent[0].body_text
    marker = "token="
    assert marker in body
    return body.split(marker, 1)[1].split()[0].strip()


def test_request_reset_unknown_email_same_ack_no_mail(
    client: TestClient, mailer: CapturingMailer
) -> None:
    known = client.post(
        "/auth/password-reset/request",
        json={"email": "nobody@example.com"},
    )
    assert known.status_code == 200
    detail = known.json()["detail"].lower()
    assert "registered" in detail or "reset" in detail
    assert mailer.sent == []


def test_request_reset_known_email_sends_and_stores_hash(
    client: TestClient, db_session: Session, mailer: CapturingMailer
) -> None:
    _register(client, "reset@example.com")
    response = client.post(
        "/auth/password-reset/request",
        json={"email": "Reset@Example.com"},
    )
    assert response.status_code == 200
    raw = _extract_token(mailer)
    row = db_session.scalar(
        select(PasswordResetTokenModel).where(
            PasswordResetTokenModel.token_hash == hash_reset_token(raw)
        )
    )
    assert row is not None
    assert row.token_hash != raw


def test_request_reset_smtp_misconfig_fails_loud(
    client: TestClient, mailer: CapturingMailer, monkeypatch: pytest.MonkeyPatch
) -> None:
    from adapters.email.settings import load_smtp_settings
    from adapters.email.smtp import SmtpEmailSender
    from api.routes import auth as auth_routes

    _register(client, "smtpfail@example.com")

    # Real adapter path: empty SMTP_HOST/FROM must fail loud (not fake mailer only).
    monkeypatch.setenv("SMTP_HOST", "")
    monkeypatch.setenv("SMTP_FROM", "")
    monkeypatch.setattr(auth_routes, "SmtpEmailSender", SmtpEmailSender)
    monkeypatch.setattr(auth_routes, "load_smtp_settings", load_smtp_settings)

    response = client.post(
        "/auth/password-reset/request",
        json={"email": "smtpfail@example.com"},
    )
    assert response.status_code == 503
    assert response.json()["code"] == "smtp_config_error"
    assert mailer.sent == []


def test_complete_reset_new_password_works_old_fails(
    client: TestClient, db_session: Session, mailer: CapturingMailer
) -> None:
    _register(client, "cycle@example.com", password="old-password1")
    # Establish a session to prove revoke-all.
    signed = client.post(
        "/auth/sign-in",
        json={"email": "cycle@example.com", "password": "old-password1"},
    )
    assert signed.status_code == 200
    old_cookie = signed.cookies["fh_session"]
    assert db_session.scalar(select(SessionModel).where(SessionModel.token == old_cookie))

    req = client.post(
        "/auth/password-reset/request",
        json={"email": "cycle@example.com"},
    )
    assert req.status_code == 200
    raw = _extract_token(mailer)

    confirm = client.post(
        "/auth/password-reset/confirm",
        json={"token": raw, "new_password": "new-password1"},
    )
    assert confirm.status_code == 200, confirm.text

    # Old session revoked.
    assert (
        db_session.scalar(select(SessionModel).where(SessionModel.token == old_cookie)) is None
    )

    client.cookies.clear()
    old_signin = client.post(
        "/auth/sign-in",
        json={"email": "cycle@example.com", "password": "old-password1"},
    )
    assert old_signin.status_code == 401

    new_signin = client.post(
        "/auth/sign-in",
        json={"email": "cycle@example.com", "password": "new-password1"},
    )
    assert new_signin.status_code == 200
    assert "fh_session" in new_signin.cookies

    user = db_session.scalar(select(UserModel).where(UserModel.email == "cycle@example.com"))
    assert user is not None
    assert user.password_hash.startswith("$argon2")


def test_complete_reset_rejects_bad_token(client: TestClient) -> None:
    response = client.post(
        "/auth/password-reset/confirm",
        json={"token": "not-a-real-token", "new_password": "new-password1"},
    )
    assert response.status_code == 400
    assert response.json()["code"] == "invalid_reset_token"


def test_request_reset_does_not_log_token(
    client: TestClient, mailer: CapturingMailer, caplog: pytest.LogCaptureFixture
) -> None:
    _register(client, "logreset@example.com")
    with caplog.at_level("INFO"):
        client.post(
            "/auth/password-reset/request",
            json={"email": "logreset@example.com"},
        )
    raw = _extract_token(mailer)
    joined = " ".join(r.message for r in caplog.records)
    assert raw not in joined
