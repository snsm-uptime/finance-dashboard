"""Create owned lists, rename, membership listing, ACL reads, default split — 2.1 / 2.2 / 2.5."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Protocol
from uuid import UUID, uuid4

from domain.default_split import (
    MODE_EVEN,
    MODE_PERCENTAGE,
    resolve_effective_default,
    validate_percentage_shares,
)
from domain.errors import (
    InvalidDefaultSplitError,
    NotListMemberError,
    NotListOwnerError,
)
from domain.lists import validate_list_name

from application.list_access import (
    AuthorizeListAccessCommand,
    AuthorizeListAccessService,
)
from application.ports import (
    ListAccessGrant,
    NewListRecord,
    NewMembershipRecord,
    PreferencesRepository,
)

PLACEHOLDER_BALANCE_CRC = "0"


@dataclass(frozen=True, slots=True)
class ListRecord:
    id: UUID
    name: str
    owner_id: UUID


@dataclass(frozen=True, slots=True)
class MembershipRecord:
    list_id: UUID
    user_id: UUID
    role: str


@dataclass(frozen=True, slots=True)
class ListMembershipSummary:
    id: UUID
    name: str
    owner_id: UUID
    role: str
    balance_crc: str = PLACEHOLDER_BALANCE_CRC


@dataclass(frozen=True, slots=True)
class DefaultSplitShareView:
    user_id: UUID
    percentage: Decimal


@dataclass(frozen=True, slots=True)
class DefaultSplitView:
    list_id: UUID
    owner_id: UUID
    mode: str
    shares: tuple[DefaultSplitShareView, ...]
    member_ids: tuple[UUID, ...]


@dataclass(frozen=True, slots=True)
class StoredDefaultSplit:
    mode: str
    shares: dict[UUID, Decimal]


class ListRepository(Protocol):
    def create_owned_list(
        self,
        *,
        owned_list: NewListRecord,
        membership: NewMembershipRecord,
    ) -> None: ...

    def get_list(self, list_id: UUID) -> ListRecord | None: ...

    def get_membership(self, list_id: UUID, user_id: UUID) -> MembershipRecord | None: ...

    def update_list_name(self, list_id: UUID, name: str) -> ListRecord: ...

    def list_for_user(self, user_id: UUID) -> list[ListMembershipSummary]: ...

    def get_list_with_grant(self, grant: ListAccessGrant, list_id: UUID) -> ListRecord: ...

    def list_member_ids(self, list_id: UUID) -> list[UUID]: ...

    def get_stored_default_split(self, list_id: UUID) -> StoredDefaultSplit | None: ...

    def set_default_split(
        self,
        list_id: UUID,
        *,
        mode: str,
        shares: dict[UUID, Decimal] | None,
    ) -> None: ...

    def clear_invalid_percentage_default(self, list_id: UUID) -> None: ...


@dataclass(frozen=True, slots=True)
class CreateOwnedListCommand:
    actor_user_id: UUID
    name: str


@dataclass(frozen=True, slots=True)
class RenameListCommand:
    actor_user_id: UUID
    list_id: UUID
    name: str


@dataclass(frozen=True, slots=True)
class ListMembershipsCommand:
    actor_user_id: UUID


@dataclass(frozen=True, slots=True)
class GetListDetailCommand:
    actor_user_id: UUID
    list_id: UUID


@dataclass(frozen=True, slots=True)
class GetListExpensesStubCommand:
    actor_user_id: UUID
    list_id: UUID


@dataclass(frozen=True, slots=True)
class GetListBalancesStubCommand:
    actor_user_id: UUID
    list_id: UUID


@dataclass(frozen=True, slots=True)
class SetLastOpenedListCommand:
    actor_user_id: UUID
    list_id: UUID


@dataclass(frozen=True, slots=True)
class GetListDefaultSplitCommand:
    actor_user_id: UUID
    list_id: UUID


@dataclass(frozen=True, slots=True)
class SetListDefaultSplitCommand:
    actor_user_id: UUID
    list_id: UUID
    mode: str
    shares: dict[UUID, Decimal] | None = None


@dataclass(frozen=True, slots=True)
class ListBalancesStub:
    list_id: UUID
    balance_crc: str


@dataclass(frozen=True, slots=True)
class ListExpensesStub:
    list_id: UUID
    expenses: tuple[object, ...]


class CreateOwnedListService:
    """Create an additional named list owned by the authenticated user.

    Same List entity as personal lists. Seeds even default split implicitly:
    creator is sole owner-member (1-member ⇒ 100% to creator / FR-9 seed).
    owner_id is durable list creator for AD-6 remainder later.
    """

    def __init__(self, repo: ListRepository) -> None:
        self._repo = repo

    def execute(self, command: CreateOwnedListCommand) -> ListRecord:
        name = validate_list_name(command.name)
        list_id = uuid4()
        membership_id = uuid4()
        owned = NewListRecord(
            id=list_id,
            name=name,
            owner_id=command.actor_user_id,
        )
        membership = NewMembershipRecord(
            id=membership_id,
            list_id=list_id,
            user_id=command.actor_user_id,
            role="owner",
        )
        self._repo.create_owned_list(owned_list=owned, membership=membership)
        return ListRecord(id=list_id, name=name, owner_id=command.actor_user_id)


class RenameListService:
    """Rename a list — owner-only (FR-6); non-members and non-owner members rejected.

    As-built 2.1: ad-hoc ACL (not shared port). Grandfathered HTTP 403 —
    do not silently migrate deny paths in this story.
    """

    def __init__(self, repo: ListRepository) -> None:
        self._repo = repo

    def execute(self, command: RenameListCommand) -> ListRecord:
        name = validate_list_name(command.name)
        existing = self._repo.get_list(command.list_id)
        membership = self._repo.get_membership(command.list_id, command.actor_user_id)
        # Missing list and non-membership share the same rejection so rename
        # cannot be used as a list-existence oracle (NFR-3 / story ACL note).
        if existing is None or membership is None:
            raise NotListMemberError()

        if existing.owner_id != command.actor_user_id:
            raise NotListOwnerError()

        return self._repo.update_list_name(command.list_id, name)


class ListMembershipsService:
    """Membership-scoped list summaries for the authenticated user.

    Actor-scoped enumeration — does not call authorize_list_access.
    """

    def __init__(self, repo: ListRepository) -> None:
        self._repo = repo

    def execute(self, command: ListMembershipsCommand) -> list[ListMembershipSummary]:
        return self._repo.list_for_user(command.actor_user_id)


class GetListDetailService:
    """List detail shell for members — authorize_list_access(read_list)."""

    def __init__(self, repo: ListRepository) -> None:
        self._repo = repo

    def execute(self, command: GetListDetailCommand) -> ListRecord:
        grant = AuthorizeListAccessService(self._repo).execute(
            AuthorizeListAccessCommand(
                acting_user_id=command.actor_user_id,
                list_id=command.list_id,
                action="read_list",
            )
        )
        return self._repo.get_list_with_grant(grant, command.list_id)


class GetListExpensesStubService:
    """Expenses collection — authorize_list_access(read_expenses); newest-first."""

    def __init__(self, repo: ListRepository) -> None:
        self._repo = repo

    def execute(self, command: GetListExpensesStubCommand) -> ListExpensesStub:
        grant = AuthorizeListAccessService(self._repo).execute(
            AuthorizeListAccessCommand(
                acting_user_id=command.actor_user_id,
                list_id=command.list_id,
                action="read_expenses",
            )
        )
        self._repo.get_list_with_grant(grant, command.list_id)
        rows = self._repo.list_ledger_entries(command.list_id)  # type: ignore[attr-defined]
        return ListExpensesStub(list_id=command.list_id, expenses=tuple(rows))


class GetListBalancesStubService:
    """Zero balance stub — authorize_list_access(read_balances)."""

    def __init__(self, repo: ListRepository) -> None:
        self._repo = repo

    def execute(self, command: GetListBalancesStubCommand) -> ListBalancesStub:
        grant = AuthorizeListAccessService(self._repo).execute(
            AuthorizeListAccessCommand(
                acting_user_id=command.actor_user_id,
                list_id=command.list_id,
                action="read_balances",
            )
        )
        self._repo.get_list_with_grant(grant, command.list_id)
        return ListBalancesStub(list_id=command.list_id, balance_crc=PLACEHOLDER_BALANCE_CRC)


class SetLastOpenedListService:
    """Remember last-opened list — authorize_list_access(set_last_opened_list) → 403 on deny."""

    def __init__(self, list_repo: ListRepository, prefs_repo: PreferencesRepository) -> None:
        self._list_repo = list_repo
        self._prefs_repo = prefs_repo

    def execute(self, command: SetLastOpenedListCommand) -> UUID:
        AuthorizeListAccessService(self._list_repo).execute(
            AuthorizeListAccessCommand(
                acting_user_id=command.actor_user_id,
                list_id=command.list_id,
                action="set_last_opened_list",
            )
        )
        self._prefs_repo.update_preferences(
            command.actor_user_id,
            last_opened_list_id=command.list_id,
        )
        return command.list_id


def _build_default_split_view(
    *,
    list_id: UUID,
    owner_id: UUID,
    member_ids: list[UUID],
    stored: StoredDefaultSplit | None,
) -> DefaultSplitView:
    stored_mode = stored.mode if stored is not None else MODE_EVEN
    stored_shares = stored.shares if stored is not None else None
    mode, shares = resolve_effective_default(stored_mode, stored_shares, member_ids)
    ordered = sorted(member_ids, key=lambda uid: str(uid))
    share_views = tuple(
        DefaultSplitShareView(user_id=uid, percentage=shares[uid]) for uid in ordered
    )
    return DefaultSplitView(
        list_id=list_id,
        owner_id=owner_id,
        mode=mode,
        shares=share_views,
        member_ids=tuple(ordered),
    )


class GetListDefaultSplitService:
    """Member-readable standing default — authorize_list_access(read_list)."""

    def __init__(self, repo: ListRepository) -> None:
        self._repo = repo

    def execute(self, command: GetListDefaultSplitCommand) -> DefaultSplitView:
        grant = AuthorizeListAccessService(self._repo).execute(
            AuthorizeListAccessCommand(
                acting_user_id=command.actor_user_id,
                list_id=command.list_id,
                action="read_list",
            )
        )
        lst = self._repo.get_list_with_grant(grant, command.list_id)
        members = self._repo.list_member_ids(command.list_id)
        self._repo.clear_invalid_percentage_default(command.list_id)
        stored = self._repo.get_stored_default_split(command.list_id)
        return _build_default_split_view(
            list_id=lst.id,
            owner_id=lst.owner_id,
            member_ids=members,
            stored=stored,
        )


class SetListDefaultSplitService:
    """Owner-only standing default mutation — authorize_list_access(edit_default_split)."""

    def __init__(self, repo: ListRepository) -> None:
        self._repo = repo

    def execute(self, command: SetListDefaultSplitCommand) -> DefaultSplitView:
        AuthorizeListAccessService(self._repo).execute(
            AuthorizeListAccessCommand(
                acting_user_id=command.actor_user_id,
                list_id=command.list_id,
                action="edit_default_split",
            )
        )
        lst = self._repo.get_list(command.list_id)
        if lst is None:
            from domain.errors import ListNotFoundError

            raise ListNotFoundError()

        members = self._repo.list_member_ids(command.list_id)
        mode = command.mode.strip().lower()
        if mode == MODE_EVEN:
            self._repo.set_default_split(command.list_id, mode=MODE_EVEN, shares=None)
        elif mode == MODE_PERCENTAGE:
            if command.shares is None:
                raise InvalidDefaultSplitError(
                    "Percentage mode requires a share for each current member."
                )
            validated = validate_percentage_shares(members, command.shares)
            self._repo.set_default_split(command.list_id, mode=MODE_PERCENTAGE, shares=validated)
        else:
            raise InvalidDefaultSplitError("Default split mode must be even or percentage.")

        stored = self._repo.get_stored_default_split(command.list_id)
        return _build_default_split_view(
            list_id=lst.id,
            owner_id=lst.owner_id,
            member_ids=members,
            stored=stored,
        )
