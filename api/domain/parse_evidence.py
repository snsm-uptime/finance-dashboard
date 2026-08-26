"""Display-only parse-failure evidence (Story 5.1). Not candidate rows.

Pure domain: no FastAPI / SQLAlchemy / pdfplumber (AD-1). Amounts are
strings so the JSON boundary never serializes money as a number (AD-5).
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Literal

ParseEvidenceKind = Literal["row", "gap"]


@dataclass(frozen=True, slots=True)
class ParseEvidenceItem:
    kind: ParseEvidenceKind
    description: str | None = None
    amount: str | None = None
    currency: str | None = None
    posted_date: str | None = None
    raw_snippet: str | None = None


@dataclass(frozen=True, slots=True)
class ParseEvidence:
    items: tuple[ParseEvidenceItem, ...]

    def to_json(self) -> dict[str, Any]:
        return {"items": [_item_to_json(item) for item in self.items]}

    @classmethod
    def from_json(cls, data: object) -> ParseEvidence | None:
        if not isinstance(data, Mapping):
            return None
        raw_items = data.get("items")
        if not isinstance(raw_items, Sequence) or isinstance(raw_items, (str, bytes)):
            return None
        items: list[ParseEvidenceItem] = []
        for raw in raw_items:
            item = _item_from_json(raw)
            if item is not None:
                items.append(item)
        if not items:
            return None
        return cls(items=tuple(items))


def parse_evidence_from_rows(
    *,
    rows: Sequence[Any],
    gap_raw: str,
) -> ParseEvidence:
    """Validated CanonicalLine-shaped rows plus the fail-loud gap snippet."""
    items: list[ParseEvidenceItem] = []
    for row in rows:
        amount = row.amount
        amount_str = amount if isinstance(amount, str) else str(amount)
        if isinstance(amount, float):  # pragma: no cover — adapters use Decimal
            raise TypeError("parse evidence amounts must not be float")
        items.append(
            ParseEvidenceItem(
                kind="row",
                description=str(row.normalized_description),
                amount=amount_str,
                currency=str(row.currency),
                posted_date=str(row.posted_date),
            )
        )
    items.append(ParseEvidenceItem(kind="gap", raw_snippet=gap_raw))
    return ParseEvidence(items=tuple(items))


def parse_evidence_gap_only(gap_raw: str) -> ParseEvidence:
    return ParseEvidence(items=(ParseEvidenceItem(kind="gap", raw_snippet=gap_raw),))


def _item_to_json(item: ParseEvidenceItem) -> dict[str, Any]:
    payload: dict[str, Any] = {"kind": item.kind}
    if item.kind == "row":
        payload["description"] = item.description
        payload["amount"] = item.amount
        payload["currency"] = item.currency
        payload["posted_date"] = item.posted_date
    else:
        payload["raw_snippet"] = item.raw_snippet
    return payload


def _item_from_json(raw: object) -> ParseEvidenceItem | None:
    if not isinstance(raw, Mapping):
        return None
    kind = raw.get("kind")
    if kind == "row":
        amount = raw.get("amount")
        if isinstance(amount, float):
            raise TypeError("parse evidence amounts must not be float")
        if isinstance(amount, Decimal):
            amount = str(amount)
        if amount is not None and not isinstance(amount, str):
            amount = str(amount)
        description = raw.get("description")
        currency = raw.get("currency")
        posted_date = raw.get("posted_date")
        return ParseEvidenceItem(
            kind="row",
            description=description if isinstance(description, str) else None,
            amount=amount if isinstance(amount, str) else None,
            currency=currency if isinstance(currency, str) else None,
            posted_date=posted_date if isinstance(posted_date, str) else None,
        )
    if kind == "gap":
        snippet = raw.get("raw_snippet")
        return ParseEvidenceItem(
            kind="gap",
            raw_snippet=snippet if isinstance(snippet, str) else None,
        )
    return None
