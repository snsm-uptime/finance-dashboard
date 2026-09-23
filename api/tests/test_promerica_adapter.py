"""Adapter-layer tests for PromericaAdapter against the synthetic fixture (Story 4.9.2).

Contract layer: "CanonicalLine + fail-loud detect" from project-context.md.
Runs against the real synthetic fixture via pdfplumber, not fakes.
"""

from __future__ import annotations

import importlib.util
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

import pytest
from adapters.bank import ADAPTERS
from adapters.bank.bac_credit.adapter import BacCreditAdapter
from adapters.bank.promerica.adapter import _SECTIONS, PromericaAdapter
from application.bank_adapters import detect_bank_adapter
from domain.canonical_line import (
    SECTION_POLICY_BEST_EFFORT,
    SECTION_POLICY_IGNORE,
    SECTION_POLICY_MUST_PARSE,
)
from domain.errors import InvalidCanonicalLineError
from domain.line_types import (
    LINE_TYPE_FEE,
    LINE_TYPE_INTEREST,
    LINE_TYPE_PAYMENT,
    LINE_TYPE_PURCHASE,
    LINE_TYPE_VOLUNTARY_SERVICE,
)
from domain.statement_row_extraction import AmountColumnRole
from fpdf import FPDF

_FIXTURE_DIR = Path(__file__).parent / "fixtures" / "pdf"
_FIXTURE_PATH = _FIXTURE_DIR / "promerica_synthetic.pdf"
_GOLDENS_PATH = _FIXTURE_DIR / "promerica_synthetic_goldens.py"
_BAC_FIXTURE_PATH = _FIXTURE_DIR / "bac_credit_synthetic.pdf"


def _load_goldens_module():
    spec = importlib.util.spec_from_file_location("promerica_synthetic_goldens", _GOLDENS_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


_goldens = _load_goldens_module()


@pytest.fixture
def fixture_bytes() -> bytes:
    return _FIXTURE_PATH.read_bytes()


@pytest.fixture
def adapter() -> PromericaAdapter:
    return PromericaAdapter()


def _assert_matches_golden(line, golden: dict[str, object]) -> None:
    assert line.posted_date == golden["posted_date"]
    assert line.amount == golden["amount"]
    assert isinstance(line.amount, Decimal)
    assert line.currency == golden["currency"]
    assert line.product_id == golden["product_id"]
    assert line.line_type == golden["line_type"]
    assert line.normalized_description == golden["normalized_description"]


def test_adapter_is_discoverable_via_adapters_registry() -> None:
    assert any(isinstance(a, PromericaAdapter) for a in ADAPTERS)
    assert not any(type(a).__name__ == "PromericaStubAdapter" for a in ADAPTERS)


def test_adapter_declares_currency_variant_amount_column_role() -> None:
    assert PromericaAdapter.amount_column_role is AmountColumnRole.CURRENCY_VARIANT


def test_section_titles_match_real_printed_headers() -> None:
    by_title = {spec.title: spec for spec in _SECTIONS}
    assert by_title["Detalle de pagos del periodo"].line_type == LINE_TYPE_PAYMENT
    assert by_title["Detalle de pagos del periodo"].policy == SECTION_POLICY_MUST_PARSE
    assert by_title["Detalle de compras del periodo"].line_type == LINE_TYPE_PURCHASE
    assert by_title["Detalle de compras del periodo"].policy == SECTION_POLICY_MUST_PARSE
    assert by_title["Detalle de intereses"].line_type == LINE_TYPE_INTEREST
    assert by_title["Detalle de intereses"].policy == SECTION_POLICY_MUST_PARSE
    assert by_title["Detalle de otros cargos"].line_type == LINE_TYPE_FEE
    assert by_title["Detalle de otros cargos"].policy == SECTION_POLICY_MUST_PARSE
    assert (
        by_title["Detalle de productos y servicios de elección voluntaria*"].line_type
        == LINE_TYPE_VOLUNTARY_SERVICE
    )
    assert (
        by_title["Detalle de productos y servicios de elección voluntaria*"].policy
        == SECTION_POLICY_BEST_EFFORT
    )
    assert by_title["Cargos por gestión evidenciable de cobro**"].line_type is None
    assert by_title["Cargos por gestión evidenciable de cobro**"].policy == SECTION_POLICY_IGNORE


def test_detect_returns_true_on_filename_containing_promerica(adapter: PromericaAdapter) -> None:
    assert adapter.detect(filename="promerica_estado.pdf", content_sample=b"") is True


def test_detect_returns_false_on_unrelated_filename(adapter: PromericaAdapter) -> None:
    assert adapter.detect(filename="bac_estado.pdf", content_sample=b"") is False


def test_detect_recognizes_fixture_header_via_content_sniff_with_generic_filename(
    adapter: PromericaAdapter, fixture_bytes: bytes
) -> None:
    assert adapter.detect(filename="statement.pdf", content_sample=fixture_bytes) is True


def test_detect_content_sniff_rejects_unrelated_content(adapter: PromericaAdapter) -> None:
    assert (
        adapter.detect(filename="statement.pdf", content_sample=b"not a promerica statement")
        is False
    )


def test_detect_does_not_match_bac_credit_fixture(adapter: PromericaAdapter) -> None:
    bac_bytes = _BAC_FIXTURE_PATH.read_bytes()
    assert adapter.detect(filename="statement.pdf", content_sample=bac_bytes) is False


def test_bac_adapter_does_not_match_promerica_fixture(fixture_bytes: bytes) -> None:
    bac_adapter = BacCreditAdapter()
    assert bac_adapter.detect(filename="statement.pdf", content_sample=fixture_bytes) is False


def test_split_returns_single_statement_chunk(
    adapter: PromericaAdapter, fixture_bytes: bytes
) -> None:
    chunks = adapter.split(fixture_bytes)
    assert len(chunks) == 1


def test_parse_matches_goldens_row_for_row(adapter: PromericaAdapter, fixture_bytes: bytes) -> None:
    chunks = adapter.split(fixture_bytes)
    rows = adapter.parse(chunks[0])
    assert len(rows) == len(_goldens.PROMERICA_GOLDENS)
    for line, golden in zip(rows, _goldens.PROMERICA_GOLDENS, strict=True):
        _assert_matches_golden(line, golden)


def test_parse_payment_row_picks_transaction_columns_not_interest_columns(
    adapter: PromericaAdapter, fixture_bytes: bytes
) -> None:
    chunks = adapter.split(fixture_bytes)
    rows = adapter.parse(chunks[0])
    payment = next(r for r in rows if r.line_type == "payment" and r.amount == Decimal("-39976.92"))
    # The interest-column values (-3,564.56) must never appear as a payment amount.
    assert payment.amount != Decimal("-3564.56")


def test_parse_purchase_refund_preserves_leading_minus_sign(
    adapter: PromericaAdapter, fixture_bytes: bytes
) -> None:
    chunks = adapter.split(fixture_bytes)
    rows = adapter.parse(chunks[0])
    refund = next(r for r in rows if "BONO DE BIENVENIDA" in r.normalized_description)
    assert refund.amount == Decimal("-30000.00")
    assert "15,000" in refund.normalized_description


def test_parse_interest_section_pairs_two_line_concept_and_amount(
    adapter: PromericaAdapter, fixture_bytes: bytes
) -> None:
    chunks = adapter.split(fixture_bytes)
    rows = adapter.parse(chunks[0])
    interest_rows = [r for r in rows if r.line_type == "interest"]
    assert len(interest_rows) == 2
    assert interest_rows[0].normalized_description == "MONTO POR INTERESES CORRIENTES"
    assert interest_rows[0].amount == Decimal("99.59")
    assert interest_rows[1].normalized_description == (
        "REVERSIÓN DE INTERESES CORRIENTES DEL PERIODO ANTERIOR"
    )
    assert interest_rows[1].amount == Decimal("-3564.56")


def test_parse_interest_amount_only_row_with_no_preceding_concept_fails_loud() -> None:
    pdf_bytes = _one_page_statement_pdf(
        [
            "Banco Promerica de Costa Rica, S.A.",
            "MOVIMIENTOS DE LA TARJETA DE CRÉDITO",
            "Detalle de intereses",
            "99.59 0.00",
        ]
    )
    with pytest.raises(InvalidCanonicalLineError) as exc_info:
        PromericaAdapter().parse(pdf_bytes)
    evidence = exc_info.value.evidence
    assert evidence is not None
    assert any(item.kind == "gap" for item in evidence.items)


def test_parse_purchase_prefers_crc_when_both_currency_columns_nonzero(
    adapter: PromericaAdapter,
) -> None:
    pdf_bytes = _one_page_statement_pdf(
        [
            "Banco Promerica de Costa Rica, S.A.",
            "MOVIMIENTOS DE LA TARJETA DE CRÉDITO",
            "Detalle de compras del periodo",
            "05/01/2026 TIENDA DOS MONEDAS SAN JOSE CRI 1,000.00 20.00",
        ]
    )
    rows = adapter.parse(pdf_bytes)
    purchase = next(r for r in rows if r.line_type == "purchase")
    assert purchase.currency == "CRC"
    assert purchase.amount == Decimal("1000.00")


def test_parse_payment_row_picks_usd_transaction_column_when_colones_is_zero(
    adapter: PromericaAdapter,
) -> None:
    pdf_bytes = _one_page_statement_pdf(
        [
            "Banco Promerica de Costa Rica, S.A.",
            "MOVIMIENTOS DE LA TARJETA DE CRÉDITO",
            "Detalle de pagos del periodo",
            "23/12/2025 PAGO SINPE 0.00 0.00 -100.00 -3.56",
        ]
    )
    rows = adapter.parse(pdf_bytes)
    payment = next(r for r in rows if r.line_type == "payment")
    assert payment.currency == "USD"
    assert payment.amount == Decimal("-100.00")
    # The interest-breakdown USD column (index 3) must never be picked either.
    assert payment.amount != Decimal("-3.56")


def test_parse_fails_loud_on_purchase_row_missing_amount_column(
    adapter: PromericaAdapter,
) -> None:
    pdf_bytes = _one_page_statement_pdf(
        [
            "Banco Promerica de Costa Rica, S.A.",
            "MOVIMIENTOS DE LA TARJETA DE CRÉDITO",
            "Detalle de compras del periodo",
            "05/01/2026 SUPERMERCADO SAN JOSE CRI 1,000.00",
        ]
    )
    with pytest.raises(InvalidCanonicalLineError) as exc_info:
        adapter.parse(pdf_bytes)
    evidence = exc_info.value.evidence
    assert evidence is not None
    assert any(item.kind == "gap" for item in evidence.items)


def test_parse_ignores_section_and_row_total_lines(
    adapter: PromericaAdapter, fixture_bytes: bytes
) -> None:
    chunks = adapter.split(fixture_bytes)
    rows = adapter.parse(chunks[0])
    descriptions = " ".join(r.normalized_description for r in rows)
    assert "Total" not in descriptions


def test_parse_ignore_section_emits_no_rows(
    adapter: PromericaAdapter, fixture_bytes: bytes
) -> None:
    chunks = adapter.split(fixture_bytes)
    rows = adapter.parse(chunks[0])
    assert all(r.line_type != "credit_note" for r in rows)
    assert len(rows) == 8


def test_parse_card_number_marker_line_mid_section_is_skipped(
    adapter: PromericaAdapter, fixture_bytes: bytes
) -> None:
    chunks = adapter.split(fixture_bytes)
    rows = adapter.parse(chunks[0])
    assert all("XXXX" not in r.normalized_description for r in rows)


def test_parse_unmapped_section_raises_rather_than_silently_dropping(
    adapter: PromericaAdapter,
) -> None:
    pdf_bytes = _one_page_statement_pdf(
        [
            "Banco Promerica de Costa Rica, S.A.",
            "MOVIMIENTOS DE LA TARJETA DE CRÉDITO",
            "Detalle de compras del periodo",
            "05/01/2026 SUPERMERCADO SAN JOSE CRI 1,000.00 0.00",
            "Sección Desconocida",
            "16/01/2026 CARGO MISTERIOSO SAN JOSE CRI 1,000.00 0.00",
        ]
    )
    with pytest.raises(InvalidCanonicalLineError) as exc_info:
        adapter.parse(pdf_bytes)
    evidence = exc_info.value.evidence
    assert evidence is not None
    assert any(item.kind == "gap" for item in evidence.items)


def test_split_records_which_boundary_method_fired(
    adapter: PromericaAdapter, fixture_bytes: bytes
) -> None:
    adapter.split(fixture_bytes)
    assert adapter.last_split_boundary_method == "repeating_marker_guess"


def test_parse_is_deterministic_across_repeated_calls(
    adapter: PromericaAdapter, fixture_bytes: bytes
) -> None:
    chunks = adapter.split(fixture_bytes)
    first_pass = adapter.parse(chunks[0])
    second_pass = adapter.parse(chunks[0])
    assert first_pass == second_pass


def test_parse_unreadable_pdf_bytes_raises_invalid_canonical_line_error(
    adapter: PromericaAdapter,
) -> None:
    with pytest.raises(InvalidCanonicalLineError):
        adapter.parse(b"not a pdf at all")


def test_split_unreadable_pdf_bytes_raises_invalid_canonical_line_error(
    adapter: PromericaAdapter,
) -> None:
    with pytest.raises(InvalidCanonicalLineError):
        adapter.split(b"not a pdf at all")


_TEST_CREATION_DATE = datetime(2026, 1, 20, 22, 14, 7, tzinfo=UTC)


def _one_page_statement_pdf(lines: list[str]) -> bytes:
    pdf = FPDF()
    pdf.set_creation_date(_TEST_CREATION_DATE)
    pdf.add_page()
    pdf.set_font("Courier", size=9)
    for line in lines:
        pdf.cell(0, 5, line, new_x="LMARGIN", new_y="NEXT")
    return bytes(pdf.output())


def test_detect_bank_adapter_picks_promerica_via_filename(fixture_bytes: bytes) -> None:
    resolved = detect_bank_adapter(
        ADAPTERS, override=None, filename="promerica_estado.pdf", content_sample=fixture_bytes
    )
    assert resolved.bank_id == "promerica"
    assert resolved.product_id == "promerica_credit"
