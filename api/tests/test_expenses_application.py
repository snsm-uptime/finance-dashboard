"""Unit tests for manual expense create + origin-update application services (Story 4.2).

Fake-repo pattern mirrors test_cards_application.py's _FakeCardRepo — Story 3.2
never got an application-tier test file for expenses, this is the first one.
"""

from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import UUID, uuid4

import pytest
from application.cards import CardRecord
from application.expenses import (
    CreateManualExpenseCommand,
    CreateManualExpenseService,
    LedgerEntryRecord,
    ListExpensesCommand,
    ListExpensesService,
    ListMemberView,
    MarkLedgerEntryReviewedCommand,
    MarkLedgerEntryReviewedService,
    UpdateExpenseOriginCommand,
    UpdateExpenseOriginService,
)
from application.fx_service import MaterializeFxService
from application.lists import ListRecord, MembershipRecord
from domain.errors import (
    InvalidManualExpenseError,
    NotEntryPayerError,
    NotListMemberError,
    SubjectNotFoundError,
)


class _FakeBccrClient:
    def get_rate(self, rate_date, currency):
        return None

    def get_nearest_prior_rate(self, rate_date, currency):
        return None

    def supported_currencies(self) -> list[str]:
        return ["USD"]


@dataclass
class _FakeExpenseRepo:
    list_id: UUID
    member_ids: list[UUID]
    cards: list[CardRecord] = field(default_factory=list)
    entries: dict[UUID, LedgerEntryRecord] = field(default_factory=dict)

    def get_list(self, list_id: UUID) -> ListRecord | None:
        if list_id != self.list_id:
            return None
        return ListRecord(id=self.list_id, name="Household", owner_id=self.member_ids[0])

    def list_member_ids(self, list_id: UUID) -> list[UUID]:
        return list(self.member_ids)

    def get_membership(self, list_id: UUID, user_id: UUID) -> MembershipRecord | None:
        if list_id != self.list_id or user_id not in self.member_ids:
            return None
        return MembershipRecord(list_id=list_id, user_id=user_id, role="member")

    def get_list_with_grant(self, grant, list_id: UUID) -> ListRecord:
        return self.get_list(list_id)

    def list_ledger_entries(self, list_id: UUID) -> list[LedgerEntryRecord]:
        return list(self.entries.values())

    def list_members_with_alias(self, list_id: UUID) -> list[ListMemberView]:
        return [ListMemberView(user_id=u, alias=None) for u in self.member_ids]

    def get_ledger_entry_payer(self, *, list_id: UUID, entry_id: UUID) -> UUID | None:
        existing = self.entries.get(entry_id)
        if existing is None or existing.list_id != list_id:
            return None
        return existing.payer_id

    def get_card_for_owner(self, user_id: UUID, card_id: UUID) -> CardRecord | None:
        for card in self.cards:
            if card.id == card_id and card.user_id == user_id:
                return card
        return None

    def get_split_override(self, list_id: UUID, subject_kind: str, subject_id: UUID):
        return None

    def get_stored_default_split(self, list_id: UUID):
        return None

    def create_ledger_entry(self, *, entry_id: UUID, list_id: UUID, draft, fx) -> LedgerEntryRecord:
        record = LedgerEntryRecord(
            id=entry_id,
            list_id=list_id,
            amount=draft.amount,
            currency=draft.currency,
            normalized_description=draft.normalized_description,
            payer_id=draft.payer_id,
            provenance=draft.provenance,
            line_type=draft.line_type,
            posted_date=date.fromisoformat(draft.posted_date),
            created_at=datetime.now(UTC),
            amount_crc=fx.amount_crc,
            fx_rate=fx.fx_rate,
            fx_rate_date=fx.fx_rate_date,
            fx_fallback=fx.fx_fallback,
            origin_kind=draft.origin_kind,
            origin_card_id=draft.origin_card_id,
        )
        self.entries[entry_id] = record
        return record

    def update_ledger_entry_origin(
        self, *, list_id: UUID, entry_id: UUID, actor_user_id: UUID, origin_kind, origin_card_id
    ) -> LedgerEntryRecord:
        existing = self.entries.get(entry_id)
        if existing is None or existing.list_id != list_id:
            raise SubjectNotFoundError()
        if existing.payer_id != actor_user_id:
            raise NotEntryPayerError()
        updated = LedgerEntryRecord(
            id=existing.id,
            list_id=existing.list_id,
            amount=existing.amount,
            currency=existing.currency,
            normalized_description=existing.normalized_description,
            payer_id=existing.payer_id,
            provenance=existing.provenance,
            line_type=existing.line_type,
            posted_date=existing.posted_date,
            created_at=existing.created_at,
            amount_crc=existing.amount_crc,
            fx_rate=existing.fx_rate,
            fx_rate_date=existing.fx_rate_date,
            fx_fallback=existing.fx_fallback,
            origin_kind=origin_kind,
            origin_card_id=origin_card_id,
            import_reviewed_at=datetime.now(UTC),
        )
        self.entries[entry_id] = updated
        return updated

    def mark_ledger_entry_reviewed(
        self, *, list_id: UUID, entry_id: UUID, actor_user_id: UUID
    ) -> LedgerEntryRecord:
        existing = self.entries.get(entry_id)
        if existing is None or existing.list_id != list_id:
            raise SubjectNotFoundError()
        updated = LedgerEntryRecord(
            id=existing.id,
            list_id=existing.list_id,
            amount=existing.amount,
            currency=existing.currency,
            normalized_description=existing.normalized_description,
            payer_id=existing.payer_id,
            provenance=existing.provenance,
            line_type=existing.line_type,
            posted_date=existing.posted_date,
            created_at=existing.created_at,
            amount_crc=existing.amount_crc,
            fx_rate=existing.fx_rate,
            fx_rate_date=existing.fx_rate_date,
            fx_fallback=existing.fx_fallback,
            origin_kind=existing.origin_kind,
            origin_card_id=existing.origin_card_id,
            import_reviewed_at=datetime.now(UTC),
        )
        self.entries[entry_id] = updated
        return updated

    @contextmanager
    def atomic(self):
        yield


def _command(
    repo: _FakeExpenseRepo,
    actor: UUID,
    *,
    payer: UUID | None = None,
    origin_kind: str | None = None,
    origin_card_id: UUID | None = None,
) -> CreateManualExpenseCommand:
    return CreateManualExpenseCommand(
        actor_user_id=actor,
        list_id=repo.list_id,
        amount="10.00",
        currency="CRC",
        description="Coffee",
        payer_id=payer if payer is not None else actor,
        origin_kind=origin_kind,
        origin_card_id=origin_card_id,
    )


def test_create_with_owned_card_succeeds() -> None:
    actor = uuid4()
    repo = _FakeExpenseRepo(list_id=uuid4(), member_ids=[actor])
    card = CardRecord(
        id=uuid4(), user_id=actor, label="My Visa", iban="CR05", created_at=datetime.now(UTC)
    )
    repo.cards = [card]
    service = CreateManualExpenseService(repo, MaterializeFxService(_FakeBccrClient()))

    result = service.execute(_command(repo, actor, origin_kind="card", origin_card_id=card.id))

    assert result.origin_kind == "card"
    assert result.origin_card_id == card.id


def test_create_with_card_owned_by_different_user_rejected() -> None:
    actor = uuid4()
    stranger = uuid4()
    repo = _FakeExpenseRepo(list_id=uuid4(), member_ids=[actor])
    foreign_card = CardRecord(
        id=uuid4(), user_id=stranger, label="Their Card", iban="CR06", created_at=datetime.now(UTC)
    )
    repo.cards = [foreign_card]
    service = CreateManualExpenseService(repo, MaterializeFxService(_FakeBccrClient()))

    with pytest.raises(InvalidManualExpenseError):
        service.execute(_command(repo, actor, origin_kind="card", origin_card_id=foreign_card.id))


def test_create_with_cash_origin_succeeds() -> None:
    actor = uuid4()
    repo = _FakeExpenseRepo(list_id=uuid4(), member_ids=[actor])
    service = CreateManualExpenseService(repo, MaterializeFxService(_FakeBccrClient()))

    result = service.execute(_command(repo, actor, origin_kind="cash"))

    assert result.origin_kind == "cash"
    assert result.origin_card_id is None


def test_create_with_no_origin_succeeds() -> None:
    actor = uuid4()
    repo = _FakeExpenseRepo(list_id=uuid4(), member_ids=[actor])
    service = CreateManualExpenseService(repo, MaterializeFxService(_FakeBccrClient()))

    result = service.execute(_command(repo, actor))

    assert result.origin_kind is None
    assert result.origin_card_id is None


def test_update_origin_blank_to_cash_to_card_to_blank() -> None:
    actor = uuid4()
    repo = _FakeExpenseRepo(list_id=uuid4(), member_ids=[actor])
    card = CardRecord(
        id=uuid4(), user_id=actor, label="My Visa", iban="CR05", created_at=datetime.now(UTC)
    )
    repo.cards = [card]
    create_service = CreateManualExpenseService(repo, MaterializeFxService(_FakeBccrClient()))
    created = create_service.execute(_command(repo, actor))
    assert created.origin_kind is None

    update_service = UpdateExpenseOriginService(repo)

    cash_result = update_service.execute(
        UpdateExpenseOriginCommand(
            actor_user_id=actor,
            list_id=repo.list_id,
            entry_id=created.id,
            origin_kind="cash",
            origin_card_id=None,
        )
    )
    assert cash_result.origin_kind == "cash"
    assert cash_result.import_reviewed_at is not None

    card_result = update_service.execute(
        UpdateExpenseOriginCommand(
            actor_user_id=actor,
            list_id=repo.list_id,
            entry_id=created.id,
            origin_kind="card",
            origin_card_id=card.id,
        )
    )
    assert card_result.origin_kind == "card"
    assert card_result.origin_card_id == card.id

    blank_result = update_service.execute(
        UpdateExpenseOriginCommand(
            actor_user_id=actor,
            list_id=repo.list_id,
            entry_id=created.id,
            origin_kind=None,
            origin_card_id=None,
        )
    )
    assert blank_result.origin_kind is None
    assert blank_result.origin_card_id is None


def test_update_origin_on_nonexistent_entry_raises_subject_not_found() -> None:
    actor = uuid4()
    repo = _FakeExpenseRepo(list_id=uuid4(), member_ids=[actor])
    service = UpdateExpenseOriginService(repo)

    with pytest.raises(SubjectNotFoundError):
        service.execute(
            UpdateExpenseOriginCommand(
                actor_user_id=actor,
                list_id=repo.list_id,
                entry_id=uuid4(),
                origin_kind="cash",
                origin_card_id=None,
            )
        )


def test_update_origin_by_non_member_denied() -> None:
    actor = uuid4()
    outsider = uuid4()
    repo = _FakeExpenseRepo(list_id=uuid4(), member_ids=[actor])
    created = CreateManualExpenseService(repo, MaterializeFxService(_FakeBccrClient())).execute(
        _command(repo, actor)
    )
    service = UpdateExpenseOriginService(repo)

    with pytest.raises(NotListMemberError):
        service.execute(
            UpdateExpenseOriginCommand(
                actor_user_id=outsider,
                list_id=repo.list_id,
                entry_id=created.id,
                origin_kind="cash",
                origin_card_id=None,
            )
        )


def test_update_origin_with_card_owned_by_different_user_rejected() -> None:
    actor = uuid4()
    stranger = uuid4()
    repo = _FakeExpenseRepo(list_id=uuid4(), member_ids=[actor])
    foreign_card = CardRecord(
        id=uuid4(), user_id=stranger, label="Their Card", iban="CR06", created_at=datetime.now(UTC)
    )
    repo.cards = [foreign_card]
    created = CreateManualExpenseService(repo, MaterializeFxService(_FakeBccrClient())).execute(
        _command(repo, actor)
    )
    service = UpdateExpenseOriginService(repo)

    with pytest.raises(InvalidManualExpenseError):
        service.execute(
            UpdateExpenseOriginCommand(
                actor_user_id=actor,
                list_id=repo.list_id,
                entry_id=created.id,
                origin_kind="card",
                origin_card_id=foreign_card.id,
            )
        )


def test_create_with_non_self_payer_forces_origin_blank() -> None:
    """Origin belongs to the payer, not the actor entering the expense on their behalf."""
    actor = uuid4()
    payer = uuid4()
    repo = _FakeExpenseRepo(list_id=uuid4(), member_ids=[actor, payer])
    card = CardRecord(
        id=uuid4(), user_id=actor, label="My Visa", iban="CR05", created_at=datetime.now(UTC)
    )
    repo.cards = [card]
    service = CreateManualExpenseService(repo, MaterializeFxService(_FakeBccrClient()))

    result = service.execute(
        _command(repo, actor, payer=payer, origin_kind="card", origin_card_id=card.id)
    )

    assert result.payer_id == payer
    assert result.origin_kind is None
    assert result.origin_card_id is None


def test_update_origin_by_non_payer_member_rejected() -> None:
    """Even a fellow list member can't set origin on an entry they didn't pay."""
    actor = uuid4()
    payer = uuid4()
    repo = _FakeExpenseRepo(list_id=uuid4(), member_ids=[actor, payer])
    created = CreateManualExpenseService(repo, MaterializeFxService(_FakeBccrClient())).execute(
        _command(repo, actor, payer=payer)
    )
    service = UpdateExpenseOriginService(repo)

    with pytest.raises(NotEntryPayerError):
        service.execute(
            UpdateExpenseOriginCommand(
                actor_user_id=actor,
                list_id=repo.list_id,
                entry_id=created.id,
                origin_kind="cash",
                origin_card_id=None,
            )
        )


def test_update_origin_by_non_payer_member_with_unowned_card_still_rejects_as_not_entry_payer() -> (
    None
):
    """Authorization (payer identity) is resolved before input-shape checks like
    card ownership — a non-payer must always get NotEntryPayerError, never the
    card-ownership InvalidManualExpenseError, regardless of which card they send."""
    actor = uuid4()
    payer = uuid4()
    repo = _FakeExpenseRepo(list_id=uuid4(), member_ids=[actor, payer])
    created = CreateManualExpenseService(repo, MaterializeFxService(_FakeBccrClient())).execute(
        _command(repo, actor, payer=payer)
    )
    service = UpdateExpenseOriginService(repo)

    with pytest.raises(NotEntryPayerError):
        service.execute(
            UpdateExpenseOriginCommand(
                actor_user_id=actor,
                list_id=repo.list_id,
                entry_id=created.id,
                origin_kind="card",
                origin_card_id=uuid4(),
            )
        )


def test_list_expenses_solo_payer_has_100_percent_and_zero_net() -> None:
    from domain.expense_lens import POLARITY_ZERO, SHARE_PERCENTAGE

    actor = uuid4()
    repo = _FakeExpenseRepo(list_id=uuid4(), member_ids=[actor])
    created = CreateManualExpenseService(repo, MaterializeFxService(_FakeBccrClient())).execute(
        _command(repo, actor)
    )
    listed = ListExpensesService(repo).execute(
        ListExpensesCommand(actor_user_id=actor, list_id=repo.list_id)
    )
    assert len(listed.expenses) == 1
    row = listed.expenses[0]
    assert row.entry.id == created.id
    assert row.lens is not None
    assert row.lens.share_kind == SHARE_PERCENTAGE
    assert row.lens.share_value == Decimal("100.00")
    assert row.lens.net_polarity == POLARITY_ZERO
    assert row.origin_card_label is None


def test_list_expenses_card_label_only_for_payer() -> None:
    actor = uuid4()
    friend = uuid4()
    repo = _FakeExpenseRepo(list_id=uuid4(), member_ids=[actor, friend])
    card = CardRecord(
        id=uuid4(), user_id=actor, label="Kitchen card", iban="CR05", created_at=datetime.now(UTC)
    )
    repo.cards = [card]
    CreateManualExpenseService(repo, MaterializeFxService(_FakeBccrClient())).execute(
        _command(repo, actor, origin_kind="card", origin_card_id=card.id)
    )
    as_payer = ListExpensesService(repo).execute(
        ListExpensesCommand(actor_user_id=actor, list_id=repo.list_id)
    )
    as_friend = ListExpensesService(repo).execute(
        ListExpensesCommand(actor_user_id=friend, list_id=repo.list_id)
    )
    assert as_payer.expenses[0].origin_card_label == "Kitchen card"
    assert as_friend.expenses[0].origin_card_label is None
    assert as_friend.expenses[0].entry.origin_kind == "card"


def test_list_expenses_omits_lens_on_key_error(monkeypatch: pytest.MonkeyPatch) -> None:
    actor = uuid4()
    repo = _FakeExpenseRepo(list_id=uuid4(), member_ids=[actor])
    CreateManualExpenseService(repo, MaterializeFxService(_FakeBccrClient())).execute(
        _command(repo, actor)
    )

    def _boom(*_args, **_kwargs):
        raise KeyError("share")

    monkeypatch.setattr("application.expenses.build_viewer_expense_lens", _boom)
    listed = ListExpensesService(repo).execute(
        ListExpensesCommand(actor_user_id=actor, list_id=repo.list_id)
    )
    assert len(listed.expenses) == 1
    assert listed.expenses[0].lens is None
    assert listed.expenses[0].entry.normalized_description == "Coffee"


def test_list_expenses_omits_lens_on_value_error(monkeypatch: pytest.MonkeyPatch) -> None:
    actor = uuid4()
    repo = _FakeExpenseRepo(list_id=uuid4(), member_ids=[actor])
    CreateManualExpenseService(repo, MaterializeFxService(_FakeBccrClient())).execute(
        _command(repo, actor)
    )

    def _boom(*_args, **_kwargs):
        raise ValueError("invalid uuid")

    monkeypatch.setattr("application.expenses.compute_share_allocations", _boom)
    listed = ListExpensesService(repo).execute(
        ListExpensesCommand(actor_user_id=actor, list_id=repo.list_id)
    )
    assert len(listed.expenses) == 1
    assert listed.expenses[0].lens is None
    assert listed.expenses[0].entry.normalized_description == "Coffee"


def test_mark_reviewed_sets_import_reviewed_at() -> None:
    actor = uuid4()
    repo = _FakeExpenseRepo(list_id=uuid4(), member_ids=[actor])
    created = CreateManualExpenseService(repo, MaterializeFxService(_FakeBccrClient())).execute(
        _command(repo, actor)
    )
    assert created.import_reviewed_at is None

    result = MarkLedgerEntryReviewedService(repo).execute(
        MarkLedgerEntryReviewedCommand(
            actor_user_id=actor, list_id=repo.list_id, entry_id=created.id
        )
    )

    assert result.import_reviewed_at is not None
    assert result.id == created.id


def test_mark_reviewed_by_non_payer_member_succeeds() -> None:
    actor = uuid4()
    payer = uuid4()
    repo = _FakeExpenseRepo(list_id=uuid4(), member_ids=[actor, payer])
    created = CreateManualExpenseService(repo, MaterializeFxService(_FakeBccrClient())).execute(
        _command(repo, actor, payer=payer)
    )

    result = MarkLedgerEntryReviewedService(repo).execute(
        MarkLedgerEntryReviewedCommand(
            actor_user_id=actor, list_id=repo.list_id, entry_id=created.id
        )
    )

    assert result.import_reviewed_at is not None


def test_mark_reviewed_on_nonexistent_entry_raises_subject_not_found() -> None:
    actor = uuid4()
    repo = _FakeExpenseRepo(list_id=uuid4(), member_ids=[actor])

    with pytest.raises(SubjectNotFoundError):
        MarkLedgerEntryReviewedService(repo).execute(
            MarkLedgerEntryReviewedCommand(
                actor_user_id=actor, list_id=repo.list_id, entry_id=uuid4()
            )
        )


def test_mark_reviewed_on_other_list_entry_raises_subject_not_found() -> None:
    actor = uuid4()
    repo = _FakeExpenseRepo(list_id=uuid4(), member_ids=[actor])
    created = CreateManualExpenseService(repo, MaterializeFxService(_FakeBccrClient())).execute(
        _command(repo, actor)
    )
    foreign = LedgerEntryRecord(
        id=created.id,
        list_id=uuid4(),
        amount=created.amount,
        currency=created.currency,
        normalized_description=created.normalized_description,
        payer_id=created.payer_id,
        provenance=created.provenance,
        line_type=created.line_type,
        posted_date=created.posted_date,
        created_at=created.created_at,
        amount_crc=created.amount_crc,
        fx_rate=created.fx_rate,
        fx_rate_date=created.fx_rate_date,
        fx_fallback=created.fx_fallback,
        origin_kind=created.origin_kind,
        origin_card_id=created.origin_card_id,
        import_reviewed_at=created.import_reviewed_at,
    )
    repo.entries[created.id] = foreign

    with pytest.raises(SubjectNotFoundError):
        MarkLedgerEntryReviewedService(repo).execute(
            MarkLedgerEntryReviewedCommand(
                actor_user_id=actor, list_id=repo.list_id, entry_id=created.id
            )
        )


def test_mark_reviewed_by_non_member_denied() -> None:
    actor = uuid4()
    outsider = uuid4()
    repo = _FakeExpenseRepo(list_id=uuid4(), member_ids=[actor])
    created = CreateManualExpenseService(repo, MaterializeFxService(_FakeBccrClient())).execute(
        _command(repo, actor)
    )

    with pytest.raises(NotListMemberError):
        MarkLedgerEntryReviewedService(repo).execute(
            MarkLedgerEntryReviewedCommand(
                actor_user_id=outsider, list_id=repo.list_id, entry_id=created.id
            )
        )
