"""Pluggable bank adapter contract + detect registry (Story 4.4, FR-31/FR-14).

Use-case layer: knows how to pick which adapter applies to an uploaded file.
Depends on domain.canonical_line.CanonicalLine only — no bank-specific
implementation lives here (that's adapters/bank/<bank>/).
"""

from __future__ import annotations

from typing import Protocol

from domain.canonical_line import CanonicalLine
from domain.errors import AmbiguousBankAdapterError, UnknownBankAdapterError


class BankAdapter(Protocol):
    """Contract a bank/product adapter implements to plug into detect → split → parse."""

    bank_id: str
    product_id: str
    account_kind: str

    def detect(self, *, filename: str, content_sample: bytes) -> bool:
        """Does this adapter recognize the file? Filename pattern and/or content sniff."""
        ...

    def split(self, pdf_bytes: bytes) -> list[bytes]:
        """Split a PDF into one byte-chunk per statement found (>=1 element)."""
        ...

    def parse(self, statement_bytes: bytes) -> list[CanonicalLine]:
        """Parse one statement chunk into CanonicalLine rows.

        Raises InvalidCanonicalLineError on any row it cannot validate —
        must-parse sections that don't match anything recognized must raise,
        not silently skip.
        """
        ...


def detect_bank_adapter(
    adapters: list[BankAdapter],
    *,
    override: str | None,
    filename: str,
    content_sample: bytes,
) -> BankAdapter:
    """Resolve which adapter applies to an upload (AC #2, FR-14).

    Priority: explicit override > unambiguous filename-only match > unambiguous
    content-inclusive match. Unknown/ambiguous detection fails loudly — no
    silent mis-association (NFR-8).
    """
    if override is not None:
        matches = [a for a in adapters if a.bank_id == override]
        if len(matches) > 1:
            raise AmbiguousBankAdapterError()
        if len(matches) == 1:
            return matches[0]
        raise UnknownBankAdapterError()

    filename_matches = [a for a in adapters if a.detect(filename=filename, content_sample=b"")]
    if len(filename_matches) == 1:
        return filename_matches[0]
    if len(filename_matches) > 1:
        raise AmbiguousBankAdapterError()

    content_matches = [
        a for a in adapters if a.detect(filename=filename, content_sample=content_sample)
    ]
    if len(content_matches) == 1:
        return content_matches[0]
    if len(content_matches) > 1:
        raise AmbiguousBankAdapterError()

    raise UnknownBankAdapterError()
