"""Domain validation tests for card label / IBAN normalization (Story 4.1)."""

from __future__ import annotations

import pytest
from domain.cards import CARD_LABEL_MAX_LENGTH, normalize_iban, validate_card_label
from domain.errors import InvalidCardIbanError, InvalidCardLabelError


def test_validate_card_label_trims() -> None:
    assert validate_card_label("  My Visa  ") == "My Visa"


def test_validate_card_label_rejects_empty() -> None:
    with pytest.raises(InvalidCardLabelError):
        validate_card_label("")


def test_validate_card_label_rejects_whitespace_only() -> None:
    with pytest.raises(InvalidCardLabelError):
        validate_card_label("   \t  ")


def test_validate_card_label_rejects_none() -> None:
    with pytest.raises(InvalidCardLabelError):
        validate_card_label(None)  # type: ignore[arg-type]


def test_validate_card_label_rejects_over_max_length() -> None:
    with pytest.raises(InvalidCardLabelError):
        validate_card_label("x" * (CARD_LABEL_MAX_LENGTH + 1))


def test_validate_card_label_accepts_max_length() -> None:
    label = "x" * CARD_LABEL_MAX_LENGTH
    assert validate_card_label(label) == label


def test_normalize_iban_trims_and_uppercases() -> None:
    assert normalize_iban("  cr05 0152 0200 1026 2840 66  ") == "CR05015202001026284066"


def test_normalize_iban_strips_internal_whitespace() -> None:
    assert normalize_iban("cr05\t0152 0200") == "CR0501520200"


def test_normalize_iban_rejects_empty_after_normalize() -> None:
    with pytest.raises(InvalidCardIbanError):
        normalize_iban("   ")


def test_normalize_iban_rejects_none() -> None:
    with pytest.raises(InvalidCardIbanError):
        normalize_iban(None)  # type: ignore[arg-type]


def test_normalize_iban_rejects_over_max_length() -> None:
    with pytest.raises(InvalidCardIbanError):
        normalize_iban("A" * 65)
