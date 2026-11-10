"""Generate the synthetic Promerica credit-card PDF fixture (Story 4.9.2, Task 5).

Rerun after changing the fixture's shape:

    uv run python scripts/generate_promerica_fixture.py

Every value is invented — no real statement data, no PII (NFR-2/AD-11). This
replaces the Story 4.5 stub's fixtures. Row text mirrors the real Promerica
credit-card layout inspected this story (`bank_data/PROMERICA_CRED.pdf`,
gitignored, never committed): real section titles (including the trailing
asterisks on the two footnoted ones), the payments section's four amount
columns, the interest section's two-line concept/amount pairing, a preamble
before the first declared section, a mid-section card-number marker line,
and each section's own totals line (must not be double-counted as a row).

Also includes every section's own printed column sub-header line(s) (e.g.
"Monto en Monto en" / "Fecha de la transacción Concepto / Descripción Lugar
/ Moneda colones US$") — the original fixture omitted these for every
section except payments, which meant the adapter's boilerplate allowlist
gap (only the payment section's sub-headers were recognized) went uncaught
until a real full statement surfaced it (2026-09-23 code-review session):
an unrecognized sub-header line under an already-open section was
misclassified as an unknown section title, flipping the cursor to
"unmapped" and failing the very next real data row.
"""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

from fpdf import FPDF

_FIXTURE_DIR = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "pdf"
OUTPUT_PATH = _FIXTURE_DIR / "promerica_synthetic.pdf"
NEWER_LAYOUT_OUTPUT_PATH = _FIXTURE_DIR / "promerica_newer_layout_synthetic.pdf"
NEWER_LAYOUT_CLEAN_OUTPUT_PATH = _FIXTURE_DIR / "promerica_newer_layout_clean_synthetic.pdf"
_UNREADABLE_ROW = "12/01/2026 SYNTHETIC MERCHANT WITHOUT AMOUNT SAN JOSE CRI"

FIXTURE_CREATION_DATE = datetime(2026, 1, 20, 22, 14, 7, tzinfo=UTC)


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

    _add_statement_page(
        pdf,
        [
            "Banco Promerica de Costa Rica, S.A.",
            "Fecha de Corte 19/01/2026",
            "MOVIMIENTOS DE LA TARJETA DE CRÉDITO",
            "Saldo anterior 19/12/2025 33,176.92 3,564.56 -6.82 0.00",
            "Detalle de pagos del periodo",
            "Transacción en Interés en Transacciones Interés en",
            "Fecha de Pagos Concepto / Descripción colones colones en US$ US$",
            "23/12/2025 PAGO SINPE -39,976.92 -3,564.56 0.00 0.00",
            "06/01/2026 PAGO SINPE -297,986.99 0.00 0.00 0.00",
            "Total de pagos del periodo de 19/12/2025 al 19/01/2026 -337,963.91 -3,564.56",
            "Detalle de compras del periodo",
            "Monto en Monto en",
            "Fecha de la transacción Concepto / Descripción Lugar / Moneda colones US$",
            "XXXX-XXXX-XXXX-9485 SOTO MADRIGAL SEBASTIAN NOE",
            "17/12/2025 PARQUEOS REAL CARIARI BELEN CRI 2,100.00 0.00",
            "20/01/2026 BONO DE BIENVENIDA 15,000 San Jose CRI -30,000.00 0.00",
            "Total de compras del periodo de 19/12/2025 al 19/01/2026 591,158.06 23.00",
            "Detalle de intereses",
            "Interés en Interés en",
            "Concepto / Descripción colones US$",
            "MONTO POR INTERESES CORRIENTES",
            "99.59 0.00",
            "REVERSIÓN DE INTERESES CORRIENTES DEL PERIODO ANTERIOR",
            "-3,564.56 0.00",
            "Total por concepto de intereses 5,964.99 0.08",
            "Detalle de otros cargos",
            "Monto en Monto en",
            "Fecha de Pagos Concepto / Descripción Lugar / Moneda colones US$",
            "02/01/2026 COSTO OPERATIVO POR ADM DE CUENTA SAN JOSE CRI 760.50 0.00",
            "Detalle de productos y servicios de elección voluntaria*",
            "Monto en Monto en",
            "Fecha Concepto / Descripción Lugar / Moneda Colones US$",
            "02/01/2026 SEGURO PROTECCIÓN FINANC. TC 1 - SAGICOR SAN JOSE CRI 3,400.00 0.00",
            "Cargos por gestión evidenciable de cobro**",
            "Monto en Monto en",
            "Fecha Concepto / Descripción Lugar / Moneda colones US$",
            "Total cargos por gestión evidenciable de cobro Monto en 0.00 0.00",
        ],
    )
    return bytes(pdf.output())


def build_newer_layout_fixture(include_unreadable_row: bool = True) -> bytes:
    """Synthetic statement in the newer Promerica layout: every rule that layout adds.

    Covers a points transfer printed as "- 80,133.00" (a note, not a transaction),
    a US$-only purchase, a negative refund, a card-number marker line with the
    holder's name, a US$ interest pair, a reversal, a payment with four amount
    columns, and optionally one deliberately unreadable purchase row (no amount).
    The clean variant (include_unreadable_row=False) has the same totals, so the
    section-total checks run on it without a flagged row. Values are invented.
    """
    pdf = _new_pdf()

    _add_statement_page(
        pdf,
        [
            "Banco Promerica de Costa Rica, S.A.",
            "Fecha de Corte 19/02/2026",
            "MOVIMIENTOS DE LA TARJETA DE CRÉDITO",
            "Saldo anterior 19/01/2026 33,176.92 3,564.56 -6.82 0.00",
            "Detalle de pagos del periodo",
            "Transacción en Interés en Transacciones Interés en",
            "Fecha de Pagos Concepto / Descripción colones colones en US$ US$",
            "23/01/2026 PAGO SINPE -50,000.00 -1,200.00 0.00 0.00",
            "02/02/2026 PAGO SINPE 0.00 0.00 -200.00 -3.00",
            "Total de pagos del periodo de 19/01/2026 al 19/02/2026 -50,000.00 -200.00",
            "Detalle de compras del periodo",
            "Monto en Monto en",
            "Fecha de la transacción Concepto / Descripción Lugar / Moneda colones US$",
            "XXXX-XXXX-XXXX-9485 SYNTHETIC HOLDER NAME",
            "05/01/2026 SUPERMERCADO SYNTHETIC SAN JOSE CRI 12,500.00 0.00",
            "07/01/2026 SYNTHETIC ONLINE STORE USA 0.00 25.50",
            "15/01/2026 REFUND SYNTHETIC SAN JOSE CRI -4,000.00 0.00",
            "25/01/2026 Traslado de puntos a cuenta crédito - 80,133.00",
            *([_UNREADABLE_ROW] if include_unreadable_row else []),
            "Total de compras del periodo de 19/01/2026 al 19/02/2026 -71,633.00 25.50",
            "Detalle de intereses",
            "Interés en Interés en",
            "Concepto / Descripción colones US$",
            "MONTO POR INTERESES CORRIENTES",
            "99.59 0.00",
            "INTERESES CORRIENTES DÓLARES",
            "0.00 1.20",
            "REVERSIÓN DE INTERESES CORRIENTES DEL PERIODO ANTERIOR",
            "-3,564.56 0.00",
            "Total por concepto de intereses -3,465.00 1.20",
            "Detalle de otros cargos",
            "Monto en Monto en",
            "Fecha de Pagos Concepto / Descripción Lugar / Moneda colones US$",
            "02/01/2026 COSTO OPERATIVO POR ADM DE CUENTA SAN JOSE CRI 760.50 0.00",
            "Detalle de productos y servicios de elección voluntaria*",
            "Monto en Monto en",
            "Fecha Concepto / Descripción Lugar / Moneda Colones US$",
            "02/01/2026 SEGURO PROTECCIÓN FINANC. TC 1 - SAGICOR SAN JOSE CRI 3,400.00 0.00",
            "Cargos por gestión evidenciable de cobro**",
            "Monto en Monto en",
            "Fecha Concepto / Descripción Lugar / Moneda colones US$",
            "Total cargos por gestión evidenciable de cobro Monto en 0.00 0.00",
        ],
    )
    return bytes(pdf.output())


def main() -> None:
    _FIXTURE_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_bytes(build_fixture())
    print(f"Wrote {OUTPUT_PATH}")
    NEWER_LAYOUT_OUTPUT_PATH.write_bytes(build_newer_layout_fixture())
    print(f"Wrote {NEWER_LAYOUT_OUTPUT_PATH}")
    NEWER_LAYOUT_CLEAN_OUTPUT_PATH.write_bytes(
        build_newer_layout_fixture(include_unreadable_row=False)
    )
    print(f"Wrote {NEWER_LAYOUT_CLEAN_OUTPUT_PATH}")


if __name__ == "__main__":
    main()
