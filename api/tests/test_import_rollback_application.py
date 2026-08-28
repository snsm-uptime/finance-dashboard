"""Application tests for RollbackImportBatchService (Story 5.4)."""

from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass, field
from uuid import UUID, uuid4

import pytest
from application.import_rollback import (
    ImportBatchPeek,
    RollbackImportBatchCommand,
    RollbackImportBatchService,
)
from domain.errors import ImportBatchNotFoundError
from domain.import_session import ROW_STATUS_COMMITTED


@dataclass
class _FakeListPeek:
    id: UUID
    owner_id: UUID


@dataclass
class _FakeMembershipPeek:
    user_id: UUID
    role: str = "member"


@dataclass
class _FakeListLookup:
    lists: dict[UUID, _FakeListPeek] = field(default_factory=dict)
    memberships: dict[UUID, list[_FakeMembershipPeek]] = field(default_factory=dict)

    def add_member(self, list_id: UUID, owner_id: UUID, user_id: UUID) -> None:
        self.lists.setdefault(list_id, _FakeListPeek(id=list_id, owner_id=owner_id))
        self.memberships.setdefault(list_id, []).append(_FakeMembershipPeek(user_id=user_id))

    def get_list(self, list_id: UUID) -> _FakeListPeek | None:
        return self.lists.get(list_id)

    def get_membership(self, list_id: UUID, user_id: UUID) -> _FakeMembershipPeek | None:
        for m in self.memberships.get(list_id, []):
            if m.user_id == user_id:
                return m
        return None


@dataclass
class _FakeLedger:
    id: UUID
    list_id: UUID
    import_batch_id: UUID | None
    import_identity: str | None
    candidate_status: str = ROW_STATUS_COMMITTED


@dataclass
class _FakeRollbackRepo:
    batches: dict[UUID, ImportBatchPeek] = field(default_factory=dict)
    entries: list[_FakeLedger] = field(default_factory=list)
    split_override_subjects: set[UUID] = field(default_factory=set)

    def get_import_batch(self, batch_id: UUID) -> ImportBatchPeek | None:
        return self.batches.get(batch_id)

    def rollback_batch(self, batch_id: UUID) -> int:
        ids = [e.id for e in self.entries if e.import_batch_id == batch_id]
        self.split_override_subjects -= set(ids)
        self.entries = [e for e in self.entries if e.import_batch_id != batch_id]
        self.batches.pop(batch_id, None)
        return len(ids)

    def identities_on_list(self, list_id: UUID) -> set[str]:
        return {
            e.import_identity
            for e in self.entries
            if e.list_id == list_id and e.import_identity
        }

    @contextmanager
    def atomic(self):
        yield


def _service(repo: _FakeRollbackRepo, lookup: _FakeListLookup) -> RollbackImportBatchService:
    return RollbackImportBatchService(repo, lookup)


def test_bulk_shaped_batch_removes_all_rows_sibling_remains() -> None:
    actor = uuid4()
    list_id = uuid4()
    batch_a = uuid4()
    batch_b = uuid4()
    entry_a1 = uuid4()
    entry_a2 = uuid4()
    entry_b = uuid4()
    lookup = _FakeListLookup()
    lookup.add_member(list_id, actor, actor)
    repo = _FakeRollbackRepo(
        batches={
            batch_a: ImportBatchPeek(id=batch_a, list_id=list_id),
            batch_b: ImportBatchPeek(id=batch_b, list_id=list_id),
        },
        entries=[
            _FakeLedger(entry_a1, list_id, batch_a, "v1:a1"),
            _FakeLedger(entry_a2, list_id, batch_a, "v1:a2"),
            _FakeLedger(entry_b, list_id, batch_b, "v1:b"),
        ],
        split_override_subjects={entry_a1},
    )

    removed = _service(repo, lookup).execute(
        RollbackImportBatchCommand(actor_user_id=actor, list_id=list_id, batch_id=batch_a)
    )

    assert removed == 2
    assert batch_a not in repo.batches
    assert batch_b in repo.batches
    assert [e.id for e in repo.entries] == [entry_b]
    assert repo.split_override_subjects == set()
    assert repo.identities_on_list(list_id) == {"v1:b"}
    assert all(e.candidate_status == ROW_STATUS_COMMITTED for e in repo.entries)


def test_individual_shaped_batch_removes_only_that_row() -> None:
    actor = uuid4()
    list_id = uuid4()
    batch_1 = uuid4()
    batch_2 = uuid4()
    row_1 = uuid4()
    row_2 = uuid4()
    lookup = _FakeListLookup()
    lookup.add_member(list_id, actor, actor)
    repo = _FakeRollbackRepo(
        batches={
            batch_1: ImportBatchPeek(id=batch_1, list_id=list_id),
            batch_2: ImportBatchPeek(id=batch_2, list_id=list_id),
        },
        entries=[
            _FakeLedger(row_1, list_id, batch_1, "v1:1"),
            _FakeLedger(row_2, list_id, batch_2, "v1:2"),
        ],
    )

    removed = _service(repo, lookup).execute(
        RollbackImportBatchCommand(actor_user_id=actor, list_id=list_id, batch_id=batch_1)
    )

    assert removed == 1
    assert [e.id for e in repo.entries] == [row_2]
    assert repo.identities_on_list(list_id) == {"v1:2"}


def test_wrong_list_id_is_not_found_and_leaves_ledger() -> None:
    actor = uuid4()
    list_a = uuid4()
    list_b = uuid4()
    batch_id = uuid4()
    entry_id = uuid4()
    lookup = _FakeListLookup()
    lookup.add_member(list_a, actor, actor)
    lookup.add_member(list_b, actor, actor)
    repo = _FakeRollbackRepo(
        batches={batch_id: ImportBatchPeek(id=batch_id, list_id=list_a)},
        entries=[_FakeLedger(entry_id, list_a, batch_id, "v1:x")],
    )

    with pytest.raises(ImportBatchNotFoundError):
        _service(repo, lookup).execute(
            RollbackImportBatchCommand(actor_user_id=actor, list_id=list_b, batch_id=batch_id)
        )

    assert repo.entries[0].id == entry_id
    assert batch_id in repo.batches


def test_stranger_is_not_found() -> None:
    owner = uuid4()
    stranger = uuid4()
    list_id = uuid4()
    batch_id = uuid4()
    lookup = _FakeListLookup()
    lookup.add_member(list_id, owner, owner)
    repo = _FakeRollbackRepo(
        batches={batch_id: ImportBatchPeek(id=batch_id, list_id=list_id)},
        entries=[_FakeLedger(uuid4(), list_id, batch_id, "v1:x")],
    )

    with pytest.raises(ImportBatchNotFoundError):
        _service(repo, lookup).execute(
            RollbackImportBatchCommand(actor_user_id=stranger, list_id=list_id, batch_id=batch_id)
        )
    assert batch_id in repo.batches


def test_second_call_is_not_found() -> None:
    actor = uuid4()
    list_id = uuid4()
    batch_id = uuid4()
    lookup = _FakeListLookup()
    lookup.add_member(list_id, actor, actor)
    repo = _FakeRollbackRepo(
        batches={batch_id: ImportBatchPeek(id=batch_id, list_id=list_id)},
        entries=[_FakeLedger(uuid4(), list_id, batch_id, "v1:x")],
    )
    service = _service(repo, lookup)
    service.execute(
        RollbackImportBatchCommand(actor_user_id=actor, list_id=list_id, batch_id=batch_id)
    )

    with pytest.raises(ImportBatchNotFoundError):
        service.execute(
            RollbackImportBatchCommand(actor_user_id=actor, list_id=list_id, batch_id=batch_id)
        )


def test_manual_expenses_are_never_selected() -> None:
    actor = uuid4()
    list_id = uuid4()
    batch_id = uuid4()
    hand = uuid4()
    imported = uuid4()
    lookup = _FakeListLookup()
    lookup.add_member(list_id, actor, actor)
    repo = _FakeRollbackRepo(
        batches={batch_id: ImportBatchPeek(id=batch_id, list_id=list_id)},
        entries=[
            _FakeLedger(hand, list_id, None, None),
            _FakeLedger(imported, list_id, batch_id, "v1:imp"),
        ],
    )

    _service(repo, lookup).execute(
        RollbackImportBatchCommand(actor_user_id=actor, list_id=list_id, batch_id=batch_id)
    )

    assert [e.id for e in repo.entries] == [hand]
    assert repo.identities_on_list(list_id) == set()
