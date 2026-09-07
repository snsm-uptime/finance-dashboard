"""Account preference use-cases — language, theme; last-opened via SetLastOpenedListService."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from uuid import UUID

from domain.alias import validate_alias
from domain.errors import CardNotFoundError, InvalidPreferencesError, PrincipalNotFoundError
from domain.photo import validate_photo
from domain.preferences import (
    coerce_stored_default_origin,
    coerce_stored_language,
    coerce_stored_theme,
    validate_default_origin_kind,
    validate_language,
    validate_theme,
)

from application.cards import CardRepository
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
    default_origin_kind: str = "cash"
    default_origin_card_id: UUID | None = None
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
    default_origin_kind: str | None = None
    default_origin_card_id: UUID | None = None
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
    origin_kind, origin_card_id = coerce_stored_default_origin(
        row.default_origin_kind, row.default_origin_card_id
    )
    return MePreferencesResult(
        user_id=row.id,
        email=row.email,
        language=_coerce_language(row.language),
        theme=_coerce_theme(row.theme),
        last_opened_list_id=row.last_opened_list_id,
        default_import_list_id=row.default_import_list_id,
        default_origin_kind=origin_kind,
        default_origin_card_id=origin_card_id,
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
    def __init__(
        self, repo: PreferencesRepository, card_repo: CardRepository | None = None
    ) -> None:
        self._repo = repo
        self._card_repo = card_repo

    def execute(self, command: UpdatePreferencesCommand) -> MePreferencesResult:
        if (
            command.language is None
            and command.theme is None
            and command.default_origin_kind is None
            and command.photo_base64 is None
            and not command.clear_photo
        ):
            return GetMePreferencesService(self._repo).execute(
                GetMePreferencesCommand(user_id=command.user_id)
            )

        language: str | None = None
        theme: str | None = None
        default_origin_kind: str | None = None
        default_origin_card_id: UUID | None = None
        clear_default_origin_card_id = False
        if command.language is not None:
            language = validate_language(command.language)
        if command.theme is not None:
            theme = validate_theme(command.theme)
        if command.default_origin_kind is not None:
            default_origin_kind = validate_default_origin_kind(command.default_origin_kind)
            if default_origin_kind == "card":
                if command.default_origin_card_id is None:
                    raise InvalidPreferencesError(
                        "default_origin_card_id is required when default_origin_kind is 'card'"
                    )
                if self._card_repo is None or self._card_repo.get_card(
                    command.default_origin_card_id, command.user_id
                ) is None:
                    raise CardNotFoundError()
                default_origin_card_id = command.default_origin_card_id
            else:
                clear_default_origin_card_id = True
        photo_base64 = validate_photo(command.photo_base64) if not command.clear_photo else None

        row = self._repo.update_preferences(
            command.user_id,
            language=language,
            theme=theme,
            default_origin_kind=default_origin_kind,
            default_origin_card_id=default_origin_card_id,
            clear_default_origin_card_id=clear_default_origin_card_id,
            photo_base64=photo_base64,
            clear_photo=command.clear_photo,
        )
        return _to_result(row)
