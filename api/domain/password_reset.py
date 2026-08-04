"""Password-reset token rules (pure — no I/O)."""

from __future__ import annotations

import hashlib
import secrets
from datetime import timedelta

from domain.errors import InvalidResetPasswordError
from domain.signup import MIN_PASSWORD_LEN, is_valid_email_shape, normalize_email

RESET_TOKEN_TTL = timedelta(hours=1)
RESET_TOKEN_BYTES = 32
MAX_PASSWORD_LEN = 256


def hash_reset_token(raw_token: str) -> str:
    """SHA-256 hex digest of the raw token — store only the hash at rest."""
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def generate_raw_reset_token() -> str:
    return secrets.token_urlsafe(RESET_TOKEN_BYTES)


def validate_reset_request_email(email: str) -> str:
    """Normalize email for a reset request. Empty/invalid → empty string (no oracle)."""
    normalized = normalize_email(email)
    if not is_valid_email_shape(normalized):
        return ""
    return normalized


def validate_new_password(password: str) -> None:
    if len(password) < MIN_PASSWORD_LEN:
        raise InvalidResetPasswordError(InvalidResetPasswordError.MESSAGE)
    if len(password) > MAX_PASSWORD_LEN:
        raise InvalidResetPasswordError("Password must be at most 256 characters.")
