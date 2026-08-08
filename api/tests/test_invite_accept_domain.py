"""Domain/application TDD for invite accept / signup-with-invite (Story 2.4)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from application.email_verification import EmailVerificationTokenRecord
from application.list_invite import ListInviteTokenRecord
from application.list_invite_accept import (
    AcceptListInviteCommand,
    AcceptListInviteService,
    PreviewListInviteCommand,
    PreviewListInviteService,
    SignUpWithInviteCommand,
    SignUpWithInviteService,
)
from application.lists import ListRecord, MembershipRecord
from application.ports import (
    NewListRecord,
    NewMembershipRecord,
    NewUserRecord,
)
from application.signin import AuthUserRecord
from application.signup import SignUpService
from domain.errors import (
    EmailNotVerifiedError,
    InvalidInviteTokenError,
    InviteEmailMismatchError,
)
from domain.list_invite import (
    INVITE_MEMBER_ROLE,
    assert_invite_email_bind,
    assert_invite_token_redeemable,
    hash_invite_token,
    invite_email_hint,
    resolve_invite_preview_path,
)


@dataclass
class FakeLists:
    lists: dict[UUID, ListRecord] = field(default_factory=dict)
    memberships: dict[tuple[UUID, UUID], MembershipRecord] = field(default_factory=dict)

    def get_list(self, list_id: UUID) -> ListRecord | None:
        return self.lists.get(list_id)

    def get_membership(self, list_id: UUID, user_id: UUID) -> MembershipRecord | None:
        return self.memberships.get((list_id, user_id))

    def add_membership(self, membership: NewMembershipRecord) -> None:
        self.memberships[(membership.list_id, membership.user_id)] = MembershipRecord(
            list_id=membership.list_id,
            user_id=membership.user_id,
            role=membership.role,
        )


@dataclass
class FakeUsers:
    by_id: dict[UUID, AuthUserRecord] = field(default_factory=dict)
    by_email: dict[str, AuthUserRecord] = field(default_factory=dict)

    def get_by_email(self, email: str) -> AuthUserRecord | None:
        return self.by_email.get(email)

    def get_by_id(self, user_id: UUID) -> AuthUserRecord | None:
        return self.by_id.get(user_id)

    def add(self, user: AuthUserRecord) -> None:
        self.by_id[user.id] = user
        self.by_email[user.email] = user


@dataclass
class FakeTokens:
    tokens: dict[str, ListInviteTokenRecord] = field(default_factory=dict)

    def invalidate_outstanding_for_list_email(self, list_id: UUID, email: str) -> None:
        raise NotImplementedError

    def create_token(self, **kwargs):  # noqa: ANN003
        raise NotImplementedError

    def get_by_token_hash(self, token_hash: str) -> ListInviteTokenRecord | None:
        return self.tokens.get(token_hash)

    def claim_token(self, token_id: UUID, *, used_at: datetime) -> bool:
        for key, token in list(self.tokens.items()):
            if token.id != token_id:
                continue
            now = datetime.now(UTC)
            if token.used_at is not None or token.expires_at <= now:
                return False
            self.tokens[key] = ListInviteTokenRecord(
                id=token.id,
                list_id=token.list_id,
                email=token.email,
                token_hash=token.token_hash,
                inviter_user_id=token.inviter_user_id,
                locale=token.locale,
                expires_at=token.expires_at,
                used_at=used_at,
            )
            return True
        return False


@dataclass
class FakeVerification:
    verified_at: dict[UUID, datetime | None] = field(default_factory=dict)

    def get_user_verified_at(self, user_id: UUID) -> datetime | None:
        return self.verified_at.get(user_id)

    def mark_email_verified(self, user_id: UUID, *, verified_at: datetime) -> None:
        self.verified_at[user_id] = verified_at

    def invalidate_outstanding_for_user(self, user_id: UUID) -> None:
        raise NotImplementedError

    def create_token(self, **kwargs):  # noqa: ANN003
        raise NotImplementedError

    def get_by_token_hash(self, token_hash: str) -> EmailVerificationTokenRecord | None:
        raise NotImplementedError

    def claim_token(self, token_id: UUID, *, used_at: datetime) -> bool:
        raise NotImplementedError


@dataclass
class FakeSignupRepo:
    emails: set[str] = field(default_factory=set)
    users: list[NewUserRecord] = field(default_factory=list)
    lists: list[NewListRecord] = field(default_factory=list)
    memberships: list[NewMembershipRecord] = field(default_factory=list)

    def email_exists(self, email: str) -> bool:
        return email in self.emails

    def create_user_with_personal_list(
        self,
        *,
        user: NewUserRecord,
        personal_list: NewListRecord,
        membership: NewMembershipRecord,
    ) -> None:
        self.emails.add(user.email)
        self.users.append(user)
        self.lists.append(personal_list)
        self.memberships.append(membership)


class PlainHasher:
    def hash(self, password: str) -> str:
        return f"hash:{password}"

    def verify(self, password: str, password_hash: str) -> bool:
        return password_hash == f"hash:{password}"


def _invite(
    *,
    email: str = "invitee@example.com",
    list_id: UUID | None = None,
    used_at: datetime | None = None,
    expires_at: datetime | None = None,
    raw: str = "raw-invite-token",
) -> tuple[str, ListInviteTokenRecord]:
    lid = list_id or uuid4()
    now = datetime.now(UTC)
    record = ListInviteTokenRecord(
        id=uuid4(),
        list_id=lid,
        email=email,
        token_hash=hash_invite_token(raw),
        inviter_user_id=uuid4(),
        locale="en",
        expires_at=expires_at or (now + timedelta(days=7)),
        used_at=used_at,
    )
    return raw, record


def test_assert_invite_token_redeemable_rejects_used_and_expired() -> None:
    now = datetime.now(UTC)
    assert_invite_token_redeemable(used_at=None, expires_at=now + timedelta(hours=1), now=now)
    with pytest.raises(InvalidInviteTokenError):
        assert_invite_token_redeemable(used_at=now, expires_at=now + timedelta(hours=1), now=now)
    with pytest.raises(InvalidInviteTokenError):
        assert_invite_token_redeemable(used_at=None, expires_at=now - timedelta(seconds=1), now=now)


def test_assert_invite_email_bind_normalizes_case() -> None:
    assert_invite_email_bind(invitee_email="Invitee@Example.com", actor_email="invitee@example.com")
    with pytest.raises(InviteEmailMismatchError):
        assert_invite_email_bind(
            invitee_email="invitee@example.com", actor_email="other@example.com"
        )


def test_invite_email_hint_masks_local_part() -> None:
    assert invite_email_hint("invitee@example.com") == "i***e@example.com"
    assert resolve_invite_preview_path(invitee_registered=False) == "signup"
    assert resolve_invite_preview_path(invitee_registered=True) == "join"


def test_accept_creates_member_membership_and_claims_token() -> None:
    raw, invite = _invite()
    tokens = FakeTokens(tokens={invite.token_hash: invite})
    lists = FakeLists(lists={invite.list_id: ListRecord(invite.list_id, "Household", uuid4())})
    invitee = AuthUserRecord(id=uuid4(), email="invitee@example.com", password_hash="x")
    users = FakeUsers()
    users.add(invitee)
    verification = FakeVerification(verified_at={invitee.id: None})

    result = AcceptListInviteService(tokens, users, lists, verification).execute(
        AcceptListInviteCommand(
            actor_user_id=invitee.id,
            raw_token=raw,
            email_verification_required=False,
        )
    )
    assert result.list_id == invite.list_id
    assert result.already_member is False
    membership = lists.get_membership(invite.list_id, invitee.id)
    assert membership is not None
    assert membership.role == INVITE_MEMBER_ROLE
    assert tokens.get_by_token_hash(invite.token_hash).used_at is not None


def test_accept_email_mismatch_rejected() -> None:
    raw, invite = _invite(email="invitee@example.com")
    tokens = FakeTokens(tokens={invite.token_hash: invite})
    lists = FakeLists(lists={invite.list_id: ListRecord(invite.list_id, "H", uuid4())})
    other = AuthUserRecord(id=uuid4(), email="other@example.com", password_hash="x")
    users = FakeUsers()
    users.add(other)

    with pytest.raises(InviteEmailMismatchError):
        AcceptListInviteService(tokens, users, lists, FakeVerification()).execute(
            AcceptListInviteCommand(
                actor_user_id=other.id,
                raw_token=raw,
                email_verification_required=False,
            )
        )
    assert lists.get_membership(invite.list_id, other.id) is None


def test_accept_expired_or_used_no_membership() -> None:
    now = datetime.now(UTC)
    raw_used, used = _invite(used_at=now)
    raw_exp, expired = _invite(expires_at=now - timedelta(minutes=1))
    invitee = AuthUserRecord(id=uuid4(), email="invitee@example.com", password_hash="x")
    users = FakeUsers()
    users.add(invitee)
    lists = FakeLists(
        lists={
            used.list_id: ListRecord(used.list_id, "H", uuid4()),
            expired.list_id: ListRecord(expired.list_id, "H", uuid4()),
        }
    )

    with pytest.raises(InvalidInviteTokenError):
        AcceptListInviteService(
            FakeTokens(tokens={used.token_hash: used}),
            users,
            lists,
            FakeVerification(),
        ).execute(
            AcceptListInviteCommand(
                actor_user_id=invitee.id,
                raw_token=raw_used,
                email_verification_required=False,
            )
        )
    with pytest.raises(InvalidInviteTokenError):
        AcceptListInviteService(
            FakeTokens(tokens={expired.token_hash: expired}),
            users,
            lists,
            FakeVerification(),
        ).execute(
            AcceptListInviteCommand(
                actor_user_id=invitee.id,
                raw_token=raw_exp,
                email_verification_required=False,
            )
        )


def test_accept_already_member_silent_idempotent() -> None:
    raw, invite = _invite()
    invitee = AuthUserRecord(id=uuid4(), email="invitee@example.com", password_hash="x")
    users = FakeUsers()
    users.add(invitee)
    lists = FakeLists(
        lists={invite.list_id: ListRecord(invite.list_id, "H", uuid4())},
        memberships={
            (invite.list_id, invitee.id): MembershipRecord(
                invite.list_id, invitee.id, INVITE_MEMBER_ROLE
            )
        },
    )
    tokens = FakeTokens(tokens={invite.token_hash: invite})

    result = AcceptListInviteService(tokens, users, lists, FakeVerification()).execute(
        AcceptListInviteCommand(
            actor_user_id=invitee.id,
            raw_token=raw,
            email_verification_required=False,
        )
    )
    assert result.already_member is True
    assert tokens.get_by_token_hash(invite.token_hash).used_at is not None


def test_accept_verification_required_blocks_before_claim() -> None:
    raw, invite = _invite()
    invitee = AuthUserRecord(id=uuid4(), email="invitee@example.com", password_hash="x")
    users = FakeUsers()
    users.add(invitee)
    lists = FakeLists(lists={invite.list_id: ListRecord(invite.list_id, "H", uuid4())})
    tokens = FakeTokens(tokens={invite.token_hash: invite})
    verification = FakeVerification(verified_at={invitee.id: None})

    with pytest.raises(EmailNotVerifiedError):
        AcceptListInviteService(tokens, users, lists, verification).execute(
            AcceptListInviteCommand(
                actor_user_id=invitee.id,
                raw_token=raw,
                email_verification_required=True,
            )
        )
    assert lists.get_membership(invite.list_id, invitee.id) is None
    assert tokens.get_by_token_hash(invite.token_hash).used_at is None


def test_signup_with_invite_creates_personal_and_inviting_membership() -> None:
    raw, invite = _invite()
    tokens = FakeTokens(tokens={invite.token_hash: invite})
    lists = FakeLists(lists={invite.list_id: ListRecord(invite.list_id, "Household", uuid4())})
    signup_repo = FakeSignupRepo()
    users = FakeUsers()
    verification = FakeVerification()

    # Bridge: after signup, Accept path needs users.get_by_id — SignUpWithInvite
    # does not need it for success path, but FakeUsers stays empty (OK).
    result = SignUpWithInviteService(
        SignUpService(signup_repo, PlainHasher()),
        tokens,
        users,
        lists,
        verification,
    ).execute(
        SignUpWithInviteCommand(
            email="invitee@example.com",
            password="password1",
            raw_token=raw,
            email_verification_required=False,
        )
    )
    assert result.requires_email_verification is False
    assert result.inviting_list_id == invite.list_id
    assert len(signup_repo.lists) == 1
    membership = lists.get_membership(invite.list_id, result.user_id)
    assert membership is not None
    assert membership.role == INVITE_MEMBER_ROLE
    assert tokens.get_by_token_hash(invite.token_hash).used_at is not None


def test_signup_with_invite_verify_on_partial_success() -> None:
    raw, invite = _invite()
    tokens = FakeTokens(tokens={invite.token_hash: invite})
    lists = FakeLists(lists={invite.list_id: ListRecord(invite.list_id, "H", uuid4())})
    signup_repo = FakeSignupRepo()

    result = SignUpWithInviteService(
        SignUpService(signup_repo, PlainHasher()),
        tokens,
        FakeUsers(),
        lists,
        FakeVerification(),
    ).execute(
        SignUpWithInviteCommand(
            email="invitee@example.com",
            password="password1",
            raw_token=raw,
            email_verification_required=True,
        )
    )
    assert result.requires_email_verification is True
    assert result.inviting_list_id is None
    assert len(signup_repo.users) == 1
    assert lists.get_membership(invite.list_id, result.user_id) is None
    assert tokens.get_by_token_hash(invite.token_hash).used_at is None


def test_signup_with_invite_email_mismatch() -> None:
    raw, invite = _invite(email="invitee@example.com")
    tokens = FakeTokens(tokens={invite.token_hash: invite})
    lists = FakeLists(lists={invite.list_id: ListRecord(invite.list_id, "H", uuid4())})

    with pytest.raises(InviteEmailMismatchError):
        SignUpWithInviteService(
            SignUpService(FakeSignupRepo(), PlainHasher()),
            tokens,
            FakeUsers(),
            lists,
            FakeVerification(),
        ).execute(
            SignUpWithInviteCommand(
                email="other@example.com",
                password="password1",
                raw_token=raw,
                email_verification_required=False,
            )
        )


def test_preview_signup_path_for_unregistered() -> None:
    raw, invite = _invite(email="invitee@example.com")
    tokens = FakeTokens(tokens={invite.token_hash: invite})
    lists = FakeLists(lists={invite.list_id: ListRecord(invite.list_id, "Household", uuid4())})

    preview = PreviewListInviteService(tokens, lists, FakeUsers()).execute(
        PreviewListInviteCommand(raw_token=raw)
    )
    assert preview.list_name == "Household"
    assert preview.path == "signup"
    assert preview.email_hint == "i***e@example.com"


def test_accept_deleted_list_is_invalid_invite() -> None:
    raw, invite = _invite(email="member@example.com")
    tokens = FakeTokens(tokens={invite.token_hash: invite})
    actor = AuthUserRecord(id=uuid4(), email="member@example.com", password_hash="x")
    users = FakeUsers()
    users.add(actor)
    lists = FakeLists()  # list missing

    with pytest.raises(InvalidInviteTokenError):
        AcceptListInviteService(
            tokens,
            users,
            lists,
            FakeVerification(verified_at={actor.id: datetime.now(UTC)}),
        ).execute(
            AcceptListInviteCommand(
                actor_user_id=actor.id,
                raw_token=raw,
                email_verification_required=False,
            )
        )


def test_accept_lost_claim_race_succeeds_if_membership_exists() -> None:
    """Concurrent winner claimed + joined; loser's claim fails but membership is there."""

    @dataclass
    class DeferredMembershipLists(FakeLists):
        _skip_first: bool = True

        def get_membership(self, list_id: UUID, user_id: UUID) -> MembershipRecord | None:
            if self._skip_first:
                self._skip_first = False
                return None
            return self.memberships.get((list_id, user_id))

    raw, invite = _invite(email="member@example.com")
    tokens = FakeTokens(tokens={invite.token_hash: invite})

    def always_lose_claim(token_id: UUID, *, used_at: datetime) -> bool:
        return False

    tokens.claim_token = always_lose_claim  # type: ignore[method-assign]

    actor = AuthUserRecord(id=uuid4(), email="member@example.com", password_hash="x")
    users = FakeUsers()
    users.add(actor)
    lists = DeferredMembershipLists(
        lists={invite.list_id: ListRecord(invite.list_id, "Household", uuid4())},
        memberships={
            (invite.list_id, actor.id): MembershipRecord(
                list_id=invite.list_id, user_id=actor.id, role="member"
            )
        },
    )

    result = AcceptListInviteService(
        tokens,
        users,
        lists,
        FakeVerification(verified_at={actor.id: datetime.now(UTC)}),
    ).execute(
        AcceptListInviteCommand(
            actor_user_id=actor.id,
            raw_token=raw,
            email_verification_required=False,
        )
    )
    assert result.already_member is True
    assert result.list_id == invite.list_id
