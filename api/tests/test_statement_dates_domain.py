"""Domain tests for the shared date-format contract (AD-26)."""

from __future__ import annotations

from datetime import date

import pytest
from domain.statement_dates import parse_statement_date


def test_parses_dd_mmm_yy_with_year_token() -> None:
    assert parse_statement_date("05-ENE-26", date_format="%d-%b-%y") == "2026-01-05"


def test_case_insensitive_month_and_whitespace_tolerant() -> None:
    assert parse_statement_date(" 31-dic-25 ", date_format="%d-%b-%y") == "2025-12-31"


def test_unknown_month_abbreviation_raises() -> None:
    with pytest.raises(KeyError):
        parse_statement_date("05-XXX-26", date_format="%d-%b-%y")


def test_malformed_value_raises() -> None:
    with pytest.raises(ValueError):
        parse_statement_date("not-a-date", date_format="%d-%b-%y")


def test_wrong_token_count_raises() -> None:
    with pytest.raises(ValueError):
        parse_statement_date("05-ENE", date_format="%d-%b-%y")


def test_no_year_token_requires_reference_date() -> None:
    with pytest.raises(ValueError):
        parse_statement_date("DIC/31", date_format="%b/%d")


def test_no_year_token_infers_nearest_year_at_or_before_reference() -> None:
    # DIC/31 relative to a January reference date must roll back one year.
    assert (
        parse_statement_date("DIC/31", date_format="%b/%d", reference_date=date(2026, 1, 15))
        == "2025-12-31"
    )


def test_no_year_token_same_year_when_not_after_reference() -> None:
    assert (
        parse_statement_date("ENE/05", date_format="%b/%d", reference_date=date(2026, 1, 15))
        == "2026-01-05"
    )
