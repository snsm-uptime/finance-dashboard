"""Domain + application email-verification tests (TDD — fakes, no DB)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from application.email_verification import (
    ConfirmEmailVerificationCommand,
    ConfirmEmailVerificationService,
    EmailVerificationTokenRecord,
    EnsureEmailVerifiedCommand,
    EnsureEmailVerifiedService,
    RequestEmailVerificationCommand,
    RequestEmailVerificationService,
)
from application.ports import EmailMessage
from application.signin import AuthUserRecord
from domain.email_verification import ensure_email_verified, hash_verification_token
from domain.errors import (
    EmailNotVerifiedError,
    InvalidVerificationTokenError,
    PrincipalNotFoundError,
    SmtpConfigurationError,
    SmtpSendError,
    VerificationNotRequiredError,
)


@dataclass
class FakeAuthUserRepo:
    users_by_id: dict[UUID, AuthUserRecord] = field(default_factory=dict)

    def get_by_email(self, email: str) -> AuthUserRecord | None:
        for user in self.users_by_id.values():
            if user.email == email:
                return user
        return None

    def get_by_id(self, user_id: UUID) -> AuthUserRecord | None:
        return self.users_by_id.get(user_id)

    def add(self, user: AuthUserRecord) -> None:
        self.users_by_id[user.id] = user


@dataclass
class FakeVerificationRepo:
    verified_at: dict[UUID, datetime | None] = field(default_factory=dict)
    tokens: dict[str, EmailVerificationTokenRecord] = field(default_factory=dict)

    def get_user_verified_at(self, user_id: UUID) -> datetime | None:
        return self.verified_at.get(user_id)

    def mark_email_verified(self, user_id: UUID, *, verified_at: datetime) -> None:
        self.verified_at[user_id] = verified_at

    def invalidate_outstanding_for_user(self, user_id: UUID) -> None:
        now = datetime.now(UTC)
        for key, token in list(self.tokens.items()):
            if token.user_id == user_id and token.used_at is None:
                self.tokens[key] = EmailVerificationTokenRecord(
                    id=token.id,
                    user_id=token.user_id,
                    token_hash=token.token_hash,
                    expires_at=token.expires_at,
                    used_at=now,
                )

    def create_token(
        self,
        *,
        token_id: UUID,
        user_id: UUID,
        token_hash: str,
        expires_at: datetime,
    ) -> None:
        self.tokens[token_hash] = EmailVerificationTokenRecord(
            id=token_id,
            user_id=user_id,
            token_hash=token_hash,
            expires_at=expires_at,
            used_at=None,
        )

    def get_by_token_hash(self, token_hash: str) -> EmailVerificationTokenRecord | None:
        return self.tokens.get(token_hash)

    def claim_token(self, token_id: UUID, *, used_at: datetime) -> bool:
        for key, token in list(self.tokens.items()):
            if token.id == token_id and token.used_at is None:
                self.tokens[key] = EmailVerificationTokenRecord(
                    id=token.id,
                    user_id=token.user_id,
                    token_hash=token.token_hash,
                    expires_at=token.expires_at,
                    used_at=used_at,
                )
                return True
        return False


class CapturingMailer:
    def __init__(self) -> None:
        self.sent: list[EmailMessage] = []
        self.fail: Exception | None = None

    def send(self, message: EmailMessage) -> None:
        if self.fail is not None:
            raise self.fail
        self.sent.append(message)


def test_ensure_email_verified_noop_when_flag_off() -> None:
    ensure_email_verified(email_verification_required=False, email_verified_at=None)


def test_ensure_email_verified_blocks_when_flag_on_and_unverified() -> None:
    with pytest.raises(EmailNotVerifiedError):
        ensure_email_verified(email_verification_required=True, email_verified_at=None)


def test_ensure_email_verified_passes_when_flag_on_and_verified() -> None:
    ensure_email_verified(
        email_verification_required=True,
        email_verified_at=datetime.now(UTC),
    )


def test_ensure_service_blocks_gated_flow_until_verified() -> None:
    user_id = uuid4()
    repo = FakeVerificationRepo(verified_at={user_id: None})
    service = EnsureEmailVerifiedService(repo)

    with pytest.raises(EmailNotVerifiedError):
        service.execute(
            EnsureEmailVerifiedCommand(user_id=user_id, email_verification_required=True)
        )

    repo.mark_email_verified(user_id, verified_at=datetime.now(UTC))
    service.execute(EnsureEmailVerifiedCommand(user_id=user_id, email_verification_required=True))


def test_request_raises_when_verification_not_required() -> None:
    user_id = uuid4()
    users = FakeAuthUserRepo()
    users.add(AuthUserRecord(id=user_id, email="user@example.com", password_hash="x"))
    service = RequestEmailVerificationService(
        users, FakeVerificationRepo(), CapturingMailer(), public_app_url="http://localhost:3000"
    )
    with pytest.raises(VerificationNotRequiredError):
        service.execute(
            RequestEmailVerificationCommand(user_id=user_id, email_verification_required=False)
        )


def test_request_sends_mail_and_persists_token_when_required() -> None:
    user_id = uuid4()
    users = FakeAuthUserRepo()
    users.add(AuthUserRecord(id=user_id, email="user@example.com", password_hash="x"))
    repo = FakeVerificationRepo(verified_at={user_id: None})
    mailer = CapturingMailer()
    service = RequestEmailVerificationService(
        users, repo, mailer, public_app_url="http://localhost:3000"
    )

    result = service.execute(
        RequestEmailVerificationCommand(user_id=user_id, email_verification_required=True)
    )

    assert result.already_verified is False
    assert len(mailer.sent) == 1
    assert "Verify your finance-helper email" in mailer.sent[0].subject
    assert "/verify?token=" in mailer.sent[0].body_text
    assert len(repo.tokens) == 1


def test_request_skips_mail_when_already_verified() -> None:
    user_id = uuid4()
    users = FakeAuthUserRepo()
    users.add(AuthUserRecord(id=user_id, email="user@example.com", password_hash="x"))
    repo = FakeVerificationRepo(verified_at={user_id: datetime.now(UTC)})
    mailer = CapturingMailer()
    service = RequestEmailVerificationService(
        users, repo, mailer, public_app_url="http://localhost:3000"
    )

    result = service.execute(
        RequestEmailVerificationCommand(user_id=user_id, email_verification_required=True)
    )

    assert result.already_verified is True
    assert mailer.sent == []
    assert repo.tokens == {}


def test_request_smtp_config_failure_propagates() -> None:
    user_id = uuid4()
    users = FakeAuthUserRepo()
    users.add(AuthUserRecord(id=user_id, email="user@example.com", password_hash="x"))
    repo = FakeVerificationRepo(verified_at={user_id: None})
    mailer = CapturingMailer()
    mailer.fail = SmtpConfigurationError()
    service = RequestEmailVerificationService(
        users, repo, mailer, public_app_url="http://localhost:3000"
    )

    with pytest.raises(SmtpConfigurationError):
        service.execute(
            RequestEmailVerificationCommand(user_id=user_id, email_verification_required=True)
        )


def test_request_smtp_send_failure_propagates() -> None:
    user_id = uuid4()
    users = FakeAuthUserRepo()
    users.add(AuthUserRecord(id=user_id, email="user@example.com", password_hash="x"))
    repo = FakeVerificationRepo(verified_at={user_id: None})
    mailer = CapturingMailer()
    mailer.fail = SmtpSendError()
    service = RequestEmailVerificationService(
        users, repo, mailer, public_app_url="http://localhost:3000"
    )

    with pytest.raises(SmtpSendError):
        service.execute(
            RequestEmailVerificationCommand(user_id=user_id, email_verification_required=True)
        )


def test_confirm_marks_verified_and_unlocks_gate() -> None:
    user_id = uuid4()
    users = FakeAuthUserRepo()
    users.add(AuthUserRecord(id=user_id, email="user@example.com", password_hash="x"))
    raw = "opaque-verify-token"
    token_hash = hash_verification_token(raw)
    token_id = uuid4()
    repo = FakeVerificationRepo(
        verified_at={user_id: None},
        tokens={
            token_hash: EmailVerificationTokenRecord(
                id=token_id,
                user_id=user_id,
                token_hash=token_hash,
                expires_at=datetime.now(UTC) + timedelta(hours=1),
                used_at=None,
            )
        },
    )

    confirm = ConfirmEmailVerificationService(users, repo)
    result = confirm.execute(
        ConfirmEmailVerificationCommand(token=raw, email_verification_required=True)
    )
    assert result.user_id == user_id
    assert result.email == "user@example.com"
    assert repo.get_user_verified_at(user_id) is not None

    # Idempotent re-confirm with the same consumed token.
    again = confirm.execute(
        ConfirmEmailVerificationCommand(token=raw, email_verification_required=True)
    )
    assert again.user_id == user_id

    EnsureEmailVerifiedService(repo).execute(
        EnsureEmailVerifiedCommand(user_id=user_id, email_verification_required=True)
    )


def test_request_missing_user_raises_principal_not_found() -> None:
    service = RequestEmailVerificationService(
        FakeAuthUserRepo(),
        FakeVerificationRepo(),
        CapturingMailer(),
        public_app_url="http://localhost:3000",
    )
    with pytest.raises(PrincipalNotFoundError):
        service.execute(
            RequestEmailVerificationCommand(user_id=uuid4(), email_verification_required=True)
        )


def test_confirm_rejects_expired_or_unknown_token() -> None:
    users = FakeAuthUserRepo()
    confirm = ConfirmEmailVerificationService(users, FakeVerificationRepo())

    with pytest.raises(InvalidVerificationTokenError):
        confirm.execute(
            ConfirmEmailVerificationCommand(token="missing", email_verification_required=True)
        )

    with pytest.raises(VerificationNotRequiredError):
        confirm.execute(
            ConfirmEmailVerificationCommand(token="anything", email_verification_required=False)
        )


def test_confirm_rejects_expired_token() -> None:
    user_id = uuid4()
    users = FakeAuthUserRepo()
    users.add(AuthUserRecord(id=user_id, email="user@example.com", password_hash="x"))
    raw = "expired-token"
    token_hash = hash_verification_token(raw)
    repo = FakeVerificationRepo(
        verified_at={user_id: None},
        tokens={
            token_hash: EmailVerificationTokenRecord(
                id=uuid4(),
                user_id=user_id,
                token_hash=token_hash,
                expires_at=datetime.now(UTC) - timedelta(minutes=1),
                used_at=None,
            )
        },
    )
    confirm = ConfirmEmailVerificationService(users, repo)
    with pytest.raises(InvalidVerificationTokenError):
        confirm.execute(
            ConfirmEmailVerificationCommand(token=raw, email_verification_required=True)
        )
