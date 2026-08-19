"""Ports for application use-cases (implemented by adapters)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from typing import Protocol
from uuid import UUID

# Canonical session TTL (30d).
# adapters.persistence.sessions re-exports this for SESSION_COOKIE_MAX_AGE.
DEFAULT_SESSION_TTL = timedelta(days=30)


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
    default_split_mode: str = "even"


@dataclass(frozen=True, slots=True)
class NewMembershipRecord:
    id: UUID
    list_id: UUID
    user_id: UUID
    role: str


@dataclass(frozen=True, slots=True)
class UserPreferencesRecord:
    id: UUID
    email: str
    language: str | None
    theme: str | None
    last_opened_list_id: UUID | None = None
    default_import_list_id: UUID | None = None
    alias: str | None = None


@dataclass(frozen=True, slots=True)
class ListAccessGrant:
    """Opaque per-request grant binding list_id + authorized action."""

    list_id: UUID
    action: str
    acting_user_id: UUID


class ListAccessAuthorizer(Protocol):
    """Canonical ACL port — authorize_list_access(acting_user_id, list_id, action)."""

    def authorize_list_access(
        self,
        acting_user_id: UUID,
        list_id: UUID,
        action: str,
    ) -> ListAccessGrant: ...


class PasswordHasher(Protocol):
    def hash(self, password: str) -> str: ...

    def verify(self, password: str, password_hash: str) -> bool: ...


class SessionStore(Protocol):
    def create(self, user_id: UUID, *, ttl: timedelta = DEFAULT_SESSION_TTL) -> str: ...

    def resolve_user_id(self, token: str | None) -> UUID | None: ...

    def revoke(self, token: str | None) -> bool: ...

    def revoke_all_for_user(self, user_id: UUID) -> int: ...


class PreferencesRepository(Protocol):
    def get_preferences(self, user_id: UUID) -> UserPreferencesRecord | None: ...

    def update_preferences(
        self,
        user_id: UUID,
        *,
        language: str | None = None,
        theme: str | None = None,
        last_opened_list_id: UUID | None = None,
        clear_last_opened_list_id: bool = False,
        default_import_list_id: UUID | None = None,
        clear_default_import_list_id: bool = False,
    ) -> UserPreferencesRecord: ...

    def claim_alias(self, user_id: UUID, alias: str) -> UserPreferencesRecord:
        """Claim a normalized alias for a user that has none.

        Raises AliasAlreadySetError when one is stored (rename is deferred) and
        AliasTakenError when the case-insensitive unique index rejects the write.
        """
        ...


class SignupRepository(Protocol):
    def email_exists(self, email: str) -> bool: ...

    def create_user_with_personal_list(
        self,
        *,
        user: NewUserRecord,
        personal_list: NewListRecord,
        membership: NewMembershipRecord,
    ) -> None: ...


@dataclass(frozen=True, slots=True)
class EmailMessage:
    to_address: str
    subject: str
    body_text: str
    body_html: str | None = None


class EmailSender(Protocol):
    def send(self, message: EmailMessage) -> None:
        """Send transactional email. Raises SmtpConfigurationError / SmtpSendError on failure."""
        ...


class BccrClient(Protocol):
    """BCCR (Banco Central de Costa Rica) daily FX rate port (Story 3.5 / AD-7).

    Implementations own transport/auth/caching; callers never fall back to 1:1.
    """

    def get_rate(self, rate_date: date, currency: str) -> Decimal | None:
        """Fetch the BCCR rate for the exact date. None if no rate is published."""
        ...

    def get_nearest_prior_rate(self, rate_date: date, currency: str) -> tuple[Decimal, date] | None:
        """Fetch the most recent rate on/before rate_date. None if none exists."""
        ...

    def supported_currencies(self) -> list[str]:
        """Currencies this client can convert to CRC (v1: USD)."""
        ...


class PdfStorage(Protocol):
    """Operator PDF volume port (Story 4.6, AD-3) — path-reference-only.

    Implementations own where/how bytes land on disk; callers only ever see
    the opaque path reference this returns.
    """

    def save(self, *, user_id: UUID, filename: str, content: bytes) -> str:
        """Persist content, returning an opaque path reference string."""
        ...

    def delete(self, path: str) -> None:
        """Remove the stored file. Must not raise if the path is already gone."""
        ...
