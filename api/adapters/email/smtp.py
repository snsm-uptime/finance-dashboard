"""SMTP email adapter (aiosmtplib) — transactional mail only from api."""

from __future__ import annotations

import asyncio
import logging
from email.message import EmailMessage as StdEmailMessage

import aiosmtplib
from application.ports import EmailMessage
from domain.errors import SmtpConfigurationError, SmtpSendError

from adapters.email.settings import SmtpSettings

logger = logging.getLogger(__name__)


class SmtpEmailSender:
    def __init__(self, settings: SmtpSettings) -> None:
        self._settings = settings

    def send(self, message: EmailMessage) -> None:
        settings = self._settings
        if not settings.host or not settings.from_address:
            raise SmtpConfigurationError(
                "SMTP_HOST and SMTP_FROM must be configured to send email."
            )

        email = StdEmailMessage()
        email["From"] = settings.from_address
        email["To"] = message.to_address
        email["Subject"] = message.subject
        email.set_content(message.body_text)
        if message.body_html:
            email.add_alternative(message.body_html, subtype="html")

        use_tls = settings.use_tls
        start_tls = settings.start_tls and not use_tls

        try:
            asyncio.run(
                aiosmtplib.send(
                    email,
                    hostname=settings.host,
                    port=settings.port,
                    username=settings.username or None,
                    password=settings.password or None,
                    use_tls=use_tls,
                    start_tls=start_tls,
                    timeout=settings.timeout_seconds,
                )
            )
        except SmtpConfigurationError:
            raise
        except Exception as exc:
            logger.error("smtp_send_failed to_domain=%s", _domain(message.to_address))
            raise SmtpSendError(
                "Could not send email. Check SMTP connectivity and try again."
            ) from exc

        logger.info("smtp_sent to_domain=%s", _domain(message.to_address))


def _domain(address: str) -> str:
    if "@" not in address:
        return "unknown"
    return address.rsplit("@", 1)[-1]
