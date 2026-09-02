"""Unit tests for budget update/delete services + viewer-share history lines
(Spec: budget-detail-crud-and-viewer-share).

Fake-repo pattern mirrors test_expenses_application.py's _FakeExpenseRepo —
no Postgres required, runs under bare `pytest`.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import UUID, uuid4

import pytest
from application.budgets import (
    BudgetRecord,
    DeleteBudgetCommand,
    DeleteBudgetService,
    UpdateBudgetCommand,
    UpdateBudgetService,
    _compute_spent_and_history,
)
from application.expenses import LedgerEntryRecord
from application.lists import ListRecord, StoredDefaultSplit
from domain.errors import (
    BudgetNotFoundError,
    DuplicateBudgetNameError,
    InvalidBudgetNameError,
    NotListMemberError,
)


@dataclass
class _FakeBudgetRepo:
    budgets: dict[UUID, BudgetRecord] = field(default_factory=dict)
    owner_id: UUID = field(default_factory=uuid4)
    rules: dict[UUID, list] = field(default_factory=dict)
    entries: dict[UUID, LedgerEntryRecord] = field(default_factory=dict)
    update_calls: list[UUID] = field(default_factory=list)
    delete_calls: list[UUID] = field(default_factory=list)

    def create_budget(self, **kwargs) -> BudgetRecord:  # pragma: no cover - unused here
        raise NotImplementedError

    def list_budgets_for_owner(self, owner_user_id: UUID) -> list[BudgetRecord]:
        return [b for b in self.budgets.values() if b.owner_user_id == owner_user_id]

    def get_budget(self, budget_id: UUID, owner_user_id: UUID) -> BudgetRecord | None:
        budget = self.budgets.get(budget_id)
        if budget is None or budget.owner_user_id != owner_user_id:
            return None
        return budget

    def update_budget(
        self,
        *,
        budget_id: UUID,
        name: str,
        cap_amount: Decimal,
        currency: str,
        source_list_ids: tuple[UUID, ...],
    ) -> BudgetRecord:
        self.update_calls.append(budget_id)
        existing = self.budgets[budget_id]
        updated = BudgetRecord(
            id=existing.id,
            owner_user_id=existing.owner_user_id,
            name=name,
            cap_amount=cap_amount,
            currency=currency,
            source_list_ids=source_list_ids,
            created_at=existing.created_at,
        )
        self.budgets[budget_id] = updated
        return updated

    def delete_budget(self, budget_id: UUID) -> None:
        self.delete_calls.append(budget_id)
        self.budgets.pop(budget_id, None)

    def list_ledger_entries(self, list_id: UUID) -> list[LedgerEntryRecord]:
        return [e for e in self.entries.values() if e.list_id == list_id]

    def list_ledger_entries_for_lists(self, list_ids: list[UUID]) -> list[LedgerEntryRecord]:
        entries: list[LedgerEntryRecord] = []
        for list_id in list_ids:
            entries.extend(self.list_ledger_entries(list_id))
        return entries

    def get_ledger_entry(self, entry_id: UUID, list_id: UUID) -> LedgerEntryRecord | None:
        entry = self.entries.get(entry_id)
        if entry is None or entry.list_id != list_id:
            return None
        return entry

    def assign_entry_to_budget(self, entry_id: UUID, budget_id: UUID) -> None:
        pass

    def unassign_entry(self, entry_id: UUID) -> None:
        pass

    def list_rules_for_budget(self, budget_id: UUID) -> list:
        return list(self.rules.get(budget_id, []))

    def create_rule(self, rule_id: UUID, budget_id: UUID, match_text: str):
        raise NotImplementedError

    def get_rule(self, rule_id: UUID, budget_id: UUID):
        return None

    def delete_rule(self, rule_id: UUID) -> None:
        pass


@dataclass
class _FakeListAccessLookup:
    """Minimal ListAccessLookup — get_membership returns non-None only for
    lists in `member_of`."""

    member_of: set[UUID] = field(default_factory=set)

    def get_list(self, list_id: UUID):
        return None

    def get_membership(self, list_id: UUID, user_id: UUID):
        if list_id in self.member_of:
            return object()
        return None


@dataclass
class _FakeSplitListRepo:
    """Minimal SplitRepository surface for resolve_viewer_lens_for_entry /
    _compute_spent_and_history — no overrides stored, one shared default
    split config."""

    lists_by_id: dict[UUID, ListRecord] = field(default_factory=dict)
    members_by_list: dict[UUID, list[UUID]] = field(default_factory=dict)
    default_split_by_list: dict[UUID, StoredDefaultSplit | None] = field(default_factory=dict)

    def get_list(self, list_id: UUID) -> ListRecord | None:
        return self.lists_by_id.get(list_id)

    def list_member_ids(self, list_id: UUID) -> list[UUID]:
        return list(self.members_by_list.get(list_id, []))

    def get_stored_default_split(self, list_id: UUID) -> StoredDefaultSplit | None:
        return self.default_split_by_list.get(list_id)

    def get_split_override(self, list_id: UUID, subject_kind: str, subject_id: UUID):
        return None


def _entry(
    *,
    list_id: UUID,
    payer_id: UUID,
    amount_crc: Decimal,
    budget_id: UUID | None = None,
    description: str = "Groceries run",
) -> LedgerEntryRecord:
    return LedgerEntryRecord(
        id=uuid4(),
        list_id=list_id,
        amount=amount_crc,
        currency="CRC",
        normalized_description=description,
        payer_id=payer_id,
        provenance="manual",
        line_type="purchase",
        posted_date=date(2026, 1, 5),
        created_at=datetime.now(UTC),
        amount_crc=amount_crc,
        fx_rate=Decimal("1"),
        fx_rate_date=None,
        fx_fallback=False,
        budget_id=budget_id,
    )


def _budget(
    *,
    owner_user_id: UUID,
    name: str = "Groceries",
    currency: str = "CRC",
    source_list_ids: tuple[UUID, ...] = (),
    cap_amount: Decimal = Decimal("500.00"),
) -> BudgetRecord:
    return BudgetRecord(
        id=uuid4(),
        owner_user_id=owner_user_id,
        name=name,
        cap_amount=cap_amount,
        currency=currency,
        source_list_ids=source_list_ids,
        created_at=datetime.now(UTC),
    )


# --- UpdateBudgetService ----------------------------------------------------


def test_update_budget_renames_and_persists_new_fields():
    owner = uuid4()
    list_id = uuid4()
    budget = _budget(owner_user_id=owner, name="Old name", source_list_ids=(list_id,))
    repo = _FakeBudgetRepo(budgets={budget.id: budget}, owner_id=owner)
    lookup = _FakeListAccessLookup(member_of={list_id})
    service = UpdateBudgetService(repo, lookup)

    result = service.execute(
        UpdateBudgetCommand(
            actor_user_id=owner,
            budget_id=budget.id,
            name="New name",
            cap="600.00",
            currency="CRC",
            source_list_ids=[list_id],
        )
    )

    assert result.name == "New name"
    assert result.cap_amount == Decimal("600.00")
    assert repo.update_calls == [budget.id]


def test_update_budget_rejects_duplicate_name_among_owners_budgets():
    owner = uuid4()
    list_id = uuid4()
    target = _budget(owner_user_id=owner, name="Groceries", source_list_ids=(list_id,))
    other = _budget(owner_user_id=owner, name="Rent", source_list_ids=(list_id,))
    repo = _FakeBudgetRepo(budgets={target.id: target, other.id: other}, owner_id=owner)
    lookup = _FakeListAccessLookup(member_of={list_id})
    service = UpdateBudgetService(repo, lookup)

    with pytest.raises(DuplicateBudgetNameError):
        service.execute(
            UpdateBudgetCommand(
                actor_user_id=owner,
                budget_id=target.id,
                name="Rent",
                cap="600.00",
                currency="CRC",
                source_list_ids=[list_id],
            )
        )

    # No write performed — the target budget's stored name is untouched.
    assert repo.update_calls == []
    assert repo.budgets[target.id].name == "Groceries"


def test_update_budget_same_name_as_self_is_allowed():
    owner = uuid4()
    list_id = uuid4()
    budget = _budget(owner_user_id=owner, name="Groceries", source_list_ids=(list_id,))
    repo = _FakeBudgetRepo(budgets={budget.id: budget}, owner_id=owner)
    lookup = _FakeListAccessLookup(member_of={list_id})
    service = UpdateBudgetService(repo, lookup)

    result = service.execute(
        UpdateBudgetCommand(
            actor_user_id=owner,
            budget_id=budget.id,
            name="Groceries",
            cap="600.00",
            currency="CRC",
            source_list_ids=[list_id],
        )
    )
    assert result.name == "Groceries"


def test_update_budget_foreign_budget_is_not_found():
    owner = uuid4()
    stranger = uuid4()
    list_id = uuid4()
    budget = _budget(owner_user_id=owner, source_list_ids=(list_id,))
    repo = _FakeBudgetRepo(budgets={budget.id: budget}, owner_id=owner)
    lookup = _FakeListAccessLookup(member_of={list_id})
    service = UpdateBudgetService(repo, lookup)

    with pytest.raises(BudgetNotFoundError):
        service.execute(
            UpdateBudgetCommand(
                actor_user_id=stranger,
                budget_id=budget.id,
                name="New name",
                cap="600.00",
                currency="CRC",
                source_list_ids=[list_id],
            )
        )
    assert repo.update_calls == []


def test_update_budget_rejects_source_list_actor_does_not_belong_to():
    owner = uuid4()
    member_list = uuid4()
    stranger_list = uuid4()
    budget = _budget(owner_user_id=owner, source_list_ids=(member_list,))
    repo = _FakeBudgetRepo(budgets={budget.id: budget}, owner_id=owner)
    lookup = _FakeListAccessLookup(member_of={member_list})
    service = UpdateBudgetService(repo, lookup)

    with pytest.raises(NotListMemberError):
        service.execute(
            UpdateBudgetCommand(
                actor_user_id=owner,
                budget_id=budget.id,
                name="New name",
                cap="600.00",
                currency="CRC",
                source_list_ids=[stranger_list],
            )
        )
    assert repo.update_calls == []


def test_update_budget_invalid_name_rejected_before_any_write():
    owner = uuid4()
    list_id = uuid4()
    budget = _budget(owner_user_id=owner, source_list_ids=(list_id,))
    repo = _FakeBudgetRepo(budgets={budget.id: budget}, owner_id=owner)
    lookup = _FakeListAccessLookup(member_of={list_id})
    service = UpdateBudgetService(repo, lookup)

    with pytest.raises(InvalidBudgetNameError):
        service.execute(
            UpdateBudgetCommand(
                actor_user_id=owner,
                budget_id=budget.id,
                name="   ",
                cap="600.00",
                currency="CRC",
                source_list_ids=[list_id],
            )
        )
    assert repo.update_calls == []


# --- DeleteBudgetService -----------------------------------------------------


def test_delete_budget_deletes_owned_budget():
    owner = uuid4()
    list_id = uuid4()
    budget = _budget(owner_user_id=owner, source_list_ids=(list_id,))
    repo = _FakeBudgetRepo(budgets={budget.id: budget}, owner_id=owner)
    service = DeleteBudgetService(repo)

    service.execute(DeleteBudgetCommand(actor_user_id=owner, budget_id=budget.id))

    assert repo.delete_calls == [budget.id]
    assert budget.id not in repo.budgets


def test_delete_budget_foreign_budget_is_not_found():
    owner = uuid4()
    stranger = uuid4()
    list_id = uuid4()
    budget = _budget(owner_user_id=owner, source_list_ids=(list_id,))
    repo = _FakeBudgetRepo(budgets={budget.id: budget}, owner_id=owner)
    service = DeleteBudgetService(repo)

    with pytest.raises(BudgetNotFoundError):
        service.execute(DeleteBudgetCommand(actor_user_id=stranger, budget_id=budget.id))
    assert repo.delete_calls == []
    assert budget.id in repo.budgets


# --- _compute_spent_and_history viewer share ---------------------------------


def test_shared_list_history_line_uses_viewer_allocated_share_not_full_amount():
    owner = uuid4()
    payer = uuid4()
    viewer = owner  # actor viewing is the list creator/owner in this fixture
    list_id = uuid4()
    budget = _budget(owner_user_id=owner, source_list_ids=(list_id,))
    entry = _entry(
        list_id=list_id, payer_id=payer, amount_crc=Decimal("100.00"), budget_id=budget.id
    )
    budget_repo = _FakeBudgetRepo(
        budgets={budget.id: budget}, owner_id=owner, entries={entry.id: entry}
    )

    list_repo = _FakeSplitListRepo(
        lists_by_id={list_id: ListRecord(id=list_id, name="Household", owner_id=owner)},
        members_by_list={list_id: [owner, payer]},
        default_split_by_list={list_id: None},  # falls back to even split
    )

    _spent, history, _rules = _compute_spent_and_history(
        budget, budget_repo, list_repo=list_repo, actor_user_id=viewer
    )

    assert len(history) == 1
    line = history[0]
    assert line.amount_crc == Decimal("100.00")
    assert line.viewer_share_crc == Decimal("50.00")
    assert line.viewer_share_crc != line.amount_crc
    assert line.payer_id == payer


def test_solo_member_list_history_line_viewer_share_equals_full_amount():
    owner = uuid4()
    list_id = uuid4()
    budget = _budget(owner_user_id=owner, source_list_ids=(list_id,))
    entry = _entry(
        list_id=list_id, payer_id=owner, amount_crc=Decimal("100.00"), budget_id=budget.id
    )
    budget_repo = _FakeBudgetRepo(
        budgets={budget.id: budget}, owner_id=owner, entries={entry.id: entry}
    )
    list_repo = _FakeSplitListRepo(
        lists_by_id={list_id: ListRecord(id=list_id, name="Solo", owner_id=owner)},
        members_by_list={list_id: [owner]},
        default_split_by_list={list_id: None},
    )

    _spent, history, _rules = _compute_spent_and_history(
        budget, budget_repo, list_repo=list_repo, actor_user_id=owner
    )

    assert len(history) == 1
    assert history[0].viewer_share_crc == history[0].amount_crc == Decimal("100.00")


def test_split_resolution_failure_falls_back_to_full_amount():
    owner = uuid4()
    list_id = uuid4()
    budget = _budget(owner_user_id=owner, source_list_ids=(list_id,))
    entry = _entry(
        list_id=list_id, payer_id=owner, amount_crc=Decimal("75.00"), budget_id=budget.id
    )
    budget_repo = _FakeBudgetRepo(
        budgets={budget.id: budget}, owner_id=owner, entries={entry.id: entry}
    )
    # No members registered for the list — compute_share_allocations raises
    # InvalidSplitOverrideError("List creator must be a current member.")
    # which resolve_viewer_lens_for_entry swallows exactly like
    # ListExpensesService._with_viewer_lens always has.
    list_repo = _FakeSplitListRepo(
        lists_by_id={list_id: ListRecord(id=list_id, name="Broken", owner_id=owner)},
        members_by_list={list_id: []},
        default_split_by_list={list_id: None},
    )

    _spent, history, _rules = _compute_spent_and_history(
        budget, budget_repo, list_repo=list_repo, actor_user_id=owner
    )

    assert len(history) == 1
    assert history[0].viewer_share_crc == history[0].amount_crc == Decimal("75.00")


def test_non_crc_budget_keeps_history_empty_regardless_of_viewer_share():
    owner = uuid4()
    list_id = uuid4()
    budget = _budget(owner_user_id=owner, currency="USD", source_list_ids=(list_id,))
    budget_repo = _FakeBudgetRepo(budgets={budget.id: budget}, owner_id=owner)
    list_repo = _FakeSplitListRepo(
        lists_by_id={list_id: ListRecord(id=list_id, name="Household", owner_id=owner)},
        members_by_list={list_id: [owner]},
        default_split_by_list={list_id: None},
    )

    spent, history, _rules = _compute_spent_and_history(
        budget, budget_repo, list_repo=list_repo, actor_user_id=owner
    )

    assert spent == Decimal("0")
    assert history == ()
