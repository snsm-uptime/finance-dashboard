"""Adapter contract output shape + section policy + identity (Story 4.4, AD-16/AD-18).

Pure domain: no FastAPI / SQLAlchemy / pdfplumber imports (AD-1). This module
defines what a bank adapter's parse() step must emit (CanonicalLine), the
per-section handling policy vocabulary, the dual-column amount normalization
rule (AC #4), and the canonical dedup identity computation (AC #5) — domain
alone computes identity; adapters never emit authoritative dedup keys.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from domain.errors import InvalidCanonicalLineError
from domain.expenses import PROVENANCE_PARSER
from domain.line_types import LINE_TYPES

SECTION_POLICY_MUST_PARSE = "must_parse"
SECTION_POLICY_BEST_EFFORT = "best_effort"
SECTION_POLICY_IGNORE = "ignore"
SECTION_POLICIES = frozenset(
    {SECTION_POLICY_MUST_PARSE, SECTION_POLICY_BEST_EFFORT, SECTION_POLICY_IGNORE}
)

REF_QUALITY_STABLE = "stable"
REF_QUALITY_DERIVED = "derived"
REF_QUALITY_ABSENT = "absent"
REF_QUALITIES = frozenset({REF_QUALITY_STABLE, REF_QUALITY_DERIVED, REF_QUALITY_ABSENT})


@dataclass(frozen=True, slots=True)
class CanonicalLine:
    """One normalized statement row emitted by a bank adapter's parse() step."""

    posted_date: str
    amount: Decimal
    currency: str
    product_id: str
    line_type: str
    normalized_description: str
    provenance: str = PROVENANCE_PARSER
    external_ref: str | None = None
    ref_quality: str | None = None


def validate_canonical_line(line: CanonicalLine) -> None:
    """Fail-loud guard an adapter's parse() runs per-row before returning a line.

    Turns a malformed adapter row into a raised error rather than a silent
    bad row (AC #3) — currency must be a 3-letter uppercase ISO 4217 code.
    """
    if line.line_type not in LINE_TYPES:
        raise InvalidCanonicalLineError(f"Unknown line_type: {line.line_type!r}.")
    if line.ref_quality is not None and line.ref_quality not in REF_QUALITIES:
        raise InvalidCanonicalLineError(f"Unknown ref_quality: {line.ref_quality!r}.")
    if len(line.currency) != 3 or not line.currency.isalpha() or not line.currency.isupper():
        raise InvalidCanonicalLineError(
            f"Currency must be a 3-letter uppercase code: {line.currency!r}."
        )


def normalize_dual_column_amount(crc_amount: Decimal, usd_amount: Decimal) -> tuple[str, Decimal]:
    """Collapse dual CRC/USD statement columns to a single (currency, amount).

    Rule (AC #4, project-context.md "Must-cover edges"): prefer the nonzero
    column; if both are nonzero, prefer CRC. When both are zero, returns
    ("CRC", 0) deterministically — the caller's section policy decides
    whether a zero-amount row is kept or ignored, this function only picks
    the currency.
    """
    if crc_amount != 0:
        return "CRC", crc_amount
    if usd_amount != 0:
        return "USD", usd_amount
    return "CRC", Decimal("0")


def compute_canonical_identity(line: CanonicalLine, *, statement_period_id: str) -> tuple:
    """Domain-owned canonical dedup identity (AC #5, AD-18).

    Adapters never emit authoritative dedup keys — only an optional
    ref_quality hint. A stable external_ref wins; otherwise identity falls
    back to a tuple of statement-row fields plus the statement_period_id.
    The leading "ref"/"fallback" discriminator prevents an external_ref
    string from ever colliding with a fallback tuple's shape.
    """
    if line.ref_quality == REF_QUALITY_STABLE and line.external_ref:
        return ("ref", line.external_ref)
    return (
        "fallback",
        line.product_id,
        line.posted_date,
        line.currency,
        line.amount,
        line.normalized_description,
        line.line_type,
        statement_period_id,
    )
