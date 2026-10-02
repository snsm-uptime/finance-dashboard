"""List and summarize imported statements — Story 12.1 (FR-57)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from uuid import UUID

from domain.errors import ImportStatementNotFoundError
from domain.statement_cycles import derive_statement_cycles


@dataclass(frozen=True, slots=True)
class StatementSummary:
    statement_id: UUID
    card_id: UUID | None
    card_label: str | None
    period_start: date
    period_end: date
    item_count: int
    destination_list_ids: tuple[UUID, ...]
    destination_list_names: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class StatementCardGroup:
    card_id: UUID | None
    card_label: str | None
    statements: tuple[StatementSummary, ...]


@dataclass(frozen=True, slots=True)
class ListUserStatementsCommand:
    actor_user_id: UUID


@dataclass(frozen=True, slots=True)
class ListUserStatementsResult:
    groups: tuple[StatementCardGroup, ...]


class ListUserStatementsService:
    """List all statements visible to a user, grouped by card and ordered
    by most-recent statement first within each card group."""

    def __init__(self, repo) -> None:
        self._repo = repo

    def execute(self, command: ListUserStatementsCommand) -> ListUserStatementsResult:
        entries = self._repo.list_ledger_entries_for_user(command.actor_user_id)
        cycles = derive_statement_cycles(entries)

        # Build card_id → card_label mapping with cache
        get_card_label = getattr(self._repo, "get_card_label", None)
        card_label_cache: dict[UUID, str | None] = {}

        def resolve_card_label(card_id: UUID | None) -> str | None:
            if card_id is None or get_card_label is None:
                return None
            if card_id not in card_label_cache:
                card_label_cache[card_id] = get_card_label(card_id)
            return card_label_cache[card_id]

        # Build destination lists mapping: statement_id → set of list_ids
        lists_by_statement: dict[UUID, set[UUID]] = {}
        card_id_by_statement: dict[UUID, UUID | None] = {}

        for entry in entries:
            if entry.statement_id is None:
                continue

            lists_by_statement.setdefault(entry.statement_id, set()).add(entry.list_id)

            # Take first non-null origin_card_id per statement (matches GetListCyclesService pattern)
            if (
                entry.origin_card_id is not None
                and card_id_by_statement.get(entry.statement_id) is None
            ):
                card_id_by_statement[entry.statement_id] = entry.origin_card_id
            else:
                card_id_by_statement.setdefault(entry.statement_id, None)

        # Build list name cache
        get_list = getattr(self._repo, "get_list", None)
        list_name_cache: dict[UUID, str | None] = {}

        def resolve_list_name(list_id: UUID) -> str | None:
            if get_list is None:
                return None
            if list_id not in list_name_cache:
                list_record = get_list(list_id)
                list_name_cache[list_id] = list_record.name if list_record else None
            return list_name_cache[list_id]

        # Build StatementSummary objects, grouped by card_id
        summaries_by_card: dict[UUID | None, list[StatementSummary]] = {}

        for cycle in cycles:
            card_id = card_id_by_statement.get(cycle.statement_id)
            card_label = resolve_card_label(card_id)

            # Resolve destination list names
            dest_list_ids = tuple(sorted(lists_by_statement.get(cycle.statement_id, set())))
            dest_list_names = tuple(
                resolve_list_name(list_id) or "" for list_id in dest_list_ids
            )

            summary = StatementSummary(
                statement_id=cycle.statement_id,
                card_id=card_id,
                card_label=card_label,
                period_start=cycle.period_start,
                period_end=cycle.period_end,
                item_count=cycle.entry_count,
                destination_list_ids=dest_list_ids,
                destination_list_names=dest_list_names,
            )

            summaries_by_card.setdefault(card_id, []).append(summary)

        # Build groups, ordered: cards with statements (alphabetically by label),
        # then None card (manual entries) group last
        groups: list[StatementCardGroup] = []

        for card_id in sorted(
            summaries_by_card.keys(),
            key=lambda cid: (cid is None, resolve_card_label(cid) or "" if cid is not None else ""),
        ):
            if card_id is None:
                # None card group goes last regardless of label
                groups.append(
                    StatementCardGroup(
                        card_id=None,
                        card_label=None,
                        statements=tuple(summaries_by_card[card_id]),
                    )
                )
            else:
                groups.append(
                    StatementCardGroup(
                        card_id=card_id,
                        card_label=resolve_card_label(card_id),
                        statements=tuple(summaries_by_card[card_id]),
                    )
                )

        return ListUserStatementsResult(groups=tuple(groups))


@dataclass(frozen=True, slots=True)
class GetUserStatementSummaryCommand:
    actor_user_id: UUID
    statement_id: UUID


class GetUserStatementSummaryService:
    """Get a single statement's summary — must be visible to the user via
    membership in at least one list containing that statement's entries."""

    def __init__(self, repo) -> None:
        self._repo = repo

    def execute(self, command: GetUserStatementSummaryCommand) -> StatementSummary:
        entries = self._repo.list_ledger_entries_for_user(command.actor_user_id)

        # Filter to just this statement
        filtered_entries = [e for e in entries if e.statement_id == command.statement_id]

        if not filtered_entries:
            raise ImportStatementNotFoundError()

        cycles = derive_statement_cycles(filtered_entries)

        if not cycles:
            raise ImportStatementNotFoundError()

        cycle = cycles[0]

        # Resolve card
        get_card_label = getattr(self._repo, "get_card_label", None)
        card_id: UUID | None = None
        card_label: str | None = None

        for entry in filtered_entries:
            if (
                entry.origin_card_id is not None
                and card_id is None
            ):
                card_id = entry.origin_card_id
                if get_card_label is not None:
                    card_label = get_card_label(card_id)
                break

        # Resolve destination lists
        get_list = getattr(self._repo, "get_list", None)
        dest_list_ids_set: set[UUID] = set()
        for entry in filtered_entries:
            dest_list_ids_set.add(entry.list_id)

        dest_list_ids = tuple(sorted(dest_list_ids_set))
        dest_list_names: list[str | None] = []
        if get_list is not None:
            for list_id in dest_list_ids:
                list_record = get_list(list_id)
                dest_list_names.append(list_record.name if list_record else None)

        return StatementSummary(
            statement_id=cycle.statement_id,
            card_id=card_id,
            card_label=card_label,
            period_start=cycle.period_start,
            period_end=cycle.period_end,
            item_count=cycle.entry_count,
            destination_list_ids=dest_list_ids,
            destination_list_names=tuple(dest_list_names),
        )
