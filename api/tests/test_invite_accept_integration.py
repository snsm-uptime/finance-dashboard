"""Postgres integration tests for invite accept / signup-with-invite (Story 2.4)."""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import replace

import pytest
from adapters.persistence.models import ListInviteTokenModel, ListMembershipModel
from application.ports import EmailMessage
from domain.list_invite import hash_invite_token
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from tests.integration_db import database_url, make_client

pytestmark = pytest.mark.skipif(
    database_url() is None,
    reason="DATABASE_URL not set — Postgres 16 required for integration tests",
)


class CapturingMailer:
    def __init__(self) -> None:
        self.sent: list[EmailMessage] = []

    def send(self, message: EmailMessage) -> None:
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
    from api.routes import auth as auth_routes
    from api.routes import lists as lists_routes

    monkeypatch.setattr(lists_routes, "SmtpEmailSender", lambda _settings: mailer)
    monkeypatch.setattr(auth_routes, "SmtpEmailSender", lambda _settings: mailer)
    monkeypatch.setattr(email_pkg, "SmtpEmailSender", lambda _settings: mailer)

    yield from make_client(db_session, monkeypatch, smtp=True)


def _register(client: TestClient, email: str) -> None:
    response = client.post(
        "/auth/register",
        json={"email": email, "password": "password1"},
    )
    assert response.status_code == 201, response.text


def _extract_raw_from_link(body: str) -> str:
    if "token=" in body:
        return body.split("token=", 1)[1].split()[0].strip()
    if "invite=" in body:
        return body.split("invite=", 1)[1].split()[0].strip()
    raise AssertionError(f"no invite token in mail body: {body!r}")


def _member_count(db: Session, list_id: str) -> int:
    return int(
        db.scalar(
            select(func.count())
            .select_from(ListMembershipModel)
            .where(ListMembershipModel.list_id == list_id)
        )
        or 0
    )


def test_unregistered_signup_with_invite_lands_membership_and_cookie(
    client: TestClient, db_session: Session, mailer: CapturingMailer
) -> None:
    _register(client, "owner@example.com")
    created = client.post("/lists", json={"name": "Household"})
    list_id = created.json()["id"]
    before = _member_count(db_session, list_id)

    invited = client.post(
        f"/lists/{list_id}/invites",
        json={"email": "invitee@example.com"},
    )
    assert invited.status_code == 201, invited.text
    assert mailer.sent
    raw = _extract_raw_from_link(mailer.sent[0].body_text)

    client.post("/auth/sign-out")
    preview = client.get("/invites/preview", params={"token": raw})
    assert preview.status_code == 200
    assert preview.json()["path"] == "signup"
    assert "email" not in preview.json()
    assert preview.json()["email_hint"]

    registered = client.post(
        "/auth/register",
        json={
            "email": "invitee@example.com",
            "password": "password1",
            "invite_token": raw,
        },
    )
    assert registered.status_code == 201, registered.text
    body = registered.json()
    assert body["inviting_list_id"] == list_id
    assert client.cookies.get("fh_session")
    assert _member_count(db_session, list_id) == before + 1

    row = db_session.scalars(
        select(ListInviteTokenModel).where(
            ListInviteTokenModel.token_hash == hash_invite_token(raw)
        )
    ).first()
    assert row is not None
    assert row.used_at is not None

    membership = db_session.scalars(
        select(ListMembershipModel).where(
            ListMembershipModel.list_id == list_id,
            ListMembershipModel.role == "member",
        )
    ).first()
    assert membership is not None


def test_registered_accept_creates_membership(
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
        json={"email": "invitee@example.com"},
    )
    assert invited.status_code == 201
    raw = _extract_raw_from_link(mailer.sent[0].body_text)

    client.post("/auth/sign-out")
    client.post(
        "/auth/sign-in",
        json={"email": "invitee@example.com", "password": "password1"},
    )
    accepted = client.post("/invites/accept", json={"token": raw})
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["list_id"] == list_id

    again = client.post("/invites/accept", json={"token": raw})
    assert again.status_code == 200
    assert (
        db_session.scalar(
            select(func.count())
            .select_from(ListMembershipModel)
            .where(
                ListMembershipModel.list_id == list_id,
                ListMembershipModel.role == "member",
            )
        )
        == 1
    )


def test_bad_token_leaves_membership_unchanged(
    client: TestClient, db_session: Session
) -> None:
    _register(client, "owner@example.com")
    created = client.post("/lists", json={"name": "Household"})
    list_id = created.json()["id"]
    before = _member_count(db_session, list_id)

    client.post("/auth/sign-out")
    bad = client.post(
        "/auth/register",
        json={
            "email": "invitee@example.com",
            "password": "password1",
            "invite_token": "not-a-real-token",
        },
    )
    assert bad.status_code == 410
    assert _member_count(db_session, list_id) == before

    preview = client.get("/invites/preview", params={"token": "nope"})
    assert preview.status_code == 410


def test_signup_with_invite_verify_on_partial_success(
    client: TestClient,
    db_session: Session,
    mailer: CapturingMailer,
) -> None:
    client.app.state.auth_settings = replace(
        client.app.state.auth_settings, email_verification_required=True
    )

    response = client.post(
        "/auth/register",
        json={"email": "owner@example.com", "password": "password1"},
    )
    assert response.status_code == 201, response.text
    created = client.post("/lists", json={"name": "Household"})
    list_id = created.json()["id"]

    invited = client.post(
        f"/lists/{list_id}/invites",
        json={"email": "invitee@example.com"},
    )
    assert invited.status_code == 201
    raw = _extract_raw_from_link(mailer.sent[-1].body_text)

    client.post("/auth/sign-out")
    registered = client.post(
        "/auth/register",
        json={
            "email": "invitee@example.com",
            "password": "password1",
            "invite_token": raw,
        },
    )
    assert registered.status_code == 403, registered.text
    assert registered.json()["code"] == "email_not_verified"
    set_cookie = registered.headers.get("set-cookie") or ""
    assert "fh_session=" in set_cookie
    assert client.cookies.get("fh_session")
    me = client.get("/auth/me")
    assert me.status_code == 200, me.text
    assert me.json()["email"] == "invitee@example.com"

    row = db_session.scalars(
        select(ListInviteTokenModel).where(
            ListInviteTokenModel.token_hash == hash_invite_token(raw)
        )
    ).first()
    assert row is not None
    assert row.used_at is None
    assert (
        db_session.scalar(
            select(func.count())
            .select_from(ListMembershipModel)
            .where(
                ListMembershipModel.list_id == list_id,
                ListMembershipModel.role == "member",
            )
        )
        == 0
    )
