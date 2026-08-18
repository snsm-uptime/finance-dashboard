"""CI release-gate test for the BAC credit-card acceptance bar (Story 4.5, AC #1, Task 2.5).

Distinct from Story 4.4's test_bac_adapter.py, which exercises the smaller
`bac_credit_synthetic.pdf` proving fixture. This test runs the bigger
`bac_credit_acceptance_bar.pdf` (Task 2.2) through the full real pipeline —
detect_bank_adapter() (content-signature path, not override) ->
BacCreditAdapter.split() -> .parse() — and asserts the result equals the
golden file exactly, field for field. "Zero manual edits" (FR-35) means this
assertion is direct equality against the golden data, not a hand-adjusted
expectation.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from adapters.bank.bac_credit.adapter import BacCreditAdapter
from application.bank_adapters import detect_bank_adapter
from domain.canonical_line import CanonicalLine

_FIXTURE_DIR = Path(__file__).parent / "fixtures" / "pdf"
_FIXTURE_PATH = _FIXTURE_DIR / "bac_credit_acceptance_bar.pdf"
_GOLDENS_PATH = _FIXTURE_DIR / "bac_credit_acceptance_bar_goldens.py"


def _load_goldens_module():
    spec = importlib.util.spec_from_file_location(
        "bac_credit_acceptance_bar_goldens", _GOLDENS_PATH
    )
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


_goldens = _load_goldens_module()


def _line_to_dict(line: CanonicalLine) -> dict[str, object]:
    return {
        "posted_date": line.posted_date,
        "amount": line.amount,
        "currency": line.currency,
        "product_id": line.product_id,
        "line_type": line.line_type,
        "normalized_description": line.normalized_description,
        "provenance": line.provenance,
        "external_ref": line.external_ref,
        "ref_quality": line.ref_quality,
    }


def test_bac_credit_acceptance_bar_parses_exactly_to_goldens_zero_manual_edits() -> None:
    pdf_bytes = _FIXTURE_PATH.read_bytes()

    adapter = detect_bank_adapter(
        [BacCreditAdapter()],
        override=None,
        filename="estado_cuenta.pdf",  # Generic filename: forces the content-signature path.
        content_sample=pdf_bytes,
    )
    assert adapter.bank_id == "bac"
    assert adapter.product_id == "bac_credit"

    chunks = adapter.split(pdf_bytes)
    assert len(chunks) == 1  # Single-cardholder fixture -> exactly one statement.

    rows = adapter.parse(chunks[0])

    assert [_line_to_dict(line) for line in rows] == _goldens.GOLDENS
    for line in rows:
        assert isinstance(line.amount, type(_goldens.GOLDENS[0]["amount"]))  # Decimal, never float.
