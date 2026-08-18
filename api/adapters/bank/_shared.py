"""Helpers shared across bank adapters (extracted during Story 4.5 review).

Not part of the BankAdapter Protocol — adapters still declare their own
_SECTIONS, markers, and detect()/split()/parse() bodies. This only removes
copy-pasted low-level parsing so a third adapter doesn't triplicate it.
"""

from __future__ import annotations

import io
import logging
from decimal import Decimal

import pdfplumber


def parse_amount_field(raw: str) -> Decimal:
    value = raw.strip()
    if value in ("", "-"):
        return Decimal("0")
    return Decimal(value.replace(",", ""))


def sniff_content_marker(
    content_sample: bytes, marker: str, *, logger: logging.Logger, adapter_name: str
) -> bool:
    """Check whether `marker` appears on the first page of a PDF content sample.

    Returns False (rather than raising) on any failure to parse the sample —
    a content sniff that can't be read just means "not recognized by this
    adapter," logged for diagnostic visibility.
    """
    try:
        with pdfplumber.open(io.BytesIO(content_sample)) as doc:
            if not doc.pages:
                return False
            text = doc.pages[0].extract_text() or ""
            return marker in text
    except Exception:
        logger.debug("%s.detect: content sniff failed to parse", adapter_name, exc_info=True)
        return False
