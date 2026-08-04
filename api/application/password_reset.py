"""Password-reset use-cases: request (email proof) + confirm (replace hash)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from html import escape
from typing import Protocol
from uuid import UUID, uuid4

from domain.errors import (
    InvalidResetPasswordError,
    InvalidResetTokenError,
    SmtpConfigurationError,
    SmtpSendError,
)
from domain.password_reset import (
    RESET_TOKEN_TTL,
    generate_raw_reset_token,
    hash_reset_token,
    validate_new_password,
    validate_reset_request_email,
)
from domain.signup import normalize_email

from application.ports import EmailMessage, EmailSender, PasswordHasher
from application.signin import AuthUserRecord, AuthUserRepository


@dataclass(frozen=True, slots=True)
class PasswordResetTokenRecord:
    id: UUID
    user_id: UUID
    token_hash: str
    expires_at: datetime
    used_at: datetime | None


class PasswordResetTokenRepository(Protocol):
    def invalidate_outstanding_for_user(self, user_id: UUID) -> None: ...

    def create_token(
        self,
        *,
        token_id: UUID,
        user_id: UUID,
        token_hash: str,
        expires_at: datetime,
    ) -> None: ...

    def get_by_token_hash(self, token_hash: str) -> PasswordResetTokenRecord | None: ...

    def claim_token(self, token_id: UUID, *, used_at: datetime) -> bool:
        """Atomically mark unused unexpired token as used.

        Returns False if missing, already used, or expired.
        """
        ...

    def update_password_hash(self, user_id: UUID, password_hash: str) -> None: ...

    def revoke_all_sessions_for_user(self, user_id: UUID) -> None: ...


@dataclass(frozen=True, slots=True)
class RequestPasswordResetCommand:
    email: str


@dataclass(frozen=True, slots=True)
class RequestPasswordResetResult:
    """Client-visible outcome is always the same ack; mail may or may not have been sent."""

    acknowledged: bool = True


class RequestPasswordResetService:
    def __init__(
        self,
        users: AuthUserRepository,
        tokens: PasswordResetTokenRepository,
        mailer: EmailSender,
        *,
        public_app_url: str,
        reset_path: str = "/reset-password",
    ) -> None:
        self._users = users
        self._tokens = tokens
        self._mailer = mailer
        self._public_app_url = public_app_url.rstrip("/")
        self._reset_path = reset_path if reset_path.startswith("/") else f"/{reset_path}"

    def execute(self, command: RequestPasswordResetCommand) -> RequestPasswordResetResult:
        email = validate_reset_request_email(command.email)
        if not email:
            # Same client ack as known emails — no enumeration.
            return RequestPasswordResetResult()

        user = self._users.get_by_email(email)
        if user is None:
            return RequestPasswordResetResult()

        raw = generate_raw_reset_token()
        token_hash = hash_reset_token(raw)
        now = datetime.now(UTC)
        expires_at = now + RESET_TOKEN_TTL
        token_id = uuid4()

        # Persist first so any emailed link is redeemable. On SMTP failure the API
        # layer must roll back the unit of work (no silent "sent", no orphan mail).
        self._tokens.invalidate_outstanding_for_user(user.id)
        self._tokens.create_token(
            token_id=token_id,
            user_id=user.id,
            token_hash=token_hash,
            expires_at=expires_at,
        )

        reset_link = f"{self._public_app_url}{self._reset_path}?token={raw}"
        safe_href = escape(reset_link, quote=True)
        subject = "Reset your finance-helper password"
        body_text = (
            "We received a request to reset your password.\n\n"
            f"Open this link within one hour to choose a new password:\n{reset_link}\n\n"
            "If you did not request this, you can ignore this email.\n"
        )
        body_html = (
            "<p>We received a request to reset your password.</p>"
            "<p>Open this link within one hour to choose a new password:</p>"
            f'<p><a href="{safe_href}">Reset password</a></p>'
            "<p>If you did not request this, you can ignore this email.</p>"
        )

        try:
            self._mailer.send(
                EmailMessage(
                    to_address=user.email,
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

        return RequestPasswordResetResult()


@dataclass(frozen=True, slots=True)
class CompletePasswordResetCommand:
    token: str
    new_password: str


@dataclass(frozen=True, slots=True)
class CompletePasswordResetResult:
    user_id: UUID
    email: str


class CompletePasswordResetService:
    def __init__(
        self,
        users: AuthUserRepository,
        tokens: PasswordResetTokenRepository,
        hasher: PasswordHasher,
    ) -> None:
        self._users = users
        self._tokens = tokens
        self._hasher = hasher

    def execute(self, command: CompletePasswordResetCommand) -> CompletePasswordResetResult:
        raw = (command.token or "").strip()
        if not raw:
            raise InvalidResetTokenError()

        try:
            validate_new_password(command.new_password)
        except InvalidResetPasswordError:
            raise

        token_hash = hash_reset_token(raw)
        record = self._tokens.get_by_token_hash(token_hash)
        if record is None or record.used_at is not None:
            raise InvalidResetTokenError()

        expires = record.expires_at
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=UTC)
        if expires <= datetime.now(UTC):
            raise InvalidResetTokenError()

        claimed = self._tokens.claim_token(record.id, used_at=datetime.now(UTC))
        if not claimed:
            raise InvalidResetTokenError()

        new_hash = self._hasher.hash(command.new_password)
        self._tokens.update_password_hash(record.user_id, new_hash)
        self._tokens.invalidate_outstanding_for_user(record.user_id)
        self._tokens.revoke_all_sessions_for_user(record.user_id)

        email = self._resolve_email(record.user_id)
        return CompletePasswordResetResult(user_id=record.user_id, email=email)

    def _resolve_email(self, user_id: UUID) -> str:
        user: AuthUserRecord | None = self._users.get_by_id(user_id)
        if user is not None:
            return user.email
        return ""


def normalize_request_email_for_logging(email: str) -> str:
    """Never log raw addresses at info in routes — helper keeps correlation generic."""
    return normalize_email(email)[:3] + "…" if email else ""
