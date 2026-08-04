"""Email verification use-cases: gate, request mail, confirm token."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from html import escape
from typing import Protocol
from uuid import UUID, uuid4

from domain.email_verification import (
    VERIFICATION_TOKEN_TTL,
    ensure_email_verified,
    generate_raw_verification_token,
    hash_verification_token,
)
from domain.errors import (
    InvalidVerificationTokenError,
    PrincipalNotFoundError,
    SmtpConfigurationError,
    SmtpSendError,
    VerificationNotRequiredError,
)

from application.ports import EmailMessage, EmailSender
from application.signin import AuthUserRecord, AuthUserRepository


@dataclass(frozen=True, slots=True)
class EmailVerificationTokenRecord:
    id: UUID
    user_id: UUID
    token_hash: str
    expires_at: datetime
    used_at: datetime | None


class EmailVerificationRepository(Protocol):
    def get_user_verified_at(self, user_id: UUID) -> datetime | None: ...

    def mark_email_verified(self, user_id: UUID, *, verified_at: datetime) -> None: ...

    def invalidate_outstanding_for_user(self, user_id: UUID) -> None: ...

    def create_token(
        self,
        *,
        token_id: UUID,
        user_id: UUID,
        token_hash: str,
        expires_at: datetime,
    ) -> None: ...

    def get_by_token_hash(self, token_hash: str) -> EmailVerificationTokenRecord | None: ...

    def claim_token(self, token_id: UUID, *, used_at: datetime) -> bool:
        """Atomically mark unused unexpired token as used.

        Returns False if missing, already used, or expired.
        """
        ...


@dataclass(frozen=True, slots=True)
class EnsureEmailVerifiedCommand:
    user_id: UUID
    email_verification_required: bool


class EnsureEmailVerifiedService:
    """Application port for gated flows (Epic 2 invite acceptance will call this)."""

    def __init__(self, verification: EmailVerificationRepository) -> None:
        self._verification = verification

    def execute(self, command: EnsureEmailVerifiedCommand) -> None:
        verified_at = self._verification.get_user_verified_at(command.user_id)
        ensure_email_verified(
            email_verification_required=command.email_verification_required,
            email_verified_at=verified_at,
        )


@dataclass(frozen=True, slots=True)
class RequestEmailVerificationCommand:
    user_id: UUID
    email_verification_required: bool


@dataclass(frozen=True, slots=True)
class RequestEmailVerificationResult:
    already_verified: bool = False


class RequestEmailVerificationService:
    def __init__(
        self,
        users: AuthUserRepository,
        verification: EmailVerificationRepository,
        mailer: EmailSender,
        *,
        public_app_url: str,
        verify_path: str = "/verify",
    ) -> None:
        self._users = users
        self._verification = verification
        self._mailer = mailer
        self._public_app_url = public_app_url.rstrip("/")
        self._verify_path = verify_path if verify_path.startswith("/") else f"/{verify_path}"

    def execute(self, command: RequestEmailVerificationCommand) -> RequestEmailVerificationResult:
        if not command.email_verification_required:
            raise VerificationNotRequiredError()

        user = self._users.get_by_id(command.user_id)
        if user is None:
            raise PrincipalNotFoundError()

        verified_at = self._verification.get_user_verified_at(command.user_id)
        if verified_at is not None:
            return RequestEmailVerificationResult(already_verified=True)

        raw = generate_raw_verification_token()
        token_hash = hash_verification_token(raw)
        now = datetime.now(UTC)
        expires_at = now + VERIFICATION_TOKEN_TTL
        token_id = uuid4()

        # Persist first so any emailed link is redeemable. On SMTP failure the API
        # layer must roll back the unit of work (no silent "sent").
        self._verification.invalidate_outstanding_for_user(user.id)
        self._verification.create_token(
            token_id=token_id,
            user_id=user.id,
            token_hash=token_hash,
            expires_at=expires_at,
        )

        verify_link = f"{self._public_app_url}{self._verify_path}?token={raw}"
        safe_href = escape(verify_link, quote=True)
        subject = "Verify your finance-helper email"
        body_text = (
            "Please verify your email address.\n\n"
            f"Open this link within 24 hours to verify:\n{verify_link}\n\n"
            "If you did not create an account, you can ignore this email.\n"
        )
        body_html = (
            "<p>Please verify your email address.</p>"
            "<p>Open this link within 24 hours to verify:</p>"
            f'<p><a href="{safe_href}">Verify email</a></p>'
            "<p>If you did not create an account, you can ignore this email.</p>"
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

        return RequestEmailVerificationResult(already_verified=False)


@dataclass(frozen=True, slots=True)
class ConfirmEmailVerificationCommand:
    token: str
    email_verification_required: bool


@dataclass(frozen=True, slots=True)
class ConfirmEmailVerificationResult:
    user_id: UUID
    email: str


class ConfirmEmailVerificationService:
    def __init__(
        self,
        users: AuthUserRepository,
        verification: EmailVerificationRepository,
    ) -> None:
        self._users = users
        self._verification = verification

    def execute(self, command: ConfirmEmailVerificationCommand) -> ConfirmEmailVerificationResult:
        if not command.email_verification_required:
            raise VerificationNotRequiredError()

        raw = (command.token or "").strip()
        if not raw:
            raise InvalidVerificationTokenError()

        token_hash = hash_verification_token(raw)
        record = self._verification.get_by_token_hash(token_hash)
        if record is None:
            raise InvalidVerificationTokenError()

        # Idempotent success: token already consumed but user is verified.
        if record.used_at is not None:
            verified_at = self._verification.get_user_verified_at(record.user_id)
            if verified_at is not None:
                email = self._resolve_email(record.user_id)
                return ConfirmEmailVerificationResult(user_id=record.user_id, email=email)
            raise InvalidVerificationTokenError()

        expires = record.expires_at
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=UTC)
        if expires <= datetime.now(UTC):
            raise InvalidVerificationTokenError()

        claimed = self._verification.claim_token(record.id, used_at=datetime.now(UTC))
        if not claimed:
            # Concurrent claim — treat as success if the user is now verified.
            verified_at = self._verification.get_user_verified_at(record.user_id)
            if verified_at is not None:
                email = self._resolve_email(record.user_id)
                return ConfirmEmailVerificationResult(user_id=record.user_id, email=email)
            raise InvalidVerificationTokenError()

        now = datetime.now(UTC)
        self._verification.mark_email_verified(record.user_id, verified_at=now)
        self._verification.invalidate_outstanding_for_user(record.user_id)

        email = self._resolve_email(record.user_id)
        return ConfirmEmailVerificationResult(user_id=record.user_id, email=email)

    def _resolve_email(self, user_id: UUID) -> str:
        user: AuthUserRecord | None = self._users.get_by_id(user_id)
        if user is not None:
            return user.email
        return ""
