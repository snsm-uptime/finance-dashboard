"""Application tests for the bank adapter detect registry (Story 4.4) — TDD.

Fake adapters only (plain classes, no pdfplumber, no DB) — this layer tests
the override → filename → content priority and the two failure modes.
"""

from __future__ import annotations

import pytest
from application.bank_adapters import detect_bank_adapter
from domain.canonical_line import CanonicalLine
from domain.errors import AmbiguousBankAdapterError, UnknownBankAdapterError


class FakeAdapter:
    def __init__(
        self,
        bank_id: str,
        *,
        matches_filename: bool = False,
        matches_content: bool = False,
    ) -> None:
        self.bank_id = bank_id
        self.product_id = f"{bank_id}_product"
        self.account_kind = "credit"
        self._matches_filename = matches_filename
        self._matches_content = matches_content

    def detect(self, *, filename: str, content_sample: bytes) -> bool:
        if not content_sample:
            return self._matches_filename
        return self._matches_filename or self._matches_content

    def split(self, pdf_bytes: bytes) -> list[bytes]:
        return [pdf_bytes]

    def parse(self, statement_bytes: bytes) -> list[CanonicalLine]:
        return []


def test_override_wins_even_when_filename_and_content_would_pick_a_different_adapter() -> None:
    bac = FakeAdapter("bac", matches_filename=True)
    promerica = FakeAdapter("promerica")
    result = detect_bank_adapter(
        [bac, promerica],
        override="promerica",
        filename="bac_statement.pdf",
        content_sample=b"anything",
    )
    assert result is promerica


def test_override_not_matching_any_adapter_raises_unknown() -> None:
    bac = FakeAdapter("bac", matches_filename=True)
    with pytest.raises(UnknownBankAdapterError):
        detect_bank_adapter(
            [bac], override="scotiabank", filename="bac_statement.pdf", content_sample=b""
        )


def test_unambiguous_filename_match_wins_without_needing_content() -> None:
    bac = FakeAdapter("bac", matches_filename=True)
    promerica = FakeAdapter("promerica")
    result = detect_bank_adapter(
        [bac, promerica], override=None, filename="bac_statement.pdf", content_sample=b""
    )
    assert result is bac


def test_two_adapters_matching_filename_raises_ambiguous() -> None:
    bac = FakeAdapter("bac", matches_filename=True)
    other = FakeAdapter("other_bac_like", matches_filename=True)
    with pytest.raises(AmbiguousBankAdapterError):
        detect_bank_adapter(
            [bac, other], override=None, filename="statement.pdf", content_sample=b"content"
        )


def test_no_filename_match_but_exactly_one_content_match_wins() -> None:
    bac = FakeAdapter("bac", matches_content=True)
    promerica = FakeAdapter("promerica")
    result = detect_bank_adapter(
        [bac, promerica],
        override=None,
        filename="statement.pdf",
        content_sample=b"BAC header bytes",
    )
    assert result is bac


def test_no_match_at_any_stage_raises_unknown() -> None:
    bac = FakeAdapter("bac")
    promerica = FakeAdapter("promerica")
    with pytest.raises(UnknownBankAdapterError):
        detect_bank_adapter(
            [bac, promerica],
            override=None,
            filename="statement.pdf",
            content_sample=b"unrelated bytes",
        )


def test_override_matching_multiple_registered_adapters_raises_ambiguous() -> None:
    bac_a = FakeAdapter("bac")
    bac_b = FakeAdapter("bac")
    with pytest.raises(AmbiguousBankAdapterError):
        detect_bank_adapter(
            [bac_a, bac_b], override="bac", filename="statement.pdf", content_sample=b""
        )


def test_two_adapters_matching_content_raises_ambiguous() -> None:
    bac = FakeAdapter("bac", matches_content=True)
    other = FakeAdapter("other", matches_content=True)
    with pytest.raises(AmbiguousBankAdapterError):
        detect_bank_adapter(
            [bac, other],
            override=None,
            filename="statement.pdf",
            content_sample=b"ambiguous bytes",
        )
