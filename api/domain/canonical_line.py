"""Adapter contract output shape + section policy + identity (Story 4.4, AD-16/AD-18).

Pure domain: no FastAPI / SQLAlchemy / pdfplumber imports (AD-1). This module
defines what a bank adapter's parse() step must emit (CanonicalLine), the
per-section handling policy vocabulary, the dual-column amount normalization
rule (AC #4), and the canonical dedup identity computation (AC #5) — domain
alone computes identity; adapters never emit authoritative dedup keys.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from decimal import Decimal
from hashlib import sha256

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


IDENTITY_KEY_VERSION = "v1"
# Numeric(18, 4) — the persisted scale. Serializing amounts at exactly this
# many places is what makes Decimal("10.5") and Decimal("10.50") one identity.
_IDENTITY_AMOUNT_PLACES = 4
_IDENTITY_AMOUNT_QUANTUM = Decimal(1).scaleb(-_IDENTITY_AMOUNT_PLACES)


def compute_canonical_identity(line: CanonicalLine) -> tuple:
    """Domain-owned canonical dedup identity (Story 4.4 AC #5, AD-18).

    Adapters never emit authoritative dedup keys — only an optional
    ref_quality hint. A stable external_ref wins; otherwise identity falls
    back to a tuple of the transaction's own statement-row fields. The
    leading "ref"/"fallback" discriminator prevents an external_ref string
    from ever colliding with a fallback tuple's shape.

    `statement_period_id` was removed from the fallback tuple by Story 4.12
    (AD-18 amended 2026-08-23). It was actively wrong: FR-20's overlap clause
    exists precisely for a transaction that appears on two overlapping
    statements — a January and a February statement both printing a purchase
    posted Jan 28. With the issuing statement's cycle in the tuple, that one
    transaction gets two identities and the duplicate commits, defeating the
    dedup the tuple is for. Only the transaction's own fields may participate,
    so the statement a row arrived on cannot change the answer.
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
    )


def canonical_identity_key(line: CanonicalLine) -> str:
    """Persistable form of `compute_canonical_identity` (Story 4.12, AC #2).

    Version-prefixed so a later identity-rule change is *detectable* rather
    than a silent dedup outage on rows fingerprinted under the old rule —
    old-rule rows simply stop matching new-rule lookups instead of matching
    the wrong thing.

    Two serialization details are load-bearing:

    - Amounts are rendered at a fixed 4 dp. `str(Decimal("10.5"))` and
      `str(Decimal("10.50"))` differ, so without this the *same* transaction
      re-parsed with a different trailing zero would produce two identities
      and dedup would miss it. Money never touches `float` here (AD-5).
    - Parts are JSON-encoded rather than joined on a delimiter: a description
      containing the delimiter would otherwise collide with a differently
      split neighbour.

    Rejects an amount finer than the persisted scale rather than silently
    rounding it: two distinct amounts differing only past the 4th decimal
    place must never collapse into one identity.
    """
    parts: list[str] = []
    for part in compute_canonical_identity(line):
        if isinstance(part, Decimal):
            if part.quantize(_IDENTITY_AMOUNT_QUANTUM) != part:
                raise InvalidCanonicalLineError(
                    f"Amount has more than {_IDENTITY_AMOUNT_PLACES} decimal places: {part!r}."
                )
            parts.append(f"{part:.{_IDENTITY_AMOUNT_PLACES}f}")
        else:
            parts.append(str(part))
    digest = sha256(
        json.dumps(parts, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    return f"{IDENTITY_KEY_VERSION}:{digest}"
