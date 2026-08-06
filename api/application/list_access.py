"""authorize_list_access application service — Story 2.2 ACL port."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol
from uuid import UUID

from domain.errors import ListNotFoundError, NotListMemberError, NotListOwnerError
from domain.list_access import (
    deny_as_not_found_for_action,
    is_owner_action,
    normalize_list_action,
)

from application.ports import ListAccessGrant


@dataclass(frozen=True, slots=True)
class _ListPeek:
    id: UUID
    owner_id: UUID


@dataclass(frozen=True, slots=True)
class _MembershipPeek:
    user_id: UUID
    role: str


class ListAccessLookup(Protocol):
    """Narrow repo surface for ACL — avoids importing full ListRepository."""

    def get_list(self, list_id: UUID) -> _ListPeek | None: ...

    def get_membership(self, list_id: UUID, user_id: UUID) -> _MembershipPeek | None: ...


@dataclass(frozen=True, slots=True)
class AuthorizeListAccessCommand:
    acting_user_id: UUID
    list_id: UUID
    action: str


class AuthorizeListAccessService:
    """Single ACL choke: membership (+ owner when required) → ListAccessGrant."""

    def __init__(self, lookup: ListAccessLookup) -> None:
        self._lookup = lookup

    def execute(self, command: AuthorizeListAccessCommand) -> ListAccessGrant:
        canonical = normalize_list_action(command.action)
        if canonical is None:
            # Fail closed — treat unknown like a mutation deny (403 path).
            raise NotListMemberError()

        existing = self._lookup.get_list(command.list_id)
        membership = self._lookup.get_membership(command.list_id, command.acting_user_id)

        # Structural duck-typing: any object with owner_id / user_id+role works.
        if existing is None or membership is None:
            if deny_as_not_found_for_action(canonical):
                raise ListNotFoundError()
            raise NotListMemberError()

        owner_id = existing.owner_id
        if is_owner_action(canonical) and not (
            membership.user_id == owner_id or membership.role == "owner"
        ):
            raise NotListOwnerError()

        return ListAccessGrant(
            list_id=command.list_id,
            action=canonical,
            acting_user_id=command.acting_user_id,
        )


def assert_grant_list_id(grant: ListAccessGrant, list_id: UUID) -> None:
    """Repositories must reject a grant whose list_id does not match the call."""
    if grant.list_id != list_id:
        raise ListNotFoundError()


class ListAccessAuthorizerAdapter:
    """Adapter implementing ListAccessAuthorizer Protocol via AuthorizeListAccessService."""

    def __init__(self, lookup: ListAccessLookup) -> None:
        self._service = AuthorizeListAccessService(lookup)

    def authorize_list_access(
        self,
        acting_user_id: UUID,
        list_id: UUID,
        action: str,
    ) -> ListAccessGrant:
        return self._service.execute(
            AuthorizeListAccessCommand(
                acting_user_id=acting_user_id,
                list_id=list_id,
                action=action,
            )
        )
