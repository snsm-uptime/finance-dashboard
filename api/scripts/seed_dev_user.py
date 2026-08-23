"""Seed ready-to-use dev accounts so worktree stacks are testable immediately.

Runs from the container entrypoint when SEED_DEV_USER is truthy (worktree
stacks set it); idempotent, so restarts are safe. Never enable in prod.

The roster seeds one account per person plus the shared-list wiring between
them, so a fresh stack can exercise sharing without going through invites.
The SEED_DEV_USER_* env overrides apply to the primary account only
(``default_user_cejas``) — the rest of the roster keeps its declared values.

Manual run:

    uv run python scripts/seed_dev_user.py
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, replace
from datetime import UTC, datetime
from uuid import uuid4

from adapters.persistence.db import get_session_factory
from adapters.persistence.models import ListMembershipModel, ListModel, UserModel
from adapters.persistence.password_hasher import Argon2PasswordHasher
from domain.alias import validate_alias
from domain.list_invite import INVITE_MEMBER_ROLE
from domain.signup import normalize_email
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

logger = logging.getLogger(__name__)

OWNER_ROLE = "owner"


@dataclass(frozen=True)
class SharedList:
    """A list owned by another roster member that this user joins as a member.

    ``owner_alias`` is the owner's *declared* alias (the roster key), so the
    link survives a SEED_DEV_USER_ALIAS override of the primary account.
    """

    owner_alias: str
    name: str


@dataclass(frozen=True)
class MockUser:
    email: str
    password: str
    alias: str
    default_lists: tuple[str, ...]
    shared_lists: tuple[SharedList, ...] = ()

    def with_env_overrides(self) -> MockUser:
        """Apply the SEED_DEV_USER_* overrides (primary account only)."""
        raw_lists = (os.environ.get("SEED_DEV_USER_LISTS") or "").strip()
        lists = (
            tuple(name.strip() for name in raw_lists.split(",") if name.strip())
            if raw_lists
            else self.default_lists
        )
        return replace(
            self,
            email=os.environ.get("SEED_DEV_USER_EMAIL") or self.email,
            password=os.environ.get("SEED_DEV_USER_PASSWORD") or self.password,
            alias=os.environ.get("SEED_DEV_USER_ALIAS") or self.alias,
            default_lists=lists,
        )


default_user_cejas = MockUser(
    email="snsmtel@gmail.com",
    password="05111012",
    alias="cejas",
    default_lists=("ECO", "Personal", "Home"),
)

default_user_monchis = MockUser(
    email="monsotos@gmail.com",
    password="05111012",
    alias="monchis",
    # "Home" belongs to cejas — monchis joins it rather than owning a namesake.
    default_lists=("Macarena", "Personal"),
    shared_lists=(SharedList(owner_alias="cejas", name="Home"),),
)

# First entry is the primary account: the one SEED_DEV_USER_* overrides target.
DEV_USERS: tuple[MockUser, ...] = (default_user_cejas, default_user_monchis)


def _resolve_roster() -> dict[str, MockUser]:
    """Roster keyed by declared alias, with env overrides on the primary user."""
    primary, *rest = DEV_USERS
    roster = {primary.alias: primary.with_env_overrides()}
    for spec in rest:
        roster[spec.alias] = spec
    return roster


def _ensure_membership(session: Session, list_model: ListModel, user: UserModel, role: str) -> bool:
    """Add the membership unless it already exists. True when one was created."""
    existing = session.scalar(
        select(ListMembershipModel).where(
            ListMembershipModel.list_id == list_model.id,
            ListMembershipModel.user_id == user.id,
        )
    )
    if existing is not None:
        return False
    session.add(ListMembershipModel(id=uuid4(), list_id=list_model.id, user_id=user.id, role=role))
    return True


def _seed_user(session: Session, spec: MockUser) -> tuple[UserModel, dict[str, ListModel]]:
    """Upsert the account and its owned lists. Returns the user and its lists by name."""
    email = normalize_email(spec.email)
    alias = validate_alias(spec.alias)

    user = session.scalar(select(UserModel).where(UserModel.email == email))
    if user is None:
        user = UserModel(
            id=uuid4(),
            email=email,
            password_hash=Argon2PasswordHasher().hash(spec.password),
            alias=alias,
            email_verified_at=datetime.now(UTC),
        )
        session.add(user)
        session.flush()
        logger.info("Seeded dev user %s", email)
    else:
        if user.email_verified_at is None:
            user.email_verified_at = datetime.now(UTC)
        # Lists are gated behind an alias, so keep the seeded account past that gate.
        if not user.alias:
            user.alias = alias

    owned: dict[str, ListModel] = {}
    for row in session.scalars(select(ListModel).where(ListModel.owner_id == user.id)):
        owned.setdefault(row.name, row)

    for name in spec.default_lists:
        list_model = owned.get(name)
        if list_model is None:
            list_model = ListModel(id=uuid4(), name=name, owner_id=user.id)
            session.add(list_model)
            session.flush()
            owned[name] = list_model
            logger.info("Seeded list %r for %s", name, email)
        _ensure_membership(session, list_model, user, OWNER_ROLE)

    return user, owned


def _seed_shared_lists(
    session: Session,
    spec: MockUser,
    user: UserModel,
    owned_by_alias: dict[str, dict[str, ListModel]],
) -> None:
    """Join this user to lists owned by other roster members."""
    for shared in spec.shared_lists:
        list_model = owned_by_alias.get(shared.owner_alias, {}).get(shared.name)
        if list_model is None:
            logger.warning(
                "Skipping shared list %r: %s does not own it",
                shared.name,
                shared.owner_alias,
            )
            continue
        if _ensure_membership(session, list_model, user, INVITE_MEMBER_ROLE):
            logger.info(
                "Added %s to list %r owned by %s", user.email, shared.name, shared.owner_alias
            )


def seed() -> None:
    session_factory: sessionmaker[Session] = get_session_factory()

    with session_factory() as session:
        roster = _resolve_roster()
        users: dict[str, UserModel] = {}
        owned_by_alias: dict[str, dict[str, ListModel]] = {}
        for key, spec in roster.items():
            users[key], owned_by_alias[key] = _seed_user(session, spec)

        # Second pass: every owner exists by now, so cross-account joins resolve.
        for key, spec in roster.items():
            _seed_shared_lists(session, spec, users[key], owned_by_alias)

        session.commit()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    seed()
