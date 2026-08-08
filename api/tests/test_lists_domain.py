"""Domain + application list create/rename tests (TDD — fakes, no DB)."""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from uuid import UUID, uuid4

import pytest
from application.lists import (
    CreateOwnedListCommand,
    CreateOwnedListService,
    GetListDefaultSplitCommand,
    GetListDefaultSplitService,
    ListMembershipsCommand,
    ListMembershipsService,
    ListMembershipSummary,
    ListRecord,
    MembershipRecord,
    RenameListCommand,
    RenameListService,
    SetListDefaultSplitCommand,
    SetListDefaultSplitService,
    StoredDefaultSplit,
)
from application.ports import NewListRecord, NewMembershipRecord
from domain.default_split import MODE_EVEN, MODE_PERCENTAGE, validate_percentage_shares
from domain.errors import (
    InvalidDefaultSplitError,
    InvalidListNameError,
    ListNotFoundError,
    NotListMemberError,
    NotListOwnerError,
)
from domain.lists import validate_list_name


@dataclass
class FakeListRepo:
    lists: dict[UUID, ListRecord] = field(default_factory=dict)
    memberships: list[MembershipRecord] = field(default_factory=list)

    def create_owned_list(
        self,
        *,
        owned_list: NewListRecord,
        membership: NewMembershipRecord,
    ) -> None:
        self.lists[owned_list.id] = ListRecord(
            id=owned_list.id,
            name=owned_list.name,
            owner_id=owned_list.owner_id,
        )
        self.memberships.append(
            MembershipRecord(
                list_id=membership.list_id,
                user_id=membership.user_id,
                role=membership.role,
            )
        )

    def get_list(self, list_id: UUID) -> ListRecord | None:
        return self.lists.get(list_id)

    def get_membership(self, list_id: UUID, user_id: UUID) -> MembershipRecord | None:
        for m in self.memberships:
            if m.list_id == list_id and m.user_id == user_id:
                return m
        return None

    def update_list_name(self, list_id: UUID, name: str) -> ListRecord:
        current = self.lists[list_id]
        updated = ListRecord(id=current.id, name=name, owner_id=current.owner_id)
        self.lists[list_id] = updated
        return updated

    def list_for_user(self, user_id: UUID) -> list[ListMembershipSummary]:
        out: list[ListMembershipSummary] = []
        for m in self.memberships:
            if m.user_id != user_id:
                continue
            lst = self.lists[m.list_id]
            out.append(
                ListMembershipSummary(
                    id=lst.id,
                    name=lst.name,
                    owner_id=lst.owner_id,
                    role=m.role,
                )
            )
        return out

    def get_list_with_grant(self, grant, list_id):  # type: ignore[no-untyped-def]
        from application.list_access import assert_grant_list_id
        from domain.errors import ListNotFoundError

        assert_grant_list_id(grant, list_id)
        row = self.lists.get(list_id)
        if row is None:
            raise ListNotFoundError()
        return row


def test_validate_list_name_trims() -> None:
    assert validate_list_name("  Household  ") == "Household"


def test_validate_list_name_rejects_empty() -> None:
    with pytest.raises(InvalidListNameError):
        validate_list_name("")


def test_validate_list_name_rejects_whitespace_only() -> None:
    with pytest.raises(InvalidListNameError):
        validate_list_name("   \t  ")


def test_create_owned_list_makes_creator_owner_and_member() -> None:
    repo = FakeListRepo()
    actor = uuid4()
    service = CreateOwnedListService(repo)

    result = service.execute(CreateOwnedListCommand(actor_user_id=actor, name="Household"))

    assert result.name == "Household"
    assert result.owner_id == actor
    assert len(repo.lists) == 1
    assert len(repo.memberships) == 1
    assert repo.memberships[0].user_id == actor
    assert repo.memberships[0].role == "owner"
    assert repo.memberships[0].list_id == result.id


def test_create_allows_multiple_owned_lists() -> None:
    repo = FakeListRepo()
    actor = uuid4()
    # Seed personal list (same entity) already owned.
    personal_id = uuid4()
    repo.create_owned_list(
        owned_list=NewListRecord(id=personal_id, name="Personal", owner_id=actor),
        membership=NewMembershipRecord(
            id=uuid4(), list_id=personal_id, user_id=actor, role="owner"
        ),
    )
    service = CreateOwnedListService(repo)

    second = service.execute(CreateOwnedListCommand(actor_user_id=actor, name="Trip"))

    owned = [lst for lst in repo.lists.values() if lst.owner_id == actor]
    assert len(owned) == 2
    assert {lst.name for lst in owned} == {"Personal", "Trip"}
    assert second.id != personal_id


def test_create_rejects_blank_name() -> None:
    service = CreateOwnedListService(FakeListRepo())
    with pytest.raises(InvalidListNameError):
        service.execute(CreateOwnedListCommand(actor_user_id=uuid4(), name="  "))


def test_owner_rename_updates_name_visible_via_membership_list() -> None:
    repo = FakeListRepo()
    owner = uuid4()
    member = uuid4()
    list_id = uuid4()
    repo.create_owned_list(
        owned_list=NewListRecord(id=list_id, name="Old", owner_id=owner),
        membership=NewMembershipRecord(id=uuid4(), list_id=list_id, user_id=owner, role="owner"),
    )
    repo.memberships.append(MembershipRecord(list_id=list_id, user_id=member, role="member"))

    RenameListService(repo).execute(
        RenameListCommand(actor_user_id=owner, list_id=list_id, name="New Name")
    )

    summaries = ListMembershipsService(repo).execute(ListMembershipsCommand(actor_user_id=member))
    assert len(summaries) == 1
    assert summaries[0].name == "New Name"


def test_non_member_rename_rejected() -> None:
    repo = FakeListRepo()
    owner = uuid4()
    stranger = uuid4()
    list_id = uuid4()
    repo.create_owned_list(
        owned_list=NewListRecord(id=list_id, name="Household", owner_id=owner),
        membership=NewMembershipRecord(id=uuid4(), list_id=list_id, user_id=owner, role="owner"),
    )

    with pytest.raises(NotListMemberError):
        RenameListService(repo).execute(
            RenameListCommand(actor_user_id=stranger, list_id=list_id, name="Hacked")
        )
    assert repo.lists[list_id].name == "Household"


def test_member_non_owner_rename_rejected() -> None:
    repo = FakeListRepo()
    owner = uuid4()
    member = uuid4()
    list_id = uuid4()
    repo.create_owned_list(
        owned_list=NewListRecord(id=list_id, name="Household", owner_id=owner),
        membership=NewMembershipRecord(id=uuid4(), list_id=list_id, user_id=owner, role="owner"),
    )
    repo.memberships.append(MembershipRecord(list_id=list_id, user_id=member, role="member"))

    with pytest.raises(NotListOwnerError):
        RenameListService(repo).execute(
            RenameListCommand(actor_user_id=member, list_id=list_id, name="Renamed")
        )
    assert repo.lists[list_id].name == "Household"


def test_rename_missing_list_raises_not_member() -> None:
    with pytest.raises(NotListMemberError):
        RenameListService(FakeListRepo()).execute(
            RenameListCommand(actor_user_id=uuid4(), list_id=uuid4(), name="X")
        )


# --- Story 2.5 default-split application (fake repo) ---


def _extend_fake(repo: FakeListRepo) -> FakeListRepo:
    repo.default_modes = {}  # type: ignore[attr-defined]
    repo.default_shares = {}  # type: ignore[attr-defined]

    def list_member_ids(list_id: UUID) -> list[UUID]:
        return [m.user_id for m in repo.memberships if m.list_id == list_id]

    def get_stored_default_split(list_id: UUID) -> StoredDefaultSplit | None:
        if list_id not in repo.lists:
            return None
        mode = repo.default_modes.get(list_id, MODE_EVEN)  # type: ignore[attr-defined]
        shares = repo.default_shares.get(list_id, {})  # type: ignore[attr-defined]
        return StoredDefaultSplit(mode=mode, shares=dict(shares))

    def set_default_split(
        list_id: UUID,
        *,
        mode: str,
        shares: dict[UUID, Decimal] | None,
    ) -> None:
        if list_id not in repo.lists:
            raise ListNotFoundError()
        repo.default_modes[list_id] = mode  # type: ignore[attr-defined]
        repo.default_shares[list_id] = dict(shares or {})  # type: ignore[attr-defined]

    def clear_invalid_percentage_default(list_id: UUID) -> None:
        stored = get_stored_default_split(list_id)
        if stored is None or stored.mode != MODE_PERCENTAGE:
            return
        members = list_member_ids(list_id)
        try:
            validate_percentage_shares(members, stored.shares)
        except InvalidDefaultSplitError:
            set_default_split(list_id, mode=MODE_EVEN, shares=None)

    repo.list_member_ids = list_member_ids  # type: ignore[method-assign]
    repo.get_stored_default_split = get_stored_default_split  # type: ignore[method-assign]
    repo.set_default_split = set_default_split  # type: ignore[method-assign]
    repo.clear_invalid_percentage_default = clear_invalid_percentage_default  # type: ignore[method-assign]
    return repo


def test_get_default_split_even_for_new_list() -> None:
    repo = _extend_fake(FakeListRepo())
    owner = uuid4()
    CreateOwnedListService(repo).execute(
        CreateOwnedListCommand(actor_user_id=owner, name="Household")
    )
    list_id = next(iter(repo.lists))
    view = GetListDefaultSplitService(repo).execute(
        GetListDefaultSplitCommand(actor_user_id=owner, list_id=list_id)
    )
    assert view.mode == MODE_EVEN
    assert len(view.shares) == 1
    assert view.shares[0].percentage == Decimal("100.00")


def test_owner_sets_percentage_default() -> None:
    repo = _extend_fake(FakeListRepo())
    owner = uuid4()
    member = uuid4()
    CreateOwnedListService(repo).execute(
        CreateOwnedListCommand(actor_user_id=owner, name="Household")
    )
    list_id = next(iter(repo.lists))
    repo.memberships.append(MembershipRecord(list_id=list_id, user_id=member, role="member"))
    view = SetListDefaultSplitService(repo).execute(
        SetListDefaultSplitCommand(
            actor_user_id=owner,
            list_id=list_id,
            mode=MODE_PERCENTAGE,
            shares={owner: Decimal("60.00"), member: Decimal("40.00")},
        )
    )
    assert view.mode == MODE_PERCENTAGE
    by_user = {s.user_id: s.percentage for s in view.shares}
    assert by_user[owner] == Decimal("60.00")
    assert by_user[member] == Decimal("40.00")


def test_set_percentage_rejects_bad_sum() -> None:
    repo = _extend_fake(FakeListRepo())
    owner = uuid4()
    member = uuid4()
    CreateOwnedListService(repo).execute(
        CreateOwnedListCommand(actor_user_id=owner, name="Household")
    )
    list_id = next(iter(repo.lists))
    repo.memberships.append(MembershipRecord(list_id=list_id, user_id=member, role="member"))
    with pytest.raises(InvalidDefaultSplitError):
        SetListDefaultSplitService(repo).execute(
            SetListDefaultSplitCommand(
                actor_user_id=owner,
                list_id=list_id,
                mode=MODE_PERCENTAGE,
                shares={owner: Decimal("60.00"), member: Decimal("30.00")},
            )
        )


def test_non_owner_cannot_set_default_split() -> None:
    repo = _extend_fake(FakeListRepo())
    owner = uuid4()
    member = uuid4()
    CreateOwnedListService(repo).execute(
        CreateOwnedListCommand(actor_user_id=owner, name="Household")
    )
    list_id = next(iter(repo.lists))
    repo.memberships.append(MembershipRecord(list_id=list_id, user_id=member, role="member"))
    with pytest.raises(NotListOwnerError):
        SetListDefaultSplitService(repo).execute(
            SetListDefaultSplitCommand(
                actor_user_id=member,
                list_id=list_id,
                mode=MODE_EVEN,
            )
        )


def test_membership_change_falls_back_to_even_on_get() -> None:
    repo = _extend_fake(FakeListRepo())
    owner = uuid4()
    member = uuid4()
    extra = uuid4()
    CreateOwnedListService(repo).execute(
        CreateOwnedListCommand(actor_user_id=owner, name="Household")
    )
    list_id = next(iter(repo.lists))
    repo.memberships.append(MembershipRecord(list_id=list_id, user_id=member, role="member"))
    SetListDefaultSplitService(repo).execute(
        SetListDefaultSplitCommand(
            actor_user_id=owner,
            list_id=list_id,
            mode=MODE_PERCENTAGE,
            shares={owner: Decimal("60.00"), member: Decimal("40.00")},
        )
    )
    repo.memberships.append(MembershipRecord(list_id=list_id, user_id=extra, role="member"))
    view = GetListDefaultSplitService(repo).execute(
        GetListDefaultSplitCommand(actor_user_id=owner, list_id=list_id)
    )
    assert view.mode == MODE_EVEN
    assert len(view.member_ids) == 3
