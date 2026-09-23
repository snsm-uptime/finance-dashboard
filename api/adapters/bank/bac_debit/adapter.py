"""BAC debit-account (checking) adapter — first real SIGN_VARIANT implementation.

Story 4.9.1. Per AD-1/AD-16 this returns normalized CanonicalLine rows to the
application layer and does nothing else: it never commits, touches
lists/membership, or calls other adapters.

Structurally modeled on `adapters/bank/bac_credit/adapter.py`, but this
product prints one continuous transaction table with no lettered sections
(AC #5) and resolves DÉBITOS vs. CRÉDITOS by physical column x-position
(AD-28's SIGN_VARIANT role) rather than a textual currency tag
(CURRENCY_VARIANT, Story 4.9's BAC credit fix).

account_kind = "checking": this codebase's only other adapter (`bac_credit`)
uses "credit"; no debit/checking value exists yet. "checking" is chosen over
"debit" because "debit" is easily confused with the SIGN_VARIANT DÉBITOS
column semantics used inside a single row, while "checking" names the
account product itself (a Costa Rican colones/dollars current account).
"""

from __future__ import annotations

import io
import logging
import re
from datetime import date
from decimal import Decimal, InvalidOperation

import pdfplumber
import pypdfium2 as pdfium
from domain.canonical_line import CanonicalLine, validate_canonical_line
from domain.errors import InvalidCanonicalLineError
from domain.line_types import LINE_TYPE_DEPOSIT, LINE_TYPE_WITHDRAWAL
from domain.statement_dates import parse_statement_date
from domain.statement_layout import detect_statement_boundaries
from domain.statement_row_extraction import (
    AmountColumnRole,
    SignVariantRanges,
    extract_row_tokens,
    is_data_row,
    resolve_sign_variant_column,
)

from adapters.bank._shared import fail_parse, parse_amount_field, sniff_content_marker

_logger = logging.getLogger(__name__)

# Content-sniff marker: printed once per statement (before the transaction
# table, immediately after the interest-rate/summary boilerplate). Also
# doubles as the split() statement-boundary marker (mirrors bac_credit's
# pattern) — real evidence shows continuation pages of the same statement do
# not reprint it. Distinct from BAC credit's "ESTADO DE CUENTA BAC CREDITO";
# BAC credit statements do not print "CUADRO RESUMEN".
_STATEMENT_HEADER_MARKER = "CUADRO RESUMEN"

_DATE_FORMAT = "%b/%d"

_CUT_OFF_DATE_RE = re.compile(
    r"Fecha de [Cc]orte:\s*(\d{1,2}/[A-ZÁÉÍÓÚÑ]{3}/\d{2})", re.IGNORECASE
)
_MONEDA_RE = re.compile(r"Moneda:\s*(COLONES|DOLARES)", re.IGNORECASE)
_CURRENCY_BY_MONEDA = {"COLONES": "CRC", "DOLARES": "USD"}

# Physical x-position ranges for the transaction-table DÉBITOS/CRÉDITOS
# columns (AD-28 SIGN_VARIANT). Calibrated against this story's own
# synthetic fixture (see generate_bac_debit_fixture.py) via a real
# pdfplumber round-trip — not copied verbatim from the real-PDF evidence
# session, which AD-28 itself warns drifts page to page. Real-PDF operation
# is expected to need re-calibration if drift exceeds this margin; CI only
# gates on the synthetic fixture (project-context.md).
_DEBITOS_KEY = "debitos"
_CREDITOS_KEY = "creditos"
_DEBITOS_RANGE = (300.0, 360.0)
_CREDITOS_RANGE = (362.0, 420.0)
_SIGN_VARIANT_RANGES = SignVariantRanges(
    {_DEBITOS_KEY: _DEBITOS_RANGE, _CREDITOS_KEY: _CREDITOS_RANGE}
)

# Sign convention (undetermined by PRD — chosen here, applied consistently,
# mirroring bac_credit's own documented convention): DÉBITOS (money leaving
# the checking account) is negative; CRÉDITOS (money entering) is positive.
_NEGATIVE_LINE_TYPES = frozenset({LINE_TYPE_WITHDRAWAL})

_Y_TOLERANCE = 3.0


def _signed_amount(amount: Decimal, line_type: str) -> Decimal:
    return -amount if line_type in _NEGATIVE_LINE_TYPES else amount


def _is_column_header_line(line: str) -> bool:
    """The real column-header line, matched loosely (word-geometry
    reconstruction may not reproduce exact original spacing/punctuation)."""
    return "REFERENCIA" in line and "CONCEPTO" in line


def _is_footer_line(line: str) -> bool:
    return "SALDO AL CORTE" in line


def _parse_pdf_creation_date(raw: str) -> date:
    """Parse a PDF /CreationDate string (`D:YYYYMMDD...`) to a calendar date."""
    text = raw.strip()
    if text.startswith("D:"):
        text = text[2:]
    if len(text) < 8 or not text[:8].isdigit():
        raise ValueError(f"Unrecognized PDF CreationDate: {raw!r}")
    return date(int(text[0:4]), int(text[4:6]), int(text[6:8]))


def parse_printed_cutoff_date(lines: list[str]) -> date | None:
    """Parse the printed `Fecha de Corte:` header (DD/MMM/YY — a different
    token order/separator than the row date format, `%b/%d`)."""
    for line in lines:
        match = _CUT_OFF_DATE_RE.search(line)
        if match is None:
            continue
        iso = parse_statement_date(match.group(1), date_format="%d/%b/%y")
        return date.fromisoformat(iso)
    return None


def statement_reference_date(metadata: dict | None, lines: list[str]) -> date | None:
    """Prefer the printed cut-off date; fall back to /CreationDate.

    Real BAC debit PDFs have empty pdfplumber metadata (same gap BAC credit
    hit) — mirrors BacCreditAdapter.statement_reference_date's printed-date-
    first fallback pattern.
    """
    printed = parse_printed_cutoff_date(lines)
    if printed is not None:
        return printed
    raw = (metadata or {}).get("CreationDate")
    if isinstance(raw, str) and raw.strip():
        try:
            return _parse_pdf_creation_date(raw)
        except ValueError:
            return None
    return None


def detect_statement_currency(lines: list[str]) -> str | None:
    """Read currency from the statement's `Moneda:` field (AC #6) — one
    adapter instance handles both COLONES and DOLARES statements."""
    for line in lines:
        match = _MONEDA_RE.search(line)
        if match is not None:
            return _CURRENCY_BY_MONEDA[match.group(1).upper()]
    return None


def _group_words_into_rows(
    words: list[dict], *, y_tolerance: float = _Y_TOLERANCE
) -> list[list[dict]]:
    """Cluster pdfplumber words into visual rows by y-position (AD-28 needs
    per-word x-position geometry, not just extract_text()'s joined lines)."""
    rows: list[list[dict]] = []
    for word in sorted(words, key=lambda w: w["top"]):
        for row in rows:
            if abs(row[0]["top"] - word["top"]) <= y_tolerance:
                row.append(word)
                break
        else:
            rows.append([word])
    for row in rows:
        row.sort(key=lambda w: w["x0"])
    rows.sort(key=lambda row: row[0]["top"])
    return rows


class BacDebitAdapter:
    """BankAdapter implementation for BAC's debit/checking-account statement product."""

    bank_id = "bac"
    product_id = "bac_debit"
    account_kind = "checking"
    amount_column_role = AmountColumnRole.SIGN_VARIANT

    last_split_boundary_method: str | None = None

    def detect(self, *, filename: str, content_sample: bytes) -> bool:
        lower_name = filename.lower()
        # Deliberately more specific than bac_credit's naive "bac in
        # filename" check: requiring both "bac" and a debit-product token
        # avoids an unconditional filename-only collision with
        # BacCreditAdapter for a bare "bac"-named file, letting content
        # sniff be authoritative whenever the filename alone is ambiguous
        # (see Dev Notes on detect_bank_adapter's filename-then-content
        # priority chain — this adapter never claims a bare "bac" filename).
        filename_match = "bac" in lower_name and ("deb" in lower_name or "debit" in lower_name)
        if not content_sample:
            return filename_match

        content_match = sniff_content_marker(
            content_sample,
            _STATEMENT_HEADER_MARKER,
            logger=_logger,
            adapter_name="BacDebitAdapter",
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

        if not boundaries:
            raise InvalidCanonicalLineError(
                f"No {_STATEMENT_HEADER_MARKER!r} boundary marker found in statement PDF."
            )

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
            with pdfplumber.open(io.BytesIO(statement_bytes)) as doc:
                metadata = doc.metadata
                pages_words = [page.extract_words() for page in doc.pages]
        except Exception as exc:
            raise fail_parse(
                "Could not read statement PDF.", gap_raw="Could not read statement PDF."
            ) from exc

        page_rows = [_group_words_into_rows(words) for words in pages_words]
        all_lines = [" ".join(w["text"] for w in row).strip() for rows in page_rows for row in rows]
        all_lines = [line for line in all_lines if line]

        reference_date = statement_reference_date(metadata, all_lines)
        currency = detect_statement_currency(all_lines)
        if currency is None:
            raise fail_parse(
                "Could not determine statement currency (missing 'Moneda:' field).",
                gap_raw="<missing Moneda: field>",
            )

        rows: list[CanonicalLine] = []
        seen_column_header = False

        for row_list in page_rows:
            finished = False
            for row_words in row_list:
                line = " ".join(w["text"] for w in row_words).strip()
                if not line:
                    continue
                if _is_footer_line(line):
                    finished = True
                    break
                if _is_column_header_line(line):
                    seen_column_header = True
                    continue
                if not seen_column_header:
                    # CUADRO RESUMEN preamble, incl. its data-row-shaped
                    # totals-line decoy (AC #5) — never parsed as a
                    # transaction row.
                    continue
                if not is_data_row(line):
                    continue

                tokens = extract_row_tokens(line)
                if len(tokens.amounts) != 1:
                    raise fail_parse(
                        f"Expected exactly one amount token in debit-account row: {line!r}.",
                        rows=rows,
                        gap_raw=line,
                    )
                amount_token = tokens.amounts[0]
                # Rightmost match, not the first: the DÉBITOS/CRÉDITOS
                # columns are the rightmost fields on the row, so if another
                # word (e.g. a reference number) coincidentally has the same
                # text as the amount, the true amount word is never to its
                # left.
                amount_candidates = [w for w in row_words if w["text"].strip() == amount_token]
                amount_word = max(amount_candidates, key=lambda w: w["x0"], default=None)
                if amount_word is None:
                    raise fail_parse(
                        f"Could not locate amount token geometry for row: {line!r}.",
                        rows=rows,
                        gap_raw=line,
                    )

                if tokens.date is None:
                    # is_data_row(requires_date=True) should guarantee a date
                    # token, but never let a fail-loud row silently slip
                    # past on a stripped assert (python -O).
                    raise fail_parse(
                        f"Could not locate date token for row: {line!r}.",
                        rows=rows,
                        gap_raw=line,
                    )

                try:
                    outcome = resolve_sign_variant_column(
                        amount_word["x0"], amount_word["x1"], _SIGN_VARIANT_RANGES.ranges
                    )
                    posted_date = parse_statement_date(
                        tokens.date, date_format=_DATE_FORMAT, reference_date=reference_date
                    )
                    amount = parse_amount_field(amount_token)
                except (ValueError, KeyError, InvalidOperation) as exc:
                    raise fail_parse(
                        f"Malformed statement row: {line!r}.", rows=rows, gap_raw=line
                    ) from exc

                line_type = LINE_TYPE_WITHDRAWAL if outcome == _DEBITOS_KEY else LINE_TYPE_DEPOSIT
                amount = _signed_amount(amount, line_type)

                canonical_line = CanonicalLine(
                    posted_date=posted_date,
                    amount=amount,
                    currency=currency,
                    product_id=self.product_id,
                    line_type=line_type,
                    normalized_description=tokens.description,
                )
                validate_canonical_line(canonical_line)
                rows.append(canonical_line)
            if finished:
                break

        if not seen_column_header:
            raise fail_parse(
                "Could not locate the transaction table column header "
                "('REFERENCIA'/'CONCEPTO') in statement PDF.",
                rows=rows,
                gap_raw="<no column header found>",
            )

        return rows
