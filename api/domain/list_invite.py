"""List invite token rules (pure — no I/O). Stories 2.3 (issue) / 2.4 (accept)."""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta
from typing import Literal

from domain.errors import (
    InvalidInviteEmailError,
    InvalidInviteTokenError,
    InviteEmailMismatchError,
)
from domain.preferences import coerce_stored_language
from domain.signup import is_valid_email_shape, normalize_email

# Longer than password-reset (1h) — invitees may take days to join.
INVITE_TOKEN_TTL = timedelta(days=7)
INVITE_TOKEN_BYTES = 32

InviteTemplateKind = Literal["join", "signup"]
InviteLocale = Literal["en", "es"]
InvitePreviewPath = Literal["signup", "join"]

# Deep links for Story 2.4 — UI signup is `/signup` (as-built), not `/sign-up`.
INVITE_ACCEPT_PATH = "/invites/accept"
INVITE_SIGNUP_PATH = "/signup"
INVITE_MEMBER_ROLE = "member"


def hash_invite_token(raw_token: str) -> str:
    """SHA-256 hex digest — store only the hash at rest; raw token only in email."""
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def generate_raw_invite_token() -> str:
    return secrets.token_urlsafe(INVITE_TOKEN_BYTES)


def validate_invite_email(email: str) -> str:
    """Normalize and validate invitee email. Raises InvalidInviteEmailError if bad."""
    normalized = normalize_email(email)
    if not is_valid_email_shape(normalized):
        raise InvalidInviteEmailError()
    return normalized


def resolve_invite_template_kind(*, invitee_registered: bool) -> InviteTemplateKind:
    """Registered users get join-list mail; unknown emails get create-account mail."""
    return "join" if invitee_registered else "signup"


def resolve_invite_locale(language: str | None) -> InviteLocale:
    """Inviter Account language (1.6) drives email locale — UX-DR16; null → en."""
    if coerce_stored_language(language) == "es":
        return "es"
    return "en"


def build_invite_link(
    *,
    public_app_url: str,
    raw_token: str,
    kind: InviteTemplateKind,
) -> str:
    base = public_app_url.rstrip("/")
    if kind == "join":
        return f"{base}{INVITE_ACCEPT_PATH}?token={raw_token}"
    return f"{base}{INVITE_SIGNUP_PATH}?invite={raw_token}"


def assert_invite_token_redeemable(
    *,
    used_at: datetime | None,
    expires_at: datetime,
    now: datetime,
) -> None:
    """Reject missing-row callers separately; this covers used / expired rows."""
    if used_at is not None:
        raise InvalidInviteTokenError()
    if expires_at <= now:
        raise InvalidInviteTokenError()


def assert_invite_email_bind(*, invitee_email: str, actor_email: str) -> None:
    """Signup/accept email must match the invitee on the token (case-normalized)."""
    if normalize_email(invitee_email) != normalize_email(actor_email):
        raise InviteEmailMismatchError()


def invite_email_hint(email: str) -> str:
    """Safe preview hint — do not leak full address to unauthenticated clients."""
    normalized = normalize_email(email)
    local, _, domain = normalized.partition("@")
    if not local or not domain:
        return "***"
    if len(local) == 1:
        masked_local = "*"
    elif len(local) == 2:
        masked_local = f"{local[0]}*"
    else:
        masked_local = f"{local[0]}***{local[-1]}"
    return f"{masked_local}@{domain}"


def resolve_invite_preview_path(*, invitee_registered: bool) -> InvitePreviewPath:
    """Registered invitees join; unknown emails sign up."""
    return "join" if invitee_registered else "signup"
