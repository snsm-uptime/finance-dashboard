"""Accept list invite / signup-with-invite (Story 2.4)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Protocol
from uuid import UUID, uuid4

from domain.errors import EmailNotVerifiedError, InvalidInviteTokenError
from domain.list_invite import (
    INVITE_MEMBER_ROLE,
    assert_invite_email_bind,
    assert_invite_token_redeemable,
    hash_invite_token,
    invite_email_hint,
    resolve_invite_preview_path,
)
from domain.signup import normalize_email

from application.email_verification import (
    EmailVerificationRepository,
    EnsureEmailVerifiedCommand,
    EnsureEmailVerifiedService,
)
from application.list_invite import ListInviteTokenRecord, ListInviteTokenRepository
from application.lists import ListRecord, MembershipRecord
from application.ports import NewMembershipRecord
from application.signin import AuthUserRepository
from application.signup import SignupCommand, SignUpService


class ListInviteAcceptLookup(Protocol):
    def get_list(self, list_id: UUID) -> ListRecord | None: ...

    def get_membership(self, list_id: UUID, user_id: UUID) -> MembershipRecord | None: ...

    def add_membership(self, membership: NewMembershipRecord) -> None: ...


class ClaimableListInviteTokenRepository(ListInviteTokenRepository, Protocol):
    def claim_token(self, token_id: UUID, *, used_at: datetime) -> bool: ...


@dataclass(frozen=True, slots=True)
class AcceptListInviteCommand:
    actor_user_id: UUID
    raw_token: str
    email_verification_required: bool


@dataclass(frozen=True, slots=True)
class AcceptListInviteResult:
    list_id: UUID
    already_member: bool = False


@dataclass(frozen=True, slots=True)
class SignUpWithInviteCommand:
    email: str
    password: str
    raw_token: str
    email_verification_required: bool


@dataclass(frozen=True, slots=True)
class SignUpWithInviteResult:
    user_id: UUID
    email: str
    personal_list_id: UUID
    personal_list_name: str
    inviting_list_id: UUID | None
    requires_email_verification: bool


@dataclass(frozen=True, slots=True)
class PreviewListInviteCommand:
    raw_token: str


@dataclass(frozen=True, slots=True)
class PreviewListInviteResult:
    list_name: str
    email: str
    email_hint: str
    path: str  # "signup" | "join"


def _load_redeemable_invite(
    tokens: ListInviteTokenRepository,
    raw_token: str,
    *,
    now: datetime,
) -> ListInviteTokenRecord:
    token_hash = hash_invite_token(raw_token.strip())
    row = tokens.get_by_token_hash(token_hash)
    if row is None:
        raise InvalidInviteTokenError()
    assert_invite_token_redeemable(
        used_at=row.used_at,
        expires_at=row.expires_at,
        now=now,
    )
    return row


def _claim_or_raise(
    tokens: ClaimableListInviteTokenRepository,
    token_id: UUID,
    *,
    now: datetime,
) -> None:
    if not tokens.claim_token(token_id, used_at=now):
        raise InvalidInviteTokenError()


class AcceptListInviteService:
    """Registered join + post-verify retry: email-bind → Ensure → claim → membership."""

    def __init__(
        self,
        tokens: ClaimableListInviteTokenRepository,
        users: AuthUserRepository,
        lists: ListInviteAcceptLookup,
        verification: EmailVerificationRepository,
    ) -> None:
        self._tokens = tokens
        self._users = users
        self._lists = lists
        self._ensure = EnsureEmailVerifiedService(verification)

    def execute(self, command: AcceptListInviteCommand) -> AcceptListInviteResult:
        now = datetime.now(UTC)
        token_hash = hash_invite_token(command.raw_token.strip())
        invite = self._tokens.get_by_token_hash(token_hash)
        if invite is None:
            raise InvalidInviteTokenError()

        actor = self._users.get_by_id(command.actor_user_id)
        if actor is None:
            raise InvalidInviteTokenError()

        assert_invite_email_bind(invitee_email=invite.email, actor_email=actor.email)

        existing = self._lists.get_membership(invite.list_id, command.actor_user_id)
        if existing is not None:
            # Idempotent silent success even if token already used/expired.
            if invite.used_at is None and invite.expires_at > now:
                self._tokens.claim_token(invite.id, used_at=now)
            return AcceptListInviteResult(list_id=invite.list_id, already_member=True)

        assert_invite_token_redeemable(
            used_at=invite.used_at,
            expires_at=invite.expires_at,
            now=now,
        )

        self._ensure.execute(
            EnsureEmailVerifiedCommand(
                user_id=command.actor_user_id,
                email_verification_required=command.email_verification_required,
            )
        )

        _claim_or_raise(self._tokens, invite.id, now=now)
        self._lists.add_membership(
            NewMembershipRecord(
                id=uuid4(),
                list_id=invite.list_id,
                user_id=command.actor_user_id,
                role=INVITE_MEMBER_ROLE,
            )
        )
        return AcceptListInviteResult(list_id=invite.list_id, already_member=False)


class SignUpWithInviteService:
    """Unregistered path: compose SignUpService + invite accept rules.

    When EMAIL_VERIFICATION_REQUIRED is on, keep user/session/personal list and
    return requires_email_verification=True without claiming the token or creating
    inviting membership (retry via AcceptListInvite after verify).
    """

    def __init__(
        self,
        signup: SignUpService,
        tokens: ClaimableListInviteTokenRepository,
        users: AuthUserRepository,
        lists: ListInviteAcceptLookup,
        verification: EmailVerificationRepository,
    ) -> None:
        self._signup = signup
        self._tokens = tokens
        self._users = users
        self._lists = lists
        self._ensure = EnsureEmailVerifiedService(verification)

    def execute(self, command: SignUpWithInviteCommand) -> SignUpWithInviteResult:
        now = datetime.now(UTC)
        invite = _load_redeemable_invite(self._tokens, command.raw_token, now=now)
        assert_invite_email_bind(invitee_email=invite.email, actor_email=command.email)

        created = self._signup.execute(
            SignupCommand(
                email=command.email,
                password=command.password,
                email_verification_required=command.email_verification_required,
            )
        )

        try:
            self._ensure.execute(
                EnsureEmailVerifiedCommand(
                    user_id=created.user_id,
                    email_verification_required=command.email_verification_required,
                )
            )
        except EmailNotVerifiedError:
            return SignUpWithInviteResult(
                user_id=created.user_id,
                email=created.email,
                personal_list_id=created.list_id,
                personal_list_name=created.list_name,
                inviting_list_id=None,
                requires_email_verification=True,
            )

        _claim_or_raise(self._tokens, invite.id, now=now)
        self._lists.add_membership(
            NewMembershipRecord(
                id=uuid4(),
                list_id=invite.list_id,
                user_id=created.user_id,
                role=INVITE_MEMBER_ROLE,
            )
        )
        return SignUpWithInviteResult(
            user_id=created.user_id,
            email=created.email,
            personal_list_id=created.list_id,
            personal_list_name=created.list_name,
            inviting_list_id=invite.list_id,
            requires_email_verification=False,
        )


class PreviewListInviteService:
    """Public safe preview for invite deep links (no membership side effects)."""

    def __init__(
        self,
        tokens: ListInviteTokenRepository,
        lists: ListInviteAcceptLookup,
        users: AuthUserRepository,
    ) -> None:
        self._tokens = tokens
        self._lists = lists
        self._users = users

    def execute(self, command: PreviewListInviteCommand) -> PreviewListInviteResult:
        now = datetime.now(UTC)
        invite = _load_redeemable_invite(self._tokens, command.raw_token, now=now)
        owned = self._lists.get_list(invite.list_id)
        if owned is None:
            raise InvalidInviteTokenError()

        invitee = self._users.get_by_email(normalize_email(invite.email))
        path = resolve_invite_preview_path(invitee_registered=invitee is not None)
        return PreviewListInviteResult(
            list_name=owned.name,
            email=normalize_email(invite.email),
            email_hint=invite_email_hint(invite.email),
            path=path,
        )
