"""Postgres integration tests for same-price conflict detect/resolve (Story 5.5)."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import UUID, uuid4

import pytest
from adapters.persistence.models import (
    ImportBatchModel,
    ImportSessionModel,
    ImportStatementModel,
    LedgerEntryModel,
    ListMembershipModel,
    ListModel,
    UserModel,
)
from adapters.persistence.repositories import SqlAlchemyListRepository
from adapters.persistence.same_price_conflicts import SqlAlchemySamePriceConflictRepository
from application.same_price_conflicts import (
    CONFLICT_RESOLUTION_MANUAL_SURVIVOR,
    CONFLICT_RESOLUTION_NOT_SAME_EXPENSE,
    CONFLICT_RESOLUTION_PARSED_SURVIVOR,
    DetectSamePriceConflictsCommand,
    DetectSamePriceConflictsService,
    ListSamePriceConflictQueueService,
    ResolveSamePriceConflictCommand,
    ResolveSamePriceConflictService,
)
from domain.errors import (
    SamePriceConflictAlreadyResolvedError,
    SamePriceConflictConfirmRequiredError,
    SamePriceConflictNotFoundError,
)
from sqlalchemy.orm import Session
from tests.integration_db import database_url

pytestmark = pytest.mark.skipif(
    database_url() is None,
    reason="DATABASE_URL not set — Postgres 16 required for integration tests",
)


def _make_user(db_session: Session, email: str) -> UUID:
    user_id = uuid4()
    db_session.add(UserModel(id=user_id, email=email, password_hash="x", alias=email.split("@")[0]))
    db_session.flush()
    return user_id


def _make_list(db_session: Session, *, owner_id: UUID, member_ids: list[UUID]) -> UUID:
    list_id = uuid4()
    db_session.add(ListModel(id=list_id, name="L", owner_id=owner_id))
    db_session.flush()
    for member_id in {owner_id, *member_ids}:
        db_session.add(
            ListMembershipModel(id=uuid4(), list_id=list_id, user_id=member_id, role="owner")
        )
    db_session.flush()
    return list_id


def _make_manual_entry(
    db_session: Session,
    *,
    list_id: UUID,
    amount: Decimal = Decimal("10.00"),
    currency: str = "CRC",
    posted_date: date = date(2026, 8, 10),
) -> UUID:
    entry_id = uuid4()
    db_session.add(
        LedgerEntryModel(
            id=entry_id,
            list_id=list_id,
            amount=amount,
            currency=currency,
            normalized_description="Manual entry",
            provenance="hand",
            posted_date=posted_date,
            amount_crc=amount,
            fx_rate=Decimal("1"),
        )
    )
    db_session.flush()
    return entry_id


def _make_parsed_entry(
    db_session: Session,
    *,
    list_id: UUID,
    batch_id: UUID | None = None,
    amount: Decimal = Decimal("10.00"),
    currency: str = "CRC",
    posted_date: date = date(2026, 8, 10),
) -> UUID:
    entry_id = uuid4()
    db_session.add(
        LedgerEntryModel(
            id=entry_id,
            list_id=list_id,
            amount=amount,
            currency=currency,
            normalized_description="Parsed entry",
            provenance="parser",
            posted_date=posted_date,
            import_batch_id=batch_id,
            amount_crc=amount,
            fx_rate=Decimal("1"),
        )
    )
    db_session.flush()
    return entry_id


def _make_batch(db_session: Session, *, list_id: UUID, actor_id: UUID) -> UUID:
    session_id = uuid4()
    statement_id = uuid4()
    batch_id = uuid4()
    db_session.add(ImportSessionModel(id=session_id, user_id=actor_id, content_hash="a" * 64))
    db_session.add(
        ImportStatementModel(id=statement_id, session_id=session_id, product_id="bac_credit", status="staged")
    )
    db_session.flush()
    db_session.add(
        ImportBatchModel(
            id=batch_id,
            session_id=session_id,
            statement_id=statement_id,
            list_id=list_id,
            actor_user_id=actor_id,
        )
    )
    db_session.flush()
    return batch_id


def test_detect_on_commit_creates_conflict_row(db_session: Session) -> None:
    actor = _make_user(db_session, "actor1@example.com")
    list_id = _make_list(db_session, owner_id=actor, member_ids=[])
    manual_id = _make_manual_entry(db_session, list_id=list_id)
    parsed_id = _make_parsed_entry(db_session, list_id=list_id)

    repo = SqlAlchemySamePriceConflictRepository(db_session)
    DetectSamePriceConflictsService(repo).execute(
        DetectSamePriceConflictsCommand(
            actor_user_id=actor,
            parsed_entry_id=parsed_id,
            parsed_list_id=list_id,
            amount=Decimal("10.00"),
            currency="CRC",
            posted_date=date(2026, 8, 10),
        )
    )

    queue = ListSamePriceConflictQueueService(repo).execute(actor)
    assert len(queue) == 1
    assert queue[0].manual.entry_id == manual_id
    assert queue[0].parsed.entry_id == parsed_id
    assert queue[0].resolved_at is None


def test_duplicate_detection_pass_does_not_create_second_row(db_session: Session) -> None:
    actor = _make_user(db_session, "actor2@example.com")
    list_id = _make_list(db_session, owner_id=actor, member_ids=[])
    _make_manual_entry(db_session, list_id=list_id)
    parsed_id = _make_parsed_entry(db_session, list_id=list_id)

    repo = SqlAlchemySamePriceConflictRepository(db_session)
    command = DetectSamePriceConflictsCommand(
        actor_user_id=actor,
        parsed_entry_id=parsed_id,
        parsed_list_id=list_id,
        amount=Decimal("10.00"),
        currency="CRC",
        posted_date=date(2026, 8, 10),
    )
    service = DetectSamePriceConflictsService(repo)
    service.execute(command)
    service.execute(command)

    queue = ListSamePriceConflictQueueService(repo).execute(actor)
    assert len(queue) == 1


def test_different_currency_same_amount_produces_no_conflict(db_session: Session) -> None:
    actor = _make_user(db_session, "actor3@example.com")
    list_id = _make_list(db_session, owner_id=actor, member_ids=[])
    _make_manual_entry(db_session, list_id=list_id, currency="USD")
    parsed_id = _make_parsed_entry(db_session, list_id=list_id, currency="CRC")

    repo = SqlAlchemySamePriceConflictRepository(db_session)
    DetectSamePriceConflictsService(repo).execute(
        DetectSamePriceConflictsCommand(
            actor_user_id=actor,
            parsed_entry_id=parsed_id,
            parsed_list_id=list_id,
            amount=Decimal("10.00"),
            currency="CRC",
            posted_date=date(2026, 8, 10),
        )
    )

    assert ListSamePriceConflictQueueService(repo).execute(actor) == []


def test_out_of_window_produces_no_conflict(db_session: Session) -> None:
    actor = _make_user(db_session, "actor4@example.com")
    list_id = _make_list(db_session, owner_id=actor, member_ids=[])
    _make_manual_entry(db_session, list_id=list_id, posted_date=date(2026, 8, 1))
    parsed_id = _make_parsed_entry(db_session, list_id=list_id, posted_date=date(2026, 8, 10))

    repo = SqlAlchemySamePriceConflictRepository(db_session)
    DetectSamePriceConflictsService(repo).execute(
        DetectSamePriceConflictsCommand(
            actor_user_id=actor,
            parsed_entry_id=parsed_id,
            parsed_list_id=list_id,
            amount=Decimal("10.00"),
            currency="CRC",
            posted_date=date(2026, 8, 10),
        )
    )

    assert ListSamePriceConflictQueueService(repo).execute(actor) == []


def test_zero_window_days_is_respected_not_defaulted(db_session: Session) -> None:
    """A list configured for a same-day-only window (0) must not silently
    fall back to DEFAULT_SAME_PRICE_WINDOW_DAYS just because 0 is falsy."""
    actor = _make_user(db_session, "actor_zero_window@example.com")
    list_id = _make_list(db_session, owner_id=actor, member_ids=[])
    db_session.query(ListModel).filter(ListModel.id == list_id).update(
        {"same_price_window_days": 0}
    )
    db_session.flush()
    _make_manual_entry(db_session, list_id=list_id, posted_date=date(2026, 8, 9))
    parsed_id = _make_parsed_entry(db_session, list_id=list_id, posted_date=date(2026, 8, 10))

    repo = SqlAlchemySamePriceConflictRepository(db_session)
    DetectSamePriceConflictsService(repo).execute(
        DetectSamePriceConflictsCommand(
            actor_user_id=actor,
            parsed_entry_id=parsed_id,
            parsed_list_id=list_id,
            amount=Decimal("10.00"),
            currency="CRC",
            posted_date=date(2026, 8, 10),
        )
    )

    # 1 day apart, but window is 0 — must not match.
    assert ListSamePriceConflictQueueService(repo).execute(actor) == []


def test_related_list_scoping_requires_actor_member_of_both(db_session: Session) -> None:
    actor = _make_user(db_session, "actor5@example.com")
    stranger = _make_user(db_session, "stranger5@example.com")
    parsed_list = _make_list(db_session, owner_id=actor, member_ids=[])
    # A list the actor is NOT a member of — must never surface, even if the
    # amount/currency/window all match.
    unrelated_list = _make_list(db_session, owner_id=stranger, member_ids=[])
    _make_manual_entry(db_session, list_id=unrelated_list)
    parsed_id = _make_parsed_entry(db_session, list_id=parsed_list)

    repo = SqlAlchemySamePriceConflictRepository(db_session)
    DetectSamePriceConflictsService(repo).execute(
        DetectSamePriceConflictsCommand(
            actor_user_id=actor,
            parsed_entry_id=parsed_id,
            parsed_list_id=parsed_list,
            amount=Decimal("10.00"),
            currency="CRC",
            posted_date=date(2026, 8, 10),
        )
    )

    assert ListSamePriceConflictQueueService(repo).execute(actor) == []


def test_related_list_shares_member_is_detected(db_session: Session) -> None:
    actor = _make_user(db_session, "actor6@example.com")
    partner = _make_user(db_session, "partner6@example.com")
    parsed_list = _make_list(db_session, owner_id=actor, member_ids=[partner])
    manual_list = _make_list(db_session, owner_id=actor, member_ids=[partner])
    _make_manual_entry(db_session, list_id=manual_list)
    parsed_id = _make_parsed_entry(db_session, list_id=parsed_list)

    repo = SqlAlchemySamePriceConflictRepository(db_session)
    DetectSamePriceConflictsService(repo).execute(
        DetectSamePriceConflictsCommand(
            actor_user_id=actor,
            parsed_entry_id=parsed_id,
            parsed_list_id=parsed_list,
            amount=Decimal("10.00"),
            currency="CRC",
            posted_date=date(2026, 8, 10),
        )
    )

    assert len(ListSamePriceConflictQueueService(repo).execute(actor)) == 1


def test_multi_match_one_manual_two_parsed_creates_two_conflicts(db_session: Session) -> None:
    actor = _make_user(db_session, "actor7@example.com")
    list_id = _make_list(db_session, owner_id=actor, member_ids=[])
    _make_manual_entry(db_session, list_id=list_id)
    parsed_1 = _make_parsed_entry(db_session, list_id=list_id)
    parsed_2 = _make_parsed_entry(db_session, list_id=list_id)

    repo = SqlAlchemySamePriceConflictRepository(db_session)
    service = DetectSamePriceConflictsService(repo)
    for parsed_id in (parsed_1, parsed_2):
        service.execute(
            DetectSamePriceConflictsCommand(
                actor_user_id=actor,
                parsed_entry_id=parsed_id,
                parsed_list_id=list_id,
                amount=Decimal("10.00"),
                currency="CRC",
                posted_date=date(2026, 8, 10),
            )
        )

    queue = ListSamePriceConflictQueueService(repo).execute(actor)
    assert len(queue) == 2
    assert {c.parsed.entry_id for c in queue} == {parsed_1, parsed_2}


def test_resolve_manual_survivor_deletes_parsed_and_empties_batch(db_session: Session) -> None:
    actor = _make_user(db_session, "actor8@example.com")
    list_id = _make_list(db_session, owner_id=actor, member_ids=[])
    manual_id = _make_manual_entry(db_session, list_id=list_id)
    batch_id = _make_batch(db_session, list_id=list_id, actor_id=actor)
    parsed_id = _make_parsed_entry(db_session, list_id=list_id, batch_id=batch_id)

    conflict_repo = SqlAlchemySamePriceConflictRepository(db_session)
    DetectSamePriceConflictsService(conflict_repo).execute(
        DetectSamePriceConflictsCommand(
            actor_user_id=actor,
            parsed_entry_id=parsed_id,
            parsed_list_id=list_id,
            amount=Decimal("10.00"),
            currency="CRC",
            posted_date=date(2026, 8, 10),
        )
    )
    conflict = ListSamePriceConflictQueueService(conflict_repo).execute(actor)[0]

    list_repo = SqlAlchemyListRepository(db_session)
    ResolveSamePriceConflictService(conflict_repo, list_repo).execute(
        ResolveSamePriceConflictCommand(
            actor_user_id=actor,
            conflict_id=conflict.id,
            resolution=CONFLICT_RESOLUTION_MANUAL_SURVIVOR,
        )
    )

    assert db_session.get(LedgerEntryModel, parsed_id) is None
    assert db_session.get(LedgerEntryModel, manual_id) is not None
    assert db_session.get(ImportBatchModel, batch_id) is None


def test_resolve_parsed_survivor_deletes_manual_entry(db_session: Session) -> None:
    actor = _make_user(db_session, "actor9@example.com")
    list_id = _make_list(db_session, owner_id=actor, member_ids=[])
    manual_id = _make_manual_entry(db_session, list_id=list_id)
    parsed_id = _make_parsed_entry(db_session, list_id=list_id)

    conflict_repo = SqlAlchemySamePriceConflictRepository(db_session)
    DetectSamePriceConflictsService(conflict_repo).execute(
        DetectSamePriceConflictsCommand(
            actor_user_id=actor,
            parsed_entry_id=parsed_id,
            parsed_list_id=list_id,
            amount=Decimal("10.00"),
            currency="CRC",
            posted_date=date(2026, 8, 10),
        )
    )
    conflict = ListSamePriceConflictQueueService(conflict_repo).execute(actor)[0]

    list_repo = SqlAlchemyListRepository(db_session)
    ResolveSamePriceConflictService(conflict_repo, list_repo).execute(
        ResolveSamePriceConflictCommand(
            actor_user_id=actor,
            conflict_id=conflict.id,
            resolution=CONFLICT_RESOLUTION_PARSED_SURVIVOR,
        )
    )

    assert db_session.get(LedgerEntryModel, manual_id) is None
    assert db_session.get(LedgerEntryModel, parsed_id) is not None


def test_resolve_not_same_expense_without_confirm_raises(db_session: Session) -> None:
    actor = _make_user(db_session, "actor10@example.com")
    list_id = _make_list(db_session, owner_id=actor, member_ids=[])
    _make_manual_entry(db_session, list_id=list_id)
    parsed_id = _make_parsed_entry(db_session, list_id=list_id)

    conflict_repo = SqlAlchemySamePriceConflictRepository(db_session)
    DetectSamePriceConflictsService(conflict_repo).execute(
        DetectSamePriceConflictsCommand(
            actor_user_id=actor,
            parsed_entry_id=parsed_id,
            parsed_list_id=list_id,
            amount=Decimal("10.00"),
            currency="CRC",
            posted_date=date(2026, 8, 10),
        )
    )
    conflict = ListSamePriceConflictQueueService(conflict_repo).execute(actor)[0]

    list_repo = SqlAlchemyListRepository(db_session)
    with pytest.raises(SamePriceConflictConfirmRequiredError):
        ResolveSamePriceConflictService(conflict_repo, list_repo).execute(
            ResolveSamePriceConflictCommand(
                actor_user_id=actor,
                conflict_id=conflict.id,
                resolution=CONFLICT_RESOLUTION_NOT_SAME_EXPENSE,
                confirmed=False,
            )
        )


def test_resolve_not_same_expense_with_confirm_keeps_both(db_session: Session) -> None:
    actor = _make_user(db_session, "actor11@example.com")
    list_id = _make_list(db_session, owner_id=actor, member_ids=[])
    manual_id = _make_manual_entry(db_session, list_id=list_id)
    parsed_id = _make_parsed_entry(db_session, list_id=list_id)

    conflict_repo = SqlAlchemySamePriceConflictRepository(db_session)
    DetectSamePriceConflictsService(conflict_repo).execute(
        DetectSamePriceConflictsCommand(
            actor_user_id=actor,
            parsed_entry_id=parsed_id,
            parsed_list_id=list_id,
            amount=Decimal("10.00"),
            currency="CRC",
            posted_date=date(2026, 8, 10),
        )
    )
    conflict = ListSamePriceConflictQueueService(conflict_repo).execute(actor)[0]

    list_repo = SqlAlchemyListRepository(db_session)
    ResolveSamePriceConflictService(conflict_repo, list_repo).execute(
        ResolveSamePriceConflictCommand(
            actor_user_id=actor,
            conflict_id=conflict.id,
            resolution=CONFLICT_RESOLUTION_NOT_SAME_EXPENSE,
            confirmed=True,
        )
    )

    assert db_session.get(LedgerEntryModel, manual_id) is not None
    assert db_session.get(LedgerEntryModel, parsed_id) is not None
    resolved = conflict_repo.get_conflict(conflict.id)
    assert resolved is not None
    assert resolved.resolution == CONFLICT_RESOLUTION_NOT_SAME_EXPENSE
    assert resolved.resolved_at is not None


def test_resolving_already_resolved_not_same_expense_conflict_raises(db_session: Session) -> None:
    """`not_same_expense` never deletes either entry, so the conflict row
    survives resolution — a retry must hit the idempotency guard directly."""
    actor = _make_user(db_session, "actor12@example.com")
    list_id = _make_list(db_session, owner_id=actor, member_ids=[])
    _make_manual_entry(db_session, list_id=list_id)
    parsed_id = _make_parsed_entry(db_session, list_id=list_id)

    conflict_repo = SqlAlchemySamePriceConflictRepository(db_session)
    DetectSamePriceConflictsService(conflict_repo).execute(
        DetectSamePriceConflictsCommand(
            actor_user_id=actor,
            parsed_entry_id=parsed_id,
            parsed_list_id=list_id,
            amount=Decimal("10.00"),
            currency="CRC",
            posted_date=date(2026, 8, 10),
        )
    )
    conflict = ListSamePriceConflictQueueService(conflict_repo).execute(actor)[0]

    list_repo = SqlAlchemyListRepository(db_session)
    service = ResolveSamePriceConflictService(conflict_repo, list_repo)
    service.execute(
        ResolveSamePriceConflictCommand(
            actor_user_id=actor,
            conflict_id=conflict.id,
            resolution=CONFLICT_RESOLUTION_NOT_SAME_EXPENSE,
            confirmed=True,
        )
    )

    with pytest.raises(SamePriceConflictAlreadyResolvedError):
        service.execute(
            ResolveSamePriceConflictCommand(
                actor_user_id=actor,
                conflict_id=conflict.id,
                resolution=CONFLICT_RESOLUTION_NOT_SAME_EXPENSE,
                confirmed=True,
            )
        )


def test_resolving_survivor_conflict_twice_is_not_found_after_cascade(db_session: Session) -> None:
    """manual_entry_id/parsed_entry_id are ON DELETE CASCADE onto this table
    (Task 2) — a survivor resolution's delete removes the conflict row too,
    so a retry is "missing", not "already resolved" (still no double-delete)."""
    actor = _make_user(db_session, "actor14@example.com")
    list_id = _make_list(db_session, owner_id=actor, member_ids=[])
    _make_manual_entry(db_session, list_id=list_id)
    parsed_id = _make_parsed_entry(db_session, list_id=list_id)

    conflict_repo = SqlAlchemySamePriceConflictRepository(db_session)
    DetectSamePriceConflictsService(conflict_repo).execute(
        DetectSamePriceConflictsCommand(
            actor_user_id=actor,
            parsed_entry_id=parsed_id,
            parsed_list_id=list_id,
            amount=Decimal("10.00"),
            currency="CRC",
            posted_date=date(2026, 8, 10),
        )
    )
    conflict = ListSamePriceConflictQueueService(conflict_repo).execute(actor)[0]

    list_repo = SqlAlchemyListRepository(db_session)
    service = ResolveSamePriceConflictService(conflict_repo, list_repo)
    service.execute(
        ResolveSamePriceConflictCommand(
            actor_user_id=actor,
            conflict_id=conflict.id,
            resolution=CONFLICT_RESOLUTION_PARSED_SURVIVOR,
        )
    )

    with pytest.raises(SamePriceConflictNotFoundError):
        service.execute(
            ResolveSamePriceConflictCommand(
                actor_user_id=actor,
                conflict_id=conflict.id,
                resolution=CONFLICT_RESOLUTION_PARSED_SURVIVOR,
            )
        )


def test_resolving_unknown_conflict_raises_not_found(db_session: Session) -> None:
    actor = _make_user(db_session, "actor13@example.com")
    conflict_repo = SqlAlchemySamePriceConflictRepository(db_session)
    list_repo = SqlAlchemyListRepository(db_session)
    with pytest.raises(SamePriceConflictNotFoundError):
        ResolveSamePriceConflictService(conflict_repo, list_repo).execute(
            ResolveSamePriceConflictCommand(
                actor_user_id=actor,
                conflict_id=uuid4(),
                resolution=CONFLICT_RESOLUTION_PARSED_SURVIVOR,
            )
        )
