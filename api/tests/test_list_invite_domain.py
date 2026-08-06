"""Domain/application TDD for list invites (Story 2.3)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from application.list_invite import (
    InviteMemberToListCommand,
    InviteMemberToListService,
    ListInviteTokenRecord,
    build_invite_email_message,
)
from application.lists import ListRecord, MembershipRecord
from application.ports import EmailMessage, UserPreferencesRecord
from application.signin import AuthUserRecord
from domain.errors import (
    AlreadyListMemberError,
    InvalidInviteEmailError,
    NotListMemberError,
    NotListOwnerError,
    SmtpConfigurationError,
    SmtpSendError,
)
from domain.list_access import is_owner_action, normalize_list_action
from domain.list_invite import (
    INVITE_TOKEN_TTL,
    build_invite_link,
    hash_invite_token,
    resolve_invite_locale,
    resolve_invite_template_kind,
    validate_invite_email,
)


@dataclass
class FakeLists:
    lists: dict[UUID, ListRecord] = field(default_factory=dict)
    memberships: dict[tuple[UUID, UUID], MembershipRecord] = field(default_factory=dict)

    def get_list(self, list_id: UUID) -> ListRecord | None:
        return self.lists.get(list_id)

    def get_membership(self, list_id: UUID, user_id: UUID) -> MembershipRecord | None:
        return self.memberships.get((list_id, user_id))


@dataclass
class FakeUsers:
    by_id: dict[UUID, AuthUserRecord] = field(default_factory=dict)
    by_email: dict[str, AuthUserRecord] = field(default_factory=dict)
    prefs: dict[UUID, UserPreferencesRecord] = field(default_factory=dict)

    def get_by_email(self, email: str) -> AuthUserRecord | None:
        return self.by_email.get(email)

    def get_by_id(self, user_id: UUID) -> AuthUserRecord | None:
        return self.by_id.get(user_id)

    def get_preferences(self, user_id: UUID) -> UserPreferencesRecord | None:
        return self.prefs.get(user_id)

    def update_preferences(self, user_id: UUID, **kwargs):  # noqa: ANN003
        raise NotImplementedError


@dataclass
class FakeTokens:
    tokens: dict[str, ListInviteTokenRecord] = field(default_factory=dict)

    def invalidate_outstanding_for_list_email(self, list_id: UUID, email: str) -> None:
        now = datetime.now(UTC)
        for key, token in list(self.tokens.items()):
            if token.list_id == list_id and token.email == email and token.used_at is None:
                self.tokens[key] = ListInviteTokenRecord(
                    id=token.id,
                    list_id=token.list_id,
                    email=token.email,
                    token_hash=token.token_hash,
                    inviter_user_id=token.inviter_user_id,
                    locale=token.locale,
                    expires_at=token.expires_at,
                    used_at=now,
                )

    def create_token(
        self,
        *,
        token_id: UUID,
        list_id: UUID,
        email: str,
        token_hash: str,
        inviter_user_id: UUID,
        locale: str,
        expires_at: datetime,
    ) -> None:
        self.tokens[token_hash] = ListInviteTokenRecord(
            id=token_id,
            list_id=list_id,
            email=email,
            token_hash=token_hash,
            inviter_user_id=inviter_user_id,
            locale=locale,
            expires_at=expires_at,
            used_at=None,
        )

    def get_by_token_hash(self, token_hash: str) -> ListInviteTokenRecord | None:
        return self.tokens.get(token_hash)


@dataclass
class CapturingMailer:
    sent: list[EmailMessage] = field(default_factory=list)
    fail: Exception | None = None

    def send(self, message: EmailMessage) -> None:
        if self.fail:
            raise self.fail
        self.sent.append(message)


def _owner_setup(
    *,
    language: str | None = "en",
    invitee: AuthUserRecord | None = None,
    member_not_owner: AuthUserRecord | None = None,
) -> tuple[FakeLists, FakeUsers, UUID, UUID, AuthUserRecord]:
    owner_id = uuid4()
    list_id = uuid4()
    owner = AuthUserRecord(id=owner_id, email="owner@example.com", password_hash="x")
    lists = FakeLists(
        lists={list_id: ListRecord(id=list_id, name="Household", owner_id=owner_id)},
        memberships={
            (list_id, owner_id): MembershipRecord(list_id=list_id, user_id=owner_id, role="owner"),
        },
    )
    users = FakeUsers(
        by_id={owner_id: owner},
        by_email={owner.email: owner},
        prefs={
            owner_id: UserPreferencesRecord(
                id=owner_id,
                email=owner.email,
                language=language,
                theme=None,
                last_opened_list_id=None,
            )
        },
    )
    if invitee is not None:
        users.by_id[invitee.id] = invitee
        users.by_email[invitee.email] = invitee
    if member_not_owner is not None:
        users.by_id[member_not_owner.id] = member_not_owner
        users.by_email[member_not_owner.email] = member_not_owner
        lists.memberships[(list_id, member_not_owner.id)] = MembershipRecord(
            list_id=list_id, user_id=member_not_owner.id, role="member"
        )
    return lists, users, owner_id, list_id, owner


def test_validate_invite_email_normalizes() -> None:
    assert validate_invite_email("  Owner@Example.COM ") == "owner@example.com"


def test_validate_invite_email_rejects_bad() -> None:
    with pytest.raises(InvalidInviteEmailError):
        validate_invite_email("not-an-email")


def test_invite_member_is_owner_action() -> None:
    assert is_owner_action(normalize_list_action("invite_member"))


def test_hash_invite_token_is_sha256_hex() -> None:
    digest = hash_invite_token("raw-token")
    assert len(digest) == 64
    assert digest == hash_invite_token("raw-token")
    assert digest != hash_invite_token("other")


def test_locale_null_defaults_en() -> None:
    assert resolve_invite_locale(None) == "en"
    assert resolve_invite_locale("es") == "es"
    assert resolve_invite_locale("en") == "en"


def test_template_kind_registered_vs_unregistered() -> None:
    assert resolve_invite_template_kind(invitee_registered=True) == "join"
    assert resolve_invite_template_kind(invitee_registered=False) == "signup"


def test_build_invite_link_paths() -> None:
    assert (
        build_invite_link(
            public_app_url="http://localhost:3000",
            raw_token="tok",
            kind="join",
        )
        == "http://localhost:3000/invites/accept?token=tok"
    )
    assert (
        build_invite_link(
            public_app_url="http://localhost:3000/",
            raw_token="tok",
            kind="signup",
        )
        == "http://localhost:3000/signup?invite=tok"
    )


def test_owner_invite_registered_sends_join_and_stores_hash() -> None:
    invitee = AuthUserRecord(id=uuid4(), email="invitee@example.com", password_hash="x")
    lists, users, owner_id, list_id, _ = _owner_setup(invitee=invitee)
    tokens = FakeTokens()
    mailer = CapturingMailer()
    service = InviteMemberToListService(
        lists, users, users, tokens, mailer, public_app_url="http://localhost:3000"
    )

    result = service.execute(
        InviteMemberToListCommand(
            actor_user_id=owner_id,
            list_id=list_id,
            email="Invitee@Example.com",
        )
    )

    assert result.status == "sent"
    assert result.template_kind == "join"
    assert len(tokens.tokens) == 1
    stored = next(iter(tokens.tokens.values()))
    assert stored.email == "invitee@example.com"
    assert stored.token_hash != ""
    assert stored.used_at is None
    assert stored.expires_at > datetime.now(UTC) + INVITE_TOKEN_TTL - timedelta(minutes=1)
    assert "Invitation to join" in mailer.sent[0].subject
    assert "/invites/accept?token=" in mailer.sent[0].body_text
    raw = mailer.sent[0].body_text.split("token=", 1)[1].split()[0]
    assert tokens.tokens.get(raw) is None


def test_owner_invite_unregistered_sends_signup() -> None:
    lists, users, owner_id, list_id, _ = _owner_setup()
    mailer = CapturingMailer()
    service = InviteMemberToListService(
        lists, users, users, FakeTokens(), mailer, public_app_url="http://localhost:3000"
    )

    result = service.execute(
        InviteMemberToListCommand(
            actor_user_id=owner_id,
            list_id=list_id,
            email="new@example.com",
        )
    )

    assert result.template_kind == "signup"
    assert "Create an account" in mailer.sent[0].subject
    assert "/signup?invite=" in mailer.sent[0].body_text


def test_member_not_owner_rejected() -> None:
    member = AuthUserRecord(id=uuid4(), email="member@example.com", password_hash="x")
    lists, users, _, list_id, _ = _owner_setup(member_not_owner=member)
    service = InviteMemberToListService(
        lists,
        users,
        users,
        FakeTokens(),
        CapturingMailer(),
        public_app_url="http://localhost:3000",
    )

    with pytest.raises(NotListOwnerError):
        service.execute(
            InviteMemberToListCommand(
                actor_user_id=member.id,
                list_id=list_id,
                email="new@example.com",
            )
        )


def test_non_member_rejected() -> None:
    lists, users, _, list_id, _ = _owner_setup()
    stranger = AuthUserRecord(id=uuid4(), email="stranger@example.com", password_hash="x")
    users.by_id[stranger.id] = stranger
    users.by_email[stranger.email] = stranger
    service = InviteMemberToListService(
        lists,
        users,
        users,
        FakeTokens(),
        CapturingMailer(),
        public_app_url="http://localhost:3000",
    )

    with pytest.raises(NotListMemberError):
        service.execute(
            InviteMemberToListCommand(
                actor_user_id=stranger.id,
                list_id=list_id,
                email="new@example.com",
            )
        )


def test_already_member_conflict() -> None:
    invitee = AuthUserRecord(id=uuid4(), email="invitee@example.com", password_hash="x")
    lists, users, owner_id, list_id, _ = _owner_setup(invitee=invitee)
    lists.memberships[(list_id, invitee.id)] = MembershipRecord(
        list_id=list_id, user_id=invitee.id, role="member"
    )
    service = InviteMemberToListService(
        lists,
        users,
        users,
        FakeTokens(),
        CapturingMailer(),
        public_app_url="http://localhost:3000",
    )

    with pytest.raises(AlreadyListMemberError):
        service.execute(
            InviteMemberToListCommand(
                actor_user_id=owner_id,
                list_id=list_id,
                email="invitee@example.com",
            )
        )


def test_inviter_locale_es_uses_spanish_template() -> None:
    lists, users, owner_id, list_id, _ = _owner_setup(language="es")
    mailer = CapturingMailer()
    InviteMemberToListService(
        lists, users, users, FakeTokens(), mailer, public_app_url="http://localhost:3000"
    ).execute(
        InviteMemberToListCommand(
            actor_user_id=owner_id,
            list_id=list_id,
            email="new@example.com",
        )
    )

    assert "Invitación" in mailer.sent[0].subject or "Crea tu cuenta" in mailer.sent[0].subject


def test_smtp_failure_propagates_and_leaves_token_for_route_rollback() -> None:
    lists, users, owner_id, list_id, _ = _owner_setup()
    tokens = FakeTokens()
    mailer = CapturingMailer(fail=SmtpSendError())
    service = InviteMemberToListService(
        lists, users, users, tokens, mailer, public_app_url="http://localhost:3000"
    )

    with pytest.raises(SmtpSendError):
        service.execute(
            InviteMemberToListCommand(
                actor_user_id=owner_id,
                list_id=list_id,
                email="new@example.com",
            )
        )
    # Token was staged before send — route must db.rollback() (same as password reset).
    assert len(tokens.tokens) == 1


def test_smtp_config_failure_propagates() -> None:
    lists, users, owner_id, list_id, _ = _owner_setup()
    mailer = CapturingMailer(fail=SmtpConfigurationError())
    service = InviteMemberToListService(
        lists, users, users, FakeTokens(), mailer, public_app_url="http://localhost:3000"
    )

    with pytest.raises(SmtpConfigurationError):
        service.execute(
            InviteMemberToListCommand(
                actor_user_id=owner_id,
                list_id=list_id,
                email="new@example.com",
            )
        )


def test_reinvite_invalidates_prior_outstanding() -> None:
    lists, users, owner_id, list_id, _ = _owner_setup()
    tokens = FakeTokens()
    mailer = CapturingMailer()
    service = InviteMemberToListService(
        lists, users, users, tokens, mailer, public_app_url="http://localhost:3000"
    )

    service.execute(
        InviteMemberToListCommand(actor_user_id=owner_id, list_id=list_id, email="new@example.com")
    )
    first_hash = next(iter(tokens.tokens))
    service.execute(
        InviteMemberToListCommand(actor_user_id=owner_id, list_id=list_id, email="new@example.com")
    )
    assert tokens.tokens[first_hash].used_at is not None
    unused = [t for t in tokens.tokens.values() if t.used_at is None]
    assert len(unused) == 1


def test_build_invite_email_renders_en_and_es_and_strips_crlf() -> None:
    en = build_invite_email_message(
        to="a@example.com",
        link="http://x/invites/accept?token=t",
        list_name="Home\nBcc: evil@x",
        inviter_display="owner@example.com",
        locale="en",
        kind="join",
    )
    es = build_invite_email_message(
        to="b@example.com",
        link="http://x/signup?invite=t",
        list_name="Home",
        inviter_display="owner@example.com",
        locale="es",
        kind="signup",
    )
    assert "\n" not in en.subject
    assert "\r" not in en.subject
    assert "Home Bcc: evil@x" in en.subject  # newlines collapsed; no header fold
    assert f"valid for {INVITE_TOKEN_TTL.days} days" in en.body_text
    assert "Crea tu cuenta" in es.subject
    assert "Crear cuenta y unirme" in (es.body_html or "")
    assert f"válido {INVITE_TOKEN_TTL.days} días" in es.body_text


def test_invite_service_module_does_not_call_ensure_email_verified() -> None:
    import application.list_invite as mod
    import inspect

    source = inspect.getsource(mod)
    assert "EnsureEmailVerified" not in source
    assert "ensure_email_verified" not in source
