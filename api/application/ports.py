"""Ports for application use-cases (implemented by adapters)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol
from uuid import UUID


@dataclass(frozen=True, slots=True)
class NewUserRecord:
    id: UUID
    email: str
    password_hash: str


@dataclass(frozen=True, slots=True)
class NewListRecord:
    id: UUID
    name: str
    owner_id: UUID


@dataclass(frozen=True, slots=True)
class NewMembershipRecord:
    id: UUID
    list_id: UUID
    user_id: UUID
    role: str


class PasswordHasher(Protocol):
    def hash(self, password: str) -> str: ...

    def verify(self, password: str, password_hash: str) -> bool: ...


class SignupRepository(Protocol):
    def email_exists(self, email: str) -> bool: ...

    def create_user_with_personal_list(
        self,
        *,
        user: NewUserRecord,
        personal_list: NewListRecord,
        membership: NewMembershipRecord,
    ) -> None: ...
