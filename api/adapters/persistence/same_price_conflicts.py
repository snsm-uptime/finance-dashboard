"""SqlAlchemySamePriceConflictRepository (Story 5.5, AD-10)."""

from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import and_, exists, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, aliased

from application.same_price_conflicts import (
    CONFLICT_RESOLUTION_MANUAL_SURVIVOR,
    CONFLICT_RESOLUTION_PARSED_SURVIVOR,
    ManualCandidateRecord,
    SamePriceConflictEntrySnapshot,
    SamePriceConflictRecord,
)
from domain.errors import SamePriceConflictAlreadyResolvedError, SamePriceConflictNotFoundError

from adapters.persistence.models import (
    ImportBatchModel,
    LedgerEntryModel,
    ListMembershipModel,
    ListModel,
    SamePriceConflictModel,
)

PROVENANCE_HAND = "hand"


class SqlAlchemySamePriceConflictRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get_list_window_days(self, list_id: UUID) -> int | None:
        row = self._session.get(ListModel, list_id)
        if row is None:
            return None
        return row.same_price_window_days

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
        actor_list_ids = set(
            self._session.scalars(
                select(ListMembershipModel.list_id).where(
                    ListMembershipModel.user_id == actor_user_id
                )
            ).all()
        )
        if parsed_list_id not in actor_list_ids:
            return []

        parsed_list_member_ids = set(
            self._session.scalars(
                select(ListMembershipModel.user_id).where(
                    ListMembershipModel.list_id == parsed_list_id
                )
            ).all()
        )
        if not parsed_list_member_ids:
            return []

        related_list_ids = set(
            self._session.scalars(
                select(ListMembershipModel.list_id)
                .where(
                    ListMembershipModel.list_id.in_(actor_list_ids),
                    ListMembershipModel.user_id.in_(parsed_list_member_ids),
                )
                .distinct()
            ).all()
        )
        if not related_list_ids:
            return []

        # Scoped to this exact (manual, parsed) pair — not "this manual has any
        # open conflict" — so one manual entry can still match a second,
        # different parsed entry (AC #3 multi-match). The UNIQUE constraint on
        # create_conflict already no-ops a true re-insert; this just skips the
        # redundant query/insert attempt on a repeated scan of the same pair.
        already_open = (
            select(SamePriceConflictModel.manual_entry_id)
            .where(
                SamePriceConflictModel.manual_entry_id == LedgerEntryModel.id,
                SamePriceConflictModel.parsed_entry_id == parsed_entry_id,
                SamePriceConflictModel.resolved_at.is_(None),
            )
            .correlate(LedgerEntryModel)
        )

        stmt = select(LedgerEntryModel).where(
            LedgerEntryModel.provenance == PROVENANCE_HAND,
            LedgerEntryModel.amount == amount,
            LedgerEntryModel.currency == currency,
            LedgerEntryModel.posted_date.between(low_date, high_date),
            LedgerEntryModel.list_id.in_(related_list_ids),
            ~exists(already_open),
        )
        rows = self._session.scalars(stmt).all()
        return [
            ManualCandidateRecord(
                manual_entry_id=row.id,
                manual_list_id=row.list_id,
                amount=Decimal(str(row.amount)),
                currency=row.currency,
                posted_date=row.posted_date,
            )
            for row in rows
            if row.posted_date is not None
        ]

    def create_conflict(
        self,
        *,
        conflict_id: UUID,
        manual_entry_id: UUID,
        parsed_entry_id: UUID,
        manual_list_id: UUID,
        parsed_list_id: UUID,
    ) -> None:
        try:
            with self._session.begin_nested():
                self._session.add(
                    SamePriceConflictModel(
                        id=conflict_id,
                        manual_entry_id=manual_entry_id,
                        parsed_entry_id=parsed_entry_id,
                        manual_list_id=manual_list_id,
                        parsed_list_id=parsed_list_id,
                    )
                )
                self._session.flush()
        except IntegrityError as exc:
            # UNIQUE (manual_entry_id, parsed_entry_id) — a re-scan of the same
            # pair in the same session is a no-op, not an error. Any other
            # integrity violation (e.g. a stale FK) is a real failure and
            # must not be swallowed alongside the expected dedup case.
            constraint = getattr(getattr(exc.orig, "diag", None), "constraint_name", None)
            if constraint is not None and constraint != "uq_same_price_conflict_pair":
                raise


    def _to_record(
        self,
        conflict: SamePriceConflictModel,
        manual_entry: LedgerEntryModel,
        parsed_entry: LedgerEntryModel,
        manual_list: ListModel,
        parsed_list: ListModel,
    ) -> SamePriceConflictRecord:
        return SamePriceConflictRecord(
            id=conflict.id,
            manual=SamePriceConflictEntrySnapshot(
                entry_id=manual_entry.id,
                list_id=manual_list.id,
                list_name=manual_list.name,
                amount=Decimal(str(manual_entry.amount)),
                currency=manual_entry.currency,
                normalized_description=manual_entry.normalized_description or "",
                posted_date=manual_entry.posted_date,
            ),
            parsed=SamePriceConflictEntrySnapshot(
                entry_id=parsed_entry.id,
                list_id=parsed_list.id,
                list_name=parsed_list.name,
                amount=Decimal(str(parsed_entry.amount)),
                currency=parsed_entry.currency,
                normalized_description=parsed_entry.normalized_description or "",
                posted_date=parsed_entry.posted_date,
            ),
            detected_at=conflict.detected_at,
            resolved_at=conflict.resolved_at,
            resolution=conflict.resolution,
        )

    def _enriched_query(self):
        manual_entry = aliased(LedgerEntryModel)
        parsed_entry = aliased(LedgerEntryModel)
        manual_list = aliased(ListModel)
        parsed_list = aliased(ListModel)
        stmt = (
            select(SamePriceConflictModel, manual_entry, parsed_entry, manual_list, parsed_list)
            .join(manual_entry, manual_entry.id == SamePriceConflictModel.manual_entry_id)
            .join(parsed_entry, parsed_entry.id == SamePriceConflictModel.parsed_entry_id)
            .join(manual_list, manual_list.id == SamePriceConflictModel.manual_list_id)
            .join(parsed_list, parsed_list.id == SamePriceConflictModel.parsed_list_id)
        )
        return stmt, manual_entry, parsed_entry, manual_list, parsed_list

    def list_unresolved_conflicts(self, actor_user_id: UUID) -> list[SamePriceConflictRecord]:
        stmt, manual_entry, parsed_entry, manual_list, parsed_list = self._enriched_query()
        stmt = stmt.where(
            SamePriceConflictModel.resolved_at.is_(None),
            exists(
                select(ListMembershipModel.id).where(
                    ListMembershipModel.list_id == SamePriceConflictModel.manual_list_id,
                    ListMembershipModel.user_id == actor_user_id,
                )
            ),
            exists(
                select(ListMembershipModel.id).where(
                    ListMembershipModel.list_id == SamePriceConflictModel.parsed_list_id,
                    ListMembershipModel.user_id == actor_user_id,
                )
            ),
        ).order_by(SamePriceConflictModel.detected_at.asc())
        rows = self._session.execute(stmt).all()
        return [self._to_record(*row) for row in rows]

    def get_conflict(self, conflict_id: UUID) -> SamePriceConflictRecord | None:
        stmt, *_ = self._enriched_query()
        stmt = stmt.where(SamePriceConflictModel.id == conflict_id)
        row = self._session.execute(stmt).first()
        if row is None:
            return None
        return self._to_record(*row)

    def resolve_conflict(
        self, *, conflict_id: UUID, resolution: str, resolved_by_user_id: UUID
    ) -> None:
        conflict = self._session.get(SamePriceConflictModel, conflict_id)
        if conflict is None:
            raise SamePriceConflictNotFoundError()
        if conflict.resolved_at is not None:
            raise SamePriceConflictAlreadyResolvedError()

        with self._session.begin_nested():
            # Stamp resolution before the delete: manual_entry_id/parsed_entry_id
            # are ON DELETE CASCADE onto this table, so deleting the losing
            # entry below removes this row too — the UPDATE must land while it
            # still exists, or SQLAlchemy raises StaleDataError on 0 rows matched.
            conflict.resolved_at = datetime.now(UTC)
            conflict.resolution = resolution
            conflict.resolved_by_user_id = resolved_by_user_id
            self._session.flush()

            if resolution == CONFLICT_RESOLUTION_MANUAL_SURVIVOR:
                self._hard_delete_parsed_entry(conflict.parsed_entry_id)
            elif resolution == CONFLICT_RESOLUTION_PARSED_SURVIVOR:
                self._hard_delete_manual_entry(conflict.manual_entry_id)

    def _hard_delete_parsed_entry(self, entry_id: UUID) -> None:
        """Mirrors `_hard_delete_ledger_for_row` (import_sessions.py:768):
        delete the entry, then delete its batch if it was the only row left."""
        entry = self._session.get(LedgerEntryModel, entry_id)
        if entry is None:
            return
        batch_id = entry.import_batch_id
        self._session.delete(entry)
        self._session.flush()

        if batch_id is None:
            return
        remaining = self._session.scalar(
            select(LedgerEntryModel.id).where(LedgerEntryModel.import_batch_id == batch_id).limit(1)
        )
        if remaining is None:
            batch_row = self._session.get(ImportBatchModel, batch_id)
            if batch_row is not None:
                self._session.delete(batch_row)
                self._session.flush()

    def _hard_delete_manual_entry(self, entry_id: UUID) -> None:
        """First delete path for a hand-provenance ledger entry — no batch to
        clean up, manual entries never carry an import_batch_id."""
        entry = self._session.get(LedgerEntryModel, entry_id)
        if entry is None:
            return
        self._session.delete(entry)
        self._session.flush()
