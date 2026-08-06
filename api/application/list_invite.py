"""Invite member to list — owner-only send (Story 2.3). Acceptance = Story 2.4."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from html import escape
from typing import Protocol
from uuid import UUID, uuid4

from domain.errors import (
    AlreadyListMemberError,
    InvalidInviteEmailError,
    ListNotFoundError,
    NotListMemberError,
    SmtpConfigurationError,
    SmtpSendError,
)
from domain.list_invite import (
    INVITE_TOKEN_TTL,
    InviteLocale,
    InviteTemplateKind,
    build_invite_link,
    generate_raw_invite_token,
    hash_invite_token,
    resolve_invite_locale,
    resolve_invite_template_kind,
    validate_invite_email,
)

from application.list_access import (
    AuthorizeListAccessCommand,
    AuthorizeListAccessService,
)
from application.lists import ListRecord, MembershipRecord
from application.ports import (
    EmailMessage,
    EmailSender,
    PreferencesRepository,
    UserPreferencesRecord,
)
from application.signin import AuthUserRepository


@dataclass(frozen=True, slots=True)
class ListInviteTokenRecord:
    id: UUID
    list_id: UUID
    email: str
    token_hash: str
    inviter_user_id: UUID
    locale: str
    expires_at: datetime
    used_at: datetime | None


class ListInviteTokenRepository(Protocol):
    def invalidate_outstanding_for_list_email(self, list_id: UUID, email: str) -> None: ...

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
    ) -> None: ...

    def get_by_token_hash(self, token_hash: str) -> ListInviteTokenRecord | None: ...

    def claim_token(self, token_id: UUID, *, used_at: datetime) -> bool: ...


class ListInviteLookup(Protocol):
    """Narrow list surface for invite ACL + name resolution."""

    def get_list(self, list_id: UUID) -> ListRecord | None: ...

    def get_membership(self, list_id: UUID, user_id: UUID) -> MembershipRecord | None: ...


@dataclass(frozen=True, slots=True)
class InviteMemberToListCommand:
    actor_user_id: UUID
    list_id: UUID
    email: str


@dataclass(frozen=True, slots=True)
class InviteMemberToListResult:
    status: str  # "sent"
    template_kind: str  # "join" | "signup"
    invite_id: UUID


def _safe_header_text(value: str) -> str:
    """Strip CR/LF so list names cannot inject email headers / MIME structure."""
    return value.replace("\r", " ").replace("\n", " ")


def build_invite_email_message(
    *,
    to: str,
    link: str,
    list_name: str,
    inviter_display: str,
    locale: InviteLocale,
    kind: InviteTemplateKind,
) -> EmailMessage:
    """Join/signup templates × EN/ES — same EmailMessage shape as password-reset."""
    safe_name = _safe_header_text(list_name)
    safe_inviter = _safe_header_text(inviter_display)
    safe_href = escape(link, quote=True)
    safe_list_html = escape(safe_name)
    safe_inviter_html = escape(safe_inviter)
    ttl_days = INVITE_TOKEN_TTL.days

    if locale == "es":
        if kind == "join":
            subject = f"Invitación a unirte a {safe_name}"
            body_text = (
                f"{safe_inviter} te invitó a la lista «{safe_name}» en finance-helper.\n\n"
                f"Abre este enlace para unirte (válido {ttl_days} días):\n{link}\n\n"
                "Si no esperabas esta invitación, puedes ignorar este correo.\n"
            )
            body_html = (
                f"<p>{safe_inviter_html} te invitó a la lista «{safe_list_html}» en finance-helper.</p>"
                f"<p>Abre este enlace para unirte (válido {ttl_days} días):</p>"
                f'<p><a href="{safe_href}">Unirme a la lista</a></p>'
                "<p>Si no esperabas esta invitación, puedes ignorar este correo.</p>"
            )
        else:
            subject = f"Crea tu cuenta para unirte a {safe_name}"
            body_text = (
                f"{safe_inviter} te invitó a la lista «{safe_name}» en finance-helper.\n\n"
                f"Crea una cuenta con este enlace para unirte (válido {ttl_days} días):\n{link}\n\n"
                "Si no esperabas esta invitación, puedes ignorar este correo.\n"
            )
            body_html = (
                f"<p>{safe_inviter_html} te invitó a la lista «{safe_list_html}» en finance-helper.</p>"
                f"<p>Crea una cuenta con este enlace para unirte (válido {ttl_days} días):</p>"
                f'<p><a href="{safe_href}">Crear cuenta y unirme</a></p>'
                "<p>Si no esperabas esta invitación, puedes ignorar este correo.</p>"
            )
        return EmailMessage(
            to_address=to,
            subject=subject,
            body_text=body_text,
            body_html=body_html,
        )

    if kind == "join":
        subject = f"Invitation to join {safe_name}"
        body_text = (
            f"{safe_inviter} invited you to the list “{safe_name}” on finance-helper.\n\n"
            f"Open this link to join (valid for {ttl_days} days):\n{link}\n\n"
            "If you weren’t expecting this, you can ignore this email.\n"
        )
        body_html = (
            f"<p>{safe_inviter_html} invited you to the list “{safe_list_html}” on finance-helper.</p>"
            f"<p>Open this link to join (valid for {ttl_days} days):</p>"
            f'<p><a href="{safe_href}">Join the list</a></p>'
            "<p>If you weren’t expecting this, you can ignore this email.</p>"
        )
    else:
        subject = f"Create an account to join {safe_name}"
        body_text = (
            f"{safe_inviter} invited you to the list “{safe_name}” on finance-helper.\n\n"
            f"Create an account with this link to join (valid for {ttl_days} days):\n{link}\n\n"
            "If you weren’t expecting this, you can ignore this email.\n"
        )
        body_html = (
            f"<p>{safe_inviter_html} invited you to the list “{safe_list_html}” on finance-helper.</p>"
            f"<p>Create an account with this link to join (valid for {ttl_days} days):</p>"
            f'<p><a href="{safe_href}">Create account and join</a></p>'
            "<p>If you weren’t expecting this, you can ignore this email.</p>"
        )
    return EmailMessage(
        to_address=to,
        subject=subject,
        body_text=body_text,
        body_html=body_html,
    )


class InviteMemberToListService:
    """Authenticate owner → issue hashed invite token → send join or signup mail.

    Does not create membership (Story 2.4). Fail-loud on SMTP (AC #5 / NFR-10).
    """

    def __init__(
        self,
        lists: ListInviteLookup,
        users: AuthUserRepository,
        prefs: PreferencesRepository,
        tokens: ListInviteTokenRepository,
        mailer: EmailSender,
        *,
        public_app_url: str,
    ) -> None:
        self._lists = lists
        self._users = users
        self._prefs = prefs
        self._tokens = tokens
        self._mailer = mailer
        self._public_app_url = public_app_url.rstrip("/")

    def execute(self, command: InviteMemberToListCommand) -> InviteMemberToListResult:
        try:
            email = validate_invite_email(command.email)
        except InvalidInviteEmailError:
            raise

        AuthorizeListAccessService(self._lists).execute(
            AuthorizeListAccessCommand(
                acting_user_id=command.actor_user_id,
                list_id=command.list_id,
                action="invite_member",
            )
        )

        owned_list = self._lists.get_list(command.list_id)
        if owned_list is None:  # pragma: no cover - ACL already checked existence
            raise ListNotFoundError()

        invitee = self._users.get_by_email(email)
        if invitee is not None:
            membership = self._lists.get_membership(command.list_id, invitee.id)
            if membership is not None:
                raise AlreadyListMemberError()

        inviter = self._users.get_by_id(command.actor_user_id)
        if inviter is None:
            raise NotListMemberError()

        prefs: UserPreferencesRecord | None = self._prefs.get_preferences(command.actor_user_id)
        locale = resolve_invite_locale(prefs.language if prefs else None)
        kind = resolve_invite_template_kind(invitee_registered=invitee is not None)

        raw = generate_raw_invite_token()
        token_hash = hash_invite_token(raw)
        now = datetime.now(UTC)
        expires_at = now + INVITE_TOKEN_TTL
        token_id = uuid4()

        # Persist first so any emailed link is redeemable. API must roll back on SMTP fail.
        self._tokens.invalidate_outstanding_for_list_email(command.list_id, email)
        self._tokens.create_token(
            token_id=token_id,
            list_id=command.list_id,
            email=email,
            token_hash=token_hash,
            inviter_user_id=command.actor_user_id,
            locale=locale,
            expires_at=expires_at,
        )

        link = build_invite_link(
            public_app_url=self._public_app_url,
            raw_token=raw,
            kind=kind,
        )

        message = build_invite_email_message(
            to=email,
            link=link,
            list_name=owned_list.name,
            inviter_display=inviter.email,
            locale=locale,
            kind=kind,
        )

        try:
            self._mailer.send(message)
        except (SmtpConfigurationError, SmtpSendError):
            raise
        except Exception as exc:  # pragma: no cover
            raise SmtpSendError(
                "Could not send email. Check SMTP connectivity and try again."
            ) from exc

        return InviteMemberToListResult(
            status="sent",
            template_kind=kind,
            invite_id=token_id,
        )
