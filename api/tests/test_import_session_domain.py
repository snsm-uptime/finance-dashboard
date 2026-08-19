"""Domain validation tests for import-session PDF upload guard (Story 4.6)."""

from __future__ import annotations

import pytest
from domain.errors import UnsupportedFileTypeError
from domain.import_session import validate_pdf_upload


def test_validate_pdf_upload_accepts_valid_pdf_magic_header() -> None:
    validate_pdf_upload("statement.pdf", b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n1 0 obj")


def test_validate_pdf_upload_rejects_empty_bytes() -> None:
    with pytest.raises(UnsupportedFileTypeError):
        validate_pdf_upload("statement.pdf", b"")


def test_validate_pdf_upload_rejects_zip_content() -> None:
    with pytest.raises(UnsupportedFileTypeError):
        validate_pdf_upload("statement.pdf", b"PK\x03\x04rest of a zip file")


def test_validate_pdf_upload_rejects_plain_text_content() -> None:
    with pytest.raises(UnsupportedFileTypeError):
        validate_pdf_upload("statement.pdf", b"this is not a pdf at all")


def test_validate_pdf_upload_is_content_based_not_extension_based() -> None:
    """A .pdf filename does not save non-PDF bytes — the check is content-only."""
    with pytest.raises(UnsupportedFileTypeError):
        validate_pdf_upload("statement.pdf", b"not actually a pdf")
