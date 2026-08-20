"""Tests for shared bank-adapter parse helpers."""

from __future__ import annotations

from decimal import Decimal

from adapters.bank._shared import parse_amount_field


def test_parse_amount_field_strips_thousands_commas() -> None:
    assert parse_amount_field("3,706.90") == Decimal("3706.90")


def test_parse_amount_field_blank_and_dash_are_zero() -> None:
    assert parse_amount_field("") == Decimal("0")
    assert parse_amount_field("-") == Decimal("0")
    assert parse_amount_field("  -  ") == Decimal("0")


def test_parse_amount_field_trailing_minus_negates() -> None:
    assert parse_amount_field("3,706.90-") == Decimal("-3706.90")
    assert isinstance(parse_amount_field("3,706.90-"), Decimal)


def test_parse_amount_field_leading_minus_still_negates() -> None:
    assert parse_amount_field("-45.00") == Decimal("-45.00")
