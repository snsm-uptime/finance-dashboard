"""Account language / theme preference rules (pure domain — no framework imports)."""

from __future__ import annotations

import re

from domain.errors import InvalidPreferencesError

ALLOWED_LANGUAGES = frozenset({"en", "es"})
ALLOWED_THEMES = frozenset({"light", "dark", "system"})
DEFAULT_LANGUAGE = "en"
DEFAULT_THEME = "system"

_Q_PARAM = re.compile(r";\s*q\s*=", re.IGNORECASE)


def validate_language(value: str) -> str:
    normalized = value.strip().lower()
    if normalized not in ALLOWED_LANGUAGES:
        raise InvalidPreferencesError(
            f"language must be one of: {', '.join(sorted(ALLOWED_LANGUAGES))}"
        )
    return normalized


def validate_theme(value: str) -> str:
    normalized = value.strip().lower()
    if normalized not in ALLOWED_THEMES:
        raise InvalidPreferencesError(f"theme must be one of: {', '.join(sorted(ALLOWED_THEMES))}")
    return normalized


def coerce_stored_language(stored: str | None) -> str | None:
    """Return validated stored language, or None when unset/corrupt."""
    if not stored:
        return None
    try:
        return validate_language(stored)
    except InvalidPreferencesError:
        return None


def coerce_stored_theme(stored: str | None) -> str | None:
    """Return validated stored theme, or None when unset/corrupt."""
    if not stored:
        return None
    try:
        return validate_theme(stored)
    except InvalidPreferencesError:
        return None


def parse_accept_language(header: str | None) -> str:
    """Resolve first-visit language from Accept-Language (EN/ES only).

    Prefers Spanish when any ``es`` tag has the highest (or equal-highest) q-value
    among supported tags; otherwise English. Unsupported tags are ignored.
    """
    if not header or not header.strip():
        return DEFAULT_LANGUAGE

    best_lang = DEFAULT_LANGUAGE
    best_q = -1.0

    for part in header.split(","):
        piece = part.strip()
        if not piece:
            continue
        if _Q_PARAM.search(piece):
            tag, q_raw = _Q_PARAM.split(piece, maxsplit=1)
            try:
                q = float(q_raw.strip().split(";", 1)[0].strip())
            except ValueError:
                q = 0.0
        else:
            tag, q = piece, 1.0
        if q <= 0 or q > 1.0:
            continue
        # Drop any leftover parameters; primary subtag only (en / es).
        primary = tag.strip().lower().split(";", 1)[0].split("-", 1)[0]
        if primary == "es":
            lang = "es"
        elif primary == "en":
            lang = "en"
        else:
            continue
        if q > best_q:
            best_q = q
            best_lang = lang
        elif q == best_q and lang == "es" and best_lang == "en":
            # Equal quality: prefer Spanish when both present at same q.
            best_lang = "es"

    return best_lang


def effective_language(stored: str | None, accept_language: str | None) -> str:
    coerced = coerce_stored_language(stored)
    if coerced:
        return coerced
    return parse_accept_language(accept_language)


def effective_theme(stored: str | None) -> str:
    coerced = coerce_stored_theme(stored)
    if coerced:
        return coerced
    return DEFAULT_THEME
