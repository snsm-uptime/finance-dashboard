"""Generate synthetic BAC credit-card PDF fixtures (Story 4.4 Task 5.4, Story 4.5 Task 2).

Rerun after changing either fixture's shape:

    uv run python scripts/generate_bac_fixture.py

Every value is invented — no real statement data, no PII (NFR-2/AD-11).
`build_fixture()` is Story 4.4's small proving fixture (throwaway TDD
scaffolding for `test_bac_adapter.py`); `build_acceptance_bar_fixture()` is
Story 4.5's bigger, stricter release-gate fixture covering every row of the
BAC credit baseline section map (`test_bac_credit_fixture_acceptance.py`).
They are separate, independently-committed PDFs — do not merge them.

Row format matches real pdfplumber-extracted BAC credit text (Story 4.11):
purchase-like sections print reference/date/description/place/currency/amount;
the interest section prints description + two blank-separated amounts and no
date. Section titles are the real lettered headers.
"""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

from fpdf import FPDF

_FIXTURE_DIR = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "pdf"
OUTPUT_PATH = _FIXTURE_DIR / "bac_credit_synthetic.pdf"
ACCEPTANCE_BAR_OUTPUT_PATH = _FIXTURE_DIR / "bac_credit_acceptance_bar.pdf"

FIXTURE_CREATION_DATE = datetime(2026, 1, 31, 12, 0, 0, tzinfo=UTC)


def _new_pdf() -> FPDF:
    pdf = FPDF()
    pdf.set_creation_date(FIXTURE_CREATION_DATE)
    return pdf


def _add_statement_page(pdf: FPDF, lines: list[str]) -> None:
    pdf.add_page()
    pdf.set_font("Courier", size=9)
    for line in lines:
        pdf.cell(0, 5, line, new_x="LMARGIN", new_y="NEXT")


def build_fixture() -> bytes:
    pdf = _new_pdf()

    # Statement 1 — proves currency-tag CRC/USD, purchase/payment/fee,
    # and balance_forward's "ignore" policy (no CanonicalLine emitted).
    _add_statement_page(
        pdf,
        [
            "ESTADO DE CUENTA BAC CREDITO",
            "Fecha de emisión:31-ENE-26",
            "Cuenta: 0000000000001234",
            "Saldo Anterior",
            "01-ENE-26 SALDO ANTERIOR 125,000.00",
            "B) Detalle de compras del periodo",
            "N. Referencia Fecha de pago Concepto/Descripción Lugar Moneda Monto en Monto en",
            "colones dólares",
            "100001 05-ENE-26 SUPERMERCADO XYZ SAN JOSE CRC 10,500.00",
            "100002 07-ENE-26 AMAZON US MIAMI USD 45.00",
            "100003 09-ENE-26 FARMACIA CENTRAL SAN JOSE CRC 8,250.00",
            "A) Detalle de pago del periodo",
            "100004 10-ENE-26 PAGO SINPE MOVIL SAN JOSE 50,000.00",
            "D) Detalle de otros cargos",
            "100005 15-ENE-26 CUOTA DE MANEJO SAN JOSE CRC 3,500.00",
        ],
    )

    # Statement 2 — proves interest (no date, dual-column) / voluntary_service
    # (best_effort) / installment_schedule, and multi-statement split.
    _add_statement_page(
        pdf,
        [
            "ESTADO DE CUENTA BAC CREDITO",
            "Fecha de emisión:31-ENE-26",
            "Cuenta: 0000000000005678",
            "C) Detalle de intereses",
            "Concepto/Descripción Monto en Monto en",
            "colones dólares",
            "INTERESES CORRIENTES 1,200.00 3.00",
            "E) Detalle de productos y servicios de elección voluntaria",
            "100006 22-ENE-26 SEGURO TARJETA SAN JOSE CRC 2,000.00",
            "Otras líneas de financiamiento",
            "100007 25-ENE-26 CUOTA FINANCIAMIENTO TV SAN JOSE CRC 15,000.00",
        ],
    )

    # Statement 3 — proves the unmapped-section fail-loud path (AC #3):
    # a row under a lettered section this adapter does not recognize must raise,
    # not silently vanish.
    _add_statement_page(
        pdf,
        [
            "ESTADO DE CUENTA BAC CREDITO",
            "Fecha de emisión:31-ENE-26",
            "Cuenta: 0000000000009999",
            "Z) Sección Desconocida",
            "16-ENE-26 CARGO MISTERIOSO SAN JOSE CRC 1,000.00",
        ],
    )

    return bytes(pdf.output())


def build_acceptance_bar_fixture() -> bytes:
    """Story 4.5 Task 2.2 — bigger, single-statement, every-section fixture.

    One cardholder / one statement (single split() chunk, per Task 2.5) that
    covers every row of the BAC credit baseline section map, including a
    CRC-tagged purchase, a USD-tagged purchase, dual-column interest
    (CRC-wins), and the payment section's inherently-negative amount.
    """
    pdf = _new_pdf()
    _add_statement_page(
        pdf,
        [
            "ESTADO DE CUENTA BAC CREDITO",
            "Fecha de emisión:31-ENE-26",
            "Cuenta: 0000000000004321",
            "Saldo Anterior",
            "01-ENE-26 SALDO ANTERIOR 150,000.00",
            "B) Detalle de compras del periodo",
            "N. Referencia Fecha de pago Concepto/Descripción Lugar Moneda Monto en Monto en",
            "colones dólares",
            "200001 03-ENE-26 FARMACIA CENTRAL SAN JOSE CRC 9,750.00",
            "200002 04-ENE-26 SUPERMERCADO ABC SAN JOSE CRC 14,200.00",
            "200003 06-ENE-26 AMAZON STORE MIAMI USD 72.50",
            "A) Detalle de pago del periodo",
            "200004 08-ENE-26 PAGO SINPE MOVIL SAN JOSE 60,000.00",
            "C) Detalle de intereses",
            "Concepto/Descripción Monto en Monto en",
            "colones dólares",
            "INTERESES CORRIENTES 1,850.00 5.00",
            "D) Detalle de otros cargos",
            "200005 12-ENE-26 CUOTA DE MANEJO SAN JOSE CRC 4,100.00",
            "E) Detalle de productos y servicios de elección voluntaria",
            "200006 14-ENE-26 SEGURO TARJETA SAN JOSE CRC 2,300.00",
            "Otras líneas de financiamiento",
            "200007 16-ENE-26 CUOTA FINANCIAMIENTO EQUIPO SAN JOSE CRC 18,500.00",
        ],
    )
    return bytes(pdf.output())


def main() -> None:
    _FIXTURE_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_bytes(build_fixture())
    print(f"Wrote {OUTPUT_PATH}")
    ACCEPTANCE_BAR_OUTPUT_PATH.write_bytes(build_acceptance_bar_fixture())
    print(f"Wrote {ACCEPTANCE_BAR_OUTPUT_PATH}")


if __name__ == "__main__":
    main()
