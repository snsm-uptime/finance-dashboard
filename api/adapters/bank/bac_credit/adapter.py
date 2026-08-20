"""BAC credit-card adapter — first concrete BankAdapter (Story 4.4, AC #1/#3/#4/#6).

Per AD-1/AD-16 this returns normalized CanonicalLine rows to the application
layer and does nothing else: it never commits, touches lists/membership, or
calls other adapters. It has zero knowledge of Import Session/Batch.

This is a *proving* adapter for the contract, not the Story 4.5 official
acceptance-bar parser — section/table extraction here is intentionally a
simple line-based reader over pdfplumber's extracted text (adequate for the
synthetic fixture this story ships), not geometry-driven table extraction.
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
    LINE_TYPE_CREDIT_NOTE,
    LINE_TYPE_FEE,
    LINE_TYPE_INSTALLMENT_SCHEDULE,
    LINE_TYPE_INTEREST,
    LINE_TYPE_PAYMENT,
    LINE_TYPE_PURCHASE,
    LINE_TYPE_VOLUNTARY_SERVICE,
)
from domain.statement_dates import parse_statement_date
from domain.statement_layout import SectionCursor, SectionSpec, detect_statement_boundaries
from domain.statement_row_extraction import (
    AmountColumnRole,
    extract_row_tokens,
    is_data_row,
)

from adapters.bank._shared import parse_amount_field, sniff_content_marker

_logger = logging.getLogger(__name__)

# Content-sniff marker: printed once per statement page. Also doubles as the
# split() statement-boundary marker (BAC multi-card PDFs bundle N per-card
# statements — NFR-12).
_STATEMENT_HEADER_MARKER = "ESTADO DE CUENTA BAC CREDITO"

_DATE_FORMAT = "%d-%b-%y"

# BAC credit section map. Lettered titles A–E confirmed against real extracted
# text (2026-08-19, structural facts only). "Saldo Anterior" and "Otras líneas
# de financiamiento" were not on the inspected pages — left as currently
# declared; a wrong MUST_PARSE/IGNORE title fails loud (NFR-8), not silent.
# F) and G) are undeclared on purpose (no evidence of row shape yet).
_SECTIONS = [
    SectionSpec("A) Detalle de pago del periodo", LINE_TYPE_PAYMENT, SECTION_POLICY_MUST_PARSE),
    SectionSpec("B) Detalle de compras del periodo", LINE_TYPE_PURCHASE, SECTION_POLICY_MUST_PARSE),
    SectionSpec("C) Detalle de intereses", LINE_TYPE_INTEREST, SECTION_POLICY_MUST_PARSE),
    SectionSpec("D) Detalle de otros cargos", LINE_TYPE_FEE, SECTION_POLICY_MUST_PARSE),
    SectionSpec(
        "E) Detalle de productos y servicios de elección voluntaria",
        LINE_TYPE_VOLUNTARY_SERVICE,
        SECTION_POLICY_BEST_EFFORT,
    ),
    # Unverified against real text this story (opening-balance page not inspected).
    SectionSpec(
        "Otras líneas de financiamiento", LINE_TYPE_INSTALLMENT_SCHEDULE, SECTION_POLICY_MUST_PARSE
    ),
    SectionSpec("Saldo Anterior", None, SECTION_POLICY_IGNORE),
]

# Sign convention (undetermined by PRD — chosen here, applied consistently):
# purchases/fees/interest/installment_schedule/voluntary_service are positive
# charges; payments/credit-notes are negative (balance-reducing).
_NEGATIVE_LINE_TYPES = frozenset({LINE_TYPE_PAYMENT, LINE_TYPE_CREDIT_NOTE})

_SECTION_TITLES = frozenset(spec.title for spec in _SECTIONS)
_LETTERED_SECTION_RE = re.compile(r"^[A-Z]\) ")
_CURRENCY_AMOUNT_RE = re.compile(r"\b(CRC|USD)\s+(\d{1,3}(?:,\d{3})*\.\d{2}-?)", re.IGNORECASE)
_CURRENCY_TOKEN_RE = re.compile(r"\b(CRC|USD)\b", re.IGNORECASE)
_ISSUANCE_DATE_RE = re.compile(
    r"Fecha de emisi[oó]n:\s*(\d{1,2}-[A-ZÁÉÍÓÚÑ]{3}-\d{2})",
    re.IGNORECASE,
)


def _signed_amount(amount: Decimal, line_type: str) -> Decimal:
    return -amount if line_type in _NEGATIVE_LINE_TYPES else amount


def _is_section_header_line(line: str) -> bool:
    """Declared titles and lettered A-Z) headers; skip column labels / preamble."""
    return line in _SECTION_TITLES or bool(_LETTERED_SECTION_RE.match(line))


def parse_pdf_creation_date(raw: str) -> date:
    """Parse a PDF /CreationDate string (`D:YYYYMMDD...`) to a calendar date."""
    text = raw.strip()
    if text.startswith("D:"):
        text = text[2:]
    if len(text) < 8 or not text[:8].isdigit():
        raise ValueError(f"Unrecognized PDF CreationDate: {raw!r}")
    return date(int(text[0:4]), int(text[4:6]), int(text[6:8]))


def parse_printed_issuance_date(lines: list[str]) -> date | None:
    """Parse the printed `Fecha de emisión:` header when PDF metadata is empty."""
    for line in lines:
        match = _ISSUANCE_DATE_RE.search(line)
        if match is None:
            continue
        iso = parse_statement_date(match.group(1), date_format=_DATE_FORMAT)
        return date.fromisoformat(iso)
    return None


def statement_reference_date(metadata: dict | None, lines: list[str]) -> date | None:
    """Prefer the printed issuance date; fall back to /CreationDate.

    Real BAC credit PDFs have empty pdfplumber metadata, and split() via
    pypdfium2 writes a fresh CreationDate onto each chunk. The printed
    `Fecha de emisión:` line is the date that actually survives extraction.
    """
    printed = parse_printed_issuance_date(lines)
    if printed is not None:
        return printed
    raw = (metadata or {}).get("CreationDate")
    if isinstance(raw, str) and raw.strip():
        try:
            return parse_pdf_creation_date(raw)
        except ValueError:
            return None
    return None


def _currency_and_amount(line: str, amounts: tuple[str, ...]) -> tuple[str, Decimal]:
    tagged = _CURRENCY_AMOUNT_RE.search(line)
    if tagged is not None:
        return tagged.group(1).upper(), parse_amount_field(tagged.group(2))
    crc_raw = amounts[0] if amounts else "0"
    usd_raw = amounts[1] if len(amounts) >= 2 else "0"
    return normalize_dual_column_amount(parse_amount_field(crc_raw), parse_amount_field(usd_raw))


def _normalize_description(description: str) -> str:
    cleaned = _CURRENCY_TOKEN_RE.sub(" ", description)
    return " ".join(cleaned.split())


class BacCreditAdapter:
    """BankAdapter implementation for BAC's credit-card statement product."""

    bank_id = "bac"
    product_id = "bac_credit"
    account_kind = "credit"
    amount_column_role = AmountColumnRole.CURRENCY_VARIANT

    # AD-27: which boundary-detection rule fired on the last split() call —
    # not part of the BankAdapter Protocol, retained for test/debug visibility.
    last_split_boundary_method: str | None = None

    def detect(self, *, filename: str, content_sample: bytes) -> bool:
        filename_match = "bac" in filename.lower()
        if not content_sample:
            return filename_match

        # A content sniff that fails to parse just means "not recognized as
        # BAC" (detect_bank_adapter falls through to UnknownBankAdapterError
        # if nothing else matches) — logged so a corrupt-but-genuine BAC PDF
        # leaves a diagnostic trail instead of a bare False.
        content_match = sniff_content_marker(
            content_sample,
            _STATEMENT_HEADER_MARKER,
            logger=_logger,
            adapter_name="BacCreditAdapter",
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
        self.last_split_boundary_method = method  # AD-27: retained for test/debug visibility.

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
            raise InvalidCanonicalLineError("Could not read statement PDF.") from exc

        stripped_lines = [raw.strip() for raw in lines if raw.strip()]
        reference_date = statement_reference_date(metadata, stripped_lines)
        rows: list[CanonicalLine] = []
        cursor = SectionCursor(_SECTIONS)
        seen_section_header = False

        for line in stripped_lines:
            _, active_spec = cursor.classify_data_row()
            requires_date = not (
                active_spec is not None and active_spec.line_type == LINE_TYPE_INTEREST
            )

            if not is_data_row(line, requires_date=requires_date):
                if line == _STATEMENT_HEADER_MARKER or line.startswith("Cuenta:"):
                    continue
                if _is_section_header_line(line):
                    cursor.see_header_line(line)
                    seen_section_header = True
                continue

            kind, spec = cursor.classify_data_row()
            if kind == "ignored":
                continue
            if kind == "unmapped" or spec is None:
                # Preamble (page-1 summaries) before any lettered/declared section:
                # skip. After an unrecognized lettered header, fail loud.
                if not seen_section_header:
                    continue
                raise InvalidCanonicalLineError(
                    f"Statement row found under an unmapped section: {line!r}."
                )

            line_type = spec.line_type
            tokens = extract_row_tokens(line, requires_date=requires_date)
            try:
                if tokens.date is None:
                    if reference_date is None:
                        raise ValueError("no-date row requires a statement reference date")
                    posted_date = reference_date.isoformat()
                else:
                    posted_date = parse_statement_date(tokens.date, date_format=_DATE_FORMAT)
                currency, amount = _currency_and_amount(line, tokens.amounts)
            except (ValueError, KeyError, InvalidOperation) as exc:
                raise InvalidCanonicalLineError(f"Malformed statement row: {line!r}.") from exc

            assert line_type is not None  # SECTION_POLICY_IGNORE rows never reach here.
            amount = _signed_amount(amount, line_type)

            canonical_line = CanonicalLine(
                posted_date=posted_date,
                amount=amount,
                currency=currency,
                product_id=self.product_id,
                line_type=line_type,
                normalized_description=_normalize_description(tokens.description),
            )
            validate_canonical_line(canonical_line)
            rows.append(canonical_line)

        return rows
