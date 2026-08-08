"""Postgres integration tests for list invites (Story 2.3).

Requires DATABASE_URL (Compose db or CI Postgres 16). Skips when unset.
"""

from __future__ import annotations

from collections.abc import Iterator
from uuid import uuid4

import pytest
from adapters.persistence.models import ListInviteTokenModel, ListMembershipModel
from application.ports import EmailMessage
from domain.errors import SmtpSendError
from domain.list_invite import hash_invite_token
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from tests.integration_db import claim_alias, database_url, make_client

pytestmark = pytest.mark.skipif(
    database_url() is None,
    reason="DATABASE_URL not set — Postgres 16 required for integration tests",
)


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
    from adapters import email as email_pkg
    from api.routes import lists as lists_routes

    monkeypatch.setattr(lists_routes, "SmtpEmailSender", lambda _settings: mailer)
    monkeypatch.setattr(email_pkg, "SmtpEmailSender", lambda _settings: mailer)

    yield from make_client(db_session, monkeypatch, smtp=True)


def _register(client: TestClient, email: str) -> None:
    response = client.post(
        "/auth/register",
        json={"email": email, "password": "password1"},
    )
    assert response.status_code == 201, response.text
    claim_alias(client, email)


def _extract_raw_from_link(body: str) -> str:
    if "token=" in body:
        return body.split("token=", 1)[1].split()[0].strip()
    if "invite=" in body:
        return body.split("invite=", 1)[1].split()[0].strip()
    raise AssertionError(f"no invite token in mail body: {body!r}")


def test_owner_invite_registered_join_template_no_membership(
    client: TestClient, db_session: Session, mailer: CapturingMailer
) -> None:
    _register(client, "owner@example.com")
    created = client.post("/lists", json={"name": "Household"})
    list_id = created.json()["id"]

    client.post("/auth/sign-out")
    _register(client, "invitee@example.com")
    client.post("/auth/sign-out")

    client.post(
        "/auth/sign-in",
        json={"email": "owner@example.com", "password": "password1"},
    )
    invited = client.post(
        f"/lists/{list_id}/invites",
        json={"email": "Invitee@Example.com"},
    )
    assert invited.status_code == 201, invited.text
    body = invited.json()
    assert body["status"] == "sent"
    assert body["template_kind"] == "join"
    assert "invite_id" in body

    assert len(mailer.sent) == 1
    assert "Invitation to join Household" in mailer.sent[0].subject
    assert "/invites/accept?token=" in mailer.sent[0].body_text

    raw = _extract_raw_from_link(mailer.sent[0].body_text)
    row = db_session.scalars(
        select(ListInviteTokenModel).where(
            ListInviteTokenModel.token_hash == hash_invite_token(raw)
        )
    ).one()
    assert row.email == "invitee@example.com"
    assert row.token_hash != raw
    assert row.locale == "en"
    assert row.used_at is None

    # Membership not created yet (2.4)
    invitee_id = db_session.scalar(
        select(ListMembershipModel.user_id).where(
            ListMembershipModel.list_id == list_id,
            ListMembershipModel.role == "member",
        )
    )
    assert invitee_id is None
    member_count = db_session.scalar(
        select(func.count())
        .select_from(ListMembershipModel)
        .where(ListMembershipModel.list_id == list_id)
    )
    assert member_count == 1


def test_owner_invite_unregistered_signup_template_es(
    client: TestClient, db_session: Session, mailer: CapturingMailer
) -> None:
    _register(client, "owner-es@example.com")
    prefs = client.patch("/auth/me", json={"language": "es"})
    assert prefs.status_code == 200, prefs.text

    created = client.post("/lists", json={"name": "Hogar"})
    list_id = created.json()["id"]

    invited = client.post(
        f"/lists/{list_id}/invites",
        json={"email": "newbie@example.com"},
    )
    assert invited.status_code == 201, invited.text
    assert invited.json()["template_kind"] == "signup"

    assert len(mailer.sent) == 1
    assert "Crea tu cuenta" in mailer.sent[0].subject
    assert "/signup?invite=" in mailer.sent[0].body_text

    raw = _extract_raw_from_link(mailer.sent[0].body_text)
    row = db_session.scalars(
        select(ListInviteTokenModel).where(
            ListInviteTokenModel.token_hash == hash_invite_token(raw)
        )
    ).one()
    assert row.locale == "es"


def test_member_not_owner_invite_forbidden(client: TestClient, db_session: Session) -> None:
    _register(client, "owner3@example.com")
    created = client.post("/lists", json={"name": "Shared"})
    list_id = created.json()["id"]

    client.post("/auth/sign-out")
    _register(client, "member@example.com")
    member_me = client.get("/auth/me")
    member_id = member_me.json()["user_id"]

    # Attach membership as owner
    client.post("/auth/sign-out")
    client.post(
        "/auth/sign-in",
        json={"email": "owner3@example.com", "password": "password1"},
    )
    from uuid import UUID

    from adapters.persistence.models import ListMembershipModel

    db_session.add(
        ListMembershipModel(
            id=uuid4(),
            list_id=UUID(list_id),
            user_id=UUID(member_id),
            role="member",
        )
    )
    db_session.flush()

    client.post("/auth/sign-out")
    client.post(
        "/auth/sign-in",
        json={"email": "member@example.com", "password": "password1"},
    )
    denied = client.post(
        f"/lists/{list_id}/invites",
        json={"email": "other@example.com"},
    )
    assert denied.status_code == 403
    assert denied.json()["code"] == "not_list_owner"
    assert denied.json()["status"] != "sent" if "status" in denied.json() else True


def test_smtp_failure_not_invite_sent(
    client: TestClient, db_session: Session, mailer: CapturingMailer
) -> None:
    _register(client, "owner-smtp@example.com")
    created = client.post("/lists", json={"name": "Trip"})
    list_id = created.json()["id"]

    mailer.fail = SmtpSendError()
    failed = client.post(
        f"/lists/{list_id}/invites",
        json={"email": "ghost@example.com"},
    )
    assert failed.status_code == 503
    assert failed.json()["code"] == "smtp_send_error"
    assert "status" not in failed.json() or failed.json().get("status") != "sent"
    assert mailer.sent == []

    db_session.expire_all()
    lingering = db_session.scalar(
        select(func.count())
        .select_from(ListInviteTokenModel)
        .where(ListInviteTokenModel.email == "ghost@example.com")
    )
    assert lingering == 0


def test_smtp_misconfig_not_invite_sent(
    client: TestClient,
    db_session: Session,
    mailer: CapturingMailer,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from adapters.email.settings import load_smtp_settings
    from adapters.email.smtp import SmtpEmailSender
    from api.routes import lists as lists_routes

    _register(client, "owner-cfg@example.com")
    created = client.post("/lists", json={"name": "Trip"})
    list_id = created.json()["id"]

    monkeypatch.setenv("SMTP_HOST", "")
    monkeypatch.setenv("SMTP_FROM", "")
    monkeypatch.setattr(lists_routes, "SmtpEmailSender", SmtpEmailSender)
    monkeypatch.setattr(lists_routes, "load_smtp_settings", load_smtp_settings)

    failed = client.post(
        f"/lists/{list_id}/invites",
        json={"email": "ghost@example.com"},
    )
    assert failed.status_code == 503
    assert failed.json()["code"] == "smtp_config_error"
    assert mailer.sent == []

    db_session.expire_all()
    lingering = db_session.scalar(
        select(func.count())
        .select_from(ListInviteTokenModel)
        .where(ListInviteTokenModel.email == "ghost@example.com")
    )
    assert lingering == 0


def test_send_ok_when_verification_required_and_invitee_unverified(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
    mailer: CapturingMailer,
) -> None:
    """AC #6 / Task 5: send must not call Ensure; succeeds for unverified invitee."""

    from adapters.persistence.models import UserModel
    from api.app import create_app
    from api.deps import get_db
    from api.routes import auth as auth_routes
    from api.routes import lists as lists_routes
    from application import email_verification as ev_mod
    from tests.integration_db import apply_base_auth_env

    ensure_calls: list[object] = []
    real_ensure = ev_mod.EnsureEmailVerifiedService

    class TrackingEnsure(real_ensure):
        def execute(self, *args, **kwargs):  # noqa: ANN002, ANN003
            ensure_calls.append((args, kwargs))
            raise AssertionError("EnsureEmailVerifiedService must not run on invite send")

    monkeypatch.setattr(ev_mod, "EnsureEmailVerifiedService", TrackingEnsure)

    apply_base_auth_env(monkeypatch)
    monkeypatch.setenv("EMAIL_VERIFICATION_REQUIRED", "true")
    monkeypatch.setenv("PUBLIC_APP_URL", "http://localhost:3000")
    monkeypatch.setenv("SMTP_HOST", "smtp.test")
    monkeypatch.setenv("SMTP_FROM", "noreply@example.com")

    monkeypatch.setattr(lists_routes, "SmtpEmailSender", lambda _settings: mailer)
    monkeypatch.setattr(auth_routes, "SmtpEmailSender", lambda _settings: mailer)

    app = create_app()

    def _override_db() -> Iterator[Session]:
        yield db_session
        db_session.flush()

    app.dependency_overrides[get_db] = _override_db
    with TestClient(app) as client:
        _register(client, "owner-verify@example.com")
        created = client.post("/lists", json={"name": "Gate"})
        assert created.status_code == 201, created.text
        list_id = created.json()["id"]

        client.post("/auth/sign-out")
        _register(client, "unverified@example.com")
        invitee = db_session.scalar(
            select(UserModel).where(UserModel.email == "unverified@example.com")
        )
        assert invitee is not None
        assert invitee.email_verified_at is None

        client.post("/auth/sign-out")
        client.post(
            "/auth/sign-in",
            json={"email": "owner-verify@example.com", "password": "password1"},
        )
        invited = client.post(
            f"/lists/{list_id}/invites",
            json={"email": "unverified@example.com"},
        )
        assert invited.status_code == 201, invited.text
        assert invited.json()["status"] == "sent"
        assert invited.json()["template_kind"] == "join"
        assert ensure_calls == []
        assert any("Invitation to join" in m.subject for m in mailer.sent)

    app.dependency_overrides.clear()


def test_already_member_conflict(client: TestClient, db_session: Session) -> None:
    _register(client, "owner4@example.com")
    created = client.post("/lists", json={"name": "Dup"})
    list_id = created.json()["id"]

    # Invite own email — owner is already a member
    conflict = client.post(
        f"/lists/{list_id}/invites",
        json={"email": "owner4@example.com"},
    )
    assert conflict.status_code == 409
    assert conflict.json()["code"] == "already_list_member"
