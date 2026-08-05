"""Postgres integration tests for config-gated email verification (Story 1.5).

Requires DATABASE_URL (Compose db or CI Postgres 16). Skips when unset.
"""

from __future__ import annotations

import os
from collections.abc import Iterator
from dataclasses import replace

import pytest
from adapters.persistence.models import EmailVerificationTokenModel, UserModel
from api.app import create_app
from api.deps import get_db
from application.ports import EmailMessage
from domain.email_verification import hash_verification_token
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
    monkeypatch.setenv("AUTH_RATE_LIMIT_REGISTER_MAX", "10000")
    monkeypatch.setenv("AUTH_RATE_LIMIT_SIGN_IN_MAX", "10000")
    monkeypatch.setenv("AUTH_RATE_LIMIT_PASSWORD_RESET_REQUEST_MAX", "10000")
    monkeypatch.setenv("AUTH_RATE_LIMIT_VERIFY_REQUEST_MAX", "10000")
    monkeypatch.setenv("PUBLIC_APP_URL", "http://localhost:3000")
    monkeypatch.setenv("SMTP_HOST", "smtp.test")
    monkeypatch.setenv("SMTP_FROM", "noreply@example.com")

    from adapters import email as email_pkg
    from adapters.email import settings as email_settings
    from api.routes import auth as auth_routes

    monkeypatch.setattr(auth_routes, "SmtpEmailSender", lambda _settings: mailer)
    monkeypatch.setattr(auth_routes, "load_smtp_settings", email_settings.load_smtp_settings)
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


def _set_verification_required(client: TestClient, required: bool) -> None:
    settings = client.app.state.auth_settings
    client.app.state.auth_settings = replace(settings, email_verification_required=required)


def _register_and_keep_session(client: TestClient, email: str, password: str = "password1") -> None:
    response = client.post("/auth/register", json={"email": email, "password": password})
    assert response.status_code == 201, response.text
    assert "fh_session" in response.cookies


def _extract_token(mailer: CapturingMailer) -> str:
    assert mailer.sent, "expected at least one verification email"
    body = mailer.sent[-1].body_text
    marker = "token="
    assert marker in body
    return body.split(marker, 1)[1].split()[0].strip()


def test_signup_usable_when_verification_off(
    client: TestClient, db_session: Session, mailer: CapturingMailer
) -> None:
    _set_verification_required(client, False)
    _register_and_keep_session(client, "off-path@example.com")
    assert mailer.sent == []

    me = client.get("/auth/me")
    assert me.status_code == 200
    assert me.json()["authenticated"] is True

    gated = client.post("/auth/gated-flows/invite-accept-stub")
    assert gated.status_code == 200, gated.text

    user = db_session.scalar(select(UserModel).where(UserModel.email == "off-path@example.com"))
    assert user is not None
    assert user.email_verified_at is None


def test_verify_endpoints_404_when_flag_off(client: TestClient) -> None:
    _set_verification_required(client, False)
    _register_and_keep_session(client, "noverify@example.com")

    req = client.post("/auth/verify/request")
    assert req.status_code == 404
    assert req.json()["code"] == "verification_not_required"

    confirm = client.post("/auth/verify/confirm", json={"token": "anything"})
    assert confirm.status_code == 404
    assert confirm.json()["code"] == "verification_not_required"


def test_register_auto_sends_when_flag_on(
    client: TestClient, db_session: Session, mailer: CapturingMailer
) -> None:
    _set_verification_required(client, True)
    _register_and_keep_session(client, "autosend@example.com")
    assert len(mailer.sent) == 1
    raw = _extract_token(mailer)
    row = db_session.scalar(
        select(EmailVerificationTokenModel).where(
            EmailVerificationTokenModel.token_hash == hash_verification_token(raw)
        )
    )
    assert row is not None


def test_register_smtp_fail_rolls_back_when_flag_on(
    client: TestClient,
    db_session: Session,
    mailer: CapturingMailer,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from adapters.email.settings import load_smtp_settings
    from adapters.email.smtp import SmtpEmailSender
    from api.routes import auth as auth_routes

    _set_verification_required(client, True)
    monkeypatch.setenv("SMTP_HOST", "")
    monkeypatch.setenv("SMTP_FROM", "")
    monkeypatch.setattr(auth_routes, "SmtpEmailSender", SmtpEmailSender)
    monkeypatch.setattr(auth_routes, "load_smtp_settings", load_smtp_settings)

    response = client.post(
        "/auth/register",
        json={"email": "regfail@example.com", "password": "password1"},
    )
    assert response.status_code == 503
    assert response.json()["code"] == "smtp_config_error"
    assert mailer.sent == []
    assert (
        db_session.scalar(select(UserModel).where(UserModel.email == "regfail@example.com")) is None
    )


def test_gated_flow_blocked_until_verified_when_flag_on(
    client: TestClient, db_session: Session, mailer: CapturingMailer
) -> None:
    _set_verification_required(client, True)
    _register_and_keep_session(client, "gate@example.com")

    # Session cookie still works (orthogonal to verification).
    me = client.get("/auth/me")
    assert me.status_code == 200

    blocked = client.post("/auth/gated-flows/invite-accept-stub")
    assert blocked.status_code == 403
    assert blocked.json()["code"] == "email_not_verified"

    # Auto-send on register already minted a token.
    raw = _extract_token(mailer)
    row = db_session.scalar(
        select(EmailVerificationTokenModel).where(
            EmailVerificationTokenModel.token_hash == hash_verification_token(raw)
        )
    )
    assert row is not None
    assert row.token_hash != raw

    confirm = client.post("/auth/verify/confirm", json={"token": raw})
    assert confirm.status_code == 200, confirm.text

    again = client.post("/auth/verify/confirm", json={"token": raw})
    assert again.status_code == 200, again.text

    user = db_session.scalar(select(UserModel).where(UserModel.email == "gate@example.com"))
    assert user is not None
    assert user.email_verified_at is not None

    allowed = client.post("/auth/gated-flows/invite-accept-stub")
    assert allowed.status_code == 200, allowed.text


def test_verify_request_smtp_fails_loud(
    client: TestClient,
    mailer: CapturingMailer,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from adapters.email.settings import load_smtp_settings
    from adapters.email.smtp import SmtpEmailSender
    from api.routes import auth as auth_routes

    _set_verification_required(client, True)
    _register_and_keep_session(client, "verifysmtp@example.com")
    mailer.sent.clear()

    monkeypatch.setenv("SMTP_HOST", "")
    monkeypatch.setenv("SMTP_FROM", "")
    monkeypatch.setattr(auth_routes, "SmtpEmailSender", SmtpEmailSender)
    monkeypatch.setattr(auth_routes, "load_smtp_settings", load_smtp_settings)

    response = client.post("/auth/verify/request")
    assert response.status_code == 503
    assert response.json()["code"] == "smtp_config_error"
    assert mailer.sent == []
    # Token-row rollback under the shared test transaction is covered by
    # test_register_smtp_fail_rolls_back_when_flag_on (user row absent after 503).


def test_verify_confirm_rejects_bad_token(client: TestClient) -> None:
    _set_verification_required(client, True)
    response = client.post(
        "/auth/verify/confirm",
        json={"token": "not-a-real-token"},
    )
    assert response.status_code == 400
    assert response.json()["code"] == "invalid_verification_token"


def test_verify_request_requires_auth(client: TestClient) -> None:
    _set_verification_required(client, True)
    client.cookies.clear()
    response = client.post("/auth/verify/request")
    assert response.status_code == 401


def test_claim_token_rejects_expired_unused_row(db_session: Session) -> None:
    """SQL claim must re-check expires_at (Story 1.5.1) — not used_at alone."""
    from datetime import UTC, datetime, timedelta
    from uuid import uuid4

    from adapters.persistence.email_verification import SqlAlchemyEmailVerificationRepository
    from adapters.persistence.password_hasher import Argon2PasswordHasher

    user_id = uuid4()
    db_session.add(
        UserModel(
            id=user_id,
            email="claim-expired-verify@example.com",
            password_hash=Argon2PasswordHasher().hash("password1"),
        )
    )
    db_session.flush()

    token_id = uuid4()
    repo = SqlAlchemyEmailVerificationRepository(db_session)
    repo.create_token(
        token_id=token_id,
        user_id=user_id,
        token_hash=hash_verification_token("expired-raw"),
        expires_at=datetime.now(UTC) - timedelta(minutes=1),
    )
    db_session.flush()

    assert repo.claim_token(token_id, used_at=datetime.now(UTC)) is False
    row = db_session.get(EmailVerificationTokenModel, token_id)
    assert row is not None
    assert row.used_at is None
    assert repo.get_user_verified_at(user_id) is None


def test_claim_token_succeeds_for_valid_unused_row(db_session: Session) -> None:
    from datetime import UTC, datetime, timedelta
    from uuid import uuid4

    from adapters.persistence.email_verification import SqlAlchemyEmailVerificationRepository
    from adapters.persistence.password_hasher import Argon2PasswordHasher

    user_id = uuid4()
    db_session.add(
        UserModel(
            id=user_id,
            email="claim-valid-verify@example.com",
            password_hash=Argon2PasswordHasher().hash("password1"),
        )
    )
    db_session.flush()

    token_id = uuid4()
    repo = SqlAlchemyEmailVerificationRepository(db_session)
    repo.create_token(
        token_id=token_id,
        user_id=user_id,
        token_hash=hash_verification_token("valid-raw"),
        expires_at=datetime.now(UTC) + timedelta(hours=1),
    )
    db_session.flush()

    used_at = datetime.now(UTC)
    assert repo.claim_token(token_id, used_at=used_at) is True
    row = db_session.get(EmailVerificationTokenModel, token_id)
    assert row is not None
    assert row.used_at is not None
