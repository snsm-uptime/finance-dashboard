"""Synthetic Promerica mixed parse-failure PDF (Story 5.1 AC #6; reshaped for the
real PromericaAdapter by Story 4.9.2 — the Story 4.5 stub's pipe-delimited
"Detalle de movimientos" shape is gone, replaced by real Promerica row text).

Chunk 1: one valid purchase row, then a row under an unrecognized section
header, which fails the whole statement (fail-loud + evidence). A row with a
missing amount is a flagged row now (partial import), so it is not used here.
Chunk 2: a clean sibling statement.

    uv run python scripts/generate_parse_failure_fixture.py
"""

from __future__ import annotations

from pathlib import Path

from fpdf import FPDF

_FIXTURE_DIR = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "pdf"
OUTPUT_PATH = _FIXTURE_DIR / "promerica_parse_failure_mixed.pdf"


def _add_page(pdf: FPDF, lines: list[str]) -> None:
    pdf.add_page()
    pdf.set_font("Courier", size=9)
    for line in lines:
        pdf.cell(0, 5, line, new_x="LMARGIN", new_y="NEXT")


def build_mixed_parse_failure_fixture() -> bytes:
    pdf = FPDF()
    _add_page(
        pdf,
        [
            "Banco Promerica de Costa Rica, S.A.",
            "MOVIMIENTOS DE LA TARJETA DE CRÉDITO",
            "Detalle de compras del periodo",
            "05/01/2026 COMERCIO GENERICO UNO SAN JOSE CRI 1,000.00 0.00",
            "Seccion desconocida sin montos",
            "07/01/2026 COMERCIO GENERICO TRES SAN JOSE CRI 500.00 0.00",
        ],
    )
    _add_page(
        pdf,
        [
            "Banco Promerica de Costa Rica, S.A.",
            "MOVIMIENTOS DE LA TARJETA DE CRÉDITO",
            "Detalle de compras del periodo",
            "10/01/2026 COMERCIO GENERICO DOS SAN JOSE CRI 2,000.00 0.00",
        ],
    )
    return bytes(pdf.output())


def main() -> None:
    OUTPUT_PATH.write_bytes(build_mixed_parse_failure_fixture())
    print(f"wrote {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
