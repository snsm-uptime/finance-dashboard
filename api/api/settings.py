"""Auth / session settings from environment."""

from __future__ import annotations

import os
from dataclasses import dataclass


def _env_bool(name: str, default: bool = False) -> bool:
    raw = (os.environ.get(name) or "").strip().lower()
    if not raw:
        return default
    return raw in {"1", "true", "yes", "on"}


@dataclass(frozen=True, slots=True)
class AuthSettings:
    session_secret: str
    session_cookie_name: str
    session_cookie_secure: bool
    session_cookie_samesite: str
    email_verification_required: bool


def load_auth_settings() -> AuthSettings:
    secret = (os.environ.get("SESSION_SECRET") or "").strip()
    if not secret:
        # Allow tests / health-only boot without auth routes needing secret;
        # register route will reject empty secret when issuing cookies.
        secret = ""
    samesite = (os.environ.get("SESSION_COOKIE_SAMESITE") or "lax").strip().lower()
    if samesite not in {"lax", "strict", "none"}:
        samesite = "lax"
    return AuthSettings(
        session_secret=secret,
        session_cookie_name=(os.environ.get("SESSION_COOKIE_NAME") or "fh_session").strip()
        or "fh_session",
        session_cookie_secure=_env_bool("SESSION_COOKIE_SECURE", default=False),
        session_cookie_samesite=samesite,
        email_verification_required=_env_bool("EMAIL_VERIFICATION_REQUIRED", default=False),
    )
