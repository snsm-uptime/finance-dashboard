"""Signup validation rules (pure — no I/O)."""

from __future__ import annotations

import re

from domain.errors import InvalidSignupError

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
MIN_PASSWORD_LEN = 8
_MIN_PASSWORD_LEN = MIN_PASSWORD_LEN  # backwards-compatible alias
PERSONAL_LIST_NAME = "Personal"


def normalize_email(email: str) -> str:
    return email.strip().lower()


def validate_signup_input(email: str, password: str) -> str:
    """Validate and return normalized email. Raises InvalidSignupError."""
    normalized = normalize_email(email)
    if not normalized or not _EMAIL_RE.match(normalized):
        raise InvalidSignupError("Enter a valid email address.")
    if not password or not password.strip():
        raise InvalidSignupError("Password must be at least 8 characters.")
    if len(password) < MIN_PASSWORD_LEN:
        raise InvalidSignupError("Password must be at least 8 characters.")
    return normalized


def is_valid_email_shape(email: str) -> bool:
    return bool(email and _EMAIL_RE.match(email))
