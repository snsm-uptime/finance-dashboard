"""Sign-up use-case: create account + exactly one personal list."""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID, uuid4

from domain.errors import DuplicateEmailError
from domain.signup import PERSONAL_LIST_NAME, validate_signup_input

from application.ports import (
    NewListRecord,
    NewMembershipRecord,
    NewUserRecord,
    PasswordHasher,
    SignupRepository,
)


@dataclass(frozen=True, slots=True)
class SignupResult:
    user_id: UUID
    email: str
    list_id: UUID
    list_name: str


@dataclass(frozen=True, slots=True)
class SignupCommand:
    email: str
    password: str
    email_verification_required: bool = False


class SignUpService:
    def __init__(self, repo: SignupRepository, hasher: PasswordHasher) -> None:
        self._repo = repo
        self._hasher = hasher

    def execute(self, command: SignupCommand) -> SignupResult:
        email = validate_signup_input(command.email, command.password)
        if self._repo.email_exists(email):
            raise DuplicateEmailError("An account with this email already exists.")

        # FR-4 off: no verification gate — account is immediately usable.
        # When verification is required (Story 1.5), gating happens elsewhere.
        _ = command.email_verification_required

        user_id = uuid4()
        list_id = uuid4()
        membership_id = uuid4()
        password_hash = self._hasher.hash(command.password)

        self._repo.create_user_with_personal_list(
            user=NewUserRecord(id=user_id, email=email, password_hash=password_hash),
            personal_list=NewListRecord(
                id=list_id,
                name=PERSONAL_LIST_NAME,
                owner_id=user_id,
            ),
            membership=NewMembershipRecord(
                id=membership_id,
                list_id=list_id,
                user_id=user_id,
                role="owner",
            ),
        )

        return SignupResult(
            user_id=user_id,
            email=email,
            list_id=list_id,
            list_name=PERSONAL_LIST_NAME,
        )
