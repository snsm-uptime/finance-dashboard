"""Unit tests for MaterializeFxService (Story 3.5) — TDD."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

import pytest
from application.fx_service import MaterializeFxService
from domain.errors import (
    FxCurrencyNotSupportedError,
    FxFutureDateError,
    FxRateNotAvailableError,
)


class FakeBccrClient:
    """In-memory BccrClient double: exact-date map + explicit nearest-prior map."""

    def __init__(
        self,
        *,
        rates: dict[tuple[date, str], Decimal] | None = None,
        nearest_prior: dict[tuple[date, str], tuple[Decimal, date]] | None = None,
        currencies: list[str] | None = None,
    ) -> None:
        self._rates = rates or {}
        self._nearest_prior = nearest_prior or {}
        self._currencies = currencies or ["USD"]

    def get_rate(self, rate_date: date, currency: str) -> Decimal | None:
        return self._rates.get((rate_date, currency))

    def get_nearest_prior_rate(self, rate_date: date, currency: str) -> tuple[Decimal, date] | None:
        return self._nearest_prior.get((rate_date, currency))

    def supported_currencies(self) -> list[str]:
        return list(self._currencies)


def test_crc_entry_passes_through_without_bccr_call() -> None:
    client = FakeBccrClient()
    service = MaterializeFxService(client)

    result = service.materialize_fx_for_entry(
        amount=Decimal("1000"), currency="CRC", posted_date=date(2026, 8, 5)
    )

    assert result.amount_crc == Decimal("1000")
    assert result.fx_rate == Decimal("1")
    assert result.fx_rate_date == date(2026, 8, 5)
    assert result.fx_fallback is False


def test_usd_exact_match() -> None:
    client = FakeBccrClient(rates={(date(2026, 8, 5), "USD"): Decimal("525.00")})
    service = MaterializeFxService(client)

    result = service.materialize_fx_for_entry(
        amount=Decimal("100"), currency="USD", posted_date=date(2026, 8, 5)
    )

    assert result.amount_crc == Decimal("52500.00")
    assert result.fx_rate == Decimal("525.00")
    assert result.fx_rate_date == date(2026, 8, 5)
    assert result.fx_fallback is False


def test_usd_fallback_to_nearest_prior() -> None:
    client = FakeBccrClient(
        nearest_prior={(date(2026, 8, 5), "USD"): (Decimal("525.00"), date(2026, 8, 4))}
    )
    service = MaterializeFxService(client)

    result = service.materialize_fx_for_entry(
        amount=Decimal("100"), currency="USD", posted_date=date(2026, 8, 5)
    )

    assert result.amount_crc == Decimal("52500.00")
    assert result.fx_rate == Decimal("525.00")
    assert result.fx_rate_date == date(2026, 8, 4)
    assert result.fx_fallback is True


def test_usd_refund_negative_amount() -> None:
    client = FakeBccrClient(rates={(date(2026, 8, 5), "USD"): Decimal("525.00")})
    service = MaterializeFxService(client)

    result = service.materialize_fx_for_entry(
        amount=Decimal("-50"), currency="USD", posted_date=date(2026, 8, 5)
    )

    assert result.amount_crc == Decimal("-26250.00")
    assert result.fx_rate == Decimal("525.00")
    assert result.fx_fallback is False


def test_no_rate_anywhere_raises_loud() -> None:
    client = FakeBccrClient()
    service = MaterializeFxService(client)

    with pytest.raises(FxRateNotAvailableError, match="USD"):
        service.materialize_fx_for_entry(
            amount=Decimal("100"), currency="USD", posted_date=date(2026, 8, 5)
        )


def test_zero_amount_passes_through_no_bccr_call() -> None:
    client = FakeBccrClient()
    service = MaterializeFxService(client)

    result = service.materialize_fx_for_entry(
        amount=Decimal("0"), currency="USD", posted_date=date(2026, 8, 5)
    )

    assert result.amount_crc == Decimal("0")
    assert result.fx_rate == Decimal("1")
    assert result.fx_fallback is False


def test_future_date_raises() -> None:
    client = FakeBccrClient()
    service = MaterializeFxService(client)
    future = date.today() + timedelta(days=1)

    with pytest.raises(FxFutureDateError):
        service.materialize_fx_for_entry(amount=Decimal("100"), currency="USD", posted_date=future)


def test_precision_preservation_banker_rounding() -> None:
    client = FakeBccrClient(rates={(date(2026, 8, 5), "USD"): Decimal("525.50")})
    service = MaterializeFxService(client)

    result = service.materialize_fx_for_entry(
        amount=Decimal("99.99"), currency="USD", posted_date=date(2026, 8, 5)
    )

    # 99.99 * 525.50 = 52544.745 -> banker's rounding to nearest even (52544.74).
    assert result.amount_crc == Decimal("52544.74")


def test_unsupported_currency_raises() -> None:
    client = FakeBccrClient(currencies=["USD"])
    service = MaterializeFxService(client)

    with pytest.raises(FxCurrencyNotSupportedError, match="EUR"):
        service.materialize_fx_for_entry(
            amount=Decimal("100"), currency="EUR", posted_date=date(2026, 8, 5)
        )


def test_missing_posted_date_raises_value_error() -> None:
    client = FakeBccrClient()
    service = MaterializeFxService(client)

    with pytest.raises(ValueError):
        service.materialize_fx_for_entry(amount=Decimal("100"), currency="USD", posted_date=None)  # type: ignore[arg-type]
