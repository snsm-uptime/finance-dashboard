"""Domain tests for parse-failure evidence (Story 5.1)."""

from __future__ import annotations

from decimal import Decimal

import pytest
from domain.canonical_line import CanonicalLine
from domain.parse_evidence import ParseEvidence, parse_evidence_from_rows


def test_parse_evidence_row_amounts_are_strings_never_float() -> None:
    row = CanonicalLine(
        posted_date="2026-01-05",
        amount=Decimal("1000.00"),
        currency="CRC",
        product_id="promerica_stub",
        line_type="purchase",
        normalized_description="COMERCIO GENERICO UNO",
    )
    evidence = parse_evidence_from_rows(rows=[row], gap_raw="07-ENE-26|COMERCIO GENERICO MALO|bad")
    payload = evidence.to_json()
    assert payload["items"][0]["kind"] == "row"
    assert payload["items"][0]["amount"] == "1000.00"
    assert isinstance(payload["items"][0]["amount"], str)
    assert payload["items"][1]["kind"] == "gap"
    restored = ParseEvidence.from_json(payload)
    assert restored is not None
    assert restored.items[0].amount == "1000.00"


def test_parse_evidence_from_json_rejects_float_amount() -> None:
    with pytest.raises(TypeError):
        ParseEvidence.from_json(
            {
                "items": [
                    {
                        "kind": "row",
                        "description": "x",
                        "amount": 10.5,
                        "currency": "CRC",
                        "posted_date": "2026-01-01",
                    }
                ]
            }
        )
