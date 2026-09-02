"""Domain + application ACL port tests (TDD — fakes, no DB). Story 2.2."""

from __future__ import annotations

from dataclasses import dataclass, field
from uuid import UUID, uuid4

import pytest
from application.list_access import (
    AuthorizeListAccessCommand,
    AuthorizeListAccessService,
    assert_grant_list_id,
)
from application.lists import (
    PLACEHOLDER_BALANCE_CRC,
    GetListBalancesStubCommand,
    GetListBalancesStubService,
    GetListDetailCommand,
    GetListDetailService,
    GetListExpensesStubCommand,
    GetListExpensesStubService,
    ListMembershipSummary,
    ListRecord,
    MembershipRecord,
    SetDefaultImportListCommand,
    SetDefaultImportListService,
    SetLastOpenedListCommand,
    SetLastOpenedListService,
)
from application.ports import (
    ListAccessGrant,
    NewListRecord,
    NewMembershipRecord,
    UserPreferencesRecord,
)
from domain.errors import ListNotFoundError, NotListMemberError, NotListOwnerError


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
                    balance_crc=PLACEHOLDER_BALANCE_CRC,
                )
            )
        return out

    def get_list_with_grant(self, grant: ListAccessGrant, list_id: UUID) -> ListRecord:
        assert_grant_list_id(grant, list_id)
        row = self.lists.get(list_id)
        if row is None:
            raise ListNotFoundError()
        return row

    def list_ledger_entries(self, list_id: UUID) -> list:
        return []

    def list_members_with_alias(self, list_id: UUID) -> list:
        return [
            type(
                "ListMemberView",
                (),
                {"user_id": m.user_id, "alias": None, "photo_base64": None},
            )()
            for m in self.memberships
            if m.list_id == list_id
        ]

    def get_stored_default_split(self, list_id: UUID):
        return None

    def get_split_override(self, list_id: UUID, subject_kind: str, receipt_id: UUID):
        return None


@dataclass
class FakeCardRepo:
    reset_calls: list[UUID] = field(default_factory=list)

    def reset_routing_to_review_for_user(self, user_id: UUID) -> None:
        self.reset_calls.append(user_id)


@dataclass
class FakePrefsRepo:
    prefs: dict[UUID, UserPreferencesRecord] = field(default_factory=dict)

    def get_preferences(self, user_id: UUID) -> UserPreferencesRecord | None:
        return self.prefs.get(user_id)

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
    ) -> UserPreferencesRecord:
        current = self.prefs[user_id]
        opened = current.last_opened_list_id
        if clear_last_opened_list_id:
            opened = None
        elif last_opened_list_id is not None:
            opened = last_opened_list_id
        default_import = current.default_import_list_id
        if clear_default_import_list_id:
            default_import = None
        elif default_import_list_id is not None:
            default_import = default_import_list_id
        updated = UserPreferencesRecord(
            id=current.id,
            email=current.email,
            language=language if language is not None else current.language,
            theme=theme if theme is not None else current.theme,
            last_opened_list_id=opened,
            default_import_list_id=default_import,
        )
        self.prefs[user_id] = updated
        return updated


def _seed_owned(repo: FakeListRepo, *, owner: UUID, name: str = "Household") -> UUID:
    list_id = uuid4()
    repo.create_owned_list(
        owned_list=NewListRecord(id=list_id, name=name, owner_id=owner),
        membership=NewMembershipRecord(id=uuid4(), list_id=list_id, user_id=owner, role="owner"),
    )
    return list_id


def test_member_may_read_list() -> None:
    repo = FakeListRepo()
    owner = uuid4()
    member = uuid4()
    list_id = _seed_owned(repo, owner=owner)
    repo.memberships.append(MembershipRecord(list_id=list_id, user_id=member, role="member"))

    grant = AuthorizeListAccessService(repo).execute(
        AuthorizeListAccessCommand(acting_user_id=member, list_id=list_id, action="read_list")
    )
    assert grant.list_id == list_id
    assert grant.action == "read_list"


def test_non_member_read_denied_as_not_found() -> None:
    repo = FakeListRepo()
    owner = uuid4()
    stranger = uuid4()
    list_id = _seed_owned(repo, owner=owner)

    with pytest.raises(ListNotFoundError):
        AuthorizeListAccessService(repo).execute(
            AuthorizeListAccessCommand(
                acting_user_id=stranger, list_id=list_id, action="read_expenses"
            )
        )


def test_missing_list_read_denied_as_not_found() -> None:
    repo = FakeListRepo()
    with pytest.raises(ListNotFoundError):
        AuthorizeListAccessService(repo).execute(
            AuthorizeListAccessCommand(
                acting_user_id=uuid4(), list_id=uuid4(), action="read_balances"
            )
        )


def test_personal_list_sole_member_allowed() -> None:
    repo = FakeListRepo()
    owner = uuid4()
    list_id = _seed_owned(repo, owner=owner, name="Personal")
    grant = AuthorizeListAccessService(repo).execute(
        AuthorizeListAccessCommand(acting_user_id=owner, list_id=list_id, action="read_list")
    )
    assert grant.acting_user_id == owner


def test_unknown_action_denied() -> None:
    repo = FakeListRepo()
    owner = uuid4()
    list_id = _seed_owned(repo, owner=owner)
    with pytest.raises(NotListMemberError):
        AuthorizeListAccessService(repo).execute(
            AuthorizeListAccessCommand(acting_user_id=owner, list_id=list_id, action="admin_bypass")
        )


def test_grant_list_id_mismatch_rejected_at_repo() -> None:
    repo = FakeListRepo()
    owner = uuid4()
    list_id = _seed_owned(repo, owner=owner)
    other = uuid4()
    grant = AuthorizeListAccessService(repo).execute(
        AuthorizeListAccessCommand(acting_user_id=owner, list_id=list_id, action="read_list")
    )
    with pytest.raises(ListNotFoundError):
        repo.get_list_with_grant(grant, other)


def test_set_last_opened_non_member_is_not_list_member() -> None:
    repo = FakeListRepo()
    owner = uuid4()
    stranger = uuid4()
    list_id = _seed_owned(repo, owner=owner)
    prefs = FakePrefsRepo()
    prefs.prefs[stranger] = UserPreferencesRecord(
        id=stranger, email="stranger@example.com", language=None, theme=None
    )

    with pytest.raises(NotListMemberError):
        SetLastOpenedListService(repo, prefs).execute(
            SetLastOpenedListCommand(actor_user_id=stranger, list_id=list_id)
        )


def test_set_last_opened_member_persists() -> None:
    repo = FakeListRepo()
    owner = uuid4()
    list_id = _seed_owned(repo, owner=owner)
    prefs = FakePrefsRepo()
    prefs.prefs[owner] = UserPreferencesRecord(
        id=owner, email="owner@example.com", language=None, theme=None
    )

    SetLastOpenedListService(repo, prefs).execute(
        SetLastOpenedListCommand(actor_user_id=owner, list_id=list_id)
    )
    assert prefs.prefs[owner].last_opened_list_id == list_id


def test_route_card_to_list_member_allowed() -> None:
    repo = FakeListRepo()
    owner = uuid4()
    list_id = _seed_owned(repo, owner=owner)

    grant = AuthorizeListAccessService(repo).execute(
        AuthorizeListAccessCommand(
            acting_user_id=owner, list_id=list_id, action="route_card_to_list"
        )
    )
    assert grant.list_id == list_id
    assert grant.action == "route_card_to_list"


def test_route_card_to_list_non_member_denied() -> None:
    repo = FakeListRepo()
    owner = uuid4()
    stranger = uuid4()
    list_id = _seed_owned(repo, owner=owner)

    with pytest.raises(NotListMemberError):
        AuthorizeListAccessService(repo).execute(
            AuthorizeListAccessCommand(
                acting_user_id=stranger, list_id=list_id, action="route_card_to_list"
            )
        )


def test_set_default_import_list_action_member_allowed() -> None:
    repo = FakeListRepo()
    owner = uuid4()
    list_id = _seed_owned(repo, owner=owner)

    grant = AuthorizeListAccessService(repo).execute(
        AuthorizeListAccessCommand(
            acting_user_id=owner, list_id=list_id, action="set_default_import_list"
        )
    )
    assert grant.list_id == list_id
    assert grant.action == "set_default_import_list"


def test_set_default_import_list_action_non_member_denied() -> None:
    repo = FakeListRepo()
    owner = uuid4()
    stranger = uuid4()
    list_id = _seed_owned(repo, owner=owner)

    with pytest.raises(NotListMemberError):
        AuthorizeListAccessService(repo).execute(
            AuthorizeListAccessCommand(
                acting_user_id=stranger, list_id=list_id, action="set_default_import_list"
            )
        )


def test_set_default_import_list_non_member_denied() -> None:
    repo = FakeListRepo()
    owner = uuid4()
    stranger = uuid4()
    list_id = _seed_owned(repo, owner=owner)
    prefs = FakePrefsRepo()
    prefs.prefs[stranger] = UserPreferencesRecord(
        id=stranger, email="stranger@example.com", language=None, theme=None
    )

    with pytest.raises(NotListMemberError):
        SetDefaultImportListService(repo, prefs).execute(
            SetDefaultImportListCommand(actor_user_id=stranger, list_id=list_id)
        )


def test_set_default_import_list_member_persists() -> None:
    repo = FakeListRepo()
    owner = uuid4()
    list_id = _seed_owned(repo, owner=owner)
    prefs = FakePrefsRepo()
    prefs.prefs[owner] = UserPreferencesRecord(
        id=owner, email="owner@example.com", language=None, theme=None
    )

    SetDefaultImportListService(repo, prefs).execute(
        SetDefaultImportListCommand(actor_user_id=owner, list_id=list_id)
    )
    assert prefs.prefs[owner].default_import_list_id == list_id


def test_set_default_import_list_change_resets_cards_to_review() -> None:
    repo = FakeListRepo()
    owner = uuid4()
    list_id = _seed_owned(repo, owner=owner)
    prefs = FakePrefsRepo()
    prefs.prefs[owner] = UserPreferencesRecord(
        id=owner, email="owner@example.com", language=None, theme=None
    )
    cards = FakeCardRepo()

    SetDefaultImportListService(repo, prefs, cards).execute(
        SetDefaultImportListCommand(actor_user_id=owner, list_id=list_id)
    )

    assert cards.reset_calls == [owner]


def test_set_default_import_list_unchanged_does_not_reset_cards() -> None:
    repo = FakeListRepo()
    owner = uuid4()
    list_id = _seed_owned(repo, owner=owner)
    prefs = FakePrefsRepo()
    prefs.prefs[owner] = UserPreferencesRecord(
        id=owner,
        email="owner@example.com",
        language=None,
        theme=None,
        default_import_list_id=list_id,
    )
    cards = FakeCardRepo()

    SetDefaultImportListService(repo, prefs, cards).execute(
        SetDefaultImportListCommand(actor_user_id=owner, list_id=list_id)
    )

    assert cards.reset_calls == []


def test_detail_and_stubs_use_acl() -> None:
    repo = FakeListRepo()
    owner = uuid4()
    stranger = uuid4()
    list_id = _seed_owned(repo, owner=owner)

    detail = GetListDetailService(repo).execute(
        GetListDetailCommand(actor_user_id=owner, list_id=list_id)
    )
    assert detail.id == list_id

    expenses = GetListExpensesStubService(repo).execute(
        GetListExpensesStubCommand(actor_user_id=owner, list_id=list_id)
    )
    assert expenses.expenses == ()

    balances = GetListBalancesStubService(repo).execute(
        GetListBalancesStubCommand(actor_user_id=owner, list_id=list_id)
    )
    assert balances.balance_crc == "0"

    with pytest.raises(ListNotFoundError):
        GetListDetailService(repo).execute(
            GetListDetailCommand(actor_user_id=stranger, list_id=list_id)
        )


def test_stale_last_opened_read_list_fails_closed() -> None:
    """First-paint revalidation must use read_list grant — not membership contains-check alone."""
    repo = FakeListRepo()
    owner = uuid4()
    former = uuid4()
    list_id = _seed_owned(repo, owner=owner)
    # former never had membership — simulates lost membership / stale last-opened
    with pytest.raises(ListNotFoundError):
        AuthorizeListAccessService(repo).execute(
            AuthorizeListAccessCommand(acting_user_id=former, list_id=list_id, action="read_list")
        )


def test_owner_action_member_non_owner_denied() -> None:
    repo = FakeListRepo()
    owner = uuid4()
    member = uuid4()
    list_id = _seed_owned(repo, owner=owner)
    repo.memberships.append(MembershipRecord(list_id=list_id, user_id=member, role="member"))
    with pytest.raises(NotListOwnerError):
        AuthorizeListAccessService(repo).execute(
            AuthorizeListAccessCommand(acting_user_id=member, list_id=list_id, action="rename_list")
        )


def test_read_expenses_alias_normalizes() -> None:
    repo = FakeListRepo()
    owner = uuid4()
    list_id = _seed_owned(repo, owner=owner)
    grant = AuthorizeListAccessService(repo).execute(
        AuthorizeListAccessCommand(acting_user_id=owner, list_id=list_id, action="read_expenses")
    )
    assert grant.action == "read_ledger"
