"""BCCR (Banco Central de Costa Rica) FX rate adapter (Story 3.5 / AD-7).

BCCR transport/auth wiring (SOAP/REST endpoint, indicator codes, credentials) is
a separate infrastructure spike — deferred until a real deployment needs live
rates. Until then this adapter fails loud rather than silently defaulting to
1:1, so manual USD expenses surface a clear 503 instead of a corrupted balance.
Tests inject a fake BccrClient (see api/tests/test_fx_service.py) and do not
depend on this adapter.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from domain.errors import FxServiceUnavailableError

# v1 scope is USD+CRC only (AD-7 / Dev Notes) — other currencies deferred.
SUPPORTED_CURRENCIES: tuple[str, ...] = ("USD",)


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


__all__ = ["SUPPORTED_CURRENCIES", "UnavailableBccrClient"]
