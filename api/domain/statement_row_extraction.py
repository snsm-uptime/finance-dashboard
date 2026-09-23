"""Shared real-text row recognition + amount-column role (AD-28).

Promoted from `scripts/statement_recon.py`'s proven `_has_date_token` /
`_amount_tokens` regex classifier. Adapters MUST use this shared classifier
instead of a private delimiter check (e.g. a literal "|").

Pure domain: no pdfplumber import (AD-1). Inputs are plain strings the
adapter already extracted.
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass, field
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


@dataclass(frozen=True, slots=True)
class SignVariantRanges:
    """Construction-time-validated x-position ranges for AD-28's SIGN_VARIANT role.

    `ranges` maps an outcome name (e.g. "debitos"/"creditos") to an
    (x0, x1) span. Validated eagerly here — missing, reversed, or
    overlapping ranges raise `ValueError` at construction, never deferred to
    resolution time (AD-28's construction-time validation rule). Adapters
    call this from their own `__init__`/module load, not `parse()`.
    """

    ranges: Mapping[str, tuple[float, float]] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not self.ranges:
            raise ValueError("SignVariantRanges requires at least one declared range.")

        spans: list[tuple[str, float, float]] = []
        for name, (low, high) in self.ranges.items():
            if low >= high:
                raise ValueError(
                    f"Range {name!r} must be declared low < high (order matters): ({low}, {high})."
                )
            spans.append((name, low, high))

        spans.sort(key=lambda item: item[1])
        for (name_a, _, high_a), (name_b, low_b, _) in zip(spans, spans[1:], strict=False):
            if high_a > low_b:
                raise ValueError(f"Ranges {name_a!r} and {name_b!r} overlap.")


def resolve_sign_variant_column(
    x0: float, x1: float, ranges: Mapping[str, tuple[float, float]]
) -> str:
    """Resolve which declared range an amount token's x-position belongs to (AD-28).

    Uses the fixed-metric rule: midpoint-to-midpoint distance, smallest wins —
    never "inside range" containment, which would fail to resolve a token
    that falls just outside a range due to documented page-to-page drift.
    Callers validate `ranges` via `SignVariantRanges` at construction time;
    this function assumes it has already been validated.
    """
    token_mid = (x0 + x1) / 2
    return min(
        ranges,
        key=lambda name: abs(token_mid - (ranges[name][0] + ranges[name][1]) / 2),
    )


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
