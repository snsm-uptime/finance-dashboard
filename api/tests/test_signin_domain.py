"""Domain + application sign-in tests (TDD — fakes, no DB)."""

from __future__ import annotations

from dataclasses import dataclass, field
from uuid import uuid4

import pytest
from application.signin import AuthUserRecord, SignInCommand, SignInService
from domain.errors import InvalidCredentialsError
from domain.signup import normalize_email


class FakeHasher:
    def __init__(self) -> None:
        self.verify_calls: list[tuple[str, str]] = []

    def hash(self, password: str) -> str:
        return f"hashed:{password}"

    def verify(self, password: str, password_hash: str) -> bool:
        self.verify_calls.append((password, password_hash))
        return password_hash == f"hashed:{password}"


@dataclass
class FakeAuthUserRepo:
    users: dict[str, AuthUserRecord] = field(default_factory=dict)

    def get_by_email(self, email: str) -> AuthUserRecord | None:
        return self.users.get(email)

    def get_by_id(self, user_id):  # type: ignore[no-untyped-def]
        for user in self.users.values():
            if user.id == user_id:
                return user
        return None


def test_normalize_email_for_signin() -> None:
    assert normalize_email("  User@Example.COM ") == "user@example.com"


def test_signin_succeeds_with_valid_credentials() -> None:
    user_id = uuid4()
    repo = FakeAuthUserRepo(
        users={
            "member@example.com": AuthUserRecord(
                id=user_id,
                email="member@example.com",
                password_hash="hashed:password1",
            )
        }
    )
    service = SignInService(repo, FakeHasher())

    result = service.execute(SignInCommand(email="Member@Example.com", password="password1"))

    assert result.user_id == user_id
    assert result.email == "member@example.com"


def test_signin_unknown_email_raises_generic_invalid_credentials() -> None:
    hasher = FakeHasher()
    service = SignInService(FakeAuthUserRepo(), hasher)

    with pytest.raises(InvalidCredentialsError) as exc_info:
        service.execute(SignInCommand(email="nobody@example.com", password="password1"))

    assert str(exc_info.value) == InvalidCredentialsError.MESSAGE
    assert len(hasher.verify_calls) == 1
    assert hasher.verify_calls[0][0] == "password1"
    assert hasher.verify_calls[0][1].startswith("$argon2")


def test_signin_bad_password_raises_same_generic_error() -> None:
    repo = FakeAuthUserRepo(
        users={
            "member@example.com": AuthUserRecord(
                id=uuid4(),
                email="member@example.com",
                password_hash="hashed:password1",
            )
        }
    )
    service = SignInService(repo, FakeHasher())

    with pytest.raises(InvalidCredentialsError) as unknown:
        service.execute(SignInCommand(email="ghost@example.com", password="password1"))
    with pytest.raises(InvalidCredentialsError) as bad_password:
        service.execute(SignInCommand(email="member@example.com", password="wrong-pass"))

    assert str(unknown.value) == str(bad_password.value) == InvalidCredentialsError.MESSAGE


def test_signin_empty_credentials_raise_generic_error() -> None:
    service = SignInService(FakeAuthUserRepo(), FakeHasher())

    with pytest.raises(InvalidCredentialsError) as empty_email:
        service.execute(SignInCommand(email="", password="password1"))
    with pytest.raises(InvalidCredentialsError) as empty_password:
        service.execute(SignInCommand(email="member@example.com", password=""))

    assert str(empty_email.value) == str(empty_password.value) == InvalidCredentialsError.MESSAGE
