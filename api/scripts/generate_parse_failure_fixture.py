"""Synthetic Promerica stub mixed parse-failure PDF (Story 5.1, AC #6).

Chunk 1: one valid row then a malformed amount (fail-loud + evidence).
Chunk 2: a clean sibling statement.

    uv run python scripts/generate_parse_failure_fixture.py
"""

from __future__ import annotations

from pathlib import Path

from fpdf import FPDF

_FIXTURE_DIR = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "pdf"
OUTPUT_PATH = _FIXTURE_DIR / "promerica_stub_parse_failure_mixed.pdf"


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
            "ESTADO DE CUENTA PROMERICA STUB",
            "Detalle de movimientos",
            "05-ENE-26|COMERCIO GENERICO UNO|1,000.00",
            "07-ENE-26|COMERCIO GENERICO MALO|not-an-amount",
        ],
    )
    _add_page(
        pdf,
        [
            "ESTADO DE CUENTA PROMERICA STUB",
            "Detalle de movimientos",
            "10-ENE-26|COMERCIO GENERICO DOS|2,000.00",
        ],
    )
    return bytes(pdf.output())


def main() -> None:
    OUTPUT_PATH.write_bytes(build_mixed_parse_failure_fixture())
    print(f"wrote {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
