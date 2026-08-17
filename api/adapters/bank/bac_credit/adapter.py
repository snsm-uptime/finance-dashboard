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

_logger = logging.getLogger(__name__)

# Content-sniff marker: printed once per statement page. Also doubles as the
# split() statement-boundary marker (BAC multi-card PDFs bundle N per-card
# statements — NFR-12).
_STATEMENT_HEADER_MARKER = "ESTADO DE CUENTA BAC CREDITO"

_DATE_FORMAT = "%d-%b-%y"

# BAC credit baseline section map (authoritative — PRD "Parsing and adapter
# requirements > BAC credit baseline"). Do not invent alternate section names
# or policies here — the fixture and the shared SectionCursor (AD-25) must
# agree on vocabulary.
_SECTIONS = [
    SectionSpec("Detalle de compras", LINE_TYPE_PURCHASE, SECTION_POLICY_MUST_PARSE),
    SectionSpec("Detalle de pago", LINE_TYPE_PAYMENT, SECTION_POLICY_MUST_PARSE),
    SectionSpec("Detalle de intereses", LINE_TYPE_INTEREST, SECTION_POLICY_MUST_PARSE),
    SectionSpec("Otros cargos", LINE_TYPE_FEE, SECTION_POLICY_MUST_PARSE),
    SectionSpec(
        "Productos y servicios de elección voluntaria",
        LINE_TYPE_VOLUNTARY_SERVICE,
        SECTION_POLICY_BEST_EFFORT,
    ),
    # "on account_kind='credit'" per the PRD table — always true for this adapter.
    SectionSpec(
        "Otras líneas de financiamiento", LINE_TYPE_INSTALLMENT_SCHEDULE, SECTION_POLICY_MUST_PARSE
    ),
    SectionSpec("Saldo Anterior", None, SECTION_POLICY_IGNORE),
]

# Sign convention (undetermined by PRD — chosen here, applied consistently):
# purchases/fees/interest/installment_schedule/voluntary_service are positive
# charges; payments/credit-notes are negative (balance-reducing).
_NEGATIVE_LINE_TYPES = frozenset({LINE_TYPE_PAYMENT, LINE_TYPE_CREDIT_NOTE})


def _parse_amount_field(raw: str) -> Decimal:
    value = raw.strip()
    if value in ("", "-"):
        return Decimal("0")
    return Decimal(value.replace(",", ""))


def _signed_amount(amount: Decimal, line_type: str) -> Decimal:
    return -amount if line_type in _NEGATIVE_LINE_TYPES else amount


class BacCreditAdapter:
    """BankAdapter implementation for BAC's credit-card statement product."""

    bank_id = "bac"
    product_id = "bac_credit"
    account_kind = "credit"

    # AD-27: which boundary-detection rule fired on the last split() call —
    # not part of the BankAdapter Protocol, retained for test/debug visibility.
    last_split_boundary_method: str | None = None

    def detect(self, *, filename: str, content_sample: bytes) -> bool:
        filename_match = "bac" in filename.lower()
        if not content_sample:
            return filename_match

        content_match = False
        try:
            with pdfplumber.open(io.BytesIO(content_sample)) as doc:
                if doc.pages:
                    text = doc.pages[0].extract_text() or ""
                    content_match = _STATEMENT_HEADER_MARKER in text
        except Exception:
            # A content sniff that fails to parse just means "not recognized as
            # BAC" (detect_bank_adapter falls through to UnknownBankAdapterError
            # if nothing else matches) — logged so a corrupt-but-genuine BAC PDF
            # leaves a diagnostic trail instead of a bare False.
            _logger.debug("BacCreditAdapter.detect: content sniff failed to parse", exc_info=True)
            content_match = False
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
                if line == _STATEMENT_HEADER_MARKER or line.startswith("Cuenta:"):
                    continue
                cursor.see_header_line(line)
                continue

            # Data row.
            kind, spec = cursor.classify_data_row()
            if kind == "ignored":
                continue
            if kind == "unmapped" or spec is None:
                raise InvalidCanonicalLineError(
                    f"Statement row found under an unmapped section: {line!r}."
                )

            line_type = spec.line_type
            try:
                date_raw, description, crc_raw, usd_raw = line.split("|")
            except ValueError as exc:
                raise InvalidCanonicalLineError(f"Malformed statement row: {line!r}.") from exc

            try:
                posted_date = parse_statement_date(date_raw, date_format=_DATE_FORMAT)
                crc_amount = _parse_amount_field(crc_raw)
                usd_amount = _parse_amount_field(usd_raw)
            except (ValueError, KeyError, InvalidOperation) as exc:
                raise InvalidCanonicalLineError(f"Malformed statement row: {line!r}.") from exc

            currency, amount = normalize_dual_column_amount(crc_amount, usd_amount)
            assert line_type is not None  # SECTION_POLICY_IGNORE rows never reach here.
            amount = _signed_amount(amount, line_type)

            canonical_line = CanonicalLine(
                posted_date=posted_date,
                amount=amount,
                currency=currency,
                product_id=self.product_id,
                line_type=line_type,
                normalized_description=description.strip(),
            )
            validate_canonical_line(canonical_line)
            rows.append(canonical_line)

        return rows
