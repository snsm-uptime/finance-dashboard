"""Contract tests for PromericaStubAdapter (Story 4.5, AC #2, Task 3.6).

Proves the BankAdapter contract extends beyond BAC without touching
detect_bank_adapter() or domain/canonical_line.py: registry discoverability,
filename-based detection, multi-statement split(), and per-chunk parse()
independence (one statement's parse failure doesn't affect its siblings —
mirrors FR-15's multi-statement resilience at the adapter-pipeline level,
even though Import Session doesn't exist yet).
"""

from __future__ import annotations

from decimal import Decimal
from pathlib import Path

import pytest
from adapters.bank import ADAPTERS
from adapters.bank.promerica_stub import PromericaStubAdapter
from application.bank_adapters import detect_bank_adapter
from domain.errors import InvalidCanonicalLineError
from fpdf import FPDF

_FIXTURE_PATH = Path(__file__).parent / "fixtures" / "pdf" / "promerica_stub_multi.pdf"


@pytest.fixture
def adapter() -> PromericaStubAdapter:
    return PromericaStubAdapter()


@pytest.fixture
def fixture_bytes() -> bytes:
    return _FIXTURE_PATH.read_bytes()


def _one_page_statement_pdf(lines: list[str]) -> bytes:
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Courier", size=9)
    for line in lines:
        pdf.cell(0, 5, line, new_x="LMARGIN", new_y="NEXT")
    return bytes(pdf.output())


def _multi_page_statement_pdf(pages: list[list[str]]) -> bytes:
    pdf = FPDF()
    for lines in pages:
        pdf.add_page()
        pdf.set_font("Courier", size=9)
        for line in lines:
            pdf.cell(0, 5, line, new_x="LMARGIN", new_y="NEXT")
    return bytes(pdf.output())


def test_adapter_is_discoverable_via_adapters_registry() -> None:
    assert any(isinstance(a, PromericaStubAdapter) for a in ADAPTERS)


def test_detect_returns_true_on_filename_containing_promerica(
    adapter: PromericaStubAdapter,
) -> None:
    assert adapter.detect(filename="promerica_estado.pdf", content_sample=b"") is True


def test_detect_returns_false_on_unrelated_filename(adapter: PromericaStubAdapter) -> None:
    assert adapter.detect(filename="bac_estado.pdf", content_sample=b"") is False


def test_detect_bank_adapter_picks_stub_via_filename_with_no_changes_to_detection_logic(
    fixture_bytes: bytes,
) -> None:
    resolved = detect_bank_adapter(
        ADAPTERS, override=None, filename="promerica_estado.pdf", content_sample=fixture_bytes
    )
    assert resolved.bank_id == "promerica"
    assert resolved.product_id == "promerica_stub"


def test_split_returns_more_than_one_chunk_on_multi_statement_fixture(
    adapter: PromericaStubAdapter, fixture_bytes: bytes
) -> None:
    chunks = adapter.split(fixture_bytes)
    assert len(chunks) > 1


def test_each_split_chunk_parses_independently(
    adapter: PromericaStubAdapter, fixture_bytes: bytes
) -> None:
    chunks = adapter.split(fixture_bytes)
    assert len(chunks) == 2

    expected = [
        ("2026-01-05", "COMERCIO GENERICO UNO", Decimal("1000.00")),
        ("2026-01-10", "COMERCIO GENERICO DOS", Decimal("2000.00")),
    ]
    for chunk, (posted_date, description, amount) in zip(chunks, expected, strict=True):
        rows = adapter.parse(chunk)
        assert len(rows) == 1
        row = rows[0]
        assert row.product_id == "promerica_stub"
        assert row.posted_date == posted_date
        assert row.normalized_description == description
        assert row.currency == "CRC"
        assert row.line_type == "purchase"
        assert row.amount == amount


def test_one_statement_parse_failure_does_not_prevent_siblings_from_parsing(
    adapter: PromericaStubAdapter,
) -> None:
    combined_statement = _multi_page_statement_pdf(
        [
            [
                "ESTADO DE CUENTA PROMERICA STUB",
                "Detalle de movimientos",
                "05-ENE-26|MISSING AMOUNT FIELD",
            ],
            [
                "ESTADO DE CUENTA PROMERICA STUB",
                "Detalle de movimientos",
                "10-ENE-26|COMERCIO GENERICO TRES|3,000.00",
            ],
        ]
    )

    chunks = adapter.split(combined_statement)
    assert len(chunks) == 2

    with pytest.raises(InvalidCanonicalLineError):
        adapter.parse(chunks[0])

    rows = adapter.parse(chunks[1])
    assert len(rows) == 1
    assert rows[0].normalized_description == "COMERCIO GENERICO TRES"
    assert rows[0].amount == Decimal("3000.00")


def test_account_kind_is_other(adapter: PromericaStubAdapter) -> None:
    assert adapter.account_kind == "other"


def test_parse_unmapped_section_raises_rather_than_silently_dropping(
    adapter: PromericaStubAdapter,
) -> None:
    pdf_bytes = _one_page_statement_pdf(
        [
            "ESTADO DE CUENTA PROMERICA STUB",
            "Sección Desconocida",
            "05-ENE-26|CARGO MISTERIOSO|1,000.00",
        ]
    )
    with pytest.raises(InvalidCanonicalLineError):
        adapter.parse(pdf_bytes)
