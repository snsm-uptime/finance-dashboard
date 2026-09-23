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
"""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

from fpdf import FPDF

_FIXTURE_DIR = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "pdf"
OUTPUT_PATH = _FIXTURE_DIR / "promerica_synthetic.pdf"

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
            "XXXX-XXXX-XXXX-9485 SOTO MADRIGAL SEBASTIAN NOE",
            "17/12/2025 PARQUEOS REAL CARIARI BELEN CRI 2,100.00 0.00",
            "20/01/2026 BONO DE BIENVENIDA 15,000 San Jose CRI -30,000.00 0.00",
            "Total de compras del periodo de 19/12/2025 al 19/01/2026 591,158.06 23.00",
            "Detalle de intereses",
            "MONTO POR INTERESES CORRIENTES",
            "99.59 0.00",
            "REVERSIÓN DE INTERESES CORRIENTES DEL PERIODO ANTERIOR",
            "-3,564.56 0.00",
            "Total por concepto de intereses 5,964.99 0.08",
            "Detalle de otros cargos",
            "02/01/2026 COSTO OPERATIVO POR ADM DE CUENTA SAN JOSE CRI 760.50 0.00",
            "Detalle de productos y servicios de elección voluntaria*",
            "02/01/2026 SEGURO PROTECCIÓN FINANC. TC 1 - SAGICOR SAN JOSE CRI 3,400.00 0.00",
            "Cargos por gestión evidenciable de cobro**",
            "Total cargos por gestión evidenciable de cobro Monto en 0.00 0.00",
        ],
    )
    return bytes(pdf.output())


def main() -> None:
    _FIXTURE_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_bytes(build_fixture())
    print(f"Wrote {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
