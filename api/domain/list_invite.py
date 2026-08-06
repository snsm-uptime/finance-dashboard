"""List invite token rules (pure — no I/O). Story 2.3."""

from __future__ import annotations

import hashlib
import secrets
from datetime import timedelta
from typing import Literal

from domain.errors import InvalidInviteEmailError
from domain.preferences import coerce_stored_language
from domain.signup import is_valid_email_shape, normalize_email

# Longer than password-reset (1h) — invitees may take days to join.
INVITE_TOKEN_TTL = timedelta(days=7)
INVITE_TOKEN_BYTES = 32

InviteTemplateKind = Literal["join", "signup"]
InviteLocale = Literal["en", "es"]

# Deep links reserved for Story 2.4 accept / signup-with-invite wiring.
INVITE_ACCEPT_PATH = "/invites/accept"
INVITE_SIGNUP_PATH = "/sign-up"


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
