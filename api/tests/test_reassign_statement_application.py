"""Application TDD for statement reassignment (Story 5.3)."""

from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass, field
from decimal import Decimal
from uuid import UUID, uuid4

import pytest
from application.list_access import AuthorizeListAccessCommand, AuthorizeListAccessService
from application.lists import ListRecord, MembershipRecord
from application.reassign_statement import (
    ReassignStatementCommand,
    ReassignStatementService,
    StatementLedgerMove,
)
from application.splits import StoredSplitOverride
from domain.errors import (
    ImportStatementNotFoundError,
    InvalidSplitOverrideError,
    NotListMemberError,
)
from domain.splits import KIND_WHOLE_ASSIGNEE, SUBJECT_ITEM


@dataclass
class _MoveState:
    entry_id: UUID
    list_id: UUID
    batch_id: UUID
    candidate_row_id: UUID | None
    receipt_id: UUID | None
    amount_crc: Decimal
    fx_rate: Decimal
    fx_fallback: bool
    import_identity: str | None
    candidate_resolved_list_id: UUID | None
    batch_list_id: UUID
    receipt_list_id: UUID | None = None


@dataclass
class _FakeReassignRepo:
    lists: dict[UUID, ListRecord] = field(default_factory=dict)
    memberships: list[MembershipRecord] = field(default_factory=list)
    member_ids: dict[UUID, list[UUID]] = field(default_factory=dict)
    moves: list[_MoveState] = field(default_factory=list)
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

    def list_statement_ledger_moves(self, statement_id: UUID) -> list[StatementLedgerMove]:
        del statement_id
        return [
            StatementLedgerMove(
                entry_id=row.entry_id,
                list_id=row.list_id,
                batch_id=row.batch_id,
                candidate_row_id=row.candidate_row_id,
                receipt_id=row.receipt_id,
                amount_crc=row.amount_crc,
                fx_rate=row.fx_rate,
                fx_fallback=row.fx_fallback,
                import_identity=row.import_identity,
            )
            for row in self.moves
        ]

    @contextmanager
    def atomic(self):
        yield

    def apply_statement_reassign(
        self,
        *,
        destination_list_id: UUID,
        entry_ids: tuple[UUID, ...],
        batch_ids: tuple[UUID, ...],
        candidate_ids: tuple[UUID, ...],
        receipt_ids: tuple[UUID, ...],
        override_keys: tuple[tuple[str, UUID], ...],
    ) -> None:
        self.write_count += 1
        entry_set = set(entry_ids)
        batch_set = set(batch_ids)
        candidate_set = set(candidate_ids)
        receipt_set = set(receipt_ids)
        for row in self.moves:
            if row.entry_id in entry_set:
                row.list_id = destination_list_id
            if row.batch_id in batch_set:
                row.batch_list_id = destination_list_id
            if row.candidate_row_id in candidate_set:
                row.candidate_resolved_list_id = destination_list_id
            if row.receipt_id in receipt_set:
                row.receipt_list_id = destination_list_id
        for ov in self.overrides:
            if (ov.subject_kind, ov.subject_id) in override_keys:
                object.__setattr__(ov, "list_id", destination_list_id)


def _seed_lists(repo: _FakeReassignRepo, *, actor: UUID, list_a: UUID, list_b: UUID) -> None:
    repo.lists[list_a] = ListRecord(id=list_a, name="A", owner_id=actor)
    repo.lists[list_b] = ListRecord(id=list_b, name="B", owner_id=actor)
    repo.memberships.append(MembershipRecord(list_id=list_a, user_id=actor, role="owner"))
    repo.memberships.append(MembershipRecord(list_id=list_b, user_id=actor, role="owner"))
    repo.member_ids[list_a] = [actor]
    repo.member_ids[list_b] = [actor]


def _move(
    *,
    list_id: UUID,
    batch_id: UUID | None = None,
    receipt_id: UUID | None = None,
    candidate_id: UUID | None = None,
) -> _MoveState:
    batch = batch_id or uuid4()
    candidate = candidate_id if candidate_id is not None else uuid4()
    return _MoveState(
        entry_id=uuid4(),
        list_id=list_id,
        batch_id=batch,
        candidate_row_id=candidate,
        receipt_id=receipt_id,
        amount_crc=Decimal("10.00"),
        fx_rate=Decimal("1"),
        fx_fallback=False,
        import_identity="v1:crc:ref",
        candidate_resolved_list_id=list_id,
        batch_list_id=list_id,
        receipt_list_id=list_id if receipt_id is not None else None,
    )


def test_reassign_statement_action_normalizes_to_write_ledger() -> None:
    repo = _FakeReassignRepo()
    actor = uuid4()
    list_a = uuid4()
    repo.lists[list_a] = ListRecord(id=list_a, name="A", owner_id=actor)
    repo.memberships.append(MembershipRecord(list_id=list_a, user_id=actor, role="owner"))
    grant = AuthorizeListAccessService(repo).execute(
        AuthorizeListAccessCommand(
            acting_user_id=actor, list_id=list_a, action="reassign_statement"
        )
    )
    assert grant.action == "write_ledger"


def test_moves_all_rows_and_batches_without_forking_batch_id() -> None:
    repo = _FakeReassignRepo()
    actor = uuid4()
    list_a, list_b = uuid4(), uuid4()
    _seed_lists(repo, actor=actor, list_a=list_a, list_b=list_b)
    batch_id = uuid4()
    first = _move(list_id=list_a, batch_id=batch_id)
    second = _move(list_id=list_a, batch_id=batch_id)
    repo.moves = [first, second]
    statement_id = uuid4()

    result = ReassignStatementService(repo).execute(
        ReassignStatementCommand(
            acting_user_id=actor,
            source_list_id=list_a,
            statement_id=statement_id,
            destination_list_id=list_b,
        )
    )

    assert result.destination_list_id == list_b
    assert set(result.ledger_entry_ids) == {first.entry_id, second.entry_id}
    assert result.batch_ids == (batch_id,)
    assert result.from_list_ids == (list_a,)
    assert first.list_id == list_b
    assert second.list_id == list_b
    assert first.batch_id == batch_id
    assert first.batch_list_id == list_b
    assert first.candidate_resolved_list_id == list_b
    assert first.fx_rate == Decimal("1")
    assert first.amount_crc == Decimal("10.00")
    assert first.import_identity == "v1:crc:ref"


def test_dest_non_member_denied() -> None:
    repo = _FakeReassignRepo()
    actor = uuid4()
    list_a, list_b = uuid4(), uuid4()
    repo.lists[list_a] = ListRecord(id=list_a, name="A", owner_id=actor)
    repo.lists[list_b] = ListRecord(id=list_b, name="B", owner_id=uuid4())
    repo.memberships.append(MembershipRecord(list_id=list_a, user_id=actor, role="owner"))
    repo.member_ids[list_a] = [actor]
    repo.moves = [_move(list_id=list_a)]

    with pytest.raises(NotListMemberError):
        ReassignStatementService(repo).execute(
            ReassignStatementCommand(
                acting_user_id=actor,
                source_list_id=list_a,
                statement_id=uuid4(),
                destination_list_id=list_b,
            )
        )
    assert repo.write_count == 0
    assert repo.moves[0].list_id == list_a


def test_source_non_member_denied() -> None:
    repo = _FakeReassignRepo()
    owner = uuid4()
    stranger = uuid4()
    list_a, list_b = uuid4(), uuid4()
    repo.lists[list_a] = ListRecord(id=list_a, name="A", owner_id=owner)
    repo.lists[list_b] = ListRecord(id=list_b, name="B", owner_id=owner)
    repo.memberships.append(MembershipRecord(list_id=list_a, user_id=owner, role="owner"))
    repo.memberships.append(MembershipRecord(list_id=list_b, user_id=owner, role="owner"))
    repo.member_ids[list_a] = [owner]
    repo.member_ids[list_b] = [owner]
    repo.moves = [_move(list_id=list_a)]

    with pytest.raises(NotListMemberError):
        ReassignStatementService(repo).execute(
            ReassignStatementCommand(
                acting_user_id=stranger,
                source_list_id=list_a,
                statement_id=uuid4(),
                destination_list_id=list_b,
            )
        )
    assert repo.write_count == 0


def test_multi_list_gather_onto_destination() -> None:
    repo = _FakeReassignRepo()
    actor = uuid4()
    list_a, list_b, list_c = uuid4(), uuid4(), uuid4()
    _seed_lists(repo, actor=actor, list_a=list_a, list_b=list_b)
    repo.lists[list_c] = ListRecord(id=list_c, name="C", owner_id=actor)
    repo.memberships.append(MembershipRecord(list_id=list_c, user_id=actor, role="owner"))
    repo.member_ids[list_c] = [actor]
    on_a = _move(list_id=list_a)
    on_c = _move(list_id=list_c)
    repo.moves = [on_a, on_c]

    result = ReassignStatementService(repo).execute(
        ReassignStatementCommand(
            acting_user_id=actor,
            source_list_id=list_a,
            statement_id=uuid4(),
            destination_list_id=list_b,
        )
    )

    assert set(result.from_list_ids) == {list_a, list_c}
    assert on_a.list_id == list_b
    assert on_c.list_id == list_b


def test_same_list_is_noop() -> None:
    repo = _FakeReassignRepo()
    actor = uuid4()
    list_a, list_b = uuid4(), uuid4()
    _seed_lists(repo, actor=actor, list_a=list_a, list_b=list_b)
    row = _move(list_id=list_a)
    repo.moves = [row]

    result = ReassignStatementService(repo).execute(
        ReassignStatementCommand(
            acting_user_id=actor,
            source_list_id=list_a,
            statement_id=uuid4(),
            destination_list_id=list_a,
        )
    )

    assert result.destination_list_id == list_a
    assert repo.write_count == 0
    assert row.list_id == list_a


def test_no_ledger_is_not_found() -> None:
    repo = _FakeReassignRepo()
    actor = uuid4()
    list_a, list_b = uuid4(), uuid4()
    _seed_lists(repo, actor=actor, list_a=list_a, list_b=list_b)

    with pytest.raises(ImportStatementNotFoundError):
        ReassignStatementService(repo).execute(
            ReassignStatementCommand(
                acting_user_id=actor,
                source_list_id=list_a,
                statement_id=uuid4(),
                destination_list_id=list_b,
            )
        )


def test_viewing_list_not_a_current_home_is_not_found() -> None:
    repo = _FakeReassignRepo()
    actor = uuid4()
    list_a, list_b, list_c = uuid4(), uuid4(), uuid4()
    _seed_lists(repo, actor=actor, list_a=list_a, list_b=list_b)
    repo.lists[list_c] = ListRecord(id=list_c, name="C", owner_id=actor)
    repo.memberships.append(MembershipRecord(list_id=list_c, user_id=actor, role="owner"))
    repo.member_ids[list_c] = [actor]
    repo.moves = [_move(list_id=list_c)]

    with pytest.raises(ImportStatementNotFoundError):
        ReassignStatementService(repo).execute(
            ReassignStatementCommand(
                acting_user_id=actor,
                source_list_id=list_a,
                statement_id=uuid4(),
                destination_list_id=list_b,
            )
        )


def test_override_list_id_follows_and_payload_kept() -> None:
    repo = _FakeReassignRepo()
    actor = uuid4()
    list_a, list_b = uuid4(), uuid4()
    _seed_lists(repo, actor=actor, list_a=list_a, list_b=list_b)
    row = _move(list_id=list_a)
    repo.moves = [row]
    override = StoredSplitOverride(
        list_id=list_a,
        subject_kind=SUBJECT_ITEM,
        subject_id=row.entry_id,
        kind=KIND_WHOLE_ASSIGNEE,
        assignee_id=actor,
        amounts=None,
        percentages=None,
        set_by_user_id=actor,
    )
    repo.overrides = [override]

    ReassignStatementService(repo).execute(
        ReassignStatementCommand(
            acting_user_id=actor,
            source_list_id=list_a,
            statement_id=uuid4(),
            destination_list_id=list_b,
        )
    )

    assert override.list_id == list_b
    assert override.kind == KIND_WHOLE_ASSIGNEE
    assert override.assignee_id == actor


def test_override_non_member_on_destination_is_conflict() -> None:
    repo = _FakeReassignRepo()
    actor = uuid4()
    outsider = uuid4()
    list_a, list_b = uuid4(), uuid4()
    _seed_lists(repo, actor=actor, list_a=list_a, list_b=list_b)
    row = _move(list_id=list_a)
    repo.moves = [row]
    repo.overrides = [
        StoredSplitOverride(
            list_id=list_a,
            subject_kind=SUBJECT_ITEM,
            subject_id=row.entry_id,
            kind=KIND_WHOLE_ASSIGNEE,
            assignee_id=outsider,
            amounts=None,
            percentages=None,
            set_by_user_id=actor,
        )
    ]

    with pytest.raises(InvalidSplitOverrideError):
        ReassignStatementService(repo).execute(
            ReassignStatementCommand(
                acting_user_id=actor,
                source_list_id=list_a,
                statement_id=uuid4(),
                destination_list_id=list_b,
            )
        )
    assert repo.write_count == 0
    assert row.list_id == list_a


def test_skips_rows_without_ledger() -> None:
    """Deleted / dedup_skipped candidates never appear in the move set."""
    repo = _FakeReassignRepo()
    actor = uuid4()
    list_a, list_b = uuid4(), uuid4()
    _seed_lists(repo, actor=actor, list_a=list_a, list_b=list_b)
    kept = _move(list_id=list_a)
    repo.moves = [kept]

    result = ReassignStatementService(repo).execute(
        ReassignStatementCommand(
            acting_user_id=actor,
            source_list_id=list_a,
            statement_id=uuid4(),
            destination_list_id=list_b,
        )
    )

    assert result.ledger_entry_ids == (kept.entry_id,)
