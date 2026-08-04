"""Unit tests for account preference domain rules (Story 1.6)."""

from __future__ import annotations

import pytest
from domain.errors import InvalidPreferencesError
from domain.preferences import (
    DEFAULT_LANGUAGE,
    DEFAULT_THEME,
    effective_language,
    effective_theme,
    parse_accept_language,
    validate_language,
    validate_theme,
)


def test_validate_language_accepts_en_es() -> None:
    assert validate_language("en") == "en"
    assert validate_language(" ES ") == "es"


def test_validate_language_rejects_unknown() -> None:
    with pytest.raises(InvalidPreferencesError):
        validate_language("fr")


def test_validate_theme_accepts_allowed() -> None:
    assert validate_theme("light") == "light"
    assert validate_theme("Dark") == "dark"
    assert validate_theme("system") == "system"


def test_validate_theme_rejects_unknown() -> None:
    with pytest.raises(InvalidPreferencesError):
        validate_theme("auto")


def test_parse_accept_language_defaults_en() -> None:
    assert parse_accept_language(None) == DEFAULT_LANGUAGE
    assert parse_accept_language("") == DEFAULT_LANGUAGE
    assert parse_accept_language("fr-FR,fr;q=0.9") == DEFAULT_LANGUAGE


def test_parse_accept_language_prefers_spanish() -> None:
    assert parse_accept_language("es-CR,es;q=0.9,en;q=0.8") == "es"
    assert parse_accept_language("en-US,en;q=0.9,es;q=0.8") == "en"
    assert parse_accept_language("es") == "es"


def test_parse_accept_language_equal_q_prefers_es() -> None:
    assert parse_accept_language("en;q=0.9,es;q=0.9") == "es"


def test_effective_language_uses_stored_over_header() -> None:
    assert effective_language("es", "en-US") == "es"
    assert effective_language(None, "es-CR") == "es"


def test_effective_theme_defaults_system() -> None:
    assert effective_theme(None) == DEFAULT_THEME
    assert effective_theme("dark") == "dark"
