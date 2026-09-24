"""Unit tests for the real BCCR adapter (BccrSwClient + CachedBccrClient).

Real BCCR calls are never exercised here — `bccr.SW.descargar_indicador` is
monkeypatched, per project-context.md ("never live BCCR in CI").
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from uuid import uuid4

import bccr
import pandas as pd
import pytest
from adapters.fx.bccr_client import BccrSwClient, CachedBccrClient
from adapters.persistence.models import FxRateCacheModel
from domain.errors import FxServiceUnavailableError
from sqlalchemy import select
from sqlalchemy.orm import Session


def _series(values: dict[date, float]) -> pd.Series:
    index = pd.to_datetime(list(values.keys()))
    return pd.Series(list(values.values()), index=index, name="Tipo cambio venta")


class TestBccrSwClient:
    def test_get_rate_returns_decimal_for_exact_date(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        target = date(2026, 1, 6)
        monkeypatch.setattr(
            bccr.SW, "descargar_indicador", lambda *a, **kw: _series({target: 620.5})
        )

        client = BccrSwClient()
        assert client.get_rate(target, "USD") == Decimal("620.5")

    def test_get_rate_returns_none_when_bccr_has_no_data(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        def raise_index_error(*args, **kwargs):
            raise IndexError("list index out of range")

        monkeypatch.setattr(bccr.SW, "descargar_indicador", raise_index_error)

        client = BccrSwClient()
        assert client.get_rate(date(2026, 1, 3), "USD") is None

    def test_get_rate_returns_none_for_empty_series(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(bccr.SW, "descargar_indicador", lambda *a, **kw: pd.Series(dtype=float))

        client = BccrSwClient()
        assert client.get_rate(date(2026, 1, 3), "USD") is None

    def test_transport_failure_raises_fx_service_unavailable(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        def raise_connection_error(*args, **kwargs):
            raise ConnectionError("BCCR unreachable")

        monkeypatch.setattr(bccr.SW, "descargar_indicador", raise_connection_error)

        client = BccrSwClient()
        with pytest.raises(FxServiceUnavailableError):
            client.get_rate(date(2026, 1, 6), "USD")

    def test_unsupported_currency_raises(self) -> None:
        client = BccrSwClient()
        with pytest.raises(FxServiceUnavailableError):
            client.get_rate(date(2026, 1, 6), "EUR")

    def test_get_nearest_prior_rate_returns_latest_in_window(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        rate_date = date(2026, 1, 6)
        series = _series({date(2026, 1, 3): 615.0, date(2026, 1, 4): 618.0})
        monkeypatch.setattr(bccr.SW, "descargar_indicador", lambda *a, **kw: series)

        client = BccrSwClient()
        rate, found_date = client.get_nearest_prior_rate(rate_date, "USD")
        assert rate == Decimal("618.0")
        assert found_date == date(2026, 1, 4)

    def test_get_nearest_prior_rate_returns_none_when_window_empty(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        def raise_index_error(*args, **kwargs):
            raise IndexError

        monkeypatch.setattr(bccr.SW, "descargar_indicador", raise_index_error)

        client = BccrSwClient()
        assert client.get_nearest_prior_rate(date(2026, 1, 6), "USD") is None

    def test_get_rate_rejects_nan(self, monkeypatch: pytest.MonkeyPatch) -> None:
        target = date(2026, 1, 6)
        monkeypatch.setattr(
            bccr.SW, "descargar_indicador", lambda *a, **kw: _series({target: float("nan")})
        )

        client = BccrSwClient()
        with pytest.raises(FxServiceUnavailableError):
            client.get_rate(target, "USD")

    def test_get_rate_rejects_duplicate_date_rows(self, monkeypatch: pytest.MonkeyPatch) -> None:
        target = date(2026, 1, 6)
        index = pd.to_datetime([target, target])
        duplicated = pd.Series([620.0, 621.0], index=index, name="Tipo cambio venta")
        monkeypatch.setattr(bccr.SW, "descargar_indicador", lambda *a, **kw: duplicated)

        client = BccrSwClient()
        with pytest.raises(FxServiceUnavailableError):
            client.get_rate(target, "USD")

    def test_init_raises_fx_service_unavailable_when_package_missing(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        import builtins

        real_import = builtins.__import__

        def blocked_import(name, *args, **kwargs):
            if name == "bccr":
                raise ImportError("no module named bccr")
            return real_import(name, *args, **kwargs)

        monkeypatch.setattr(builtins, "__import__", blocked_import)
        with pytest.raises(FxServiceUnavailableError):
            BccrSwClient()


class _FakeDelegate:
    """BccrClient double for CachedBccrClient tests. get_rate is used on a
    cache miss for get_rate(); get_nearest_prior_rate is called at most once
    per lookup, only when the cache-only walk finds nothing (see Design
    Notes / Spec Change Log)."""

    def __init__(
        self,
        rates: dict[tuple[date, str], Decimal] | None = None,
        nearest_prior: tuple[Decimal, date] | None = None,
    ) -> None:
        self._rates = rates or {}
        self._nearest_prior = nearest_prior
        self.get_rate_calls: list[tuple[date, str]] = []
        self.get_nearest_prior_rate_calls: list[tuple[date, str]] = []

    def get_rate(self, rate_date: date, currency: str) -> Decimal | None:
        self.get_rate_calls.append((rate_date, currency))
        return self._rates.get((rate_date, currency))

    def get_nearest_prior_rate(self, rate_date: date, currency: str) -> tuple[Decimal, date] | None:
        self.get_nearest_prior_rate_calls.append((rate_date, currency))
        return self._nearest_prior

    def supported_currencies(self) -> list[str]:
        return ["USD"]


class TestCachedBccrClient:
    def test_get_rate_cache_miss_then_hit(self, db_session: Session) -> None:
        target = date(2026, 1, 6)
        delegate = _FakeDelegate({(target, "USD"): Decimal("620.5")})
        client = CachedBccrClient(delegate, db_session)

        first = client.get_rate(target, "USD")
        assert first == Decimal("620.5")
        assert delegate.get_rate_calls == [(target, "USD")]

        row = db_session.execute(
            select(FxRateCacheModel).where(
                FxRateCacheModel.rate_date == target, FxRateCacheModel.currency == "USD"
            )
        ).scalar_one()
        assert row.rate == Decimal("620.5")

        second = client.get_rate(target, "USD")
        assert second == Decimal("620.5")
        # No new delegate call — served from cache.
        assert delegate.get_rate_calls == [(target, "USD")]

    def test_get_rate_miss_with_no_bccr_data_does_not_cache(self, db_session: Session) -> None:
        target = date(2026, 1, 3)
        delegate = _FakeDelegate()
        client = CachedBccrClient(delegate, db_session)

        assert client.get_rate(target, "USD") is None
        count = db_session.execute(
            select(FxRateCacheModel).where(FxRateCacheModel.rate_date == target)
        ).scalars().all()
        assert count == []

    def test_get_nearest_prior_rate_hits_cache_without_calling_delegate(
        self, db_session: Session
    ) -> None:
        rate_date = date(2026, 1, 6)
        found_date = rate_date - timedelta(days=2)
        db_session.add(
            FxRateCacheModel(
                id=uuid4(), rate_date=found_date, currency="USD", rate=Decimal("618.0")
            )
        )
        db_session.flush()
        delegate = _FakeDelegate()
        client = CachedBccrClient(delegate, db_session)

        rate, actual_date = client.get_nearest_prior_rate(rate_date, "USD")
        assert rate == Decimal("618.0")
        assert actual_date == found_date
        # Cache-only walk found it — no network call at all.
        assert delegate.get_nearest_prior_rate_calls == []

    def test_get_nearest_prior_rate_cold_cache_makes_one_batched_delegate_call(
        self, db_session: Session
    ) -> None:
        rate_date = date(2026, 1, 6)
        found_date = rate_date - timedelta(days=3)
        delegate = _FakeDelegate(nearest_prior=(Decimal("618.0"), found_date))
        client = CachedBccrClient(delegate, db_session)

        rate, actual_date = client.get_nearest_prior_rate(rate_date, "USD")
        assert rate == Decimal("618.0")
        assert actual_date == found_date
        # Exactly one batched call, not one per day in the window.
        assert delegate.get_nearest_prior_rate_calls == [(rate_date, "USD")]

        row = db_session.execute(
            select(FxRateCacheModel).where(
                FxRateCacheModel.rate_date == found_date, FxRateCacheModel.currency == "USD"
            )
        ).scalar_one()
        assert row.rate == Decimal("618.0")

    def test_get_nearest_prior_rate_returns_none_when_nothing_in_window(
        self, db_session: Session
    ) -> None:
        delegate = _FakeDelegate()
        client = CachedBccrClient(delegate, db_session)

        assert client.get_nearest_prior_rate(date(2026, 1, 6), "USD") is None

    def test_supported_currencies_delegates(self, db_session: Session) -> None:
        delegate = _FakeDelegate()
        client = CachedBccrClient(delegate, db_session)
        assert client.supported_currencies() == ["USD"]
