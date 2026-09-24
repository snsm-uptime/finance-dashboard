"""BCCR (Banco Central de Costa Rica) FX rate adapter (Story 3.5 / AD-7).

Live transport (`BccrSwClient`) uses the `bccr` PyPI package's SDDE client
(`bccr.SW`), indicator 318 (USD "Tipo de cambio venta" — sell reference
rate). `CachedBccrClient` wraps it with a Postgres-backed cache so repeat
commits on the same (rate_date, currency) don't re-hit BCCR. Real BCCR calls
are never exercised in tests (see api/tests/test_bccr_client.py, which stubs
the `bccr.SW` delegate) — never live BCCR in CI (project-context.md).
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal, InvalidOperation
from uuid import uuid4

from domain.errors import FxServiceUnavailableError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from adapters.persistence.models import FxRateCacheModel

# v1 scope is USD+CRC only (AD-7 / Dev Notes) — other currencies deferred.
SUPPORTED_CURRENCIES: tuple[str, ...] = ("USD",)

# BCCR indicator codes for USD/CRC (verified live against the SDDE API):
# 317 = Compra (buy), 318 = Venta (sell). We convert a USD amount into CRC
# using the sell rate — what it costs in CRC to buy the USD amount back.
_USD_VENTA_INDICATOR = 318

_NEAREST_PRIOR_WINDOW_DAYS = 30


class UnavailableBccrClient:
    """BccrClient stub: implements the port, fails loud until the real adapter ships."""

    def get_rate(self, rate_date: date, currency: str) -> Decimal | None:
        raise FxServiceUnavailableError(
            "BCCR client not yet implemented. BCCR API integration is deferred to a "
            "separate infrastructure spike; manual non-CRC expense FX materialization "
            "cannot proceed until then. See Epic 4 adapter stories."
        )

    def get_nearest_prior_rate(self, rate_date: date, currency: str) -> tuple[Decimal, date] | None:
        raise FxServiceUnavailableError(
            "BCCR client not yet implemented. BCCR API integration is deferred to a "
            "separate infrastructure spike; manual non-CRC expense FX materialization "
            "cannot proceed until then. See Epic 4 adapter stories."
        )

    def supported_currencies(self) -> list[str]:
        return list(SUPPORTED_CURRENCIES)


class BccrSwClient:
    """Raw BCCR transport via the `bccr` PyPI package (`bccr.SW`). No DB access —
    the caching wrapper (`CachedBccrClient`) owns persistence."""

    def __init__(self) -> None:
        try:
            from bccr import SW
        except ImportError as exc:
            raise FxServiceUnavailableError(f"BCCR client package unavailable: {exc}") from exc

        self._sw = SW

    def get_rate(self, rate_date: date, currency: str) -> Decimal | None:
        self._require_supported(currency)
        return self._fetch_single_date(rate_date)

    def get_nearest_prior_rate(self, rate_date: date, currency: str) -> tuple[Decimal, date] | None:
        self._require_supported(currency)
        start = rate_date - timedelta(days=_NEAREST_PRIOR_WINDOW_DAYS)
        series = self._download(start, rate_date)
        if series is None or series.empty:
            return None
        last_date = series.index.max()
        return self._to_decimal(self._single_value(series, last_date)), last_date.date()

    def supported_currencies(self) -> list[str]:
        return list(SUPPORTED_CURRENCIES)

    def _fetch_single_date(self, rate_date: date) -> Decimal | None:
        series = self._download(rate_date, rate_date)
        if series is None or series.empty:
            return None
        last_date = series.index.max()
        return self._to_decimal(self._single_value(series, last_date))

    def _single_value(self, series, index_value) -> object:
        """series.loc[index_value] is a scalar unless BCCR republished duplicate
        rows for the same date, in which case it's a Series — fail loud instead
        of feeding pandas objects into Decimal()."""
        value = series.loc[index_value]
        if hasattr(value, "__len__") and not isinstance(value, str):
            raise FxServiceUnavailableError(
                f"BCCR returned multiple rows for {index_value}: {value!r}"
            )
        return value

    def _download(self, start: date, end: date):
        try:
            return self._sw.descargar_indicador(
                _USD_VENTA_INDICATOR,
                FechaInicio=start.strftime("%Y/%m/%d"),
                FechaFinal=end.strftime("%Y/%m/%d"),
            )
        except IndexError:
            # bccr raises IndexError internally when BCCR returns zero data
            # points for the requested range (e.g. before the series starts) —
            # that is "no rate published", not a transport failure.
            return None
        except Exception as exc:  # noqa: BLE001 - any other failure is a real outage
            raise FxServiceUnavailableError(f"BCCR request failed: {exc}") from exc

    @staticmethod
    def _to_decimal(value: object) -> Decimal:
        try:
            decimal_value = Decimal(str(value))
        except (InvalidOperation, TypeError) as exc:
            raise FxServiceUnavailableError(f"BCCR returned a non-numeric rate: {value!r}") from exc
        if decimal_value.is_nan():
            # str(float('nan')) == "nan", which Decimal() parses instead of
            # rejecting — a gap in the middle of a BCCR date range must fail
            # loud, never materialize as a literal Decimal('NaN').
            raise FxServiceUnavailableError("BCCR returned a NaN rate")
        return decimal_value

    @staticmethod
    def _require_supported(currency: str) -> None:
        if currency.upper() not in SUPPORTED_CURRENCIES:
            raise FxServiceUnavailableError(f"BccrSwClient does not support currency {currency}")


class CachedBccrClient:
    """Postgres-backed cache in front of a real `BccrClient` delegate.

    Cache hit short-circuits without calling the delegate. Cache miss calls
    the delegate, persists the result under the *actual* returned date (which
    for `get_nearest_prior_rate` may be earlier than the requested date), then
    returns it.
    """

    def __init__(self, delegate: BccrSwClient, db: Session) -> None:
        self._delegate = delegate
        self._db = db

    def get_rate(self, rate_date: date, currency: str) -> Decimal | None:
        currency = currency.upper()
        cached = self._lookup(rate_date, currency)
        if cached is not None:
            return cached
        rate = self._delegate.get_rate(rate_date, currency)
        if rate is not None:
            self._store(rate_date, currency, rate)
        return rate

    def get_nearest_prior_rate(self, rate_date: date, currency: str) -> tuple[Decimal, date] | None:
        """Cache-only walk first (cheap DB reads, no network); a full miss
        falls back to a single batched delegate call instead of one BCCR
        request per day in the window."""
        currency = currency.upper()
        for offset in range(_NEAREST_PRIOR_WINDOW_DAYS + 1):
            candidate = rate_date - timedelta(days=offset)
            cached = self._lookup(candidate, currency)
            if cached is not None:
                return cached, candidate

        found = self._delegate.get_nearest_prior_rate(rate_date, currency)
        if found is None:
            return None
        rate, found_date = found
        self._store(found_date, currency, rate)
        return rate, found_date

    def supported_currencies(self) -> list[str]:
        return self._delegate.supported_currencies()

    def _lookup(self, rate_date: date, currency: str) -> Decimal | None:
        row = self._db.execute(
            select(FxRateCacheModel).where(
                FxRateCacheModel.rate_date == rate_date,
                FxRateCacheModel.currency == currency,
            )
        ).scalar_one_or_none()
        return row.rate if row is not None else None

    def _store(self, rate_date: date, currency: str, rate: Decimal) -> None:
        try:
            with self._db.begin_nested():
                self._db.add(
                    FxRateCacheModel(id=uuid4(), rate_date=rate_date, currency=currency, rate=rate)
                )
                self._db.flush()
        except IntegrityError:
            # Another concurrent request cached the same (rate_date, currency)
            # first — the unique constraint is the backstop, this is not an error.
            pass


__all__ = [
    "SUPPORTED_CURRENCIES",
    "BccrSwClient",
    "CachedBccrClient",
    "UnavailableBccrClient",
]
