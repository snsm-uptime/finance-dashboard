"""Bank statement recon CLI — turn a real statement into a test mock + extraction mapping.

Dev workflow this supports: you have a real bank statement PDF and want (1) an
anonymized mock PDF safe to commit as a test fixture, and (2) a mapping of the
statement's structure (section headers, column positions, date/amount shape)
to jump-start writing a new BankAdapter (Story 4.4's contract).

The real input file is only ever read — its content is never written to disk,
logged, or persisted, with one deliberate exception: mapping.yaml's
`statement_marker` and each section's `header_lines` are real text lifted
verbatim from the source PDF, because a real bank's section vocabulary (e.g.
"Detalle de compras") is exactly what a BankAdapter needs. Header detection
is best-effort and CAN misclassify a stray line (e.g. a name) as a header —
always manually review those fields for personal data before committing
mapping.yaml. Sections are listed in document order and are NOT deduplicated
by text — the same header text can legitimately appear in more than one
entry if it labels different tables (e.g. a repeated column sub-header).
Everything else in the mapping (counts, positions, the mock PDF) is
synthetic — no other real values are echoed anywhere.

The mock is a *freshly generated* synthetic PDF (same technique as
scripts/generate_bac_fixture.py) built from the *shape* of what was found
(section headers, row counts, column layout) — not a redacted copy of the
original file's pixels/content stream.

Usage:
    uv run python scripts/statement_recon.py /path/to/real_statement.pdf
    uv run python scripts/statement_recon.py /path/to/real_statement.pdf \\
        --bank promerica --out-dir tests/fixtures/bank_recon/promerica --seed 7
"""

from __future__ import annotations

import argparse
import random
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

import pdfplumber
import yaml
from fpdf import FPDF

_SPANISH_MONTHS = "ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC"
_DATE_MONTH_RE = re.compile(r"\b\d{1,2}[-/][A-ZÁÉÍÓÚÑ]{3,4}[-/]\d{2,4}\b", re.IGNORECASE)
# Some BAC products (debit accounts) print MMM/DD with no year instead of
# credit cards' DD-MMM-YY — e.g. "DIC/31", "ENE/15". Constrained to real
# Spanish month abbreviations (not any 3-4 letters) to avoid false positives.
_DATE_MONTH_DAY_RE = re.compile(rf"\b({_SPANISH_MONTHS})/\d{{1,2}}\b", re.IGNORECASE)
_DATE_NUMERIC_RE = re.compile(r"\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b")
_AMOUNT_RE = re.compile(r"\b\d{1,3}(?:,\d{3})*\.\d{2}\b")
_PAGE_COUNTER_RE = re.compile(r"p[aá]gina\s+(\d+)\s+de\s+(\d+)", re.IGNORECASE)
_PAGE_COUNTER_EN_RE = re.compile(r"page\s+(\d+)\s+of\s+(\d+)", re.IGNORECASE)

_GENERIC_DESCRIPTIONS = [
    "COMERCIO GENERICO",
    "TIENDA DE PRUEBA",
    "SERVICIO EJEMPLO",
    "PROVEEDOR DEMO",
    "ESTABLECIMIENTO FICTICIO",
]

_MAX_HEADER_LEN = 60


@dataclass
class SectionStats:
    # The full run of header-like lines seen since the last data row, in
    # document order — real bank statements print multi-line/two-level
    # headers (a section title immediately followed by column sub-headers,
    # e.g. "B) Detalle de compras del periodo" then "colones dólares").
    # Keeping the whole run (instead of just the last line) avoids silently
    # discarding the real section title in favor of a column-label fragment.
    header_lines: list[str]
    row_count: int = 0
    dual_column_rows: int = 0
    first_seen_page: int = 0
    date_x_range: list[float] = field(default_factory=lambda: [None, None])  # type: ignore[arg-type]
    amount_x_ranges: list[tuple[float, float]] = field(default_factory=list)


def _has_date_token(line: str) -> bool:
    return bool(
        _DATE_MONTH_RE.search(line)
        or _DATE_MONTH_DAY_RE.search(line)
        or _DATE_NUMERIC_RE.search(line)
    )


def _amount_tokens(line: str) -> list[str]:
    return _AMOUNT_RE.findall(line)


def _looks_like_header(line: str) -> bool:
    """Best-effort "this is a boilerplate section label, not a data value" guess.

    Deliberately conservative: a bare one-word line (e.g. a cardholder's first
    name printed alone) must NOT pass, since header text is echoed verbatim
    into mapping.yaml — real section labels in bank statements are reliably
    multi-word phrases ("Detalle de compras", "Otros cargos"), personal data
    printed alone on a line usually is not. This narrows but does not
    eliminate the risk — always manually review "header" values before
    committing the mapping (see the CLI's printed warning and mapping note).
    """
    stripped = line.strip()
    if not stripped or len(stripped) > _MAX_HEADER_LEN:
        return False
    if len(stripped.split()) < 2:
        return False
    digit_count = sum(ch.isdigit() for ch in stripped)
    return digit_count <= 1 and not _has_date_token(stripped) and not _amount_tokens(stripped)


def _page_counter(lines: list[str]) -> tuple[int, int] | None:
    """Find a "Página X de Y" / "Page X of Y" style page counter on a page.

    A far more reliable statement-boundary signal than a repeating page
    header: a printed page counter resetting to 1 is real evidence of a new
    statement starting; a running header (e.g. a bank's name on every page)
    repeating is not — it just means the pages belong to the same document.
    """
    for line in lines:
        match = _PAGE_COUNTER_RE.search(line) or _PAGE_COUNTER_EN_RE.search(line)
        if match:
            return int(match.group(1)), int(match.group(2))
    return None


def _word_x_range(words: list[dict], predicate) -> tuple[float, float] | None:
    matches = [w for w in words if predicate(w["text"])]
    if not matches:
        return None
    return (min(w["x0"] for w in matches), max(w["x1"] for w in matches))


@dataclass
class ReconResult:
    page_count: int
    statement_marker: str | None
    statement_boundaries: list[int]
    statement_count_method: str
    sections: list[SectionStats]
    metadata_lines: set[str]


def analyze(pdf_path: Path) -> ReconResult:
    sections: list[SectionStats] = []
    metadata_lines: set[str] = set()
    all_first_lines: list[str] = []

    with pdfplumber.open(pdf_path) as doc:
        page_count = len(doc.pages)
        pages_data = []
        for page in doc.pages:
            text = page.extract_text() or ""
            lines = [line.strip() for line in text.splitlines() if line.strip()]
            if lines:
                all_first_lines.append(lines[0])
            pages_data.append((lines, page.extract_words()))

        page_counters = [_page_counter(lines) for lines, _ in pages_data]

        marker_candidate = all_first_lines[0] if all_first_lines else None
        marker_is_repeating = (
            marker_candidate is not None
            and sum(1 for line in all_first_lines if line == marker_candidate) > 1
        )
        marker_text = marker_candidate if marker_is_repeating else None

        # Document-scoped (not per-page): a table's header can be printed just
        # before a page break, with its data rows continuing on the next page.
        pending_header_lines: list[str] = []
        current_entry: SectionStats | None = None
        header_seen_since_last_row = False

        for page_index, (lines, words) in enumerate(pages_data):
            for line in lines:
                if _has_date_token(line) and _amount_tokens(line):
                    # Transaction row. Start a NEW section entry whenever any
                    # header-like line was seen since the last row — even if
                    # its text repeats an earlier section's, since we can't
                    # reliably tell "same section continuing" from "different
                    # table reusing the same column label" (e.g. "colones
                    # dólares") from text alone. Prefer over-splitting to
                    # silently merging unrelated tables.
                    if current_entry is None or header_seen_since_last_row:
                        current_entry = SectionStats(
                            header_lines=list(pending_header_lines)
                            or ["(rows before any recognized header)"],
                            first_seen_page=page_index + 1,
                        )
                        sections.append(current_entry)
                        pending_header_lines = []
                        header_seen_since_last_row = False

                    stats = current_entry
                    stats.row_count += 1
                    amounts = _amount_tokens(line)
                    if len(amounts) >= 2:
                        stats.dual_column_rows += 1

                    date_range = _word_x_range(
                        words,
                        lambda t: bool(
                            _DATE_MONTH_RE.fullmatch(t)
                            or _DATE_MONTH_DAY_RE.fullmatch(t)
                            or _DATE_NUMERIC_RE.fullmatch(t)
                        ),
                    )
                    if date_range and stats.date_x_range[0] is None:
                        stats.date_x_range = [date_range[0], date_range[1]]
                    for amount in amounts:
                        amount_range = _word_x_range(words, lambda t, a=amount: t == a)
                        if amount_range:
                            stats.amount_x_ranges.append(amount_range)
                elif line == marker_text:
                    metadata_lines.add(line)
                elif _looks_like_header(line):
                    pending_header_lines.append(line)
                    header_seen_since_last_row = True
                else:
                    metadata_lines.add(line)

    pages_with_counters = sum(1 for pc in page_counters if pc is not None)
    if pages_with_counters:
        # A printed page counter resetting to 1 is real evidence of a new
        # statement. Pages with no counter found are assumed to continue
        # whichever statement is currently open (no evidence of a reset).
        boundaries = [i for i, pc in enumerate(page_counters) if pc is not None and pc[0] == 1]
        if not boundaries or boundaries[0] != 0:
            boundaries = sorted({0, *boundaries})
        statement_count_method = "page_counter"
    elif marker_text:
        # Fallback: no page counter found anywhere — treat every occurrence
        # of a repeating page header as a statement boundary. Unreliable
        # for statements where that header is just a running page title
        # (single multi-page statement), not a per-statement marker — this
        # is a rough guess, not evidence.
        boundaries = [i for i, line in enumerate(all_first_lines) if line == marker_text]
        statement_count_method = "repeating_marker_guess"
    else:
        boundaries = [0]
        statement_count_method = "no_evidence_assumed_single"

    return ReconResult(
        page_count=page_count,
        statement_marker=marker_text,
        statement_boundaries=boundaries,
        statement_count_method=statement_count_method,
        sections=sections,
        metadata_lines=metadata_lines,
    )


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")
    return slug or "bank"


def write_mapping(
    result: ReconResult, *, bank_id: str, source_filename: str, out_path: Path
) -> None:
    mapping = {
        "bank_id": bank_id,
        "source_filename": source_filename,
        "note": (
            "Auto-generated heuristic recon. SECURITY: 'statement_marker' and every "
            "section 'header_lines' entry below are real text lifted verbatim from "
            "the source PDF (kept because a real bank's section vocabulary is what "
            "a BankAdapter needs) — detection can misclassify a stray line (e.g. a "
            "name) as a header. Manually review all of them for personal data "
            "before committing this file. Sections list is ordered as found in the "
            "document and is NOT deduplicated by text — the same header text can "
            "legitimately appear in multiple entries if it labels different "
            "tables; don't assume repeats are the same section. Nothing else here "
            "is real statement text."
        ),
        "page_count": result.page_count,
        "statement_marker": result.statement_marker,
        "statement_count_detected": len(result.statement_boundaries),
        "statement_count_method": result.statement_count_method,
        "sections": [
            {
                "header_lines": stats.header_lines,
                "row_count": stats.row_count,
                "dual_column_rows": stats.dual_column_rows,
                "first_seen_page": stats.first_seen_page,
                "date_x_range": stats.date_x_range,
                "amount_x_range_sample": stats.amount_x_ranges[0]
                if stats.amount_x_ranges
                else None,
                "sample_row_shape": "DD-MMM-YY | <description> | <amount> [<amount>]",
            }
            for stats in result.sections
        ],
        "metadata_line_count": len(result.metadata_lines),
    }
    out_path.write_text(yaml.safe_dump(mapping, sort_keys=False, allow_unicode=True))


def _random_amount(rng: random.Random) -> str:
    whole = rng.randint(1, 999) * 100 + rng.randint(0, 99)
    cents = rng.randint(0, 99)
    return f"{whole:,}.{cents:02d}"


def _random_date(rng: random.Random) -> str:
    months = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"]
    return f"{rng.randint(1, 28):02d}-{rng.choice(months)}-26"


def build_mock_pdf(result: ReconResult, *, seed: int) -> bytes:
    rng = random.Random(seed)
    pdf = FPDF()

    section_list = result.sections or [
        SectionStats(header_lines=["Detalle de transacciones"], row_count=3)
    ]
    statement_count = max(1, len(result.statement_boundaries))

    for statement_index in range(statement_count):
        pdf.add_page()
        pdf.set_font("Courier", size=9)
        if result.statement_marker:
            pdf.cell(0, 5, result.statement_marker, new_x="LMARGIN", new_y="NEXT")
        pdf.cell(0, 5, f"Cuenta: MOCK-{statement_index + 1:04d}", new_x="LMARGIN", new_y="NEXT")

        for stats in section_list:
            if stats.header_lines[0].startswith("("):
                continue  # Skip the "rows before any recognized header" bucket in the mock.
            for header_line in stats.header_lines:
                pdf.cell(0, 5, header_line, new_x="LMARGIN", new_y="NEXT")
            row_count = max(1, min(stats.row_count, 5))
            for _ in range(row_count):
                description = rng.choice(_GENERIC_DESCRIPTIONS)
                crc_amount = _random_amount(rng)
                usd_amount = _random_amount(rng) if stats.dual_column_rows else "-"
                line = f"{_random_date(rng)}|{description}|{crc_amount}|{usd_amount}"
                pdf.cell(0, 5, line, new_x="LMARGIN", new_y="NEXT")

    return bytes(pdf.output())


def run(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Turn a real bank statement PDF into an anonymized mock fixture + extraction mapping."
        )
    )
    parser.add_argument(
        "statement_path", type=Path, help="Path to the real statement PDF (read-only)."
    )
    parser.add_argument(
        "--bank",
        type=str,
        default=None,
        help="Bank id used for output naming (default: derived from the input filename).",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=None,
        help="Output directory for the mock PDF + mapping.yaml "
        "(default: tests/fixtures/bank_recon/<bank>/, relative to api/).",
    )
    parser.add_argument(
        "--seed", type=int, default=42, help="Random seed for the mock's synthetic values."
    )
    args = parser.parse_args(argv)

    if not args.statement_path.is_file():
        print(f"error: file not found: {args.statement_path}", file=sys.stderr)
        return 1

    bank_id = _slugify(args.bank or args.statement_path.stem)
    out_dir = args.out_dir or (
        Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "bank_recon" / bank_id
    )
    out_dir.mkdir(parents=True, exist_ok=True)

    try:
        result = analyze(args.statement_path)
    except Exception as exc:  # noqa: BLE001 — CLI boundary, report and exit non-zero
        print(f"error: could not read PDF: {exc}", file=sys.stderr)
        return 1

    if not result.sections:
        print(
            "warning: no transaction-like rows detected — mapping/mock will be minimal.",
            file=sys.stderr,
        )

    mapping_path = out_dir / "mapping.yaml"
    mock_path = out_dir / "mock_statement.pdf"

    write_mapping(
        result, bank_id=bank_id, source_filename=args.statement_path.name, out_path=mapping_path
    )
    mock_path.write_bytes(build_mock_pdf(result, seed=args.seed))

    print(f"bank_id: {bank_id}")
    print(f"pages analyzed: {result.page_count}")
    print(f"sections detected: {len(result.sections)}")
    print(
        f"statements detected: {len(result.statement_boundaries)} "
        f"(method: {result.statement_count_method})"
    )
    print(f"wrote: {mapping_path}")
    print(f"wrote: {mock_path}")
    print(
        "SECURITY: 'statement_marker' and section 'header_lines' values in "
        "mapping.yaml are real text from the source PDF — review them for "
        "personal data before committing this file. Everything else in the "
        "mapping and the mock PDF is synthetic.",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
