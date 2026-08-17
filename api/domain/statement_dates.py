"""Shared per-product date-format contract (AD-26).

Adapters declare a date_format token string built from a small fixed
vocabulary (%d day, %b Spanish month abbreviation, %y 2-digit year) joined
by "-" or "/" — e.g. "%d-%b-%y" for BAC credit's DD-MMM-YY, "%b/%d" for BAC
debit's MMM/DD. Resolved here against a fixed Spanish-month table, never
against datetime's locale machinery (locale is not guaranteed es_CR).

Formats with no %y token require a reference_date (the source PDF's
/CreationDate, read once per statement chunk) — the row's year is assigned
the nearest year at or before reference_date (mirrors AD-7's FX
nearest-prior-date fallback), not inferred via ad-hoc per-row logic.
"""

from __future__ import annotations

from datetime import date

SPANISH_MONTHS: dict[str, int] = {
    "ENE": 1,
    "FEB": 2,
    "MAR": 3,
    "ABR": 4,
    "MAY": 5,
    "JUN": 6,
    "JUL": 7,
    "AGO": 8,
    "SEP": 9,
    "OCT": 10,
    "NOV": 11,
    "DIC": 12,
}

_SUPPORTED_TOKENS = frozenset({"%d", "%b", "%y"})


def _split_on_declared_separator(value: str, date_format: str) -> list[str]:
    for sep in ("-", "/"):
        if sep in date_format:
            return [part.strip() for part in value.strip().split(sep)]
    raise ValueError(f"date_format {date_format!r} has no recognized separator")


def parse_statement_date(raw: str, *, date_format: str, reference_date: date | None = None) -> str:
    """Parse a statement date token against a declared format, returning ISO-8601."""
    format_tokens = [t for t in date_format.replace("/", "-").split("-") if t]
    unsupported = [t for t in format_tokens if t not in _SUPPORTED_TOKENS]
    if unsupported:
        raise ValueError(f"Unsupported date_format token(s): {unsupported!r}")

    value_tokens = _split_on_declared_separator(raw, date_format)
    if len(format_tokens) != len(value_tokens):
        raise ValueError(f"Date {raw!r} does not match format {date_format!r}")

    day: int | None = None
    month: int | None = None
    year: int | None = None
    for fmt_token, value_token in zip(format_tokens, value_tokens, strict=True):
        if fmt_token == "%d":
            day = int(value_token)
        elif fmt_token == "%b":
            month = SPANISH_MONTHS[value_token.upper()]
        elif fmt_token == "%y":
            year = 2000 + int(value_token)

    if day is None or month is None:
        raise ValueError(f"date_format {date_format!r} must declare both %d and %b")

    if year is None:
        if reference_date is None:
            raise ValueError(
                f"date_format {date_format!r} has no %y token; reference_date is required"
            )
        year = reference_date.year
        if date(year, month, day) > reference_date:
            year -= 1

    return f"{year:04d}-{month:02d}-{day:02d}"
