"""SMTP settings from environment."""

from __future__ import annotations

import os
from dataclasses import dataclass


def _env_bool(name: str, default: bool = False) -> bool:
    raw = (os.environ.get(name) or "").strip().lower()
    if not raw:
        return default
    return raw in {"1", "true", "yes", "on"}


@dataclass(frozen=True, slots=True)
class SmtpSettings:
    host: str
    port: int
    username: str
    password: str
    from_address: str
    # use_tls = implicit TLS (typically port 465); start_tls = upgrade on 587.
    use_tls: bool
    start_tls: bool
    timeout_seconds: float


def load_smtp_settings() -> SmtpSettings:
    port_raw = (os.environ.get("SMTP_PORT") or "587").strip()
    try:
        port = int(port_raw)
    except ValueError:
        port = 587

    use_tls = _env_bool("SMTP_USE_TLS", default=False)
    # Default STARTTLS on when not using implicit TLS (common for 587).
    start_tls_default = not use_tls
    start_tls = _env_bool("SMTP_STARTTLS", default=start_tls_default)

    timeout_raw = (os.environ.get("SMTP_TIMEOUT_SECONDS") or "20").strip()
    try:
        timeout = float(timeout_raw)
    except ValueError:
        timeout = 20.0

    return SmtpSettings(
        host=(os.environ.get("SMTP_HOST") or "").strip(),
        port=port,
        username=(os.environ.get("SMTP_USER") or "").strip(),
        password=(os.environ.get("SMTP_PASSWORD") or "").strip(),
        from_address=(os.environ.get("SMTP_FROM") or "").strip(),
        use_tls=use_tls,
        start_tls=start_tls,
        timeout_seconds=timeout,
    )
