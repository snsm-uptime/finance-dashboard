"""Shared atomic claim for single-use email tokens (reset, verify, future invites).

AD-8 Epic 1.5 addendum: a successful claim MUST NOT succeed solely because a row
matched. The UPDATE must re-check ``expires_at`` (and ``used_at IS NULL``).

Invite tokens (Epic 2) should call ``claim_single_use_email_token`` against their
own table model — do not copy-paste a WHERE that omits ``expires_at``.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import update
from sqlalchemy.orm import Session


def claim_single_use_email_token(
    session: Session,
    model: Any,
    token_id: UUID,
    *,
    used_at: datetime,
    now: datetime | None = None,
) -> bool:
    """Atomically mark an unused, unexpired token as used.

    Returns False if the row is missing, already used, or expired.
    Does not set ``used_at`` on expired rows.
    """
    claim_now = now if now is not None else datetime.now(UTC)
    result = session.execute(
        update(model)
        .where(
            model.id == token_id,
            model.used_at.is_(None),
            model.expires_at > claim_now,
        )
        .values(used_at=used_at)
    )
    return bool(result.rowcount)
