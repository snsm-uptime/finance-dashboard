"""Domain tests for manual expense create validation (Story 3.2) — TDD."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4
from zoneinfo import ZoneInfo

import pytest
from domain.dates import COSTA_RICA_TZ, today_costa_rica_iso
from domain.errors import InvalidManualExpenseError
from domain.expenses import (
    LINE_TYPE_PURCHASE,
    MANUAL_CURRENCY_CRC,
    PROVENANCE_HAND,
    validate_manual_expense,
)


def test_today_costa_rica_iso_not_utc_midnight_shift() -> None:
    # 2026-08-07 02:30 UTC is still 2026-08-06 evening in Costa Rica (UTC-6).
    utc_morning = datetime(2026, 8, 7, 2, 30, tzinfo=UTC)
    assert today_costa_rica_iso(utc_morning) == "2026-08-06"
    assert utc_morning.astimezone(ZoneInfo("UTC")).date().isoformat() == "2026-08-07"


def test_today_costa_rica_iso_uses_costa_rica_calendar_day() -> None:
    local = datetime(2026, 8, 6, 23, 59, tzinfo=COSTA_RICA_TZ)
    assert today_costa_rica_iso(local) == "2026-08-06"


def test_validate_accepts_crc_positive_amount_and_member_payer() -> None:
    payer, other = uuid4(), uuid4()
    draft = validate_manual_expense(
        amount="10.50",
        currency="CRC",
        description="  Groceries  ",
        payer_id=payer,
        member_ids=[payer, other],
        now=datetime(2026, 8, 6, 12, 0, tzinfo=COSTA_RICA_TZ),
    )
    assert draft.amount == Decimal("10.50")
    assert draft.currency == MANUAL_CURRENCY_CRC
    assert draft.normalized_description == "Groceries"
    assert draft.payer_id == payer
    assert draft.provenance == PROVENANCE_HAND
    assert draft.line_type == LINE_TYPE_PURCHASE
    assert draft.posted_date == "2026-08-06"
    # Origin / cards are Epic 4 — draft must not invent origin fields.
    assert not hasattr(draft, "origin_kind")


def test_validate_rejects_non_crc_currency() -> None:
    payer = uuid4()
    with pytest.raises(InvalidManualExpenseError, match="CRC"):
        validate_manual_expense(
            amount="10.00",
            currency="USD",
            description="Coffee",
            payer_id=payer,
            member_ids=[payer],
        )


def test_validate_rejects_non_positive_amount() -> None:
    payer = uuid4()
    with pytest.raises(InvalidManualExpenseError):
        validate_manual_expense(
            amount="0",
            currency="CRC",
            description="X",
            payer_id=payer,
            member_ids=[payer],
        )
    with pytest.raises(InvalidManualExpenseError):
        validate_manual_expense(
            amount="-1.00",
            currency="CRC",
            description="X",
            payer_id=payer,
            member_ids=[payer],
        )


def test_validate_rejects_blank_description() -> None:
    payer = uuid4()
    with pytest.raises(InvalidManualExpenseError):
        validate_manual_expense(
            amount="1.00",
            currency="CRC",
            description="   ",
            payer_id=payer,
            member_ids=[payer],
        )


def test_validate_rejects_payer_outside_member_set() -> None:
    member, outsider = uuid4(), uuid4()
    with pytest.raises(InvalidManualExpenseError, match="member"):
        validate_manual_expense(
            amount="1.00",
            currency="CRC",
            description="Taxi",
            payer_id=outsider,
            member_ids=[member],
        )


def test_validate_rejects_non_decimal_amount_string() -> None:
    payer = uuid4()
    with pytest.raises(InvalidManualExpenseError):
        validate_manual_expense(
            amount="ten",
            currency="CRC",
            description="X",
            payer_id=payer,
            member_ids=[payer],
        )


def test_validate_rejects_more_than_two_decimal_places() -> None:
    payer = uuid4()
    with pytest.raises(InvalidManualExpenseError, match="two decimal"):
        validate_manual_expense(
            amount="10.001",
            currency="CRC",
            description="X",
            payer_id=payer,
            member_ids=[payer],
        )


def test_validate_rejects_oversized_description() -> None:
    payer = uuid4()
    with pytest.raises(InvalidManualExpenseError, match="at most"):
        validate_manual_expense(
            amount="1.00",
            currency="CRC",
            description="x" * 501,
            payer_id=payer,
            member_ids=[payer],
        )
