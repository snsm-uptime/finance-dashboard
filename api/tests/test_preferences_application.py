"""Unit tests for preference application services (Story 1.6)."""

from __future__ import annotations

import logging
from uuid import uuid4

from application.preferences import (
    GetMePreferencesCommand,
    GetMePreferencesService,
    UserPreferencesRecord,
)

_PREFS_LOGGER = "application.preferences"


class _FakeRepo:
    def __init__(self, row: UserPreferencesRecord) -> None:
        self._row = row

    def get_preferences(self, user_id):  # noqa: ANN001
        if user_id != self._row.id:
            return None
        return self._row

    def update_preferences(
        self,
        user_id,
        *,
        language=None,
        theme=None,
        last_opened_list_id=None,
        clear_last_opened_list_id=False,
    ):  # noqa: ANN001
        del last_opened_list_id, clear_last_opened_list_id
        raise AssertionError("not used")


def test_get_me_logs_corrupt_language(caplog) -> None:  # noqa: ANN001
    user_id = uuid4()
    repo = _FakeRepo(
        UserPreferencesRecord(
            id=user_id,
            email="user@example.com",
            language="fr",
            theme="dark",
        )
    )
    # Alembic fileConfig(disable_existing_loggers=True) may have disabled this
    # logger earlier in the suite; re-enable so the warning is observable.
    logging.getLogger(_PREFS_LOGGER).disabled = False
    with caplog.at_level("WARNING", logger=_PREFS_LOGGER):
        result = GetMePreferencesService(repo).execute(GetMePreferencesCommand(user_id=user_id))
    assert result.language is None
    assert result.theme == "dark"
    assert "corrupt_user_language_preference" in caplog.text
