"""List-invite email templates (EN/ES) — extends 1.4 SMTP via EmailSender."""

from __future__ import annotations

from html import escape

from application.ports import EmailMessage, EmailSender
from domain.errors import SmtpConfigurationError, SmtpSendError
from domain.list_invite import InviteLocale, InviteTemplateKind


class SmtpListInviteMailer:
    """Port methods for join vs signup invite emails; sync send via EmailSender."""

    def __init__(self, mailer: EmailSender) -> None:
        self._mailer = mailer

    def send_list_invite_join(
        self,
        *,
        to: str,
        link: str,
        list_name: str,
        inviter_display: str,
        locale: InviteLocale,
    ) -> None:
        subject, body_text, body_html = _render(
            kind="join",
            link=link,
            list_name=list_name,
            inviter_display=inviter_display,
            locale=locale,
        )
        self._dispatch(to, subject, body_text, body_html)

    def send_list_invite_signup(
        self,
        *,
        to: str,
        link: str,
        list_name: str,
        inviter_display: str,
        locale: InviteLocale,
    ) -> None:
        subject, body_text, body_html = _render(
            kind="signup",
            link=link,
            list_name=list_name,
            inviter_display=inviter_display,
            locale=locale,
        )
        self._dispatch(to, subject, body_text, body_html)

    def _dispatch(self, to: str, subject: str, body_text: str, body_html: str) -> None:
        try:
            self._mailer.send(
                EmailMessage(
                    to_address=to,
                    subject=subject,
                    body_text=body_text,
                    body_html=body_html,
                )
            )
        except (SmtpConfigurationError, SmtpSendError):
            raise
        except Exception as exc:  # pragma: no cover - defensive wrap
            raise SmtpSendError(
                "Could not send email. Check SMTP connectivity and try again."
            ) from exc


def _render(
    *,
    kind: InviteTemplateKind,
    link: str,
    list_name: str,
    inviter_display: str,
    locale: InviteLocale,
) -> tuple[str, str, str]:
    safe_href = escape(link, quote=True)
    safe_list = escape(list_name)
    safe_inviter = escape(inviter_display)

    if locale == "es":
        if kind == "join":
            subject = f"Invitación a unirte a {list_name}"
            body_text = (
                f"{inviter_display} te invitó a la lista «{list_name}» en finance-helper.\n\n"
                f"Abre este enlace para unirte (válido 7 días):\n{link}\n\n"
                "Si no esperabas esta invitación, puedes ignorar este correo.\n"
            )
            body_html = (
                f"<p>{safe_inviter} te invitó a la lista «{safe_list}» en finance-helper.</p>"
                "<p>Abre este enlace para unirte (válido 7 días):</p>"
                f'<p><a href="{safe_href}">Unirme a la lista</a></p>'
                "<p>Si no esperabas esta invitación, puedes ignorar este correo.</p>"
            )
        else:
            subject = f"Crea tu cuenta para unirte a {list_name}"
            body_text = (
                f"{inviter_display} te invitó a la lista «{list_name}» en finance-helper.\n\n"
                f"Crea una cuenta con este enlace para unirte (válido 7 días):\n{link}\n\n"
                "Si no esperabas esta invitación, puedes ignorar este correo.\n"
            )
            body_html = (
                f"<p>{safe_inviter} te invitó a la lista «{safe_list}» en finance-helper.</p>"
                "<p>Crea una cuenta con este enlace para unirte (válido 7 días):</p>"
                f'<p><a href="{safe_href}">Crear cuenta y unirme</a></p>'
                "<p>Si no esperabas esta invitación, puedes ignorar este correo.</p>"
            )
        return subject, body_text, body_html

    if kind == "join":
        subject = f"Invitation to join {list_name}"
        body_text = (
            f"{inviter_display} invited you to the list “{list_name}” on finance-helper.\n\n"
            f"Open this link to join (valid for 7 days):\n{link}\n\n"
            "If you weren’t expecting this, you can ignore this email.\n"
        )
        body_html = (
            f"<p>{safe_inviter} invited you to the list “{safe_list}” on finance-helper.</p>"
            "<p>Open this link to join (valid for 7 days):</p>"
            f'<p><a href="{safe_href}">Join the list</a></p>'
            "<p>If you weren’t expecting this, you can ignore this email.</p>"
        )
    else:
        subject = f"Create an account to join {list_name}"
        body_text = (
            f"{inviter_display} invited you to the list “{list_name}” on finance-helper.\n\n"
            f"Create an account with this link to join (valid for 7 days):\n{link}\n\n"
            "If you weren’t expecting this, you can ignore this email.\n"
        )
        body_html = (
            f"<p>{safe_inviter} invited you to the list “{safe_list}” on finance-helper.</p>"
            "<p>Create an account with this link to join (valid for 7 days):</p>"
            f'<p><a href="{safe_href}">Create account and join</a></p>'
            "<p>If you weren’t expecting this, you can ignore this email.</p>"
        )
    return subject, body_text, body_html
