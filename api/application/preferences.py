"""Account preference use-cases — language EN/ES and theme Light/Dark/System."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Protocol
from uuid import UUID

from domain.errors import PrincipalNotFoundError
from domain.preferences import (
    coerce_stored_language,
    coerce_stored_theme,
    validate_language,
    validate_theme,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class UserPreferencesRecord:
    id: UUID
    email: str
    language: str | None
    theme: str | None


class PreferencesRepository(Protocol):
    def get_preferences(self, user_id: UUID) -> UserPreferencesRecord | None: ...

    def update_preferences(
        self,
        user_id: UUID,
        *,
        language: str | None = None,
        theme: str | None = None,
    ) -> UserPreferencesRecord: ...


@dataclass(frozen=True, slots=True)
class GetMePreferencesCommand:
    user_id: UUID


@dataclass(frozen=True, slots=True)
class MePreferencesResult:
    user_id: UUID
    email: str
    language: str | None
    theme: str | None


@dataclass(frozen=True, slots=True)
class UpdatePreferencesCommand:
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


class GetMePreferencesService:
    def __init__(self, repo: PreferencesRepository) -> None:
        self._repo = repo

    def execute(self, command: GetMePreferencesCommand) -> MePreferencesResult:
        row = self._repo.get_preferences(command.user_id)
        if row is None:
            raise PrincipalNotFoundError()
        return MePreferencesResult(
            user_id=row.id,
            email=row.email,
            language=_coerce_language(row.language),
            theme=_coerce_theme(row.theme),
        )


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
        return MePreferencesResult(
            user_id=row.id,
            email=row.email,
            language=_coerce_language(row.language),
            theme=_coerce_theme(row.theme),
        )
