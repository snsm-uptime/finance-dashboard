"""Domain tests for real-text row recognition + amount-column role (AD-28).

Plain string/primitive inputs — no PDF, no pdfplumber (mirrors
test_statement_layout_domain.py).
"""

from __future__ import annotations

from domain.statement_row_extraction import (
    AmountColumnRole,
    extract_row_tokens,
    is_data_row,
)


def test_date_and_amount_tokens_classify_as_data_row_without_delimiter() -> None:
    line = "05-ENE-26 SUPERMERCADO XYZ CRC 12,850.00"
    assert is_data_row(line) is True
    assert "|" not in line


def test_header_line_with_neither_date_nor_amount_is_not_a_data_row() -> None:
    assert is_data_row("B) Detalle de compras del periodo") is False


def test_date_token_without_amount_is_not_a_data_row() -> None:
    assert is_data_row("Periodo 05-ENE-26 a 04-FEB-26") is False


def test_amount_without_date_is_not_a_data_row_when_requires_date() -> None:
    assert is_data_row("INTERESES CORRIENTES 3,577.10 0.00") is False


def test_amount_without_date_is_a_data_row_when_requires_date_false() -> None:
    assert is_data_row("INTERESES CORRIENTES 3,577.10 0.00", requires_date=False) is True


def test_trailing_minus_amount_is_recognized_as_amount_token() -> None:
    line = "INTERESES CORRIENTES 3,706.90- 0.00"
    assert is_data_row(line, requires_date=False) is True


def test_numeric_slash_date_and_month_day_date_shapes_are_recognized() -> None:
    assert is_data_row("15/01/26 COMPRA 1,000.00") is True
    assert is_data_row("DIC/31 COMPRA 1,000.00") is True


def test_extract_row_tokens_splits_date_amounts_and_remaining_description() -> None:
    tokens = extract_row_tokens("100001 05-ENE-26 SUPERMERCADO XYZ SAN JOSE CRC 12,850.00")
    assert tokens.date == "05-ENE-26"
    assert tokens.amounts == ("12,850.00",)
    assert tokens.description == "100001 SUPERMERCADO XYZ SAN JOSE CRC"


def test_extract_row_tokens_interest_row_has_no_date_and_two_amounts() -> None:
    tokens = extract_row_tokens(
        "INTERESES CORRIENTES 3,577.10 0.00",
        requires_date=False,
    )
    assert tokens.date is None
    assert tokens.amounts == ("3,577.10", "0.00")
    assert tokens.description == "INTERESES CORRIENTES"


def test_extract_row_tokens_keeps_trailing_minus_on_amount() -> None:
    tokens = extract_row_tokens("AJUSTE INTERES 3,706.90- 0.00", requires_date=False)
    assert tokens.amounts == ("3,706.90-", "0.00")
    assert tokens.description == "AJUSTE INTERES"


def test_extract_row_tokens_does_not_return_a_date_when_requires_date_is_false() -> None:
    tokens = extract_row_tokens("05-ENE-26 INTERESES 1,200.00 0.00", requires_date=False)
    assert tokens.date is None


def test_amount_column_role_declares_currency_and_sign_variants() -> None:
    assert AmountColumnRole.CURRENCY_VARIANT == "currency_variant"
    assert AmountColumnRole.SIGN_VARIANT == "sign_variant"
    assert {role.value for role in AmountColumnRole} == {
        "currency_variant",
        "sign_variant",
    }


def test_amount_token_pattern_is_overridable() -> None:
    decimal_comma_line = "05-ENE-26 COMPRA 12.850,00"
    assert is_data_row(decimal_comma_line) is False
    override = r"\b\d{1,3}(?:\.\d{3})*,\d{2}"
    assert is_data_row(decimal_comma_line, amount_pattern=override) is True
    tokens = extract_row_tokens(decimal_comma_line, amount_pattern=override)
    assert tokens.amounts == ("12.850,00",)
