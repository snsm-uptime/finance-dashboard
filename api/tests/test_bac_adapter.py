"""Adapter-layer tests for BacCreditAdapter against the synthetic fixture (Story 4.4).

Contract layer: "CanonicalLine + fail-loud detect" from project-context.md.
Runs against the real synthetic fixture via pdfplumber, not fakes.
"""

from __future__ import annotations

import importlib.util
import io
from decimal import Decimal
from pathlib import Path

import pdfplumber
import pytest
from adapters.bank.bac_credit.adapter import BacCreditAdapter
from domain.errors import InvalidCanonicalLineError
from fpdf import FPDF

_FIXTURE_DIR = Path(__file__).parent / "fixtures" / "pdf"
_FIXTURE_PATH = _FIXTURE_DIR / "bac_credit_synthetic.pdf"
_GOLDENS_PATH = _FIXTURE_DIR / "bac_credit_synthetic_goldens.py"


def _load_goldens_module():
    spec = importlib.util.spec_from_file_location("bac_credit_synthetic_goldens", _GOLDENS_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


_goldens = _load_goldens_module()


@pytest.fixture
def fixture_bytes() -> bytes:
    return _FIXTURE_PATH.read_bytes()


@pytest.fixture
def adapter() -> BacCreditAdapter:
    return BacCreditAdapter()


def _assert_matches_golden(line, golden: dict[str, object]) -> None:
    assert line.posted_date == golden["posted_date"]
    assert line.amount == golden["amount"]
    assert isinstance(line.amount, Decimal)
    assert line.currency == golden["currency"]
    assert line.product_id == golden["product_id"]
    assert line.line_type == golden["line_type"]
    assert line.normalized_description == golden["normalized_description"]


def test_detect_returns_true_on_filename_containing_bac(adapter: BacCreditAdapter) -> None:
    assert adapter.detect(filename="BAC_estado_enero.pdf", content_sample=b"") is True


def test_detect_returns_false_on_unrelated_filename(adapter: BacCreditAdapter) -> None:
    assert adapter.detect(filename="promerica_statement.pdf", content_sample=b"") is False


def test_detect_recognizes_fixture_header_via_content_sniff_with_generic_filename(
    adapter: BacCreditAdapter, fixture_bytes: bytes
) -> None:
    assert adapter.detect(filename="statement.pdf", content_sample=fixture_bytes) is True


def test_detect_content_sniff_rejects_unrelated_content(adapter: BacCreditAdapter) -> None:
    assert adapter.detect(filename="statement.pdf", content_sample=b"not a bac statement") is False


def test_split_returns_expected_number_of_statement_chunks(
    adapter: BacCreditAdapter, fixture_bytes: bytes
) -> None:
    chunks = adapter.split(fixture_bytes)
    assert len(chunks) == 3


def test_parse_statement_one_matches_goldens_row_for_row(
    adapter: BacCreditAdapter, fixture_bytes: bytes
) -> None:
    chunks = adapter.split(fixture_bytes)
    rows = adapter.parse(chunks[0])
    assert len(rows) == len(_goldens.STATEMENT_1_GOLDENS)
    for line, golden in zip(rows, _goldens.STATEMENT_1_GOLDENS, strict=True):
        _assert_matches_golden(line, golden)


def test_parse_statement_two_matches_goldens_row_for_row(
    adapter: BacCreditAdapter, fixture_bytes: bytes
) -> None:
    chunks = adapter.split(fixture_bytes)
    rows = adapter.parse(chunks[1])
    assert len(rows) == len(_goldens.STATEMENT_2_GOLDENS)
    for line, golden in zip(rows, _goldens.STATEMENT_2_GOLDENS, strict=True):
        _assert_matches_golden(line, golden)


def test_parse_dual_column_both_nonzero_prefers_crc(
    adapter: BacCreditAdapter, fixture_bytes: bytes
) -> None:
    chunks = adapter.split(fixture_bytes)
    rows = adapter.parse(chunks[0])
    farmacia = next(r for r in rows if r.normalized_description == "FARMACIA CENTRAL")
    assert farmacia.currency == "CRC"
    assert farmacia.amount == Decimal("8250.00")


def test_parse_dual_column_usd_only_picks_usd(
    adapter: BacCreditAdapter, fixture_bytes: bytes
) -> None:
    chunks = adapter.split(fixture_bytes)
    rows = adapter.parse(chunks[0])
    amazon = next(r for r in rows if r.normalized_description == "AMAZON US")
    assert amazon.currency == "USD"
    assert amazon.amount == Decimal("45.00")


def test_parse_balance_forward_section_emits_no_canonical_line(
    adapter: BacCreditAdapter, fixture_bytes: bytes
) -> None:
    chunks = adapter.split(fixture_bytes)
    rows = adapter.parse(chunks[0])
    assert all(r.line_type != "balance_forward" for r in rows)
    descriptions = [r.normalized_description for r in rows]
    assert "SALDO ANTERIOR" not in descriptions


def test_parse_unmapped_section_raises_rather_than_silently_dropping(
    adapter: BacCreditAdapter, fixture_bytes: bytes
) -> None:
    chunks = adapter.split(fixture_bytes)
    with pytest.raises(InvalidCanonicalLineError):
        adapter.parse(chunks[2])


def test_split_records_which_boundary_method_fired(
    adapter: BacCreditAdapter, fixture_bytes: bytes
) -> None:
    adapter.split(fixture_bytes)
    assert adapter.last_split_boundary_method == "repeating_marker_guess"


def _one_page_statement_pdf(lines: list[str]) -> bytes:
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Courier", size=9)
    for line in lines:
        pdf.cell(0, 5, line, new_x="LMARGIN", new_y="NEXT")
    return bytes(pdf.output())


def test_parse_malformed_date_raises_invalid_canonical_line_error_not_raw_exception(
    adapter: BacCreditAdapter,
) -> None:
    pdf_bytes = _one_page_statement_pdf(
        [
            "ESTADO DE CUENTA BAC CREDITO",
            "Detalle de compras",
            "05-XXX-26|BAD MONTH ABBREV|10,500.00|-",
        ]
    )
    with pytest.raises(InvalidCanonicalLineError):
        adapter.parse(pdf_bytes)


def test_parse_malformed_row_field_count_raises_invalid_canonical_line_error(
    adapter: BacCreditAdapter,
) -> None:
    pdf_bytes = _one_page_statement_pdf(
        [
            "ESTADO DE CUENTA BAC CREDITO",
            "Detalle de compras",
            "05-ENE-26|MISSING A FIELD|10,500.00",
        ]
    )
    with pytest.raises(InvalidCanonicalLineError):
        adapter.parse(pdf_bytes)


def test_parse_unreadable_pdf_bytes_raises_invalid_canonical_line_error(
    adapter: BacCreditAdapter,
) -> None:
    with pytest.raises(InvalidCanonicalLineError):
        adapter.parse(b"not a pdf at all")


def test_split_unreadable_pdf_bytes_raises_invalid_canonical_line_error(
    adapter: BacCreditAdapter,
) -> None:
    with pytest.raises(InvalidCanonicalLineError):
        adapter.split(b"not a pdf at all")


def test_split_retains_leading_pages_before_first_marker(adapter: BacCreditAdapter) -> None:
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Courier", size=9)
    pdf.cell(0, 5, "Cover page with no statement marker", new_x="LMARGIN", new_y="NEXT")
    pdf.add_page()
    pdf.set_font("Courier", size=9)
    pdf.cell(0, 5, "ESTADO DE CUENTA BAC CREDITO", new_x="LMARGIN", new_y="NEXT")
    pdf_bytes = bytes(pdf.output())

    chunks = adapter.split(pdf_bytes)

    # The cover page is never dropped: it surfaces as its own leading chunk
    # (empty of statement rows) rather than being silently excluded.
    assert len(chunks) == 2
    with pdfplumber.open(io.BytesIO(chunks[0])) as doc:
        assert "Cover page with no statement marker" in (doc.pages[0].extract_text() or "")
    with pdfplumber.open(io.BytesIO(chunks[1])) as doc:
        assert "ESTADO DE CUENTA BAC CREDITO" in (doc.pages[0].extract_text() or "")


def test_parse_is_deterministic_across_repeated_calls(
    adapter: BacCreditAdapter, fixture_bytes: bytes
) -> None:
    chunks = adapter.split(fixture_bytes)
    first_pass = adapter.parse(chunks[0])
    second_pass = adapter.parse(chunks[0])
    assert first_pass == second_pass
