"""Account preference use-cases — language, theme; last-opened via SetLastOpenedListService."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from uuid import UUID

from domain.alias import validate_alias
from domain.errors import PrincipalNotFoundError
from domain.photo import validate_photo
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
    "SetAliasCommand",
    "SetAliasService",
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
    default_import_list_id: UUID | None = None
    alias: str | None = None
    photo_base64: str | None = None


@dataclass(frozen=True, slots=True)
class SetAliasCommand:
    """Initial alias claim only — rename lands with the deferred account-menu story."""

    user_id: UUID
    alias: str


@dataclass(frozen=True, slots=True)
class UpdatePreferencesCommand:
    """Language/theme/photo only — last_opened goes through SetLastOpenedListService (ACL)."""

    user_id: UUID
    language: str | None = None
    theme: str | None = None
    photo_base64: str | None = None
    clear_photo: bool = False


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
        default_import_list_id=row.default_import_list_id,
        alias=row.alias,
        photo_base64=row.photo_base64,
    )


class GetMePreferencesService:
    def __init__(self, repo: PreferencesRepository) -> None:
        self._repo = repo

    def execute(self, command: GetMePreferencesCommand) -> MePreferencesResult:
        row = self._repo.get_preferences(command.user_id)
        if row is None:
            raise PrincipalNotFoundError()
        return _to_result(row)


class SetAliasService:
    """Validate then claim; the repository translates the unique race to alias_taken."""

    def __init__(self, repo: PreferencesRepository) -> None:
        self._repo = repo

    def execute(self, command: SetAliasCommand) -> MePreferencesResult:
        alias = validate_alias(command.alias)
        row = self._repo.claim_alias(command.user_id, alias)
        return _to_result(row)


class UpdatePreferencesService:
    def __init__(self, repo: PreferencesRepository) -> None:
        self._repo = repo

    def execute(self, command: UpdatePreferencesCommand) -> MePreferencesResult:
        if (
            command.language is None
            and command.theme is None
            and command.photo_base64 is None
            and not command.clear_photo
        ):
            return GetMePreferencesService(self._repo).execute(
                GetMePreferencesCommand(user_id=command.user_id)
            )

        language: str | None = None
        theme: str | None = None
        if command.language is not None:
            language = validate_language(command.language)
        if command.theme is not None:
            theme = validate_theme(command.theme)
        photo_base64 = validate_photo(command.photo_base64) if not command.clear_photo else None

        row = self._repo.update_preferences(
            command.user_id,
            language=language,
            theme=theme,
            photo_base64=photo_base64,
            clear_photo=command.clear_photo,
        )
        return _to_result(row)
