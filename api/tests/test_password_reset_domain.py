"""Domain + application password-reset tests (TDD — fakes, no DB)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from application.password_reset import (
    CompletePasswordResetCommand,
    CompletePasswordResetService,
    PasswordResetTokenRecord,
    RequestPasswordResetCommand,
    RequestPasswordResetService,
)
from application.ports import EmailMessage
from application.signin import AuthUserRecord
from domain.errors import (
    InvalidResetPasswordError,
    InvalidResetTokenError,
    SmtpConfigurationError,
    SmtpSendError,
)
from domain.password_reset import RESET_TOKEN_TTL, hash_reset_token


class FakeHasher:
    def hash(self, password: str) -> str:
        return f"hashed:{password}"

    def verify(self, password: str, password_hash: str) -> bool:
        return password_hash == f"hashed:{password}"


@dataclass
class FakeAuthUserRepo:
    users_by_email: dict[str, AuthUserRecord] = field(default_factory=dict)
    users_by_id: dict[UUID, AuthUserRecord] = field(default_factory=dict)

    def get_by_email(self, email: str) -> AuthUserRecord | None:
        return self.users_by_email.get(email)

    def get_by_id(self, user_id: UUID) -> AuthUserRecord | None:
        return self.users_by_id.get(user_id)

    def add(self, user: AuthUserRecord) -> None:
        self.users_by_email[user.email] = user
        self.users_by_id[user.id] = user


@dataclass
class FakeTokenRepo:
    tokens: dict[str, PasswordResetTokenRecord] = field(default_factory=dict)
    password_hashes: dict[UUID, str] = field(default_factory=dict)
    revoked_users: list[UUID] = field(default_factory=list)

    def invalidate_outstanding_for_user(self, user_id: UUID) -> None:
        now = datetime.now(UTC)
        for key, token in list(self.tokens.items()):
            if token.user_id == user_id and token.used_at is None:
                self.tokens[key] = PasswordResetTokenRecord(
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
        self.tokens[token_hash] = PasswordResetTokenRecord(
            id=token_id,
            user_id=user_id,
            token_hash=token_hash,
            expires_at=expires_at,
            used_at=None,
        )

    def get_by_token_hash(self, token_hash: str) -> PasswordResetTokenRecord | None:
        return self.tokens.get(token_hash)

    def claim_token(self, token_id: UUID, *, used_at: datetime) -> bool:
        for key, token in list(self.tokens.items()):
            if token.id == token_id and token.used_at is None:
                self.tokens[key] = PasswordResetTokenRecord(
                    id=token.id,
                    user_id=token.user_id,
                    token_hash=token.token_hash,
                    expires_at=token.expires_at,
                    used_at=used_at,
                )
                return True
        return False

    def update_password_hash(self, user_id: UUID, password_hash: str) -> None:
        self.password_hashes[user_id] = password_hash

    def revoke_all_sessions_for_user(self, user_id: UUID) -> None:
        self.revoked_users.append(user_id)


@dataclass
class FakeMailer:
    sent: list[EmailMessage] = field(default_factory=list)
    fail_with: Exception | None = None

    def send(self, message: EmailMessage) -> None:
        if self.fail_with is not None:
            raise self.fail_with
        self.sent.append(message)


def _user(email: str = "member@example.com", password: str = "password1") -> AuthUserRecord:
    user = AuthUserRecord(id=uuid4(), email=email, password_hash=f"hashed:{password}")
    return user


def test_hash_reset_token_is_stable_and_not_plaintext() -> None:
    raw = "opaque-token-value"
    digest = hash_reset_token(raw)
    assert digest == hash_reset_token(raw)
    assert digest != raw
    assert len(digest) == 64


def test_request_reset_unknown_email_acks_without_sending() -> None:
    mailer = FakeMailer()
    service = RequestPasswordResetService(
        FakeAuthUserRepo(),
        FakeTokenRepo(),
        mailer,
        public_app_url="http://localhost:3000",
    )
    result = service.execute(RequestPasswordResetCommand(email="ghost@example.com"))
    assert result.acknowledged is True
    assert mailer.sent == []


def test_request_reset_known_email_sends_link_and_stores_hash_only() -> None:
    user = _user()
    users = FakeAuthUserRepo()
    users.add(user)
    tokens = FakeTokenRepo()
    mailer = FakeMailer()
    service = RequestPasswordResetService(
        users, tokens, mailer, public_app_url="http://localhost:3000"
    )

    service.execute(RequestPasswordResetCommand(email="Member@Example.com"))

    assert len(mailer.sent) == 1
    assert "http://localhost:3000/reset-password?token=" in mailer.sent[0].body_text
    assert user.email == mailer.sent[0].to_address
    assert len(tokens.tokens) == 1
    stored_hash = next(iter(tokens.tokens))
    assert "token=" not in stored_hash
    raw = mailer.sent[0].body_text.split("token=")[1].split()[0]
    assert stored_hash == hash_reset_token(raw)


def test_request_reset_smtp_config_failure_propagates() -> None:
    user = _user()
    users = FakeAuthUserRepo()
    users.add(user)
    mailer = FakeMailer(fail_with=SmtpConfigurationError())
    service = RequestPasswordResetService(
        users, FakeTokenRepo(), mailer, public_app_url="http://localhost:3000"
    )
    with pytest.raises(SmtpConfigurationError):
        service.execute(RequestPasswordResetCommand(email=user.email))


def test_request_reset_smtp_send_failure_propagates() -> None:
    user = _user()
    users = FakeAuthUserRepo()
    users.add(user)
    mailer = FakeMailer(fail_with=SmtpSendError())
    service = RequestPasswordResetService(
        users, FakeTokenRepo(), mailer, public_app_url="http://localhost:3000"
    )
    with pytest.raises(SmtpSendError):
        service.execute(RequestPasswordResetCommand(email=user.email))


def test_complete_reset_replaces_password_and_revokes_sessions() -> None:
    user = _user(password="old-password")
    users = FakeAuthUserRepo()
    users.add(user)
    tokens = FakeTokenRepo()
    raw = "reset-token-raw"
    token_hash = hash_reset_token(raw)
    tokens.create_token(
        token_id=uuid4(),
        user_id=user.id,
        token_hash=token_hash,
        expires_at=datetime.now(UTC) + RESET_TOKEN_TTL,
    )
    hasher = FakeHasher()
    service = CompletePasswordResetService(users, tokens, hasher)

    result = service.execute(
        CompletePasswordResetCommand(token=raw, new_password="new-password1")
    )

    assert result.user_id == user.id
    assert tokens.password_hashes[user.id] == "hashed:new-password1"
    assert hasher.verify("new-password1", tokens.password_hashes[user.id])
    assert not hasher.verify("old-password", tokens.password_hashes[user.id])
    assert tokens.revoked_users == [user.id]
    assert tokens.get_by_token_hash(token_hash) is not None
    assert tokens.get_by_token_hash(token_hash).used_at is not None  # type: ignore[union-attr]


def test_complete_reset_rejects_expired_token() -> None:
    user = _user()
    users = FakeAuthUserRepo()
    users.add(user)
    tokens = FakeTokenRepo()
    raw = "expired-token"
    tokens.create_token(
        token_id=uuid4(),
        user_id=user.id,
        token_hash=hash_reset_token(raw),
        expires_at=datetime.now(UTC) - timedelta(minutes=1),
    )
    service = CompletePasswordResetService(users, tokens, FakeHasher())
    with pytest.raises(InvalidResetTokenError):
        service.execute(CompletePasswordResetCommand(token=raw, new_password="new-password1"))


def test_request_reset_second_request_invalidates_prior_token() -> None:
    user = _user()
    users = FakeAuthUserRepo()
    users.add(user)
    tokens = FakeTokenRepo()
    mailer = FakeMailer()
    service = RequestPasswordResetService(
        users, tokens, mailer, public_app_url="http://localhost:3000"
    )

    service.execute(RequestPasswordResetCommand(email=user.email))
    first_raw = mailer.sent[0].body_text.split("token=")[1].split()[0]
    first_hash = hash_reset_token(first_raw)
    assert tokens.get_by_token_hash(first_hash) is not None
    assert tokens.get_by_token_hash(first_hash).used_at is None  # type: ignore[union-attr]

    service.execute(RequestPasswordResetCommand(email=user.email))
    second_raw = mailer.sent[1].body_text.split("token=")[1].split()[0]
    second_hash = hash_reset_token(second_raw)

    assert tokens.get_by_token_hash(first_hash).used_at is not None  # type: ignore[union-attr]
    assert tokens.get_by_token_hash(second_hash) is not None
    assert tokens.get_by_token_hash(second_hash).used_at is None  # type: ignore[union-attr]

    with pytest.raises(InvalidResetTokenError):
        CompletePasswordResetService(users, tokens, FakeHasher()).execute(
            CompletePasswordResetCommand(token=first_raw, new_password="new-password1")
        )


def test_complete_reset_rejects_used_token() -> None:
    user = _user()
    users = FakeAuthUserRepo()
    users.add(user)
    tokens = FakeTokenRepo()
    raw = "used-token"
    token_id = uuid4()
    tokens.create_token(
        token_id=token_id,
        user_id=user.id,
        token_hash=hash_reset_token(raw),
        expires_at=datetime.now(UTC) + RESET_TOKEN_TTL,
    )
    assert tokens.claim_token(token_id, used_at=datetime.now(UTC)) is True
    service = CompletePasswordResetService(users, tokens, FakeHasher())
    with pytest.raises(InvalidResetTokenError):
        service.execute(CompletePasswordResetCommand(token=raw, new_password="new-password1"))


def test_complete_reset_rejects_short_password() -> None:
    user = _user()
    users = FakeAuthUserRepo()
    users.add(user)
    tokens = FakeTokenRepo()
    raw = "ok-token"
    tokens.create_token(
        token_id=uuid4(),
        user_id=user.id,
        token_hash=hash_reset_token(raw),
        expires_at=datetime.now(UTC) + RESET_TOKEN_TTL,
    )
    service = CompletePasswordResetService(users, tokens, FakeHasher())
    with pytest.raises(InvalidResetPasswordError):
        service.execute(CompletePasswordResetCommand(token=raw, new_password="short"))


def test_complete_reset_rejects_too_long_password() -> None:
    user = _user()
    users = FakeAuthUserRepo()
    users.add(user)
    tokens = FakeTokenRepo()
    raw = "ok-token"
    tokens.create_token(
        token_id=uuid4(),
        user_id=user.id,
        token_hash=hash_reset_token(raw),
        expires_at=datetime.now(UTC) + RESET_TOKEN_TTL,
    )
    service = CompletePasswordResetService(users, tokens, FakeHasher())
    with pytest.raises(InvalidResetPasswordError):
        service.execute(
            CompletePasswordResetCommand(token=raw, new_password="x" * 257)
        )
