"""User alias rules — readable roster/picker label (pure domain, no framework imports).

Email stays the auth/invite identifier; the alias is the only person label the
product renders. Uniqueness is case-insensitive, so normalization is lowercase.
"""

from __future__ import annotations

import re

from domain.errors import InvalidAliasError

ALIAS_MIN_LENGTH = 3
ALIAS_MAX_LENGTH = 32
ALIAS_PATTERN = re.compile(r"^[a-z0-9_]+$")
ALIAS_CHARSET_HINT = "lowercase letters, numbers, and underscores"


def normalize_alias(value: str | None) -> str:
    """Trim + lowercase. Normalization only — never raises."""
    return (value or "").strip().lower()


def validate_alias(value: str | None) -> str:
    """Return the normalized alias or raise InvalidAliasError."""
    normalized = normalize_alias(value)
    if not normalized:
        raise InvalidAliasError("Choose an alias.")
    if len(normalized) < ALIAS_MIN_LENGTH or len(normalized) > ALIAS_MAX_LENGTH:
        raise InvalidAliasError(
            f"Alias must be between {ALIAS_MIN_LENGTH} and {ALIAS_MAX_LENGTH} characters."
        )
    if not ALIAS_PATTERN.match(normalized):
        raise InvalidAliasError(f"Alias may use only {ALIAS_CHARSET_HINT}.")
    return normalized
