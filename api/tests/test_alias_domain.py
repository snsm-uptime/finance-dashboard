"""Domain tests for the user alias matrix (normalize + validate) — TDD."""

from __future__ import annotations

import pytest
from domain.alias import (
    ALIAS_MAX_LENGTH,
    ALIAS_MIN_LENGTH,
    normalize_alias,
    validate_alias,
)
from domain.errors import InvalidAliasError


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("alice", "alice"),
        ("  alice  ", "alice"),
        ("ALICE", "alice"),
        ("Bob_99", "bob_99"),
        ("a" * ALIAS_MAX_LENGTH, "a" * ALIAS_MAX_LENGTH),
        ("a" * ALIAS_MIN_LENGTH, "a" * ALIAS_MIN_LENGTH),
    ],
)
def test_validate_normalizes_to_lowercase_slug(raw: str, expected: str) -> None:
    assert validate_alias(raw) == expected


def test_normalize_alias_never_raises() -> None:
    assert normalize_alias(None) == ""
    assert normalize_alias("  Mixed CASE ") == "mixed case"


@pytest.mark.parametrize(
    "raw",
    [
        "",
        "   ",
        None,
        "ab",
        "a" * (ALIAS_MAX_LENGTH + 1),
        "has space",
        "dash-not-allowed",
        "dot.not.allowed",
        "emoji_🙂",
        "acentuación",
        "alice@example.com",
    ],
)
def test_validate_rejects_bad_length_or_charset(raw: str | None) -> None:
    with pytest.raises(InvalidAliasError):
        validate_alias(raw)


def test_case_variants_normalize_to_the_same_slug() -> None:
    # Uniqueness is case-insensitive; normalization is what makes the DB index bite.
    assert validate_alias("Alice") == validate_alias("aLICE") == "alice"
