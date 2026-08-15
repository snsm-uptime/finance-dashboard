"""Unit tests for manual expense create + origin-update application services (Story 4.2).

Fake-repo pattern mirrors test_cards_application.py's _FakeCardRepo — Story 3.2
never got an application-tier test file for expenses, this is the first one.
"""

from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from uuid import UUID, uuid4

import pytest
from application.cards import CardRecord
from application.expenses import (
    CreateManualExpenseCommand,
    CreateManualExpenseService,
    LedgerEntryRecord,
    ListMemberView,
    UpdateExpenseOriginCommand,
    UpdateExpenseOriginService,
)
from application.fx_service import MaterializeFxService
from application.lists import ListRecord, MembershipRecord
from domain.errors import InvalidManualExpenseError, NotListMemberError, SubjectNotFoundError


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

    def get_card_for_owner(self, user_id: UUID, card_id: UUID) -> CardRecord | None:
        for card in self.cards:
            if card.id == card_id and card.user_id == user_id:
                return card
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
        self, *, list_id: UUID, entry_id: UUID, origin_kind, origin_card_id
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
            origin_kind=origin_kind,
            origin_card_id=origin_card_id,
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
    origin_kind: str | None = None,
    origin_card_id: UUID | None = None,
) -> CreateManualExpenseCommand:
    return CreateManualExpenseCommand(
        actor_user_id=actor,
        list_id=repo.list_id,
        amount="10.00",
        currency="CRC",
        description="Coffee",
        payer_id=actor,
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
