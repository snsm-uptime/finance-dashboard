"""Membership ACL policy — list-scoped actions (Story 1.5.4 / 2.2).

Pure domain: no FastAPI / SQLAlchemy imports.
"""

from __future__ import annotations

from typing import Literal

# Stable action vocabulary (sketch). Synonyms normalize to the same capability.
ListAccessAction = Literal[
    "read_list",
    "read_expenses",
    "read_balances",
    "read_ledger",
    "write_expense",
    "write_ledger",
    "import_to_list",
    "set_last_opened_list",
    "rename_list",
    "invite_member",
    "edit_default_split",
]

_ACTION_ALIASES: dict[str, str] = {
    "read_expenses": "read_ledger",
    "write_expense": "write_ledger",
}

_MEMBER_READ_ACTIONS = frozenset(
    {
        "read_list",
        "read_ledger",
        "read_balances",
    }
)

_MEMBER_MUTATION_ACTIONS = frozenset(
    {
        "write_ledger",
        "import_to_list",
        "set_last_opened_list",
    }
)

_OWNER_ACTIONS = frozenset(
    {
        "rename_list",
        "invite_member",
        "edit_default_split",
    }
)

ALL_KNOWN_ACTIONS = (
    _MEMBER_READ_ACTIONS | _MEMBER_MUTATION_ACTIONS | _OWNER_ACTIONS | frozenset(_ACTION_ALIASES)
)


def normalize_list_action(action: str) -> str | None:
    """Return canonical action name, or None if unknown (fail closed)."""
    if action in _ACTION_ALIASES:
        return _ACTION_ALIASES[action]
    if action in ALL_KNOWN_ACTIONS:
        return action
    return None


def is_member_read_action(canonical_action: str) -> bool:
    return canonical_action in _MEMBER_READ_ACTIONS


def is_member_mutation_action(canonical_action: str) -> bool:
    return canonical_action in _MEMBER_MUTATION_ACTIONS


def is_owner_action(canonical_action: str) -> bool:
    return canonical_action in _OWNER_ACTIONS


def deny_as_not_found_for_action(canonical_action: str) -> bool:
    """List-scoped reads hide existence (404). Mutations use 403 not_list_member."""
    return is_member_read_action(canonical_action)
