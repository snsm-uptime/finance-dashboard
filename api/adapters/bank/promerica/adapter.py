"""Promerica credit-card adapter — real parser replacing the Story 4.5 stub.

Per AD-1/AD-16 this returns normalized CanonicalLine rows to the application
layer and does nothing else: it never commits, touches lists/membership, or
calls other adapters.

Structurally modeled on `adapters/bank/bac_credit/adapter.py` (the sibling
CURRENCY_VARIANT adapter), but real Promerica text has two section shapes
BAC credit never needed (Story 4.9.2 Task 1, evidence gathered directly from
`bank_data/PROMERICA_CRED.pdf`, gitignored, never committed):

- "Detalle de pagos del periodo" prints FOUR amount columns per row
  (transacción-colones, interés-colones, transacción-US$, interés-US$), not
  BAC credit's two. Only the transaction columns (index 0 and 2) are this
  row's own payment amount — the interest-breakdown columns belong
  conceptually to "Detalle de intereses" and must not be double-counted
  (undetermined-by-PRD convention, chosen here, applied consistently).
- "Detalle de intereses" rows split concept and amounts across two
  consecutive lines with no date at all (e.g. "MONTO POR INTERESES
  CORRIENTES" then, on the next line, "99.59 0.00") — paired here by
  buffering the most recently seen non-data line while the interest section
  is active.

Real Promerica amounts also use a LEADING minus for negative values (e.g.
payment rows, and an observed purchase refund), unlike BAC credit's
TRAILING-minus convention (`_shared.parse_amount_field`). The shared
`domain.statement_row_extraction` amount pattern only ever captures a
trailing minus, so this adapter extracts signed amount tokens itself
(`_AMOUNT_TOKEN_RE`) rather than trusting `extract_row_tokens().amounts` for
the final CanonicalLine value — `is_data_row`/`is_data_row`'s amount-shaped
check (sign-agnostic) is still the shared classifier used for AC #5's "no
private delimiter check" requirement.
"""

from __future__ import annotations

import io
import logging
import re
from datetime import date
from decimal import Decimal, InvalidOperation

import pdfplumber
import pypdfium2 as pdfium
from domain.canonical_line import (
    SECTION_POLICY_BEST_EFFORT,
    SECTION_POLICY_IGNORE,
    SECTION_POLICY_MUST_PARSE,
    CanonicalLine,
    normalize_dual_column_amount,
    validate_canonical_line,
)
from domain.errors import InvalidCanonicalLineError
from domain.line_types import (
    LINE_TYPE_FEE,
    LINE_TYPE_INTEREST,
    LINE_TYPE_PAYMENT,
    LINE_TYPE_PURCHASE,
    LINE_TYPE_VOLUNTARY_SERVICE,
)
from domain.statement_dates import parse_statement_date
from domain.statement_layout import SectionCursor, SectionSpec, detect_statement_boundaries
from domain.statement_row_extraction import AmountColumnRole, is_data_row

from adapters.bank._shared import fail_parse, sniff_content_marker

_logger = logging.getLogger(__name__)

# Content-sniff markers: printed once per statement page. The second one
# also doubles as the split() statement-boundary marker (AD-27).
_BANK_NAME_MARKER = "Banco Promerica de Costa Rica"
_STATEMENT_HEADER_MARKER = "MOVIMIENTOS DE LA TARJETA DE CRÉDITO"

# AD-26: real dates print as numeric DD/MM/YYYY (e.g. "23/12/2025") — no
# Spanish-month abbreviation, and the year token is present (no reference
# date fallback needed for row dates).
_DATE_FORMAT = "%d/%m/%Y"

# Real section titles (2026-09-22 session, direct pdfplumber extraction).
# Note the trailing asterisks on the last two: printed exactly this way,
# footnote-referenced — the epic AC text quoted them without asterisks,
# which is an epic-text transcription gap, not evidence the PDF differs.
_SECTIONS = [
    SectionSpec("Detalle de pagos del periodo", LINE_TYPE_PAYMENT, SECTION_POLICY_MUST_PARSE),
    SectionSpec("Detalle de compras del periodo", LINE_TYPE_PURCHASE, SECTION_POLICY_MUST_PARSE),
    SectionSpec("Detalle de intereses", LINE_TYPE_INTEREST, SECTION_POLICY_MUST_PARSE),
    SectionSpec("Detalle de otros cargos", LINE_TYPE_FEE, SECTION_POLICY_MUST_PARSE),
    SectionSpec(
        "Detalle de productos y servicios de elección voluntaria*",
        LINE_TYPE_VOLUNTARY_SERVICE,
        SECTION_POLICY_BEST_EFFORT,
    ),
    SectionSpec("Cargos por gestión evidenciable de cobro**", None, SECTION_POLICY_IGNORE),
]

_SECTION_TITLES = frozenset(spec.title for spec in _SECTIONS)

# Section total lines (e.g. "Total de compras del periodo de ... 591,158.06
# 23.00") are themselves date+amount shaped and print right after a
# section's last real row — without this skip they would be misclassified
# as one more data row under the still-active MUST_PARSE section (and, for
# "Detalle de intereses", as an orphaned amount-only row with no preceding
# concept line). Real evidence: every declared section prints one.
_TOTAL_LINE_RE = re.compile(r"^Total\b", re.IGNORECASE)

# Own token regexes rather than domain's shared amount pattern: Promerica
# encodes negative amounts with a LEADING minus (unlike BAC credit's
# trailing-minus convention), which the shared DEFAULT_AMOUNT_PATTERN does
# not capture. is_data_row() (sign-agnostic) remains the shared classifier
# per AC #5; only the final signed value is extracted with this regex.
_DATE_TOKEN_RE = re.compile(r"\b\d{1,2}/\d{1,2}/\d{4}\b")
_AMOUNT_TOKEN_RE = re.compile(r"-?\d{1,3}(?:,\d{3})*\.\d{2}")

# Printed reference date for the "Detalle de intereses" section's dateless
# rows (mirrors BacCreditAdapter's "Fecha de emisión:" pattern). Not PDF
# metadata: pypdfium2's split() rewrites a fresh /CreationDate onto each
# chunk, so metadata alone is unreliable once a multi-statement PDF has been
# split — the printed field survives extraction unaffected.
_CUTOFF_DATE_RE = re.compile(r"Fecha de Corte\s*(\d{1,2}/\d{1,2}/\d{4})", re.IGNORECASE)

# Known non-data boilerplate lines that are not section titles: card-number
# marker lines printed mid-section, and every section's own column
# sub-header line(s) (real evidence, 2026-09-22 session for the payment
# section; 2026-09-23 session, against a real full statement, for the
# remaining five — every declared section prints its own column-header
# line(s) directly under its title, not just the payment section). Recognized
# here so they don't get mistaken for an unrecognized section (see the "elif
# seen_section_header" branch in parse()). "Monto en Monto en" is the shared
# first sub-header line for compras/otros cargos/voluntaria/cobro — each of
# those four sections then differs in its second line, so each is listed
# individually rather than assumed identical.
_CARD_NUMBER_MARKER_RE = re.compile(r"^X{4}-X{4}-X{4}-")
_KNOWN_BOILERPLATE_LINES = frozenset(
    {
        # Detalle de pagos del periodo (payment)
        "Transacción en Interés en Transacciones Interés en",
        "Fecha de Pagos Concepto / Descripción colones colones en US$ US$",
        # Shared first sub-header line: compras / otros cargos / voluntaria / cobro
        "Monto en Monto en",
        # Detalle de compras del periodo
        "Fecha de la transacción Concepto / Descripción Lugar / Moneda colones US$",
        # Detalle de intereses
        "Interés en Interés en",
        "Concepto / Descripción colones US$",
        # Detalle de otros cargos
        "Fecha de Pagos Concepto / Descripción Lugar / Moneda colones US$",
        # Detalle de productos y servicios de elección voluntaria*
        "Fecha Concepto / Descripción Lugar / Moneda Colones US$",
        # Cargos por gestión evidenciable de cobro**
        "Fecha Concepto / Descripción Lugar / Moneda colones US$",
    }
)


def _is_section_header_line(line: str) -> bool:
    return line in _SECTION_TITLES


def _is_known_boilerplate_line(line: str) -> bool:
    return bool(_CARD_NUMBER_MARKER_RE.match(line)) or line in _KNOWN_BOILERPLATE_LINES


def _printed_cutoff_date(lines: list[str]) -> date | None:
    for line in lines:
        match = _CUTOFF_DATE_RE.search(line)
        if match is None:
            continue
        iso = parse_statement_date(match.group(1), date_format=_DATE_FORMAT)
        return date.fromisoformat(iso)
    return None


def _parse_amount(raw: str) -> Decimal:
    return Decimal(raw.replace(",", ""))


def _row_shape(line: str) -> tuple[str | None, list[str], str]:
    """Date token (or None), raw signed-amount tokens in printed order, and
    the description remainder once both are stripped out."""
    date_match = _DATE_TOKEN_RE.search(line)
    date_token = date_match.group(0) if date_match else None
    amount_tokens = _AMOUNT_TOKEN_RE.findall(line)

    remainder = line
    if date_token:
        remainder = remainder.replace(date_token, " ", 1)
    for token in amount_tokens:
        remainder = remainder.replace(token, " ", 1)
    description = " ".join(remainder.split())

    return date_token, amount_tokens, description


def _creation_date(metadata: dict | None) -> date | None:
    """Parse the PDF /CreationDate — fallback only (see `_printed_cutoff_date`
    for why this alone is unreliable after split()). Unlike BAC's real PDFs,
    Promerica's pdfplumber metadata IS populated on an unsplit statement
    (evidence: `Oracle12c AS Reports Services` producer, real /CreationDate)."""
    raw = (metadata or {}).get("CreationDate")
    if not isinstance(raw, str) or not raw.strip():
        return None
    text = raw.strip()
    if text.startswith("D:"):
        text = text[2:]
    if len(text) < 8 or not text[:8].isdigit():
        return None
    return date(int(text[0:4]), int(text[4:6]), int(text[6:8]))


class PromericaAdapter:
    """BankAdapter implementation for Promerica's real credit-card statement product."""

    bank_id = "promerica"
    product_id = "promerica_credit"
    account_kind = "credit"
    amount_column_role = AmountColumnRole.CURRENCY_VARIANT

    # AD-27: which boundary-detection rule fired on the last split() call —
    # not part of the BankAdapter Protocol, retained for test/debug visibility.
    last_split_boundary_method: str | None = None

    def detect(self, *, filename: str, content_sample: bytes) -> bool:
        filename_match = "promerica" in filename.lower()
        if not content_sample:
            return filename_match

        content_match = sniff_content_marker(
            content_sample,
            _BANK_NAME_MARKER,
            logger=_logger,
            adapter_name="PromericaAdapter",
        ) and sniff_content_marker(
            content_sample,
            _STATEMENT_HEADER_MARKER,
            logger=_logger,
            adapter_name="PromericaAdapter",
        )
        return filename_match or content_match

    def split(self, pdf_bytes: bytes) -> list[bytes]:
        try:
            with pdfplumber.open(io.BytesIO(pdf_bytes)) as doc:
                pages = [(page.extract_text() or "").splitlines() for page in doc.pages]
        except Exception as exc:
            raise InvalidCanonicalLineError("Could not read statement PDF.") from exc

        if not pages:
            raise InvalidCanonicalLineError("Statement PDF has no pages.")

        boundaries, method = detect_statement_boundaries(pages, marker=_STATEMENT_HEADER_MARKER)
        self.last_split_boundary_method = method

        src = pdfium.PdfDocument(pdf_bytes)
        chunks: list[bytes] = []
        for idx, start in enumerate(boundaries):
            end = boundaries[idx + 1] if idx + 1 < len(boundaries) else len(src)
            dst = pdfium.PdfDocument.new()
            dst.import_pages(src, pages=list(range(start, end)))
            buf = io.BytesIO()
            dst.save(buf)
            chunks.append(buf.getvalue())
        return chunks

    def parse(self, statement_bytes: bytes) -> list[CanonicalLine]:
        try:
            lines: list[str] = []
            metadata: dict | None = None
            with pdfplumber.open(io.BytesIO(statement_bytes)) as doc:
                metadata = doc.metadata
                for page in doc.pages:
                    text = page.extract_text() or ""
                    lines.extend(text.splitlines())
        except Exception as exc:
            raise fail_parse(
                "Could not read statement PDF.", gap_raw="Could not read statement PDF."
            ) from exc

        stripped_lines = [raw.strip() for raw in lines if raw.strip()]
        try:
            reference_date = _printed_cutoff_date(stripped_lines) or _creation_date(metadata)
        except ValueError as exc:
            raise fail_parse(
                "Could not resolve statement reference date.",
                gap_raw="Could not resolve statement reference date.",
            ) from exc
        rows: list[CanonicalLine] = []
        cursor = SectionCursor(_SECTIONS)
        seen_section_header = False
        pending_interest_concept: str | None = None

        for line in stripped_lines:
            if _TOTAL_LINE_RE.match(line):
                continue

            _, active_spec = cursor.classify_data_row()
            in_interest_section = (
                active_spec is not None and active_spec.line_type == LINE_TYPE_INTEREST
            )
            requires_date = not in_interest_section

            if not is_data_row(line, requires_date=requires_date):
                if _is_section_header_line(line):
                    cursor.see_header_line(line)
                    seen_section_header = True
                    pending_interest_concept = None
                elif _is_known_boilerplate_line(line):
                    pass  # column sub-header / card-number marker: no cursor change.
                elif in_interest_section:
                    # Task 3: buffer the concept line for the next amount-only
                    # interest data row to pair with (two-line shape). Fail
                    # loud rather than silently overwrite an unpaired concept
                    # line already buffered (AD-25/NFR-8) — a real amount-only
                    # row is always expected to follow the concept line it
                    # pairs with.
                    if pending_interest_concept is not None:
                        raise fail_parse(
                            "Interest concept line found with no preceding "
                            f"amount row for buffered concept: {pending_interest_concept!r}.",
                            rows=rows,
                            gap_raw=pending_interest_concept,
                        )
                    pending_interest_concept = line
                elif seen_section_header:
                    # Promerica titles have no common lettered prefix (unlike
                    # BAC's "A)".."G)"), so an unrecognized header-ish line
                    # can only be caught once we're past the initial preamble
                    # (AD-25): route it through SectionCursor's own
                    # unrecognized-title path so a row under it fails loud
                    # instead of silently staying attributed to the last
                    # real section.
                    cursor.see_header_line(line)
                continue

            kind, spec = cursor.classify_data_row()
            if kind == "ignored":
                continue
            if kind == "unmapped" or spec is None:
                # Preamble (account-summary boilerplate) before any declared
                # section: skip. After an unrecognized section, fail loud.
                if not seen_section_header:
                    continue
                raise fail_parse(
                    f"Statement row found under an unmapped section: {line!r}.",
                    rows=rows,
                    gap_raw=line,
                )

            line_type = spec.line_type
            assert line_type is not None  # SECTION_POLICY_IGNORE rows never reach here.

            try:
                if line_type == LINE_TYPE_INTEREST:
                    if pending_interest_concept is None:
                        raise ValueError(
                            "interest amount row with no preceding concept line buffered"
                        )
                    _, amount_tokens, _ = _row_shape(line)
                    if len(amount_tokens) != 2:
                        raise ValueError(
                            f"expected 2 amount columns in interest row, got {len(amount_tokens)}"
                        )
                    currency, amount = normalize_dual_column_amount(
                        _parse_amount(amount_tokens[0]), _parse_amount(amount_tokens[1])
                    )
                    description = pending_interest_concept
                    pending_interest_concept = None
                    if reference_date is None:
                        raise ValueError("interest row requires a statement reference date")
                    posted_date = reference_date.isoformat()
                elif line_type == LINE_TYPE_PAYMENT:
                    date_token, amount_tokens, description = _row_shape(line)
                    if date_token is None:
                        raise ValueError("payment row missing date token")
                    if len(amount_tokens) != 4:
                        raise ValueError(
                            f"expected 4 amount columns in payment row, got {len(amount_tokens)}"
                        )
                    # Task 1 Discrepancy A: only the transaction columns
                    # (index 0 colones, index 2 US$) are this row's own
                    # amount — index 1/3 are the interest breakdown.
                    currency, amount = normalize_dual_column_amount(
                        _parse_amount(amount_tokens[0]), _parse_amount(amount_tokens[2])
                    )
                    posted_date = parse_statement_date(date_token, date_format=_DATE_FORMAT)
                else:
                    date_token, amount_tokens, description = _row_shape(line)
                    if date_token is None:
                        raise ValueError("row missing date token")
                    if len(amount_tokens) != 2:
                        raise ValueError(f"expected 2 amount columns, got {len(amount_tokens)}")
                    currency, amount = normalize_dual_column_amount(
                        _parse_amount(amount_tokens[0]), _parse_amount(amount_tokens[1])
                    )
                    posted_date = parse_statement_date(date_token, date_format=_DATE_FORMAT)
            except (ValueError, KeyError, InvalidOperation) as exc:
                raise fail_parse(
                    f"Malformed statement row: {line!r}.",
                    rows=rows,
                    gap_raw=line,
                ) from exc

            canonical_line = CanonicalLine(
                posted_date=posted_date,
                amount=amount,
                currency=currency,
                product_id=self.product_id,
                line_type=line_type,
                normalized_description=description,
            )
            validate_canonical_line(canonical_line)
            rows.append(canonical_line)

        return rows
