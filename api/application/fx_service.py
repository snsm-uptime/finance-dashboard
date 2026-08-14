"""Materializes FX to CRC at commit time for non-CRC ledger lines (Story 3.5 / FR-40, AD-7).

Called once per entry, at commit. Settle-up (domain/settle.py) always reads the
resulting amount_crc from the committed ledger row afterwards — it never re-calls
BCCR (AC #2). Never falls back to a 1:1 rate; missing rates fail loud.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_EVEN, Decimal

from domain.errors import (
    FxCurrencyNotSupportedError,
    FxFutureDateError,
    FxRateNotAvailableError,
)

from application.ports import BccrClient

CRC_CURRENCY = "CRC"
CRC_QUANTUM = Decimal("0.01")
# Matches ledger_entries.fx_rate NUMERIC(10,4) — quantize here so the in-memory
# value returned at commit matches what a later read of the persisted row
# yields; otherwise "525.00" (fresh) vs "525.0000" (DB round-trip) diverge.
FX_RATE_QUANTUM = Decimal("0.0001")


@dataclass(frozen=True, slots=True)
class MaterializedFx:
    """Fields to persist on the ledger entry (AD-3: durable, atomic with commit)."""

    amount_crc: Decimal
    fx_rate: Decimal
    fx_rate_date: date
    fx_fallback: bool


class MaterializeFxService:
    def __init__(self, bccr_client: BccrClient, logger: logging.Logger | None = None) -> None:
        self._bccr = bccr_client
        self._logger = logger or logging.getLogger(__name__)

    def materialize_fx_for_entry(
        self,
        *,
        amount: Decimal,
        currency: str,
        posted_date: date | None,
    ) -> MaterializedFx:
        if posted_date is None:
            raise ValueError("Ledger entry must have posted_date")
        if posted_date > date.today():
            raise FxFutureDateError(f"Cannot materialize FX for future date {posted_date}")

        cur = (currency or "").strip().upper()

        # CRC and zero-amount lines pass through — no BCCR call (perf + no-op FX).
        if cur == CRC_CURRENCY or amount == 0:
            return MaterializedFx(
                amount_crc=amount,
                fx_rate=_quantize_rate(Decimal("1")),
                fx_rate_date=posted_date,
                fx_fallback=False,
            )

        supported = self._bccr.supported_currencies()
        if cur not in supported:
            raise FxCurrencyNotSupportedError(
                f"Currency {cur} not supported; BCCR rates for: {', '.join(supported)}"
            )

        rate = self._bccr.get_rate(posted_date, cur)
        if rate is not None:
            return MaterializedFx(
                amount_crc=_quantize(amount * rate),
                fx_rate=_quantize_rate(rate),
                fx_rate_date=posted_date,
                fx_fallback=False,
            )

        fallback = self._bccr.get_nearest_prior_rate(posted_date, cur)
        if fallback is not None:
            fallback_rate, fallback_date = fallback
            self._logger.info(
                "fx_rate_fallback currency=%s requested_date=%s used_date=%s",
                cur,
                posted_date,
                fallback_date,
            )
            return MaterializedFx(
                amount_crc=_quantize(amount * fallback_rate),
                fx_rate=_quantize_rate(fallback_rate),
                fx_rate_date=fallback_date,
                fx_fallback=True,
            )

        raise FxRateNotAvailableError(
            f"No BCCR rate for {cur} on {posted_date} or any prior date. "
            f"Supported currencies: {supported}"
        )


def _quantize(value: Decimal) -> Decimal:
    return value.quantize(CRC_QUANTUM, rounding=ROUND_HALF_EVEN)


def _quantize_rate(value: Decimal) -> Decimal:
    return value.quantize(FX_RATE_QUANTUM, rounding=ROUND_HALF_EVEN)


__all__ = ["MaterializeFxService", "MaterializedFx"]
