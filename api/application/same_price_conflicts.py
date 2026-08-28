"""Same-price conflict detect/resolve application services (Story 5.5, AD-10)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Protocol
from uuid import UUID

from domain.errors import NotListMemberError, SamePriceConflictNotFoundError
from domain.same_price_conflict import (
    CONFLICT_RESOLUTION_MANUAL_SURVIVOR,
    CONFLICT_RESOLUTION_NOT_SAME_EXPENSE,
    CONFLICT_RESOLUTION_PARSED_SURVIVOR,
    DEFAULT_SAME_PRICE_WINDOW_DAYS,
    is_same_price,
    validate_resolution_confirm,
    within_window,
)

from application.description_aliases import (
    DescriptionAliasRepository,
    NullDescriptionAliasRepository,
    RecordDescriptionAliasService,
)
from application.list_access import (
    AuthorizeListAccessCommand,
    AuthorizeListAccessService,
    ListAccessLookup,
)


@dataclass(frozen=True, slots=True)
class ManualCandidateRecord:
    """A `provenance='hand'` ledger entry returned by the repo's related-list
    + not-already-open-conflict query, still subject to domain filtering."""

    manual_entry_id: UUID
    manual_list_id: UUID
    amount: Decimal
    currency: str
    posted_date: date


@dataclass(frozen=True, slots=True)
class SamePriceConflictEntrySnapshot:
    entry_id: UUID
    list_id: UUID
    list_name: str
    amount: Decimal
    currency: str
    normalized_description: str
    posted_date: date


@dataclass(frozen=True, slots=True)
class SamePriceConflictRecord:
    id: UUID
    manual: SamePriceConflictEntrySnapshot
    parsed: SamePriceConflictEntrySnapshot
    detected_at: datetime
    resolved_at: datetime | None
    resolution: str | None


class SamePriceConflictRepository(Protocol):
    def find_related_manual_candidates(
        self,
        *,
        actor_user_id: UUID,
        parsed_entry_id: UUID,
        parsed_list_id: UUID,
        amount: Decimal,
        currency: str,
        low_date: date,
        high_date: date,
    ) -> list[ManualCandidateRecord]:
        """Unresolved `hand`-provenance ledger entries on lists related to
        `parsed_list_id` (AD-19: scoped through the actor's own memberships),
        matching amount/currency/date-window, excluding manual entries that
        already have an unresolved conflict open."""
        ...

    def create_conflict(
        self,
        *,
        conflict_id: UUID,
        manual_entry_id: UUID,
        parsed_entry_id: UUID,
        manual_list_id: UUID,
        parsed_list_id: UUID,
    ) -> None:
        """No-op (not an error) if the pair already exists — UNIQUE guard."""
        ...

    def list_unresolved_conflicts(self, actor_user_id: UUID) -> list[SamePriceConflictRecord]: ...

    def get_conflict(self, conflict_id: UUID) -> SamePriceConflictRecord | None: ...

    def resolve_conflict(
        self, *, conflict_id: UUID, resolution: str, resolved_by_user_id: UUID
    ) -> None:
        """Raises SamePriceConflictNotFoundError / SamePriceConflictAlreadyResolvedError."""
        ...

    def get_list_window_days(self, list_id: UUID) -> int | None: ...


class NullSamePriceConflictRepository:
    """No-op collaborator for callers that inject no repo — every prior Bulk
    /row-assign test predates this story and does not exercise detection."""

    def find_related_manual_candidates(self, **_kwargs) -> list[ManualCandidateRecord]:
        return []

    def create_conflict(self, **_kwargs) -> None:
        return None

    def list_unresolved_conflicts(self, actor_user_id: UUID) -> list[SamePriceConflictRecord]:
        return []

    def get_conflict(self, conflict_id: UUID) -> SamePriceConflictRecord | None:
        return None

    def resolve_conflict(self, **_kwargs) -> None:
        return None

    def get_list_window_days(self, list_id: UUID) -> int | None:
        return None


@dataclass(frozen=True, slots=True)
class DetectSamePriceConflictsCommand:
    actor_user_id: UUID
    parsed_entry_id: UUID
    parsed_list_id: UUID
    amount: Decimal
    currency: str
    posted_date: date


class DetectSamePriceConflictsService:
    """Runs once per newly-committed parsed ledger entry (Task 4 hook points).
    A parsed row can match more than one manual row (AC #3) — journals one
    conflict per match."""

    def __init__(self, repo: SamePriceConflictRepository) -> None:
        self._repo = repo

    def execute(self, command: DetectSamePriceConflictsCommand) -> None:
        from uuid import uuid4

        configured_window_days = self._repo.get_list_window_days(command.parsed_list_id)
        window_days = (
            configured_window_days
            if configured_window_days is not None
            else DEFAULT_SAME_PRICE_WINDOW_DAYS
        )
        low_date = command.posted_date - timedelta(days=window_days)
        high_date = command.posted_date + timedelta(days=window_days)

        candidates = self._repo.find_related_manual_candidates(
            actor_user_id=command.actor_user_id,
            parsed_entry_id=command.parsed_entry_id,
            parsed_list_id=command.parsed_list_id,
            amount=command.amount,
            currency=command.currency,
            low_date=low_date,
            high_date=high_date,
        )

        for candidate in candidates:
            if not is_same_price(
                command.amount, command.currency, candidate.amount, candidate.currency
            ):
                continue
            if not within_window(command.posted_date, candidate.posted_date, window_days):
                continue
            self._repo.create_conflict(
                conflict_id=uuid4(),
                manual_entry_id=candidate.manual_entry_id,
                parsed_entry_id=command.parsed_entry_id,
                manual_list_id=candidate.manual_list_id,
                parsed_list_id=command.parsed_list_id,
            )


@dataclass(frozen=True, slots=True)
class ResolveSamePriceConflictCommand:
    actor_user_id: UUID
    conflict_id: UUID
    resolution: str
    confirmed: bool = False


class ResolveSamePriceConflictService:
    def __init__(
        self,
        repo: SamePriceConflictRepository,
        list_lookup: ListAccessLookup,
        alias_repo: DescriptionAliasRepository | None = None,
    ) -> None:
        self._repo = repo
        self._list_lookup = list_lookup
        self._alias_repo = alias_repo or NullDescriptionAliasRepository()

    def execute(self, command: ResolveSamePriceConflictCommand) -> None:
        conflict = self._repo.get_conflict(command.conflict_id)
        if conflict is None:
            raise SamePriceConflictNotFoundError()

        validate_resolution_confirm(command.resolution, confirmed=command.confirmed)

        # A conflict the actor has no membership on either side of must read
        # as not-found, not forbidden — a 403 here would let an unauthorized
        # caller confirm a given conflict_id exists (SamePriceConflictNotFoundError's
        # own docstring documents ACL-hidden conflicts as its intended use).
        authorizer = AuthorizeListAccessService(self._list_lookup)
        try:
            for list_id in (conflict.manual.list_id, conflict.parsed.list_id):
                authorizer.execute(
                    AuthorizeListAccessCommand(
                        acting_user_id=command.actor_user_id,
                        list_id=list_id,
                        action="write_ledger",
                    )
                )
        except NotListMemberError as exc:
            raise SamePriceConflictNotFoundError() from exc

        self._repo.resolve_conflict(
            conflict_id=command.conflict_id,
            resolution=command.resolution,
            resolved_by_user_id=command.actor_user_id,
        )

        if command.resolution in (
            CONFLICT_RESOLUTION_MANUAL_SURVIVOR,
            CONFLICT_RESOLUTION_PARSED_SURVIVOR,
        ):
            # source_conflict_id is None, not conflict.id: resolve_conflict's
            # hard-delete of the losing entry cascades (ON DELETE CASCADE on
            # same_price_conflicts.manual_entry_id/parsed_entry_id) and removes
            # this very conflict row from the DB before this line runs — an FK
            # pointing at conflict.id would violate referential integrity.
            # The column is nullable exactly for this "source already purged"
            # case (see description_aliases schema note).
            RecordDescriptionAliasService(self._alias_repo).execute(
                list_id=conflict.parsed.list_id,
                manual_label=conflict.manual.normalized_description,
                bank_description=conflict.parsed.normalized_description,
                source_conflict_id=None,
            )


class ListSamePriceConflictQueueService:
    """The acting user's full unresolved queue (AC #4) — reads the durable
    `same_price_conflicts` table directly, not any ephemeral Import Session
    state, so it survives session discard/expiry."""

    def __init__(self, repo: SamePriceConflictRepository) -> None:
        self._repo = repo

    def execute(self, actor_user_id: UUID) -> list[SamePriceConflictRecord]:
        return self._repo.list_unresolved_conflicts(actor_user_id)


__all__ = [
    "CONFLICT_RESOLUTION_MANUAL_SURVIVOR",
    "CONFLICT_RESOLUTION_NOT_SAME_EXPENSE",
    "CONFLICT_RESOLUTION_PARSED_SURVIVOR",
    "DetectSamePriceConflictsCommand",
    "DetectSamePriceConflictsService",
    "ListSamePriceConflictQueueService",
    "ManualCandidateRecord",
    "NullSamePriceConflictRepository",
    "ResolveSamePriceConflictCommand",
    "ResolveSamePriceConflictService",
    "SamePriceConflictEntrySnapshot",
    "SamePriceConflictRecord",
    "SamePriceConflictRepository",
]
