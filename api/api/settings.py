"""Auth / session / SMTP settings from environment."""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass

from application.rate_limit import MAX_ATTEMPTS_CAP, RateLimitPolicy, parse_trusted_proxy_ips

logger = logging.getLogger(__name__)


def _env_bool(name: str, default: bool = False) -> bool:
    raw = (os.environ.get(name) or "").strip().lower()
    if not raw:
        return default
    return raw in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    raw = (os.environ.get(name) or "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError as exc:
        raise ValueError(f"{name} must be an integer, got {raw!r}") from exc


def _rate_limit_policy(
    max_env: str,
    window_env: str,
    *,
    max_default: int,
    window_default: int,
) -> RateLimitPolicy:
    max_attempts = _env_int(max_env, max_default)
    window_seconds = _env_int(window_env, window_default)
    if max_attempts < 1:
        raise ValueError(f"{max_env} must be >= 1, got {max_attempts}")
    if window_seconds < 1:
        raise ValueError(f"{window_env} must be >= 1, got {window_seconds}")
    if max_attempts > MAX_ATTEMPTS_CAP:
        logger.warning(
            "%s=%s exceeds cap %s; clamping",
            max_env,
            max_attempts,
            MAX_ATTEMPTS_CAP,
        )
        max_attempts = MAX_ATTEMPTS_CAP
    return RateLimitPolicy(max_attempts=max_attempts, window_seconds=window_seconds)


@dataclass(frozen=True, slots=True)
class AuthSettings:
    session_secret: str
    session_cookie_name: str
    session_cookie_secure: bool
    session_cookie_samesite: str
    email_verification_required: bool
    public_app_url: str
    rate_limit_register: RateLimitPolicy
    rate_limit_sign_in: RateLimitPolicy
    rate_limit_password_reset_request: RateLimitPolicy
    rate_limit_verify_request: RateLimitPolicy
    auth_client_ip_header: str
    trusted_proxy_ips: tuple[str, ...]


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
    header_raw = (os.environ.get("AUTH_CLIENT_IP_HEADER") or "X-FH-Client-IP").strip()
    header = header_raw or "X-FH-Client-IP"
    # Empty TRUSTED_PROXY_IPS = never honor the client-IP header (safe for direct api hits).
    # Compose pins Docker bridge + loopback only (not blanket RFC1918).
    trusted_raw = os.environ.get("TRUSTED_PROXY_IPS")
    if trusted_raw is None:
        trusted = ()
    else:
        trusted = parse_trusted_proxy_ips(trusted_raw)
    return AuthSettings(
        session_secret=secret,
        session_cookie_name=(os.environ.get("SESSION_COOKIE_NAME") or "fh_session").strip()
        or "fh_session",
        session_cookie_secure=secure,
        session_cookie_samesite=samesite,
        email_verification_required=_env_bool("EMAIL_VERIFICATION_REQUIRED", default=False),
        public_app_url=public_app_url or "http://localhost:3000",
        rate_limit_register=_rate_limit_policy(
            "AUTH_RATE_LIMIT_REGISTER_MAX",
            "AUTH_RATE_LIMIT_REGISTER_WINDOW_SECONDS",
            max_default=5,
            window_default=3600,
        ),
        rate_limit_sign_in=_rate_limit_policy(
            "AUTH_RATE_LIMIT_SIGN_IN_MAX",
            "AUTH_RATE_LIMIT_SIGN_IN_WINDOW_SECONDS",
            max_default=20,
            window_default=900,
        ),
        rate_limit_password_reset_request=_rate_limit_policy(
            "AUTH_RATE_LIMIT_PASSWORD_RESET_REQUEST_MAX",
            "AUTH_RATE_LIMIT_PASSWORD_RESET_REQUEST_WINDOW_SECONDS",
            max_default=5,
            window_default=3600,
        ),
        rate_limit_verify_request=_rate_limit_policy(
            "AUTH_RATE_LIMIT_VERIFY_REQUEST_MAX",
            "AUTH_RATE_LIMIT_VERIFY_REQUEST_WINDOW_SECONDS",
            max_default=5,
            window_default=3600,
        ),
        auth_client_ip_header=header,
        trusted_proxy_ips=trusted,
    )
