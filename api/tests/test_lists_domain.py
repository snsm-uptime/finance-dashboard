"""Domain + application list create/rename tests (TDD — fakes, no DB)."""

from __future__ import annotations

from dataclasses import dataclass, field
from uuid import UUID, uuid4

import pytest
from application.lists import (
    CreateOwnedListCommand,
    CreateOwnedListService,
    ListMembershipsCommand,
    ListMembershipsService,
    ListMembershipSummary,
    ListRecord,
    MembershipRecord,
    RenameListCommand,
    RenameListService,
)
from application.ports import NewListRecord, NewMembershipRecord
from domain.errors import (
    InvalidListNameError,
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
        membership=NewMembershipRecord(
            id=uuid4(), list_id=list_id, user_id=owner, role="owner"
        ),
    )
    repo.memberships.append(
        MembershipRecord(list_id=list_id, user_id=member, role="member")
    )

    RenameListService(repo).execute(
        RenameListCommand(actor_user_id=owner, list_id=list_id, name="New Name")
    )

    summaries = ListMembershipsService(repo).execute(
        ListMembershipsCommand(actor_user_id=member)
    )
    assert len(summaries) == 1
    assert summaries[0].name == "New Name"


def test_non_member_rename_rejected() -> None:
    repo = FakeListRepo()
    owner = uuid4()
    stranger = uuid4()
    list_id = uuid4()
    repo.create_owned_list(
        owned_list=NewListRecord(id=list_id, name="Household", owner_id=owner),
        membership=NewMembershipRecord(
            id=uuid4(), list_id=list_id, user_id=owner, role="owner"
        ),
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
        membership=NewMembershipRecord(
            id=uuid4(), list_id=list_id, user_id=owner, role="owner"
        ),
    )
    repo.memberships.append(
        MembershipRecord(list_id=list_id, user_id=member, role="member")
    )

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
