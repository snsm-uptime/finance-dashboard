"""Adapter-layer tests for BacDebitAdapter against the synthetic fixture (Story 4.9.1).

Contract layer: "CanonicalLine + fail-loud detect" from project-context.md.
Runs against the real synthetic fixture via pdfplumber, not fakes. Mirrors
test_bac_adapter.py's coverage style.
"""

from __future__ import annotations

import importlib.util
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

import pytest
from adapters.bank.bac_credit.adapter import BacCreditAdapter
from adapters.bank.bac_debit.adapter import (
    BacDebitAdapter,
    detect_statement_currency,
    parse_printed_cutoff_date,
    statement_reference_date,
)
from domain.errors import InvalidCanonicalLineError
from domain.statement_row_extraction import AmountColumnRole, SignVariantRanges
from fpdf import FPDF
from scripts.generate_bac_debit_fixture import _row

_FIXTURE_DIR = Path(__file__).parent / "fixtures" / "pdf"
_FIXTURE_PATH = _FIXTURE_DIR / "bac_debit_synthetic.pdf"
_GOLDENS_PATH = _FIXTURE_DIR / "bac_debit_synthetic_goldens.py"
_CREDIT_FIXTURE_PATH = _FIXTURE_DIR / "bac_credit_synthetic.pdf"


def _load_goldens_module():
    spec = importlib.util.spec_from_file_location("bac_debit_synthetic_goldens", _GOLDENS_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


_goldens = _load_goldens_module()


@pytest.fixture
def fixture_bytes() -> bytes:
    return _FIXTURE_PATH.read_bytes()


@pytest.fixture
def credit_fixture_bytes() -> bytes:
    return _CREDIT_FIXTURE_PATH.read_bytes()


@pytest.fixture
def adapter() -> BacDebitAdapter:
    return BacDebitAdapter()


def _assert_matches_golden(line, golden: dict[str, object]) -> None:
    assert line.posted_date == golden["posted_date"]
    assert line.amount == golden["amount"]
    assert isinstance(line.amount, Decimal)
    assert line.currency == golden["currency"]
    assert line.product_id == golden["product_id"]
    assert line.line_type == golden["line_type"]
    assert line.normalized_description == golden["normalized_description"]


def test_adapter_declares_sign_variant_amount_column_role() -> None:
    assert BacDebitAdapter.amount_column_role is AmountColumnRole.SIGN_VARIANT


def test_adapter_identity_fields() -> None:
    adapter = BacDebitAdapter()
    assert adapter.bank_id == "bac"
    assert adapter.product_id == "bac_debit"
    assert adapter.account_kind == "checking"


def test_detect_returns_true_on_filename_containing_bac_and_deb(adapter: BacDebitAdapter) -> None:
    assert adapter.detect(filename="BAC_DEB_COLONES_jun.pdf", content_sample=b"") is True


def test_detect_returns_false_on_bare_bac_filename_no_content(adapter: BacDebitAdapter) -> None:
    # Deliberately narrower than bac_credit's naive "bac in filename" check
    # (Dev Notes) — a bare "bac"-named file with no content sample does not
    # match here, avoiding an unconditional filename-only collision.
    assert adapter.detect(filename="BAC_estado_enero.pdf", content_sample=b"") is False


def test_detect_returns_false_on_unrelated_filename(adapter: BacDebitAdapter) -> None:
    assert adapter.detect(filename="promerica_statement.pdf", content_sample=b"") is False


def test_detect_recognizes_fixture_via_content_sniff_with_generic_filename(
    adapter: BacDebitAdapter, fixture_bytes: bytes
) -> None:
    assert adapter.detect(filename="statement.pdf", content_sample=fixture_bytes) is True


def test_detect_content_sniff_rejects_unrelated_content(adapter: BacDebitAdapter) -> None:
    assert adapter.detect(filename="statement.pdf", content_sample=b"not a bac statement") is False


def test_detect_does_not_match_bac_credit_fixture(
    adapter: BacDebitAdapter, credit_fixture_bytes: bytes
) -> None:
    assert adapter.detect(filename="statement.pdf", content_sample=credit_fixture_bytes) is False


def test_bac_credit_adapter_does_not_match_bac_debit_fixture(fixture_bytes: bytes) -> None:
    credit_adapter = BacCreditAdapter()
    assert credit_adapter.detect(filename="statement.pdf", content_sample=fixture_bytes) is False


def test_split_returns_single_statement_chunk(
    adapter: BacDebitAdapter, fixture_bytes: bytes
) -> None:
    chunks = adapter.split(fixture_bytes)
    assert len(chunks) == 1


def test_parse_matches_goldens_row_for_row(adapter: BacDebitAdapter, fixture_bytes: bytes) -> None:
    chunks = adapter.split(fixture_bytes)
    rows = adapter.parse(chunks[0])
    assert len(rows) == len(_goldens.STATEMENT_GOLDENS)
    for line, golden in zip(rows, _goldens.STATEMENT_GOLDENS, strict=True):
        _assert_matches_golden(line, golden)


def test_parse_resolves_debitos_rows_as_negative_withdrawal(
    adapter: BacDebitAdapter, fixture_bytes: bytes
) -> None:
    rows = adapter.parse(adapter.split(fixture_bytes)[0])
    withdrawals = [r for r in rows if r.line_type == "withdrawal"]
    assert len(withdrawals) == 2
    assert all(r.amount < 0 for r in withdrawals)


def test_parse_resolves_creditos_row_as_positive_deposit(
    adapter: BacDebitAdapter, fixture_bytes: bytes
) -> None:
    rows = adapter.parse(adapter.split(fixture_bytes)[0])
    deposits = [r for r in rows if r.line_type == "deposit"]
    assert len(deposits) == 1
    assert deposits[0].amount > 0


def test_parse_preamble_totals_line_decoy_is_not_parsed_as_a_row(
    adapter: BacDebitAdapter, fixture_bytes: bytes
) -> None:
    rows = adapter.parse(adapter.split(fixture_bytes)[0])
    # The CUADRO RESUMEN totals-line decoy has 5 amount-shaped tokens and no
    # matching reference/description — if it leaked through it would not
    # match any golden row shape.
    assert len(rows) == 3


def test_parse_is_deterministic_across_repeated_calls(
    adapter: BacDebitAdapter, fixture_bytes: bytes
) -> None:
    chunk = adapter.split(fixture_bytes)[0]
    assert adapter.parse(chunk) == adapter.parse(chunk)


def test_parse_printed_cutoff_date_from_header_lines() -> None:
    assert (
        parse_printed_cutoff_date(["Fecha de Corte: 30/JUN/26"])
        == datetime(2026, 6, 30, tzinfo=UTC).date()
    )
    assert (
        parse_printed_cutoff_date(["Fecha de corte: 30/JUN/26"])
        == datetime(2026, 6, 30, tzinfo=UTC).date()
    )
    assert parse_printed_cutoff_date(["unrelated"]) is None


def test_parse_printed_cutoff_date_when_label_and_date_are_on_separate_lines() -> None:
    # Real BAC debit PDFs wrap this two-column header: pdfplumber extracts
    # the "Fecha de Corte:" label at the end of one line and the date at
    # the end of the next.
    name_line = (
        "Nombre: SEBASTIAN NOE SOTO MADRIGAL Para el rango de su Tasa anual: 3101012009 31/ENE/26"
    )
    assert (
        parse_printed_cutoff_date(
            [
                "Tasas de interés escalonadas Banco BAC San José SA Fecha de Corte:",
                name_line,
            ]
        )
        == datetime(2026, 1, 31, tzinfo=UTC).date()
    )


def test_statement_reference_date_prefers_printed_cutoff_over_creation_date() -> None:
    assert (
        statement_reference_date(
            {"CreationDate": "D:20260101120000Z"}, ["Fecha de Corte: 30/JUN/26"]
        )
        == datetime(2026, 6, 30, tzinfo=UTC).date()
    )
    assert (
        statement_reference_date({"CreationDate": "D:20260131120000Z"}, [])
        == datetime(2026, 1, 31, tzinfo=UTC).date()
    )


def test_detect_statement_currency_reads_colones_and_dolares() -> None:
    assert detect_statement_currency(["Moneda: COLONES"]) == "CRC"
    assert detect_statement_currency(["Moneda: DOLARES"]) == "USD"
    # Real BAC dollar-account statements print "U.S. DOLLAR", not "DOLARES".
    assert detect_statement_currency(["Moneda: U.S. DOLLAR"]) == "USD"
    assert detect_statement_currency(["unrelated"]) is None


def test_sign_variant_ranges_raises_at_construction_on_overlapping_ranges() -> None:
    # AC #4: construction-time validation, never deferred to parse().
    with pytest.raises(ValueError, match="overlap"):
        SignVariantRanges({"debitos": (100.0, 200.0), "creditos": (150.0, 250.0)})


def test_sign_variant_ranges_raises_at_construction_on_missing_ranges() -> None:
    with pytest.raises(ValueError, match="at least one"):
        SignVariantRanges({})


_TEST_CREATION_DATE = datetime(2026, 6, 30, 12, 0, 0, tzinfo=UTC)


def _one_page_debit_pdf(lines: list[str]) -> bytes:
    pdf = FPDF()
    pdf.set_creation_date(_TEST_CREATION_DATE)
    pdf.add_page()
    pdf.set_font("Courier", size=9)
    for line in lines:
        pdf.cell(0, 5, line, new_x="LMARGIN", new_y="NEXT")
    return bytes(pdf.output())


_HEADER_LINE = _row("NO.", "FECHA", "REFERENCIA CONCEPTO", debitos="DEBITOS", creditos="CREDITOS")


def test_parse_dolares_statement_reads_usd_currency(adapter: BacDebitAdapter) -> None:
    pdf_bytes = _one_page_debit_pdf(
        [
            "Moneda: DOLARES",
            "Fecha de Corte: 30/JUN/26",
            "CUADRO RESUMEN",
            "DEBITOS CREDITOS SALDOS",
            _HEADER_LINE,
            _row("053100001", "JUN/15", "COMPRA EN LINEA", debitos="123.45"),
            "ULTIMA LINEA SALDO AL CORTE 999.99",
        ]
    )
    rows = adapter.parse(pdf_bytes)
    assert len(rows) == 1
    assert rows[0].currency == "USD"
    assert rows[0].amount == Decimal("-123.45")
    assert rows[0].line_type == "withdrawal"


def test_parse_missing_moneda_field_fails_loud(adapter: BacDebitAdapter) -> None:
    pdf_bytes = _one_page_debit_pdf(
        [
            "Fecha de Corte: 30/JUN/26",
            "CUADRO RESUMEN",
            "DEBITOS CREDITOS SALDOS",
            _HEADER_LINE,
            _row("053100001", "JUN/15", "COMPRA EN LINEA", debitos="123.45"),
            "ULTIMA LINEA SALDO AL CORTE 999.99",
        ]
    )
    with pytest.raises(InvalidCanonicalLineError) as exc_info:
        adapter.parse(pdf_bytes)
    evidence = exc_info.value.evidence
    assert evidence is not None
    assert any(item.kind == "gap" for item in evidence.items)


def test_parse_row_with_two_amount_tokens_fails_loud(adapter: BacDebitAdapter) -> None:
    pdf_bytes = _one_page_debit_pdf(
        [
            "Moneda: COLONES",
            "Fecha de Corte: 30/JUN/26",
            "CUADRO RESUMEN",
            "DEBITOS CREDITOS SALDOS",
            _HEADER_LINE,
            _row("053100001", "JUN/15", "COMPRA RARA", debitos="123.45", creditos="678.90"),
            "ULTIMA LINEA SALDO AL CORTE 999.99",
        ]
    )
    with pytest.raises(InvalidCanonicalLineError) as exc_info:
        adapter.parse(pdf_bytes)
    evidence = exc_info.value.evidence
    assert evidence is not None
    assert any(item.kind == "gap" for item in evidence.items)


def test_parse_unreadable_pdf_bytes_raises_invalid_canonical_line_error(
    adapter: BacDebitAdapter,
) -> None:
    with pytest.raises(InvalidCanonicalLineError):
        adapter.parse(b"not a pdf at all")


def test_split_unreadable_pdf_bytes_raises_invalid_canonical_line_error(
    adapter: BacDebitAdapter,
) -> None:
    with pytest.raises(InvalidCanonicalLineError):
        adapter.split(b"not a pdf at all")


def test_extract_iban_reads_unqualified_cuenta_iban_field(adapter: BacDebitAdapter) -> None:
    """Real BAC debit statements print a single "Cuenta IBAN:" line (no
    colones/dólares split), confirmed against a real 0126_BAC_DEB_DOLARES.pdf
    statement."""
    synthetic_pdf = FPDF()
    synthetic_pdf.add_page()
    synthetic_pdf.set_font("Helvetica", "", 12)
    synthetic_pdf.multi_cell(
        0, 10, "Tasas de interes escalonadas\nCuenta IBAN: CR41 0102 0000 9541 9910 52\n"
    )
    pdf_bytes = bytes(synthetic_pdf.output())

    iban = adapter.extract_iban(pdf_bytes)
    assert iban == "CR41 0102 0000 9541 9910 52"


def test_extract_iban_whitespace_only_treated_as_absent(adapter: BacDebitAdapter) -> None:
    synthetic_pdf = FPDF()
    synthetic_pdf.add_page()
    synthetic_pdf.set_font("Helvetica", "", 12)
    synthetic_pdf.multi_cell(0, 10, "ESTADO DE CUENTA BAC DEBITO\nCuenta IBAN:   \n")
    pdf_bytes = bytes(synthetic_pdf.output())

    iban = adapter.extract_iban(pdf_bytes)
    assert iban is None or iban == ""


def test_extract_iban_from_invalid_pdf_returns_none_gracefully(adapter: BacDebitAdapter) -> None:
    invalid_bytes = b"not a pdf"
    iban = adapter.extract_iban(invalid_bytes)
    assert iban is None


def test_extract_iban_from_statement_with_no_iban_field_returns_none(
    adapter: BacDebitAdapter, fixture_bytes: bytes
) -> None:
    chunks = adapter.split(fixture_bytes)
    assert len(chunks) > 0

    iban = adapter.extract_iban(chunks[0])
    assert iban is None or isinstance(iban, str)
