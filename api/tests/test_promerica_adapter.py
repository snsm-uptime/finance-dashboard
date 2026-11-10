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


_NEWER_LAYOUT_FIXTURE_PATH = _FIXTURE_DIR / "promerica_newer_layout_clean_synthetic.pdf"
_NEWER_LAYOUT_UNREADABLE_FIXTURE_PATH = _FIXTURE_DIR / "promerica_newer_layout_synthetic.pdf"
_NEWER_LAYOUT_GOLDENS_PATH = _FIXTURE_DIR / "promerica_newer_layout_goldens.py"
_BAC_DEBIT_FIXTURE_PATH = _FIXTURE_DIR / "bac_debit_synthetic.pdf"


def _load_newer_layout_goldens_module():
    spec = importlib.util.spec_from_file_location(
        "promerica_newer_layout_goldens", _NEWER_LAYOUT_GOLDENS_PATH
    )
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


_newer_layout = _load_newer_layout_goldens_module()


@pytest.fixture
def newer_layout_bytes() -> bytes:
    return _NEWER_LAYOUT_FIXTURE_PATH.read_bytes()


@pytest.fixture
def newer_layout_unreadable_bytes() -> bytes:
    return _NEWER_LAYOUT_UNREADABLE_FIXTURE_PATH.read_bytes()


def test_newer_layout_fixture_detected_as_promerica_by_content(
    adapter: PromericaAdapter, newer_layout_bytes: bytes
) -> None:
    assert adapter.detect(filename="statement.pdf", content_sample=newer_layout_bytes)


def test_newer_layout_fixture_detected_as_promerica_by_filename(
    adapter: PromericaAdapter, newer_layout_bytes: bytes
) -> None:
    assert adapter.detect(filename="promerica_newer_layout.pdf", content_sample=newer_layout_bytes)


def test_bac_fixtures_are_not_detected_as_promerica(adapter: PromericaAdapter) -> None:
    for path in (_BAC_FIXTURE_PATH, _BAC_DEBIT_FIXTURE_PATH):
        assert not adapter.detect(filename="", content_sample=path.read_bytes()), path.name


def test_newer_layout_rows_match_goldens_row_for_row(
    adapter: PromericaAdapter, newer_layout_bytes: bytes
) -> None:
    result = adapter.parse_statement(newer_layout_bytes)
    assert len(result.rows) == _newer_layout.PROMERICA_NEWER_LAYOUT_EXPECTED_ROW_COUNT
    for line, golden in zip(result.rows, _newer_layout.PROMERICA_NEWER_LAYOUT_GOLDENS, strict=True):
        _assert_matches_golden(line, golden)


def test_newer_layout_section_totals_match_goldens_per_currency(
    adapter: PromericaAdapter, newer_layout_bytes: bytes
) -> None:
    totals: dict[tuple[str, str], Decimal] = {}
    for line in adapter.parse_statement(newer_layout_bytes).rows:
        key = (line.line_type, line.currency)
        totals[key] = totals.get(key, Decimal("0")) + line.amount
    expected = {
        (section, currency): amount
        for section, by_currency in _newer_layout.PROMERICA_NEWER_LAYOUT_SECTION_TOTALS.items()
        for currency, amount in by_currency.items()
    }
    assert totals == expected


def test_newer_layout_points_transfer_is_a_note_not_a_transaction(
    adapter: PromericaAdapter, newer_layout_bytes: bytes
) -> None:
    result = adapter.parse_statement(newer_layout_bytes)
    assert not any("Traslado de puntos" in line.normalized_description for line in result.rows)
    assert len(result.notes) == 1
    note = result.notes[0]
    golden = _newer_layout.PROMERICA_NEWER_LAYOUT_POINTS_TRANSFER_NOTE
    assert note.label == golden["label"]
    assert note.section == golden["section"]
    assert note.currency == golden["currency"]
    assert note.amount == golden["amount"]


def test_newer_layout_summary_total_card_and_footer_lines_never_become_transactions(
    adapter: PromericaAdapter, newer_layout_bytes: bytes
) -> None:
    descriptions = [
        line.normalized_description for line in adapter.parse_statement(newer_layout_bytes).rows
    ]
    for leaked in ("Total", "Saldo anterior", "XXXX-XXXX", "Fecha de Corte", "Monto en"):
        assert not any(leaked in description for description in descriptions), leaked


def test_newer_layout_four_column_payment_records_only_transaction_amount_per_currency(
    adapter: PromericaAdapter, newer_layout_bytes: bytes
) -> None:
    payments = [
        line
        for line in adapter.parse_statement(newer_layout_bytes).rows
        if line.line_type == LINE_TYPE_PAYMENT
    ]
    # Row "23/01/2026 PAGO SINPE -50,000.00 -1,200.00 0.00 0.00": the -1,200.00
    # interest column is not a second payment.
    assert [(p.amount, p.currency) for p in payments] == [
        (Decimal("-50000.00"), "CRC"),
        (Decimal("-200.00"), "USD"),
    ]


def test_newer_layout_usd_only_purchase_records_usd_amount_not_zero_colones(
    adapter: PromericaAdapter, newer_layout_bytes: bytes
) -> None:
    usd_purchases = [
        line
        for line in adapter.parse_statement(newer_layout_bytes).rows
        if line.line_type == LINE_TYPE_PURCHASE and line.currency == "USD"
    ]
    assert [(p.amount, p.currency) for p in usd_purchases] == [(Decimal("25.50"), "USD")]


def test_newer_layout_unreadable_row_is_flagged_with_raw_text_section_and_reason(
    adapter: PromericaAdapter, newer_layout_unreadable_bytes: bytes
) -> None:
    result = adapter.parse_statement(newer_layout_unreadable_bytes)
    assert len(result.flagged) == 1
    flagged = result.flagged[0]
    assert flagged.raw_text == _newer_layout.PROMERICA_NEWER_LAYOUT_FLAGGED_RAW_TEXT
    assert flagged.section == _newer_layout.PROMERICA_NEWER_LAYOUT_FLAGGED_SECTION
    assert flagged.page == 1
    assert flagged.reason == "amount missing"
    assert flagged.review_status == "unreviewed"


def test_newer_layout_parse_contract_still_fails_loud_on_unreadable_row(
    adapter: PromericaAdapter, newer_layout_unreadable_bytes: bytes
) -> None:
    # BankAdapter.parse() keeps raising until the import session can store flags.
    with pytest.raises(InvalidCanonicalLineError):
        adapter.parse(newer_layout_unreadable_bytes)


def test_interest_concept_without_amount_line_is_flagged_not_dropped(
    adapter: PromericaAdapter,
) -> None:
    pdf_bytes = _one_page_statement_pdf(
        [
            "Banco Promerica de Costa Rica, S.A.",
            "Fecha de Corte 19/01/2026",
            "MOVIMIENTOS DE LA TARJETA DE CRÉDITO",
            "Detalle de intereses",
            "Interés en Interés en",
            "MONTO SIN MONTO",
            "MONTO POR INTERESES CORRIENTES",
            "99.59 0.00",
        ]
    )
    result = adapter.parse_statement(pdf_bytes)
    assert [row.normalized_description for row in result.rows] == ["MONTO POR INTERESES CORRIENTES"]
    assert [flag.raw_text for flag in result.flagged] == ["MONTO SIN MONTO"]
    assert result.flagged[0].reason == "interest concept with no amount line"


def test_earlier_layout_fixture_has_no_notes_and_no_flagged_rows(
    adapter: PromericaAdapter, fixture_bytes: bytes
) -> None:
    result = adapter.parse_statement(fixture_bytes)
    assert result.notes == []
    assert result.flagged == []
    assert result.rows == adapter.parse(fixture_bytes)
