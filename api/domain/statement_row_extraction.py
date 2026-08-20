"""Shared real-text row recognition + amount-column role (AD-28).

Promoted from `scripts/statement_recon.py`'s proven `_has_date_token` /
`_amount_tokens` regex classifier. Adapters MUST use this shared classifier
instead of a private delimiter check (e.g. a literal "|").

Pure domain: no pdfplumber import (AD-1). Inputs are plain strings the
adapter already extracted.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import StrEnum

_SPANISH_MONTHS = "ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC"
_DATE_MONTH_RE = re.compile(r"\b\d{1,2}[-/][A-ZÁÉÍÓÚÑ]{3,4}[-/]\d{2,4}\b", re.IGNORECASE)
_DATE_MONTH_DAY_RE = re.compile(rf"\b({_SPANISH_MONTHS})/\d{{1,2}}\b", re.IGNORECASE)
_DATE_NUMERIC_RE = re.compile(r"\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b")

# Default amount shape: #,###.## with optional trailing minus ("3,706.90-").
# `(?!\d)` keeps the original recon `\b` terminator's "don't eat into a longer
# digit run" intent so a European `12.850,00` is not a false-positive `12.85`.
# Overridable per product (AD-28), mirroring AD-26's declared date_format.
DEFAULT_AMOUNT_PATTERN = r"\b\d{1,3}(?:,\d{3})*\.\d{2}-?(?!\d)"


class AmountColumnRole(StrEnum):
    """Product-level amount-column semantics (AD-28). Declared once per product."""

    CURRENCY_VARIANT = "currency_variant"
    SIGN_VARIANT = "sign_variant"


@dataclass(frozen=True, slots=True)
class ExtractedRowTokens:
    """Regex-only split of a recognized data-row line."""

    date: str | None
    amounts: tuple[str, ...]
    description: str


def _amount_re(amount_pattern: str | None) -> re.Pattern[str]:
    return re.compile(amount_pattern or DEFAULT_AMOUNT_PATTERN)


def _has_date_token(line: str) -> bool:
    return bool(
        _DATE_MONTH_RE.search(line)
        or _DATE_MONTH_DAY_RE.search(line)
        or _DATE_NUMERIC_RE.search(line)
    )


def _first_date_token(line: str) -> str | None:
    match = (
        _DATE_MONTH_RE.search(line)
        or _DATE_MONTH_DAY_RE.search(line)
        or _DATE_NUMERIC_RE.search(line)
    )
    return match.group(0) if match else None


def is_data_row(
    line: str,
    *,
    requires_date: bool = True,
    amount_pattern: str | None = None,
) -> bool:
    """Classify a statement line as a data row without requiring a delimiter.

    Default rule (AD-28): date-shaped token AND at least one amount-shaped
    token. `requires_date=False` is the per-section escape hatch for rows that
    print amounts but no date (BAC credit interest).
    """
    if not _amount_re(amount_pattern).search(line):
        return False
    if not requires_date:
        return True
    return _has_date_token(line)


def extract_row_tokens(
    line: str,
    *,
    requires_date: bool = True,
    amount_pattern: str | None = None,
) -> ExtractedRowTokens:
    """Return date (or None), amount substring(s), and remaining description."""
    amounts = tuple(_amount_re(amount_pattern).findall(line))
    date_token = _first_date_token(line) if requires_date else None

    remainder = line
    if date_token:
        remainder = remainder.replace(date_token, " ", 1)
    for amount in amounts:
        remainder = remainder.replace(amount, " ", 1)
    description = " ".join(remainder.split())

    return ExtractedRowTokens(date=date_token, amounts=amounts, description=description)
