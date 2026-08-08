"""Calendar-date helpers — America/Costa_Rica (ARCHITECTURE-SPINE Dates)."""

from __future__ import annotations

from datetime import date, datetime
from zoneinfo import ZoneInfo

COSTA_RICA_TZ = ZoneInfo("America/Costa_Rica")


def today_costa_rica(now: datetime | None = None) -> date:
    """Return today's calendar date in America/Costa_Rica (never UTC midnight)."""
    instant = now if now is not None else datetime.now(COSTA_RICA_TZ)
    if instant.tzinfo is None:
        instant = instant.replace(tzinfo=COSTA_RICA_TZ)
    return instant.astimezone(COSTA_RICA_TZ).date()


def today_costa_rica_iso(now: datetime | None = None) -> str:
    """ISO-8601 calendar date string (YYYY-MM-DD) in America/Costa_Rica."""
    return today_costa_rica(now).isoformat()
