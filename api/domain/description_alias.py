"""Description-alias pair validation (Story 5.6, FR-23) — pure, no I/O (AD-1)."""

from __future__ import annotations


def normalize_alias_pair(
    manual_label: str | None, bank_description: str | None
) -> tuple[str, str] | None:
    """Strips both inputs; returns `None` if either is blank/`None` after
    stripping — the caller's signal to skip persistence silently rather than
    write a garbage alias row."""
    manual = (manual_label or "").strip()
    bank = (bank_description or "").strip()
    if not manual or not bank:
        return None
    return manual, bank


__all__ = ["normalize_alias_pair"]
