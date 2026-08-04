"""Auth / session / SMTP settings from environment."""

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
    public_app_url: str


def load_auth_settings() -> AuthSettings:
    secret = (os.environ.get("SESSION_SECRET") or "").strip()
    if not secret:
        # Allow tests / health-only boot without auth routes needing secret;
        # register/sign-in routes reject empty secret as a config presence gate.
        # Opaque session tokens are NOT HMAC'd with SESSION_SECRET (Story 1.2 review:
        # secrets.token_urlsafe stored server-side; secret remains required ops config).
        secret = ""
    samesite = (os.environ.get("SESSION_COOKIE_SAMESITE") or "lax").strip().lower()
    if samesite not in {"lax", "strict", "none"}:
        samesite = "lax"
    secure = _env_bool("SESSION_COOKIE_SECURE", default=False)
    # SameSite=None requires Secure; otherwise browsers reject the cookie.
    if samesite == "none" and not secure:
        samesite = "lax"
    public_app_url = (os.environ.get("PUBLIC_APP_URL") or "http://localhost:3000").strip()
    return AuthSettings(
        session_secret=secret,
        session_cookie_name=(os.environ.get("SESSION_COOKIE_NAME") or "fh_session").strip()
        or "fh_session",
        session_cookie_secure=secure,
        session_cookie_samesite=samesite,
        email_verification_required=_env_bool("EMAIL_VERIFICATION_REQUIRED", default=False),
        public_app_url=public_app_url or "http://localhost:3000",
    )
