"""Account preference use-cases — language, theme; last-opened via SetLastOpenedListService."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from uuid import UUID

from domain.errors import PrincipalNotFoundError
from domain.preferences import (
    coerce_stored_language,
    coerce_stored_theme,
    validate_language,
    validate_theme,
)

from application.ports import PreferencesRepository, UserPreferencesRecord

logger = logging.getLogger(__name__)

# Thin re-export for existing test/import paths (canonical home is application.ports).
__all__ = [
    "GetMePreferencesCommand",
    "GetMePreferencesService",
    "MePreferencesResult",
    "PreferencesRepository",
    "UpdatePreferencesCommand",
    "UpdatePreferencesService",
    "UserPreferencesRecord",
]


@dataclass(frozen=True, slots=True)
class GetMePreferencesCommand:
    user_id: UUID


@dataclass(frozen=True, slots=True)
class MePreferencesResult:
    user_id: UUID
    email: str
    language: str | None
    theme: str | None
    last_opened_list_id: UUID | None


@dataclass(frozen=True, slots=True)
class UpdatePreferencesCommand:
    """Language/theme only — last_opened goes through SetLastOpenedListService (ACL)."""

    user_id: UUID
    language: str | None = None
    theme: str | None = None


def _coerce_language(stored: str | None) -> str | None:
    coerced = coerce_stored_language(stored)
    if stored and coerced is None:
        logger.warning("corrupt_user_language_preference ignored value=%r", stored)
    return coerced


def _coerce_theme(stored: str | None) -> str | None:
    coerced = coerce_stored_theme(stored)
    if stored and coerced is None:
        logger.warning("corrupt_user_theme_preference ignored value=%r", stored)
    return coerced


def _to_result(row: UserPreferencesRecord) -> MePreferencesResult:
    return MePreferencesResult(
        user_id=row.id,
        email=row.email,
        language=_coerce_language(row.language),
        theme=_coerce_theme(row.theme),
        last_opened_list_id=row.last_opened_list_id,
    )


class GetMePreferencesService:
    def __init__(self, repo: PreferencesRepository) -> None:
        self._repo = repo

    def execute(self, command: GetMePreferencesCommand) -> MePreferencesResult:
        row = self._repo.get_preferences(command.user_id)
        if row is None:
            raise PrincipalNotFoundError()
        return _to_result(row)


class UpdatePreferencesService:
    def __init__(self, repo: PreferencesRepository) -> None:
        self._repo = repo

    def execute(self, command: UpdatePreferencesCommand) -> MePreferencesResult:
        if command.language is None and command.theme is None:
            return GetMePreferencesService(self._repo).execute(
                GetMePreferencesCommand(user_id=command.user_id)
            )

        language: str | None = None
        theme: str | None = None
        if command.language is not None:
            language = validate_language(command.language)
        if command.theme is not None:
            theme = validate_theme(command.theme)

        row = self._repo.update_preferences(
            command.user_id,
            language=language,
            theme=theme,
        )
        return _to_result(row)
