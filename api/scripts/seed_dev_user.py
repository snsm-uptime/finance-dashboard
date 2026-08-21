"""Seed a ready-to-use dev account so worktree stacks are testable immediately.

Runs from the container entrypoint when SEED_DEV_USER is truthy (worktree
stacks set it); idempotent, so restarts are safe. Never enable in prod.

Manual run:

    uv run python scripts/seed_dev_user.py
"""

from __future__ import annotations

import logging
import os
from datetime import UTC, datetime
from uuid import uuid4

from adapters.persistence.db import get_session_factory
from adapters.persistence.models import ListMembershipModel, ListModel, UserModel
from adapters.persistence.password_hasher import Argon2PasswordHasher
from domain.alias import validate_alias
from domain.signup import normalize_email
from sqlalchemy import select

logger = logging.getLogger(__name__)

DEFAULT_EMAIL = "snsmtel@gmail.com"
DEFAULT_PASSWORD = "05111012"
DEFAULT_ALIAS = "snsm"
DEFAULT_LISTS = ("ECO", "Walmart", "Home")


def _lists_from_env() -> tuple[str, ...]:
    raw = (os.environ.get("SEED_DEV_USER_LISTS") or "").strip()
    if not raw:
        return DEFAULT_LISTS
    return tuple(name.strip() for name in raw.split(",") if name.strip())


def seed() -> None:
    email = normalize_email(os.environ.get("SEED_DEV_USER_EMAIL") or DEFAULT_EMAIL)
    password = os.environ.get("SEED_DEV_USER_PASSWORD") or DEFAULT_PASSWORD
    alias = validate_alias(os.environ.get("SEED_DEV_USER_ALIAS") or DEFAULT_ALIAS)
    list_names = _lists_from_env()

    session_factory = get_session_factory()
    with session_factory() as session:
        user = session.scalar(select(UserModel).where(UserModel.email == email))
        if user is None:
            user = UserModel(
                id=uuid4(),
                email=email,
                password_hash=Argon2PasswordHasher().hash(password),
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

        existing = {
            row.name
            for row in session.scalars(select(ListModel).where(ListModel.owner_id == user.id))
        }
        for name in list_names:
            if name in existing:
                continue
            owned = ListModel(id=uuid4(), name=name, owner_id=user.id)
            session.add(owned)
            session.add(
                ListMembershipModel(id=uuid4(), list_id=owned.id, user_id=user.id, role="owner")
            )
            logger.info("Seeded list %r for %s", name, email)

        session.commit()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    seed()
