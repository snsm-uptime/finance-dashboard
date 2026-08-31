"""Domain unit tests for statement-cycle derivation (Story 5.9, FR-39)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from uuid import UUID, uuid4

from domain.statement_cycles import (
    current_calendar_month_window,
    derive_default_period,
    derive_statement_cycles,
)


@dataclass(frozen=True, slots=True)
class FakeEntry:
    statement_id: UUID | None
    posted_date: date


def test_single_statement_yields_one_cycle() -> None:
    statement_id = uuid4()
    entries = [
        FakeEntry(statement_id=statement_id, posted_date=date(2026, 6, 15)),
        FakeEntry(statement_id=statement_id, posted_date=date(2026, 6, 20)),
        FakeEntry(statement_id=statement_id, posted_date=date(2026, 7, 1)),
    ]

    cycles = derive_statement_cycles(entries)

    assert len(cycles) == 1
    cycle = cycles[0]
    assert cycle.statement_id == statement_id
    assert cycle.period_start == date(2026, 6, 15)
    assert cycle.period_end == date(2026, 7, 1)
    assert cycle.entry_count == 3


def test_multiple_statements_sorted_most_recent_first() -> None:
    older = uuid4()
    newer = uuid4()
    entries = [
        FakeEntry(statement_id=older, posted_date=date(2026, 5, 1)),
        FakeEntry(statement_id=older, posted_date=date(2026, 5, 20)),
        FakeEntry(statement_id=newer, posted_date=date(2026, 6, 1)),
        FakeEntry(statement_id=newer, posted_date=date(2026, 6, 25)),
    ]

    cycles = derive_statement_cycles(entries)

    assert [c.statement_id for c in cycles] == [newer, older]
    assert cycles[0].period_start == date(2026, 6, 1)
    assert cycles[0].period_end == date(2026, 6, 25)
    assert cycles[1].period_start == date(2026, 5, 1)
    assert cycles[1].period_end == date(2026, 5, 20)


def test_hand_entered_only_produces_no_cycles() -> None:
    entries = [
        FakeEntry(statement_id=None, posted_date=date(2026, 6, 1)),
        FakeEntry(statement_id=None, posted_date=date(2026, 6, 10)),
    ]

    assert derive_statement_cycles(entries) == []


def test_mixed_hand_entered_and_imported_excludes_hand_entered_from_grouping() -> None:
    statement_id = uuid4()
    entries = [
        FakeEntry(statement_id=statement_id, posted_date=date(2026, 6, 5)),
        FakeEntry(statement_id=statement_id, posted_date=date(2026, 6, 25)),
        FakeEntry(statement_id=None, posted_date=date(2026, 6, 15)),
    ]

    cycles = derive_statement_cycles(entries)

    assert len(cycles) == 1
    assert cycles[0].entry_count == 2
    assert cycles[0].period_start == date(2026, 6, 5)
    assert cycles[0].period_end == date(2026, 6, 25)


def test_default_period_uses_most_recent_cycle_when_present() -> None:
    older = uuid4()
    newer = uuid4()
    entries = [
        FakeEntry(statement_id=older, posted_date=date(2026, 5, 1)),
        FakeEntry(statement_id=older, posted_date=date(2026, 5, 20)),
        FakeEntry(statement_id=newer, posted_date=date(2026, 6, 1)),
        FakeEntry(statement_id=newer, posted_date=date(2026, 6, 25)),
    ]

    window = derive_default_period(entries)

    assert window.period_start == date(2026, 6, 1)
    assert window.period_end == date(2026, 6, 25)


def test_default_period_falls_back_to_calendar_month_when_no_statement_entries() -> None:
    entries = [FakeEntry(statement_id=None, posted_date=date(2026, 6, 15))]

    window = derive_default_period(entries, today=date(2026, 8, 30))

    assert window == current_calendar_month_window(date(2026, 8, 30))
    assert window.period_start == date(2026, 8, 1)
    assert window.period_end == date(2026, 8, 31)


def test_default_period_falls_back_to_calendar_month_when_no_entries_at_all() -> None:
    window = derive_default_period([], today=date(2026, 2, 10))

    assert window.period_start == date(2026, 2, 1)
    assert window.period_end == date(2026, 2, 28)


def test_current_calendar_month_window_handles_leap_year() -> None:
    window = current_calendar_month_window(date(2028, 2, 10))

    assert window.period_start == date(2028, 2, 1)
    assert window.period_end == date(2028, 2, 29)
