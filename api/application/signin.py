"""Sign-in use-case: verify credentials (generic failures — no email oracle)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol
from uuid import UUID

from domain.errors import InvalidCredentialsError
from domain.signup import normalize_email

from application.ports import PasswordHasher

# Precomputed argon2id hash (of a disposable passphrase) for equalize-verify timing.
# Must remain a valid argon2 hash string so PasswordHasher.verify always runs work.
_TIMING_DUMMY_HASH = (
    "$argon2id$v=19$m=65536,t=3,p=4$IcXawhpnwQGnBhBIOpSTIA$v/F17OCXK3q9sJSIeECZ5l0daEU2q5xpSunMkV7UvyM"
)


@dataclass(frozen=True, slots=True)
class AuthUserRecord:
    id: UUID
    email: str
    password_hash: str


class AuthUserRepository(Protocol):
    def get_by_email(self, email: str) -> AuthUserRecord | None: ...

    def get_by_id(self, user_id: UUID) -> AuthUserRecord | None: ...


@dataclass(frozen=True, slots=True)
class SignInCommand:
    email: str
    password: str


@dataclass(frozen=True, slots=True)
class SignInResult:
    user_id: UUID
    email: str


class SignInService:
    def __init__(self, repo: AuthUserRepository, hasher: PasswordHasher) -> None:
        self._repo = repo
        self._hasher = hasher

    def execute(self, command: SignInCommand) -> SignInResult:
        email = normalize_email(command.email)
        if not email or not command.password:
            raise InvalidCredentialsError()

        user = self._repo.get_by_email(email)
        if user is None:
            # Always run verify work so unknown emails are not faster than bad passwords.
            self._hasher.verify(command.password, _TIMING_DUMMY_HASH)
            raise InvalidCredentialsError()
        if not self._hasher.verify(command.password, user.password_hash):
            raise InvalidCredentialsError()

        return SignInResult(user_id=user.id, email=user.email)
