"""Pure list create / rename rules (no FastAPI / SQLAlchemy)."""

from __future__ import annotations

from domain.errors import InvalidListNameError

LIST_NAME_MAX_LENGTH = 200


def validate_list_name(raw: str) -> str:
    """Trim and validate a user-visible list name.

    Returns the normalized name. Raises InvalidListNameError when empty
    or whitespace-only after trim, or when longer than LIST_NAME_MAX_LENGTH.
    """
    if raw is None:
        raise InvalidListNameError()
    name = raw.strip()
    if not name:
        raise InvalidListNameError()
    if len(name) > LIST_NAME_MAX_LENGTH:
        raise InvalidListNameError(
            f"List name must be at most {LIST_NAME_MAX_LENGTH} characters."
        )
    return name
