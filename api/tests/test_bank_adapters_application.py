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
    """Mirrors real adapters' detect() shape: filename_match is derived from
    the actual `filename` argument (not a fixed flag), so blanking the
    filename in a disambiguation pass genuinely disables it — same as it
    would for BacCreditAdapter/BacDebitAdapter."""

    def __init__(
        self,
        bank_id: str,
        *,
        filename_token: str | None = None,
        content_marker: bytes | None = None,
    ) -> None:
        self.bank_id = bank_id
        self.product_id = f"{bank_id}_product"
        self.account_kind = "credit"
        self._filename_token = filename_token
        self._content_marker = content_marker

    def detect(self, *, filename: str, content_sample: bytes) -> bool:
        filename_match = self._filename_token is not None and self._filename_token in filename
        if not content_sample:
            return filename_match
        content_match = self._content_marker is not None and self._content_marker in content_sample
        return filename_match or content_match

    def split(self, pdf_bytes: bytes) -> list[bytes]:
        return [pdf_bytes]

    def parse(self, statement_bytes: bytes) -> list[CanonicalLine]:
        return []


def test_override_wins_even_when_filename_and_content_would_pick_a_different_adapter() -> None:
    bac = FakeAdapter("bac", filename_token="bac")
    promerica = FakeAdapter("promerica")
    result = detect_bank_adapter(
        [bac, promerica],
        override="promerica",
        filename="bac_statement.pdf",
        content_sample=b"anything",
    )
    assert result is promerica


def test_override_not_matching_any_adapter_raises_unknown() -> None:
    bac = FakeAdapter("bac", filename_token="bac")
    with pytest.raises(UnknownBankAdapterError):
        detect_bank_adapter(
            [bac], override="scotiabank", filename="bac_statement.pdf", content_sample=b""
        )


def test_unambiguous_filename_match_wins_without_needing_content() -> None:
    bac = FakeAdapter("bac", filename_token="bac")
    promerica = FakeAdapter("promerica")
    result = detect_bank_adapter(
        [bac, promerica], override=None, filename="bac_statement.pdf", content_sample=b""
    )
    assert result is bac


def test_two_adapters_matching_filename_raises_ambiguous_when_content_cannot_resolve() -> None:
    bac = FakeAdapter("bac", filename_token="statement")
    other = FakeAdapter("other_bac_like", filename_token="statement")
    with pytest.raises(AmbiguousBankAdapterError):
        detect_bank_adapter(
            [bac, other], override=None, filename="statement.pdf", content_sample=b"content"
        )


def test_no_filename_match_but_exactly_one_content_match_wins() -> None:
    bac = FakeAdapter("bac", content_marker=b"BAC header")
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


def test_ambiguous_filename_falls_through_to_content_to_resolve() -> None:
    # Mirrors the real BAC debit/credit collision: a filename neither
    # adapter controls (e.g. "BAC_DEB_COLONES_jun.pdf") matches both on
    # filename alone, but only one adapter's content marker is present.
    bac_debit = FakeAdapter("bac_debit", filename_token="bac", content_marker=b"CUADRO RESUMEN")
    bac_credit = FakeAdapter(
        "bac_credit", filename_token="bac", content_marker=b"ESTADO DE CUENTA BAC CREDITO"
    )
    result = detect_bank_adapter(
        [bac_debit, bac_credit],
        override=None,
        filename="BAC_DEB_COLONES_jun.pdf",
        content_sample=b"...CUADRO RESUMEN...",
    )
    assert result is bac_debit


def test_ambiguous_filename_still_ambiguous_after_content_raises_ambiguous() -> None:
    bac = FakeAdapter("bac", filename_token="bac", content_marker=b"shared marker")
    other = FakeAdapter("other_bac_like", filename_token="bac", content_marker=b"shared marker")
    with pytest.raises(AmbiguousBankAdapterError):
        detect_bank_adapter(
            [bac, other],
            override=None,
            filename="bac_statement.pdf",
            content_sample=b"shared marker",
        )


def test_ambiguous_filename_with_no_content_match_raises_ambiguous() -> None:
    bac = FakeAdapter("bac", filename_token="bac")
    other = FakeAdapter("other_bac_like", filename_token="bac")
    with pytest.raises(AmbiguousBankAdapterError):
        detect_bank_adapter(
            [bac, other], override=None, filename="bac_statement.pdf", content_sample=b"unrelated"
        )


def test_two_adapters_matching_content_raises_ambiguous() -> None:
    bac = FakeAdapter("bac", content_marker=b"ambiguous")
    other = FakeAdapter("other", content_marker=b"ambiguous")
    with pytest.raises(AmbiguousBankAdapterError):
        detect_bank_adapter(
            [bac, other],
            override=None,
            filename="statement.pdf",
            content_sample=b"ambiguous bytes",
        )
