"""Email verification gate rules and token helpers (pure — no I/O)."""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta

from domain.errors import EmailNotVerifiedError

# Match Story 1.5 guidance: ≤24h; opaque token hashed at rest (same SHA-256 as reset).
VERIFICATION_TOKEN_TTL = timedelta(hours=24)
VERIFICATION_TOKEN_BYTES = 32


def hash_verification_token(raw_token: str) -> str:
    """SHA-256 hex digest of the raw token — store only the hash at rest."""
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def generate_raw_verification_token() -> str:
    return secrets.token_urlsafe(VERIFICATION_TOKEN_BYTES)


def ensure_email_verified(
    *,
    email_verification_required: bool,
    email_verified_at: datetime | None,
) -> None:
    """No-op when the deployment gate is off; otherwise require a verified timestamp.

    Stable application/domain port for Epic 2 invite acceptance and similar gated flows.
    """
    if not email_verification_required:
        return
    if email_verified_at is None:
        raise EmailNotVerifiedError()
