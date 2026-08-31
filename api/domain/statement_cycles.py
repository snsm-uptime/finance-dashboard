"""Derive statement/billing cycles from already-committed ledger entries (Story 5.9, FR-39).

Pure domain logic: no FastAPI / SQLAlchemy. This story adds zero new persisted
columns — cycles are derived by grouping ledger entries on their existing
`statement_id` foreign key and taking min/max `posted_date` per group. Must
never feed `compute_canonical_identity` / dedup (AD-18 was explicitly amended
to remove a period concept from identity).
"""

from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import date
from typing import Protocol
from uuid import UUID

from domain.dates import today_costa_rica


class HasStatementAndPostedDate(Protocol):
    statement_id: UUID | None
    posted_date: date


@dataclass(frozen=True, slots=True)
class StatementCycle:
    statement_id: UUID
    period_start: date
    period_end: date
    entry_count: int


@dataclass(frozen=True, slots=True)
class PeriodWindow:
    period_start: date
    period_end: date


def derive_statement_cycles(
    entries: list[HasStatementAndPostedDate],
) -> list[StatementCycle]:
    """Group entries by `statement_id` (hand-entered rows with no statement_id
    are excluded — they do not define a cycle boundary). Sorted by
    `period_end` descending — most-recent statement first."""
    dates_by_statement: dict[UUID, list[date]] = {}
    for entry in entries:
        if entry.statement_id is None:
            continue
        dates_by_statement.setdefault(entry.statement_id, []).append(entry.posted_date)

    cycles = [
        StatementCycle(
            statement_id=statement_id,
            period_start=min(dates),
            period_end=max(dates),
            entry_count=len(dates),
        )
        for statement_id, dates in dates_by_statement.items()
    ]
    # Overlapping statements can share the same period_end (FR-20/AD-18), so
    # statement_id breaks ties deterministically rather than relying on
    # incidental dict/ledger-fetch ordering.
    cycles.sort(key=lambda cycle: (cycle.period_end, cycle.statement_id), reverse=True)
    return cycles


def current_calendar_month_window(today: date | None = None) -> PeriodWindow:
    """Calendar-month fallback bounds in America/Costa_Rica (AC #4)."""
    reference = today if today is not None else today_costa_rica()
    last_day = calendar.monthrange(reference.year, reference.month)[1]
    return PeriodWindow(
        period_start=date(reference.year, reference.month, 1),
        period_end=date(reference.year, reference.month, last_day),
    )


def derive_default_period(
    entries: list[HasStatementAndPostedDate],
    *,
    today: date | None = None,
) -> PeriodWindow:
    """Most-recent statement cycle's window, or the current calendar month in
    America/Costa_Rica when no statement-sourced entries exist (AC #4)."""
    cycles = derive_statement_cycles(entries)
    if cycles:
        most_recent = cycles[0]
        return PeriodWindow(
            period_start=most_recent.period_start, period_end=most_recent.period_end
        )
    return current_calendar_month_window(today)


def full_history_window(
    entries: list[HasStatementAndPostedDate],
    *,
    today: date | None = None,
) -> PeriodWindow:
    """ "All periods" window — spans every entry's `posted_date`, so a
    newly-added hand entry (which never belongs to a statement cycle) is
    never excluded by a hidden default filter. Falls back to the current
    calendar month when the list has no entries yet."""
    dates = [entry.posted_date for entry in entries]
    if not dates:
        return current_calendar_month_window(today)
    return PeriodWindow(period_start=min(dates), period_end=max(dates))


def resolve_period_bounds(
    entries: list[HasStatementAndPostedDate],
    *,
    period_start: date | None,
    period_end: date | None,
    today: date | None = None,
) -> PeriodWindow:
    """Explicit `[period_start, period_end]` when both are given, else the
    full-history window — "All" is the default; a statement cycle is only
    applied when explicitly requested. Single shared decision point for read
    paths that accept optional period query params, so the "both or neither"
    contract can't drift between call sites."""
    if period_start is not None and period_end is not None:
        return PeriodWindow(period_start=period_start, period_end=period_end)
    return full_history_window(entries, today=today)
