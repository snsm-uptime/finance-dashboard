"""Promerica stub adapter — proves the BankAdapter contract extends (Story 4.5, AC #2).

Not a real Promerica parser: real Promerica parsing is out of scope until
real statement samples exist (PRD). This exists only to prove that adding a
second bank/product needs zero edits to domain/canonical_line.py or
application/bank_adapters.py — only a new adapter module plus a registry
entry (adapters/bank/__init__.py). Detection is a deliberately fake
signature, not real content heuristics.

Uses the same shared contracts BacCreditAdapter uses (AD-25/AD-26/AD-27):
SectionSpec/SectionCursor for section vocabulary, parse_statement_date for
dates, detect_statement_boundaries for the split() multi-statement proof —
a stub that hand-rolled its own section dict or date parsing would prove
less than AC #2 requires.
"""

from __future__ import annotations

import io
import logging
from decimal import InvalidOperation

import pdfplumber
import pypdfium2 as pdfium
from domain.canonical_line import (
    SECTION_POLICY_MUST_PARSE,
    CanonicalLine,
    validate_canonical_line,
)
from domain.errors import InvalidCanonicalLineError
from domain.line_types import LINE_TYPE_PURCHASE
from domain.statement_dates import parse_statement_date
from domain.statement_layout import SectionCursor, SectionSpec, detect_statement_boundaries

from adapters.bank._shared import parse_amount_field, sniff_content_marker

_logger = logging.getLogger(__name__)

# Clearly fake — this is a stub proving pluggability, not a real Promerica
# content signature (none exists yet; no real samples to derive one from).
_STATEMENT_HEADER_MARKER = "ESTADO DE CUENTA PROMERICA STUB"

_DATE_FORMAT = "%d-%b-%y"

# Minimal, single-section vocabulary — enough to prove the contract's
# section-declaration mechanism generalizes, not a real Promerica layout.
_SECTIONS = [
    SectionSpec("Detalle de movimientos", LINE_TYPE_PURCHASE, SECTION_POLICY_MUST_PARSE),
]


class PromericaStubAdapter:
    """BankAdapter implementation proving the contract extends beyond BAC."""

    bank_id = "promerica"
    product_id = "promerica_stub"
    # "other" rather than "credit": this is not a real product, and signaling
    # that here avoids implying a real Promerica credit-card contract exists.
    account_kind = "other"

    last_split_boundary_method: str | None = None

    def detect(self, *, filename: str, content_sample: bytes) -> bool:
        filename_match = "promerica" in filename.lower()
        if not content_sample:
            return filename_match

        content_match = sniff_content_marker(
            content_sample,
            _STATEMENT_HEADER_MARKER,
            logger=_logger,
            adapter_name="PromericaStubAdapter",
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
            with pdfplumber.open(io.BytesIO(statement_bytes)) as doc:
                for page in doc.pages:
                    text = page.extract_text() or ""
                    lines.extend(text.splitlines())
        except Exception as exc:
            raise InvalidCanonicalLineError("Could not read statement PDF.") from exc

        rows: list[CanonicalLine] = []
        cursor = SectionCursor(_SECTIONS)

        for raw_line in lines:
            line = raw_line.strip()
            if not line:
                continue

            if "|" not in line:
                if line == _STATEMENT_HEADER_MARKER:
                    continue
                cursor.see_header_line(line)
                continue

            kind, spec = cursor.classify_data_row()
            if kind == "ignored":
                continue
            if kind == "unmapped" or spec is None:
                raise InvalidCanonicalLineError(
                    f"Statement row found under an unmapped section: {line!r}."
                )

            line_type = spec.line_type
            try:
                date_raw, description, amount_raw = line.split("|")
            except ValueError as exc:
                raise InvalidCanonicalLineError(f"Malformed statement row: {line!r}.") from exc

            try:
                posted_date = parse_statement_date(date_raw, date_format=_DATE_FORMAT)
                amount = parse_amount_field(amount_raw)
            except (ValueError, KeyError, InvalidOperation) as exc:
                raise InvalidCanonicalLineError(f"Malformed statement row: {line!r}.") from exc

            assert line_type is not None  # SECTION_POLICY_IGNORE rows never reach here.
            canonical_line = CanonicalLine(
                posted_date=posted_date,
                amount=amount,
                currency="CRC",
                product_id=self.product_id,
                line_type=line_type,
                normalized_description=description.strip(),
            )
            validate_canonical_line(canonical_line)
            rows.append(canonical_line)

        return rows
