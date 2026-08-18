"""Generate the synthetic Promerica-stub multi-statement PDF fixture (Story 4.5, Task 3.3).

Rerun after changing the fixture's shape:

    uv run python scripts/generate_promerica_stub_fixture.py

Not a real Promerica layout — a minimal synthetic PDF with 2+ clearly-marked
"statement" sections, proving PromericaStubAdapter.split() generalizes the
shared detect_statement_boundaries() (AD-27) multi-statement path beyond
BAC's single-adapter case (AC #2). Every value is invented — no real
statement data, no PII (NFR-2).

Row format matches promerica_stub.py's parser:
"{date}|{description}|{amount}", DD-MMM-YY Spanish date, single CRC amount
column (no dual-column complexity — that's already proven by BacCreditAdapter).
"""

from __future__ import annotations

from pathlib import Path

from fpdf import FPDF

OUTPUT_PATH = (
    Path(__file__).resolve().parent.parent
    / "tests"
    / "fixtures"
    / "pdf"
    / "promerica_stub_multi.pdf"
)


def _add_statement_page(pdf: FPDF, lines: list[str]) -> None:
    pdf.add_page()
    pdf.set_font("Courier", size=9)
    for line in lines:
        pdf.cell(0, 5, line, new_x="LMARGIN", new_y="NEXT")


def build_fixture() -> bytes:
    pdf = FPDF()

    _add_statement_page(
        pdf,
        [
            "ESTADO DE CUENTA PROMERICA STUB",
            "Detalle de movimientos",
            "05-ENE-26|COMERCIO GENERICO UNO|1,000.00",
        ],
    )
    _add_statement_page(
        pdf,
        [
            "ESTADO DE CUENTA PROMERICA STUB",
            "Detalle de movimientos",
            "10-ENE-26|COMERCIO GENERICO DOS|2,000.00",
        ],
    )

    return bytes(pdf.output())


def main() -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_bytes(build_fixture())
    print(f"Wrote {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
