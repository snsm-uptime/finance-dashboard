"""Integration tests for auth rate limits (Story 1.5.6).

Requires DATABASE_URL (Compose db or CI Postgres 16). Skips when unset.
"""

from __future__ import annotations

import os
from collections.abc import Iterator
from dataclasses import replace

import pytest
from api.app import create_app
from api.deps import get_db
from application.rate_limit import RateLimitPolicy, SlidingWindowRateLimiter
from domain.errors import RateLimitedError, SmtpConfigurationError
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker


def _database_url() -> str | None:
    return (os.environ.get("DATABASE_URL") or "").strip() or None


pytestmark = pytest.mark.skipif(
    _database_url() is None,
    reason="DATABASE_URL not set — Postgres 16 required for integration tests",
)

_RATE_BODY = {
    "detail": RateLimitedError.MESSAGE,
    "code": RateLimitedError.CODE,
}


class CapturingMailer:
    def __init__(self) -> None:
        self.sent: list[object] = []
        self.fail: Exception | None = None

    def send(self, message: object) -> None:
        if self.fail is not None:
            raise self.fail
        self.sent.append(message)


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
def mailer() -> CapturingMailer:
    return CapturingMailer()


def _tighten(client: TestClient, **policies: RateLimitPolicy) -> None:
    settings = client.app.state.auth_settings
    client.app.state.auth_settings = replace(settings, **policies)


def _clear_limiter(client: TestClient) -> None:
    limiter = getattr(client.app.state, "rate_limiter", None)
    if isinstance(limiter, SlidingWindowRateLimiter):
        limiter.clear()


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
    monkeypatch.setenv("TRUSTED_PROXY_IPS", "testclient")
    monkeypatch.setenv("AUTH_CLIENT_IP_HEADER", "X-FH-Client-IP")

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


def _assert_rate_limited(response: object) -> None:
    assert response.status_code == 429, getattr(response, "text", "")
    body = response.json()
    assert body == _RATE_BODY
    assert response.headers.get("Retry-After") is not None
    assert int(response.headers["Retry-After"]) >= 1


def test_register_rate_limit_and_identity_isolation(client: TestClient) -> None:
    _clear_limiter(client)
    _tighten(
        client,
        rate_limit_register=RateLimitPolicy(max_attempts=2, window_seconds=3600),
    )
    headers_a = {"X-FH-Client-IP": "203.0.113.10"}
    headers_b = {"X-FH-Client-IP": "203.0.113.11"}

    r1 = client.post(
        "/auth/register",
        json={"email": "rl-a1@example.com", "password": "password1"},
        headers=headers_a,
    )
    assert r1.status_code == 201, r1.text
    r2 = client.post(
        "/auth/register",
        json={"email": "rl-a2@example.com", "password": "password1"},
        headers=headers_a,
    )
    assert r2.status_code == 201, r2.text
    limited = client.post(
        "/auth/register",
        json={"email": "rl-a3@example.com", "password": "password1"},
        headers=headers_a,
    )
    _assert_rate_limited(limited)

    other = client.post(
        "/auth/register",
        json={"email": "rl-b1@example.com", "password": "password1"},
        headers=headers_b,
    )
    assert other.status_code == 201, other.text


def test_sign_in_rate_limit_anti_oracle(client: TestClient) -> None:
    _clear_limiter(client)
    _tighten(
        client,
        rate_limit_sign_in=RateLimitPolicy(max_attempts=2, window_seconds=900),
        rate_limit_register=RateLimitPolicy(max_attempts=50, window_seconds=3600),
    )
    client.post(
        "/auth/register",
        json={"email": "known-rl@example.com", "password": "password1"},
        headers={"X-FH-Client-IP": "198.51.100.1"},
    )
    client.cookies.clear()

    ip = {"X-FH-Client-IP": "198.51.100.2"}
    assert (
        client.post(
            "/auth/sign-in",
            json={"email": "known-rl@example.com", "password": "wrong"},
            headers=ip,
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/auth/sign-in",
            json={"email": "ghost-rl@example.com", "password": "password1"},
            headers=ip,
        ).status_code
        == 401
    )
    known_limited = client.post(
        "/auth/sign-in",
        json={"email": "known-rl@example.com", "password": "wrong"},
        headers=ip,
    )
    ghost_limited = client.post(
        "/auth/sign-in",
        json={"email": "ghost-rl@example.com", "password": "password1"},
        headers=ip,
    )
    _assert_rate_limited(known_limited)
    _assert_rate_limited(ghost_limited)
    assert known_limited.json() == ghost_limited.json()
    assert known_limited.headers.get("Retry-After") == ghost_limited.headers.get("Retry-After")


def test_password_reset_request_rate_limit_anti_oracle(
    client: TestClient, mailer: CapturingMailer
) -> None:
    _clear_limiter(client)
    _tighten(
        client,
        rate_limit_password_reset_request=RateLimitPolicy(max_attempts=2, window_seconds=3600),
        rate_limit_register=RateLimitPolicy(max_attempts=50, window_seconds=3600),
    )
    client.post(
        "/auth/register",
        json={"email": "reset-known@example.com", "password": "password1"},
        headers={"X-FH-Client-IP": "203.0.113.20"},
    )
    client.cookies.clear()
    mailer.sent.clear()

    ip = {"X-FH-Client-IP": "203.0.113.21"}
    assert (
        client.post(
            "/auth/password-reset/request",
            json={"email": "reset-known@example.com"},
            headers=ip,
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/auth/password-reset/request",
            json={"email": "nobody-rl@example.com"},
            headers=ip,
        ).status_code
        == 200
    )
    known_limited = client.post(
        "/auth/password-reset/request",
        json={"email": "reset-known@example.com"},
        headers=ip,
    )
    ghost_limited = client.post(
        "/auth/password-reset/request",
        json={"email": "nobody-rl@example.com"},
        headers=ip,
    )
    _assert_rate_limited(known_limited)
    _assert_rate_limited(ghost_limited)
    assert known_limited.json() == ghost_limited.json()


def test_verify_request_rate_limit_with_gate_on(client: TestClient) -> None:
    _clear_limiter(client)
    _tighten(
        client,
        rate_limit_verify_request=RateLimitPolicy(max_attempts=2, window_seconds=3600),
        rate_limit_register=RateLimitPolicy(max_attempts=50, window_seconds=3600),
        email_verification_required=True,
    )
    reg = client.post(
        "/auth/register",
        json={"email": "verify-rl@example.com", "password": "password1"},
        headers={"X-FH-Client-IP": "203.0.113.30"},
    )
    assert reg.status_code == 201, reg.text

    assert client.post("/auth/verify/request").status_code == 200
    assert client.post("/auth/verify/request").status_code == 200
    limited = client.post("/auth/verify/request")
    _assert_rate_limited(limited)


def test_health_unaffected_after_auth_exhausted(client: TestClient) -> None:
    _clear_limiter(client)
    _tighten(
        client,
        rate_limit_register=RateLimitPolicy(max_attempts=1, window_seconds=3600),
    )
    ip = {"X-FH-Client-IP": "203.0.113.40"}
    assert (
        client.post(
            "/auth/register",
            json={"email": "health-rl@example.com", "password": "password1"},
            headers=ip,
        ).status_code
        == 201
    )
    _assert_rate_limited(
        client.post(
            "/auth/register",
            json={"email": "health-rl-2@example.com", "password": "password1"},
            headers=ip,
        )
    )
    health = client.get("/health")
    assert health.status_code == 200


def test_under_limit_smtp_fail_still_503(client: TestClient, mailer: CapturingMailer) -> None:
    _clear_limiter(client)
    _tighten(
        client,
        rate_limit_password_reset_request=RateLimitPolicy(max_attempts=5, window_seconds=3600),
        rate_limit_register=RateLimitPolicy(max_attempts=50, window_seconds=3600),
    )
    client.post(
        "/auth/register",
        json={"email": "smtp-rl@example.com", "password": "password1"},
        headers={"X-FH-Client-IP": "203.0.113.50"},
    )
    client.cookies.clear()
    mailer.fail = SmtpConfigurationError()
    response = client.post(
        "/auth/password-reset/request",
        json={"email": "smtp-rl@example.com"},
        headers={"X-FH-Client-IP": "203.0.113.51"},
    )
    assert response.status_code == 503
    assert response.json()["code"] == "smtp_config_error"
