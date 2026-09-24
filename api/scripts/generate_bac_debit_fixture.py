"""Generate the synthetic BAC debit-account PDF fixture (Story 4.9.1, Task 4).

Rerun after changing the fixture's shape:

    uv run python scripts/generate_bac_debit_fixture.py

Every value is invented — no real statement data, no PII (NFR-2/AD-11).

Row/column shape matches real pdfplumber-extracted BAC debit text (session
evidence, Story 4.9.1 Dev Notes): one continuous transaction table (no
lettered sections), a `NO. REFERENCIA FECHA CONCEPTO DEBITOS CREDITOS`
column header, `CUADRO RESUMEN` preamble (with a data-row-shaped totals-line
decoy) before it, and `... SALDO AL CORTE` boilerplate after it. Each data
row carries exactly one amount token, positioned in fixed character columns
so its physical x-position (as pdfplumber's extract_words() sees it) lands
inside BacDebitAdapter's declared DÉBITOS/CRÉDITOS x-position ranges — this
fixture's own geometry is what those ranges are calibrated against (verified
by round-tripping through pdfplumber below), not the real-PDF session's
numbers, which AD-28 itself warns drift page to page.
"""

from __future__ import annotations

import io
from datetime import UTC, datetime
from pathlib import Path

import pdfplumber
from fpdf import FPDF

_FIXTURE_DIR = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "pdf"
OUTPUT_PATH = _FIXTURE_DIR / "bac_debit_synthetic.pdf"

FIXTURE_CREATION_DATE = datetime(2026, 6, 30, 12, 0, 0, tzinfo=UTC)

# Fixed character columns (Courier is monospaced, so a character offset maps
# to a stable x-position once font/size are fixed) — mirrors the real
# statement's two-column layout: reference/date/description on the left,
# then a DEBITOS field, then a CREDITOS field, each amount right-aligned
# within its own field so a lone amount's x-position falls consistently
# inside one column or the other.
_DEBITOS_COL_WIDTH = 15
_CREDITOS_COL_WIDTH = 15


def _row(ref: str, when: str, description: str, *, debitos: str = "", creditos: str = "") -> str:
    left = f"{ref:<11}{when:<8}{description}"
    return f"{left}{debitos:>{_DEBITOS_COL_WIDTH}}{creditos:>{_CREDITOS_COL_WIDTH}}"


def build_fixture() -> bytes:
    pdf = FPDF()
    pdf.set_creation_date(FIXTURE_CREATION_DATE)
    pdf.add_page()
    pdf.set_font("Courier", size=9)

    header_row = _row("NO.", "FECHA", "REFERENCIA CONCEPTO", debitos="DEBITOS", creditos="CREDITOS")
    assert "REFERENCIA" in header_row and "CONCEPTO" in header_row
    lines = [
        "BANCO DE AMERICA CENTRAL (BAC)",
        "Cuenta IBAN: CR00 0000 0000 0000 0000 00",
        "Moneda: COLONES",
        "Fecha de Corte: 30/JUN/26",
        "CUADRO RESUMEN",
        "DEBITOS CREDITOS SALDOS",
        # Totals-line decoy: multiple amount-shaped tokens, no header seen
        # yet — must not be parsed as a transaction row (AC #5).
        "42 2019,411.82 8 1644,280.26 487,997.97 1,309,316.43 934,184.87",
        header_row,
        _row("053100000", "MAY/29", "IVA -UBER *TRIP-HELP.UB", debitos="284.26"),
        _row("000000002", "JUN/01", "Sobrantesporrefundiciondec", debitos="50,000.00"),
        _row("000000003", "JUN/02", "TRANSFERENCIA RECIBIDA", creditos="75,000.00"),
        "ULTIMA LINEA SALDO AL CORTE 934,184.87",
        "Gracias por su preferencia.",
    ]
    for line in lines:
        pdf.cell(0, 5, line, new_x="LMARGIN", new_y="NEXT")

    return bytes(pdf.output())


def _verify_geometry(pdf_bytes: bytes) -> None:
    """Round-trip the fixture through pdfplumber to confirm the amount
    tokens' x-positions actually land where BacDebitAdapter expects them —
    the same integration-honesty concern Story 4.9's fixture generator
    flagged for itself."""
    from adapters.bank.bac_debit.adapter import _CREDITOS_RANGE, _DEBITOS_RANGE

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as doc:
        words = doc.pages[0].extract_words()

    by_text = {w["text"]: w for w in words}
    debito_amounts = ["284.26", "50,000.00"]
    credito_amounts = ["75,000.00"]

    for amount in debito_amounts:
        word = by_text[amount]
        mid = (word["x0"] + word["x1"]) / 2
        assert _DEBITOS_RANGE[0] <= mid <= _DEBITOS_RANGE[1], (
            f"{amount!r} midpoint {mid} outside DEBITOS range {_DEBITOS_RANGE}"
        )
    for amount in credito_amounts:
        word = by_text[amount]
        mid = (word["x0"] + word["x1"]) / 2
        assert _CREDITOS_RANGE[0] <= mid <= _CREDITOS_RANGE[1], (
            f"{amount!r} midpoint {mid} outside CREDITOS range {_CREDITOS_RANGE}"
        )


def main() -> None:
    _FIXTURE_DIR.mkdir(parents=True, exist_ok=True)
    pdf_bytes = build_fixture()
    _verify_geometry(pdf_bytes)
    OUTPUT_PATH.write_bytes(pdf_bytes)
    print(f"Wrote {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
