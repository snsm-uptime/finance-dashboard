"""Generate synthetic BAC credit-card PDF fixtures (Story 4.4 Task 5.4, Story 4.5 Task 2).

Rerun after changing either fixture's shape:

    uv run python scripts/generate_bac_fixture.py

Every value is invented — no real statement data, no PII (NFR-2/AD-11).
`build_fixture()` is Story 4.4's small proving fixture (throwaway TDD
scaffolding for `test_bac_adapter.py`); `build_acceptance_bar_fixture()` is
Story 4.5's bigger, stricter release-gate fixture covering every row of the
BAC credit baseline section map (`test_bac_credit_fixture_acceptance.py`).
They are separate, independently-committed PDFs — do not merge them.

Row format (pipe-delimited, matches adapter.py's parser): each transaction
line is "{date}|{description}|{crc_amount_or_dash}|{usd_amount_or_dash}",
with amounts as plain positive numbers using BAC's DD-MMM-YY Spanish date
format. Section headers are printed verbatim from the BAC baseline map (see
Story 4.5 Completion Notes for a real-statement-vs-fixture header-text
mismatch this project-context/PRD map has not yet been reconciled against).
"""

from __future__ import annotations

from pathlib import Path

from fpdf import FPDF

_FIXTURE_DIR = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "pdf"
OUTPUT_PATH = _FIXTURE_DIR / "bac_credit_synthetic.pdf"
ACCEPTANCE_BAR_OUTPUT_PATH = _FIXTURE_DIR / "bac_credit_acceptance_bar.pdf"


def _add_statement_page(pdf: FPDF, lines: list[str]) -> None:
    pdf.add_page()
    pdf.set_font("Courier", size=9)
    for line in lines:
        pdf.cell(0, 5, line, new_x="LMARGIN", new_y="NEXT")


def build_fixture() -> bytes:
    pdf = FPDF()

    # Statement 1 — proves dual-column normalize, purchase/payment/fee,
    # and balance_forward's "ignore" policy (no CanonicalLine emitted).
    _add_statement_page(
        pdf,
        [
            "ESTADO DE CUENTA BAC CREDITO",
            "Cuenta: 0000000000001234",
            "Saldo Anterior",
            "01-ENE-26|SALDO ANTERIOR|125,000.00|-",
            "Detalle de compras",
            "05-ENE-26|SUPERMERCADO XYZ|10,500.00|-",
            "07-ENE-26|AMAZON US|-|45.00",
            "09-ENE-26|FARMACIA CENTRAL|8,250.00|3.00",
            "Detalle de pago",
            "10-ENE-26|PAGO SINPE MOVIL|50,000.00|-",
            "Otros cargos",
            "15-ENE-26|CUOTA DE MANEJO|3,500.00|-",
        ],
    )

    # Statement 2 — proves interest / voluntary_service (best_effort) /
    # installment_schedule, and multi-statement split (>=2 statements).
    _add_statement_page(
        pdf,
        [
            "ESTADO DE CUENTA BAC CREDITO",
            "Cuenta: 0000000000005678",
            "Detalle de intereses",
            "20-ENE-26|INTERESES CORRIENTES|1,200.00|-",
            "Productos y servicios de elección voluntaria",
            "22-ENE-26|SEGURO TARJETA|2,000.00|-",
            "Otras líneas de financiamiento",
            "25-ENE-26|CUOTA FINANCIAMIENTO TV|15,000.00|-",
        ],
    )

    # Statement 3 — proves the unmapped-section fail-loud path (AC #3):
    # a row under a section this adapter does not recognize must raise,
    # not silently vanish.
    _add_statement_page(
        pdf,
        [
            "ESTADO DE CUENTA BAC CREDITO",
            "Cuenta: 0000000000009999",
            "Sección Desconocida",
            "16-ENE-26|CARGO MISTERIOSO|1,000.00|-",
        ],
    )

    return bytes(pdf.output())


def build_acceptance_bar_fixture() -> bytes:
    """Story 4.5 Task 2.2 — bigger, single-statement, every-section fixture.

    One cardholder / one statement (single split() chunk, per Task 2.5) that
    covers every row of the BAC credit baseline section map, including a
    dual-CRC/USD-nonzero row (CRC-wins), a CRC-only row, a USD-only row, and
    the payment section's inherently-negative amount. See
    `bac_credit_acceptance_bar_goldens.py` for the exact expected rows.
    """
    pdf = FPDF()
    _add_statement_page(
        pdf,
        [
            "ESTADO DE CUENTA BAC CREDITO",
            "Cuenta: 0000000000004321",
            "Saldo Anterior",
            "01-ENE-26|SALDO ANTERIOR|150,000.00|-",
            "Detalle de compras",
            "03-ENE-26|FARMACIA CENTRAL|9,750.00|5.00",
            "04-ENE-26|SUPERMERCADO ABC|14,200.00|-",
            "06-ENE-26|AMAZON STORE|-|72.50",
            "Detalle de pago",
            "08-ENE-26|PAGO SINPE MOVIL|60,000.00|-",
            "Detalle de intereses",
            "10-ENE-26|INTERESES CORRIENTES|1,850.00|-",
            "Otros cargos",
            "12-ENE-26|CUOTA DE MANEJO|4,100.00|-",
            "Productos y servicios de elección voluntaria",
            "14-ENE-26|SEGURO TARJETA|2,300.00|-",
            "Otras líneas de financiamiento",
            "16-ENE-26|CUOTA FINANCIAMIENTO EQUIPO|18,500.00|-",
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
