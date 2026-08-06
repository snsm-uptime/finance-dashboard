"""Email / SMTP adapters."""

from adapters.email.settings import SmtpSettings, load_smtp_settings
from adapters.email.smtp import SmtpEmailSender

__all__ = [
    "SmtpEmailSender",
    "SmtpSettings",
    "load_smtp_settings",
]
