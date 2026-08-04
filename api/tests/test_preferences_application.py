"""Unit tests for preference application services (Story 1.6)."""

from __future__ import annotations

from uuid import uuid4

from application.preferences import (
    GetMePreferencesCommand,
    GetMePreferencesService,
    UserPreferencesRecord,
)


class _FakeRepo:
    def __init__(self, row: UserPreferencesRecord) -> None:
        self._row = row

    def get_preferences(self, user_id):  # noqa: ANN001
        if user_id != self._row.id:
            return None
        return self._row

    def update_preferences(self, user_id, *, language=None, theme=None):  # noqa: ANN001
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
    with caplog.at_level("WARNING"):
        result = GetMePreferencesService(repo).execute(GetMePreferencesCommand(user_id=user_id))
    assert result.language is None
    assert result.theme == "dark"
    assert any("corrupt_user_language_preference" in r.message for r in caplog.records)
