"""Application TDD for single entry reassignment (Story 5.10)."""

from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass, field
from decimal import Decimal
from uuid import UUID, uuid4

import pytest
from application.lists import ListRecord, MembershipRecord
from application.reassign_statement import (
    ReassignLedgerEntryCommand,
    ReassignLedgerEntryService,
    StatementLedgerMove,
)
from application.splits import StoredSplitOverride
from domain.errors import (
    ImportStatementNotFoundError,
    InvalidSplitOverrideError,
    NotListMemberError,
)
from domain.splits import KIND_WHOLE_ASSIGNEE, SUBJECT_ITEM, SUBJECT_RECEIPT


@dataclass
class _EntryState:
    entry_id: UUID
    list_id: UUID
    batch_id: UUID
    candidate_row_id: UUID | None
    receipt_id: UUID | None
    amount_crc: Decimal
    fx_rate: Decimal
    fx_fallback: bool
    import_identity: str | None
    payer_id: UUID | None


@dataclass
class _FakeEntryReassignRepo:
    lists: dict[UUID, ListRecord] = field(default_factory=dict)
    memberships: list[MembershipRecord] = field(default_factory=list)
    member_ids: dict[UUID, list[UUID]] = field(default_factory=dict)
    entry: _EntryState | None = None
    overrides: list[StoredSplitOverride] = field(default_factory=list)
    write_count: int = 0

    def get_list(self, list_id: UUID) -> ListRecord | None:
        return self.lists.get(list_id)

    def get_membership(self, list_id: UUID, user_id: UUID) -> MembershipRecord | None:
        for row in self.memberships:
            if row.list_id == list_id and row.user_id == user_id:
                return row
        return None

    def list_member_ids(self, list_id: UUID) -> list[UUID]:
        return list(self.member_ids.get(list_id, []))

    def get_split_override(
        self, list_id: UUID, subject_kind: str, subject_id: UUID
    ) -> StoredSplitOverride | None:
        for row in self.overrides:
            if (
                row.list_id == list_id
                and row.subject_kind == subject_kind
                and row.subject_id == subject_id
            ):
                return row
        return None

    def get_ledger_entry_move(self, entry_id: UUID) -> StatementLedgerMove | None:
        if self.entry is None or self.entry.entry_id != entry_id:
            return None
        return StatementLedgerMove(
            entry_id=self.entry.entry_id,
            list_id=self.entry.list_id,
            batch_id=self.entry.batch_id,
            candidate_row_id=self.entry.candidate_row_id,
            receipt_id=self.entry.receipt_id,
            payer_id=self.entry.payer_id,
            amount_crc=self.entry.amount_crc,
            fx_rate=self.entry.fx_rate,
            fx_fallback=self.entry.fx_fallback,
            import_identity=self.entry.import_identity,
        )

    @contextmanager
    def atomic(self):
        yield

    def apply_entry_reassign(
        self,
        *,
        destination_list_id: UUID,
        entry_id: UUID,
        from_list_id: UUID,
        override_keys: tuple[tuple[str, UUID], ...],
    ) -> None:
        self.write_count += 1
        if self.entry is not None and self.entry.entry_id == entry_id:
            self.entry.list_id = destination_list_id
        for ov in self.overrides:
            if (ov.subject_kind, ov.subject_id) in override_keys and ov.list_id == from_list_id:
                object.__setattr__(ov, "list_id", destination_list_id)


def _seed_lists(repo: _FakeEntryReassignRepo, *, actor: UUID, list_a: UUID, list_b: UUID) -> None:
    repo.lists[list_a] = ListRecord(id=list_a, name="A", owner_id=actor)
    repo.lists[list_b] = ListRecord(id=list_b, name="B", owner_id=actor)
    repo.memberships.append(MembershipRecord(list_id=list_a, user_id=actor, role="owner"))
    repo.memberships.append(MembershipRecord(list_id=list_b, user_id=actor, role="owner"))
    repo.member_ids[list_a] = [actor]
    repo.member_ids[list_b] = [actor]


def test_moves_single_entry_to_destination() -> None:
    repo = _FakeEntryReassignRepo()
    actor = uuid4()
    list_a, list_b = uuid4(), uuid4()
    _seed_lists(repo, actor=actor, list_a=list_a, list_b=list_b)
    entry_id = uuid4()
    batch_id = uuid4()
    repo.entry = _EntryState(
        entry_id=entry_id,
        list_id=list_a,
        batch_id=batch_id,
        candidate_row_id=uuid4(),
        receipt_id=None,
        amount_crc=Decimal("10.00"),
        fx_rate=Decimal("1"),
        fx_fallback=False,
        import_identity="v1:crc:ref",
        payer_id=None,
    )

    result = ReassignLedgerEntryService(repo).execute(
        ReassignLedgerEntryCommand(
            acting_user_id=actor,
            source_list_id=list_a,
            entry_id=entry_id,
            destination_list_id=list_b,
        )
    )

    assert result.ledger_entry_id == entry_id
    assert result.from_list_id == list_a
    assert result.destination_list_id == list_b
    assert repo.entry.list_id == list_b
    assert repo.entry.batch_id == batch_id
    assert repo.entry.amount_crc == Decimal("10.00")
    assert repo.entry.import_identity == "v1:crc:ref"


def test_dest_non_member_denied() -> None:
    repo = _FakeEntryReassignRepo()
    actor = uuid4()
    list_a, list_b = uuid4(), uuid4()
    repo.lists[list_a] = ListRecord(id=list_a, name="A", owner_id=actor)
    repo.lists[list_b] = ListRecord(id=list_b, name="B", owner_id=uuid4())
    repo.memberships.append(MembershipRecord(list_id=list_a, user_id=actor, role="owner"))
    repo.member_ids[list_a] = [actor]
    entry_id = uuid4()
    repo.entry = _EntryState(
        entry_id=entry_id,
        list_id=list_a,
        batch_id=uuid4(),
        candidate_row_id=None,
        receipt_id=None,
        amount_crc=Decimal("10.00"),
        fx_rate=Decimal("1"),
        fx_fallback=False,
        import_identity="v1:crc:ref",
        payer_id=None,
    )

    with pytest.raises(NotListMemberError):
        ReassignLedgerEntryService(repo).execute(
            ReassignLedgerEntryCommand(
                acting_user_id=actor,
                source_list_id=list_a,
                entry_id=entry_id,
                destination_list_id=list_b,
            )
        )
    assert repo.write_count == 0
    assert repo.entry.list_id == list_a


def test_source_non_member_denied() -> None:
    repo = _FakeEntryReassignRepo()
    owner = uuid4()
    stranger = uuid4()
    list_a, list_b = uuid4(), uuid4()
    repo.lists[list_a] = ListRecord(id=list_a, name="A", owner_id=owner)
    repo.lists[list_b] = ListRecord(id=list_b, name="B", owner_id=owner)
    repo.memberships.append(MembershipRecord(list_id=list_a, user_id=owner, role="owner"))
    repo.memberships.append(MembershipRecord(list_id=list_b, user_id=owner, role="owner"))
    repo.member_ids[list_a] = [owner]
    repo.member_ids[list_b] = [owner]
    entry_id = uuid4()
    repo.entry = _EntryState(
        entry_id=entry_id,
        list_id=list_a,
        batch_id=uuid4(),
        candidate_row_id=None,
        receipt_id=None,
        amount_crc=Decimal("10.00"),
        fx_rate=Decimal("1"),
        fx_fallback=False,
        import_identity="v1:crc:ref",
        payer_id=None,
    )

    with pytest.raises(NotListMemberError):
        ReassignLedgerEntryService(repo).execute(
            ReassignLedgerEntryCommand(
                acting_user_id=stranger,
                source_list_id=list_a,
                entry_id=entry_id,
                destination_list_id=list_b,
            )
        )
    assert repo.write_count == 0


def test_same_list_is_noop() -> None:
    repo = _FakeEntryReassignRepo()
    actor = uuid4()
    list_a, list_b = uuid4(), uuid4()
    _seed_lists(repo, actor=actor, list_a=list_a, list_b=list_b)
    entry_id = uuid4()
    repo.entry = _EntryState(
        entry_id=entry_id,
        list_id=list_a,
        batch_id=uuid4(),
        candidate_row_id=None,
        receipt_id=None,
        amount_crc=Decimal("10.00"),
        fx_rate=Decimal("1"),
        fx_fallback=False,
        import_identity="v1:crc:ref",
        payer_id=None,
    )

    result = ReassignLedgerEntryService(repo).execute(
        ReassignLedgerEntryCommand(
            acting_user_id=actor,
            source_list_id=list_a,
            entry_id=entry_id,
            destination_list_id=list_a,
        )
    )

    assert result.destination_list_id == list_a
    assert repo.write_count == 0
    assert repo.entry.list_id == list_a


def test_entry_not_found() -> None:
    repo = _FakeEntryReassignRepo()
    actor = uuid4()
    list_a, list_b = uuid4(), uuid4()
    _seed_lists(repo, actor=actor, list_a=list_a, list_b=list_b)

    with pytest.raises(ImportStatementNotFoundError):
        ReassignLedgerEntryService(repo).execute(
            ReassignLedgerEntryCommand(
                acting_user_id=actor,
                source_list_id=list_a,
                entry_id=uuid4(),
                destination_list_id=list_b,
            )
        )


def test_item_override_follows_and_payload_kept() -> None:
    repo = _FakeEntryReassignRepo()
    actor = uuid4()
    list_a, list_b = uuid4(), uuid4()
    _seed_lists(repo, actor=actor, list_a=list_a, list_b=list_b)
    entry_id = uuid4()
    repo.entry = _EntryState(
        entry_id=entry_id,
        list_id=list_a,
        batch_id=uuid4(),
        candidate_row_id=None,
        receipt_id=None,
        amount_crc=Decimal("10.00"),
        fx_rate=Decimal("1"),
        fx_fallback=False,
        import_identity="v1:crc:ref",
        payer_id=None,
    )
    override = StoredSplitOverride(
        list_id=list_a,
        subject_kind=SUBJECT_ITEM,
        subject_id=entry_id,
        kind=KIND_WHOLE_ASSIGNEE,
        assignee_id=actor,
        amounts=None,
        percentages=None,
        set_by_user_id=actor,
    )
    repo.overrides = [override]

    ReassignLedgerEntryService(repo).execute(
        ReassignLedgerEntryCommand(
            acting_user_id=actor,
            source_list_id=list_a,
            entry_id=entry_id,
            destination_list_id=list_b,
        )
    )

    assert override.list_id == list_b
    assert override.kind == KIND_WHOLE_ASSIGNEE
    assert override.assignee_id == actor


def test_receipt_override_not_moved_when_entry_has_sibling() -> None:
    """AC #4: receipt-level override should NOT move with the entry when siblings exist."""
    repo = _FakeEntryReassignRepo()
    actor = uuid4()
    list_a, list_b = uuid4(), uuid4()
    _seed_lists(repo, actor=actor, list_a=list_a, list_b=list_b)
    entry_id = uuid4()
    receipt_id = uuid4()
    repo.entry = _EntryState(
        entry_id=entry_id,
        list_id=list_a,
        batch_id=uuid4(),
        candidate_row_id=None,
        receipt_id=receipt_id,
        amount_crc=Decimal("10.00"),
        fx_rate=Decimal("1"),
        fx_fallback=False,
        import_identity="v1:crc:ref",
        payer_id=None,
    )
    receipt_override = StoredSplitOverride(
        list_id=list_a,
        subject_kind=SUBJECT_RECEIPT,
        subject_id=receipt_id,
        kind=KIND_WHOLE_ASSIGNEE,
        assignee_id=actor,
        amounts=None,
        percentages=None,
        set_by_user_id=actor,
    )
    repo.overrides = [receipt_override]

    ReassignLedgerEntryService(repo).execute(
        ReassignLedgerEntryCommand(
            acting_user_id=actor,
            source_list_id=list_a,
            entry_id=entry_id,
            destination_list_id=list_b,
        )
    )

    assert receipt_override.list_id == list_a
    assert repo.entry.list_id == list_b


def test_non_member_payer_is_conflict() -> None:
    repo = _FakeEntryReassignRepo()
    actor = uuid4()
    outsider = uuid4()
    list_a, list_b = uuid4(), uuid4()
    _seed_lists(repo, actor=actor, list_a=list_a, list_b=list_b)
    entry_id = uuid4()
    repo.entry = _EntryState(
        entry_id=entry_id,
        list_id=list_a,
        batch_id=uuid4(),
        candidate_row_id=None,
        receipt_id=None,
        amount_crc=Decimal("10.00"),
        fx_rate=Decimal("1"),
        fx_fallback=False,
        import_identity="v1:crc:ref",
        payer_id=outsider,
    )

    with pytest.raises(InvalidSplitOverrideError):
        ReassignLedgerEntryService(repo).execute(
            ReassignLedgerEntryCommand(
                acting_user_id=actor,
                source_list_id=list_a,
                entry_id=entry_id,
                destination_list_id=list_b,
            )
        )
    assert repo.write_count == 0
    assert repo.entry.list_id == list_a
