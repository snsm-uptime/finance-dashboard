"""Create owned lists, rename, membership listing, ACL reads, default split — 2.1 / 2.2 / 2.5."""

from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Protocol
from uuid import UUID, uuid4

from domain.default_split import (
    MODE_EVEN,
    MODE_PERCENTAGE,
    resolve_effective_default,
    validate_percentage_shares,
)
from domain.errors import (
    InvalidDefaultSplitError,
    NotListMemberError,
    NotListOwnerError,
)
from domain.lists import validate_list_name
from domain.settle import (
    compute_pairwise_settle_balances,
    compute_settle_balance_for_list_members,
    net_pairwise_edges,
    simplify_group_transfers,
)
from domain.spend_by_origin import compute_spend_by_origin
from domain.splits import SplitSpec, compute_share_allocations
from domain.statement_cycles import (
    PeriodWindow,
    current_calendar_month_window,
    derive_statement_cycles,
    filter_entries_by_statement,
    full_history_window,
    resolve_period_bounds,
)

from application.list_access import (
    AuthorizeListAccessCommand,
    AuthorizeListAccessService,
)
from application.ports import (
    ListAccessGrant,
    NewListRecord,
    NewMembershipRecord,
    PreferencesRepository,
)
from application.same_price_conflicts import (
    NullSamePriceConflictRepository,
    SamePriceConflictRepository,
    conflicts_overlapping_period,
    conflicts_touching_list,
)

PLACEHOLDER_BALANCE_CRC = "0"


@dataclass(frozen=True, slots=True)
class ListRecord:
    id: UUID
    name: str
    owner_id: UUID


@dataclass(frozen=True, slots=True)
class MembershipRecord:
    list_id: UUID
    user_id: UUID
    role: str


@dataclass(frozen=True, slots=True)
class ListMemberLabel:
    """Roster label on membership summaries — alias only, never email."""

    user_id: UUID
    alias: str | None = None
    photo_base64: str | None = None


@dataclass(frozen=True, slots=True)
class ListMembershipSummary:
    id: UUID
    name: str
    owner_id: UUID
    role: str
    balance_crc: str = PLACEHOLDER_BALANCE_CRC
    members: tuple[ListMemberLabel, ...] = ()
    total_crc: str = PLACEHOLDER_BALANCE_CRC


@dataclass(frozen=True, slots=True)
class DefaultSplitShareView:
    user_id: UUID
    percentage: Decimal


@dataclass(frozen=True, slots=True)
class DefaultSplitView:
    list_id: UUID
    owner_id: UUID
    mode: str
    shares: tuple[DefaultSplitShareView, ...]
    member_ids: tuple[UUID, ...]


@dataclass(frozen=True, slots=True)
class StoredDefaultSplit:
    mode: str
    shares: dict[UUID, Decimal]


class ListRepository(Protocol):
    def create_owned_list(
        self,
        *,
        owned_list: NewListRecord,
        membership: NewMembershipRecord,
    ) -> None: ...

    def get_list(self, list_id: UUID) -> ListRecord | None: ...

    def get_membership(self, list_id: UUID, user_id: UUID) -> MembershipRecord | None: ...

    def update_list_name(self, list_id: UUID, name: str) -> ListRecord: ...

    def delete_list(self, list_id: UUID) -> None: ...

    def list_for_user(self, user_id: UUID) -> list[ListMembershipSummary]: ...

    def get_list_with_grant(self, grant: ListAccessGrant, list_id: UUID) -> ListRecord: ...

    def list_member_ids(self, list_id: UUID) -> list[UUID]: ...

    def get_stored_default_split(self, list_id: UUID) -> StoredDefaultSplit | None: ...

    def set_default_split(
        self,
        list_id: UUID,
        *,
        mode: str,
        shares: dict[UUID, Decimal] | None,
    ) -> None: ...

    def clear_invalid_percentage_default(self, list_id: UUID) -> None: ...

    def upsert_settle_assertion(
        self, list_id: UUID, actor_user_id: UUID, settled_at: datetime
    ) -> None: ...

    def get_settled_at(self, list_id: UUID, actor_user_id: UUID) -> datetime | None: ...


@dataclass(frozen=True, slots=True)
class CreateOwnedListCommand:
    actor_user_id: UUID
    name: str


@dataclass(frozen=True, slots=True)
class RenameListCommand:
    actor_user_id: UUID
    list_id: UUID
    name: str


@dataclass(frozen=True, slots=True)
class DeleteListCommand:
    actor_user_id: UUID
    list_id: UUID


@dataclass(frozen=True, slots=True)
class ListMembershipsCommand:
    actor_user_id: UUID


@dataclass(frozen=True, slots=True)
class GetListDetailCommand:
    actor_user_id: UUID
    list_id: UUID


@dataclass(frozen=True, slots=True)
class GetListExpensesStubCommand:
    actor_user_id: UUID
    list_id: UUID


@dataclass(frozen=True, slots=True)
class GetListBalancesStubCommand:
    actor_user_id: UUID
    list_id: UUID
    period_start: date | None = None
    period_end: date | None = None
    statement_id: UUID | None = None


@dataclass(frozen=True, slots=True)
class SetLastOpenedListCommand:
    actor_user_id: UUID
    list_id: UUID


@dataclass(frozen=True, slots=True)
class SetDefaultImportListCommand:
    actor_user_id: UUID
    list_id: UUID


@dataclass(frozen=True, slots=True)
class GetListDefaultSplitCommand:
    actor_user_id: UUID
    list_id: UUID


@dataclass(frozen=True, slots=True)
class SetListDefaultSplitCommand:
    actor_user_id: UUID
    list_id: UUID
    mode: str
    shares: dict[UUID, Decimal] | None = None


@dataclass(frozen=True, slots=True)
class PairwiseEdge:
    """One member's net vs the viewer, from the viewer's perspective."""

    member_id: UUID
    alias: str | None
    amount_crc: str
    photo_base64: str | None = None


@dataclass(frozen=True, slots=True)
class ListBalancesStub:
    list_id: UUID
    balance_crc: str
    is_incomplete: bool = False
    you_are_owed: tuple[PairwiseEdge, ...] = ()
    you_owe: tuple[PairwiseEdge, ...] = ()
    period_start: date | None = None
    period_end: date | None = None


@dataclass(frozen=True, slots=True)
class ListPairwiseBalances:
    """Standalone pairwise-balances view — same shape as `ListBalancesStub`.

    Kept as a distinct name per the domain vocabulary; `GetListBalancesStubService`
    returns `ListBalancesStub` (its established result type) rather than this
    class, since both carry identical fields.
    """

    list_id: UUID
    you_are_owed: tuple[PairwiseEdge, ...]
    you_owe: tuple[PairwiseEdge, ...]
    balance_crc: str
    is_incomplete: bool = False


@dataclass(frozen=True, slots=True)
class SuggestedTransferView:
    """Simplify-plan transfer with resolved aliases, ready for API/UI wire-up."""

    from_member_id: UUID
    from_alias: str | None
    to_member_id: UUID
    to_alias: str | None
    amount_crc: str
    from_photo_base64: str | None = None
    to_photo_base64: str | None = None


@dataclass(frozen=True, slots=True)
class SimplifyGroupPlan:
    list_id: UUID
    transfers: tuple[SuggestedTransferView, ...]
    is_incomplete: bool


@dataclass(frozen=True, slots=True)
class SimplifyGroupPlanCommand:
    actor_user_id: UUID
    list_id: UUID


@dataclass(frozen=True, slots=True)
class SettlePayablesCommand:
    actor_user_id: UUID
    list_id: UUID


@dataclass(frozen=True, slots=True)
class ListExpensesStub:
    list_id: UUID
    expenses: tuple[object, ...]


class CreateOwnedListService:
    """Create an additional named list owned by the authenticated user.

    Same List entity as personal lists. Seeds even default split implicitly:
    creator is sole owner-member (1-member ⇒ 100% to creator / FR-9 seed).
    owner_id is durable list creator for AD-6 remainder later.
    """

    def __init__(self, repo: ListRepository) -> None:
        self._repo = repo

    def execute(self, command: CreateOwnedListCommand) -> ListRecord:
        name = validate_list_name(command.name)
        list_id = uuid4()
        membership_id = uuid4()
        owned = NewListRecord(
            id=list_id,
            name=name,
            owner_id=command.actor_user_id,
        )
        membership = NewMembershipRecord(
            id=membership_id,
            list_id=list_id,
            user_id=command.actor_user_id,
            role="owner",
        )
        self._repo.create_owned_list(owned_list=owned, membership=membership)
        return ListRecord(id=list_id, name=name, owner_id=command.actor_user_id)


class RenameListService:
    """Rename a list — owner-only (FR-6); non-members and non-owner members rejected.

    As-built 2.1: ad-hoc ACL (not shared port). Grandfathered HTTP 403 —
    do not silently migrate deny paths in this story.
    """

    def __init__(self, repo: ListRepository) -> None:
        self._repo = repo

    def execute(self, command: RenameListCommand) -> ListRecord:
        name = validate_list_name(command.name)
        existing = self._repo.get_list(command.list_id)
        membership = self._repo.get_membership(command.list_id, command.actor_user_id)
        # Missing list and non-membership share the same rejection so rename
        # cannot be used as a list-existence oracle (NFR-3 / story ACL note).
        if existing is None or membership is None:
            raise NotListMemberError()

        if existing.owner_id != command.actor_user_id:
            raise NotListOwnerError()

        return self._repo.update_list_name(command.list_id, name)


class DeleteListService:
    """Delete a list — owner-only; non-members and non-owner members rejected."""

    def __init__(self, repo: ListRepository) -> None:
        self._repo = repo

    def execute(self, command: DeleteListCommand) -> None:
        existing = self._repo.get_list(command.list_id)
        membership = self._repo.get_membership(command.list_id, command.actor_user_id)
        if existing is None or membership is None:
            raise NotListMemberError()

        if existing.owner_id != command.actor_user_id:
            raise NotListOwnerError()

        self._repo.delete_list(command.list_id)


def _filter_entries_by_period(
    entries: list,
    *,
    period_start: date | None,
    period_end: date | None,
):
    """Boundary-inclusive posted_date filter — no-op unless both bounds are set
    (callers only ever pass both or neither; see `_invalid_period` at the route
    layer for the both-or-neither validation)."""
    if period_start is None or period_end is None:
        return entries
    return [entry for entry in entries if period_start <= entry.posted_date <= period_end]


def resolve_effective_period(
    repo: object,
    *,
    list_id: UUID,
    period_start: date | None,
    period_end: date | None,
    entries: list | None = None,
) -> tuple[date, date]:
    """Explicit `[period_start, period_end]` when both given, else the
    derived default (most-recent statement cycle, or current calendar month
    in America/Costa_Rica — AC #1/#4). Pass `entries` when the caller has
    already fetched the list's ledger, to avoid a second fetch."""
    if entries is None:
        list_ledger = getattr(repo, "list_ledger_entries", None)
        entries = list_ledger(list_id) if list_ledger is not None else []
    window = resolve_period_bounds(entries, period_start=period_start, period_end=period_end)
    return window.period_start, window.period_end


def compute_viewer_balance_crc(
    repo: object,
    *,
    list_id: UUID,
    actor_user_id: UUID,
    owner_id: UUID,
    period_start: date | None = None,
    period_end: date | None = None,
    entries: list | None = None,
) -> str:
    """Viewer settle balance for a membership row — same math as the list-detail strip.

    Pass `entries` when the caller has already fetched the list's ledger, to
    avoid a second fetch."""
    list_members = getattr(repo, "list_members_with_alias", None)
    if list_members is None:
        return PLACEHOLDER_BALANCE_CRC
    if entries is None:
        list_ledger = getattr(repo, "list_ledger_entries", None)
        if list_ledger is None:
            return PLACEHOLDER_BALANCE_CRC
        entries = list_ledger(list_id)

    ledger_entries = _filter_entries_by_period(
        entries, period_start=period_start, period_end=period_end
    )
    members = list_members(list_id)
    stored_default_split = repo.get_stored_default_split(list_id)  # type: ignore[attr-defined]
    default_mode = stored_default_split.mode if stored_default_split else MODE_EVEN
    default_shares = stored_default_split.shares if stored_default_split else None

    get_split_override_fn = _split_override_fn_for(repo, list_id)

    def get_list_default_split_fn(_list_id):
        return default_shares

    balances = compute_settle_balance_for_list_members(
        ledger_entries,
        members,
        owner_id,
        compute_share_allocations,
        get_split_override_fn,
        get_list_default_split_fn,
        default_mode=default_mode,
    )
    return str(balances.get(actor_user_id, Decimal("0")))


def _split_override_fn_for(repo: object, list_id: UUID):
    def to_spec(stored):
        if stored is None:
            return None
        return SplitSpec(
            kind=stored.kind,
            assignee_id=stored.assignee_id,
            amounts=stored.amounts,
            percentages=stored.percentages,
        )

    def get_split_override_fn(entry_id, receipt_id):
        from domain.splits import KIND_ABSOLUTE_AMOUNTS, SUBJECT_ITEM, SUBJECT_RECEIPT

        item_override = to_spec(
            repo.get_split_override(list_id, SUBJECT_ITEM, entry_id)  # type: ignore[attr-defined]
        )

        receipt_override = None
        if receipt_id is not None:
            candidate = to_spec(
                repo.get_split_override(list_id, SUBJECT_RECEIPT, receipt_id)  # type: ignore[attr-defined]
            )
            # Absolute receipt totals cannot apply to child line amounts
            # (decision A — fall through toward list_default for items).
            if candidate is not None and candidate.kind != KIND_ABSOLUTE_AMOUNTS:
                receipt_override = candidate

        return item_override, receipt_override

    return get_split_override_fn


def compute_viewer_pairwise_edges(
    repo: object,
    *,
    list_id: UUID,
    actor_user_id: UUID,
    owner_id: UUID,
    settled_at: datetime | None = None,
    period_start: date | None = None,
    period_end: date | None = None,
    entries: list | None = None,
) -> tuple[tuple[PairwiseEdge, ...], tuple[PairwiseEdge, ...]]:
    """Viewer-perspective pairwise edges: (you_are_owed, you_owe).

    `you_are_owed` always reflects the full ledger for the selected period
    (unfiltered by `settled_at`). `you_owe` is additionally filtered to
    entries created after `settled_at` when provided — a settle assertion
    clears the payable side for the viewer, but never the true net (AD-21).

    Pass `entries` when the caller has already fetched the list's ledger, to
    avoid a second fetch.
    """
    list_members = getattr(repo, "list_members_with_alias", None)
    if list_members is None:
        return (), ()
    if entries is None:
        list_ledger = getattr(repo, "list_ledger_entries", None)
        if list_ledger is None:
            return (), ()
        entries = list(list_ledger(list_id))

    all_entries = _filter_entries_by_period(
        entries, period_start=period_start, period_end=period_end
    )
    members = list_members(list_id)
    alias_by_id = {m.user_id: m.alias for m in members}
    photo_by_id = {m.user_id: m.photo_base64 for m in members}
    stored_default_split = repo.get_stored_default_split(list_id)  # type: ignore[attr-defined]
    default_mode = stored_default_split.mode if stored_default_split else MODE_EVEN
    default_shares = stored_default_split.shares if stored_default_split else None
    get_split_override_fn = _split_override_fn_for(repo, list_id)

    def get_list_default_split_fn(_list_id):
        return default_shares

    def net_for(entries) -> dict[tuple[UUID, UUID], Decimal]:
        edges = compute_pairwise_settle_balances(
            entries,
            members,
            owner_id,
            compute_share_allocations,
            get_split_override_fn,
            get_list_default_split_fn,
            default_mode=default_mode,
        )
        return net_pairwise_edges(edges)

    def edge(other: UUID, amount: Decimal) -> PairwiseEdge:
        return PairwiseEdge(
            member_id=other,
            alias=alias_by_id.get(other),
            photo_base64=photo_by_id.get(other),
            amount_crc=str(amount),
        )

    def viewer_split(
        net: dict[tuple[UUID, UUID], Decimal],
    ) -> tuple[tuple[PairwiseEdge, ...], tuple[PairwiseEdge, ...]]:
        owed_to_viewer: list[PairwiseEdge] = []
        viewer_owes: list[PairwiseEdge] = []
        for (x, y), value in net.items():
            if x == actor_user_id:
                other = y
                # net[(x,y)] > 0 means y owes x (viewer) — viewer is owed.
                if value > 0:
                    owed_to_viewer.append(edge(other, value))
                elif value < 0:
                    viewer_owes.append(edge(other, -value))
            elif y == actor_user_id:
                other = x
                # net[(x,y)] > 0 means y (viewer) owes x.
                if value > 0:
                    viewer_owes.append(edge(other, value))
                elif value < 0:
                    owed_to_viewer.append(edge(other, -value))
        return tuple(owed_to_viewer), tuple(viewer_owes)

    net_full = net_for(all_entries)
    you_are_owed, you_owe_unfiltered = viewer_split(net_full)

    if settled_at is None:
        return you_are_owed, you_owe_unfiltered

    filtered_entries = [e for e in all_entries if e.created_at > settled_at]
    net_filtered = net_for(filtered_entries)
    _, you_owe = viewer_split(net_filtered)
    return you_are_owed, you_owe


class ListMembershipsService:
    """Membership-scoped list summaries for the authenticated user.

    Actor-scoped enumeration — does not call authorize_list_access.
    """

    def __init__(self, repo: ListRepository) -> None:
        self._repo = repo

    def execute(self, command: ListMembershipsCommand) -> list[ListMembershipSummary]:
        items = self._repo.list_for_user(command.actor_user_id)
        return [
            replace(
                item,
                balance_crc=compute_viewer_balance_crc(
                    self._repo,
                    list_id=item.id,
                    actor_user_id=command.actor_user_id,
                    owner_id=item.owner_id,
                ),
                # Running total of all entries on the list, shown on every
                # card alongside the viewer's net balance (Story 5.9).
                total_crc=self._total_crc(item.id),
            )
            for item in items
        ]

    def _total_crc(self, list_id: UUID) -> str:
        list_ledger = getattr(self._repo, "list_ledger_entries", None)
        if list_ledger is None:
            return PLACEHOLDER_BALANCE_CRC
        entries = list_ledger(list_id)
        total = sum((entry.amount_crc for entry in entries), Decimal("0"))
        return str(total)


class GetListDetailService:
    """List detail shell for members — authorize_list_access(read_list)."""

    def __init__(self, repo: ListRepository) -> None:
        self._repo = repo

    def execute(self, command: GetListDetailCommand) -> ListRecord:
        grant = AuthorizeListAccessService(self._repo).execute(
            AuthorizeListAccessCommand(
                acting_user_id=command.actor_user_id,
                list_id=command.list_id,
                action="read_list",
            )
        )
        return self._repo.get_list_with_grant(grant, command.list_id)


class GetListExpensesStubService:
    """Expenses collection — authorize_list_access(read_expenses); newest-first."""

    def __init__(self, repo: ListRepository) -> None:
        self._repo = repo

    def execute(self, command: GetListExpensesStubCommand) -> ListExpensesStub:
        grant = AuthorizeListAccessService(self._repo).execute(
            AuthorizeListAccessCommand(
                acting_user_id=command.actor_user_id,
                list_id=command.list_id,
                action="read_expenses",
            )
        )
        self._repo.get_list_with_grant(grant, command.list_id)
        rows = self._repo.list_ledger_entries(command.list_id)  # type: ignore[attr-defined]
        return ListExpensesStub(list_id=command.list_id, expenses=tuple(rows))


class GetListBalancesStubService:
    """Settle-up balances from per-transaction shares — authorize_list_access(read_balances)."""

    def __init__(
        self,
        repo: ListRepository,
        conflict_repo: SamePriceConflictRepository | None = None,
    ) -> None:
        self._repo = repo
        self._conflict_repo = conflict_repo or NullSamePriceConflictRepository()

    def execute(self, command: GetListBalancesStubCommand) -> ListBalancesStub:
        grant = AuthorizeListAccessService(self._repo).execute(
            AuthorizeListAccessCommand(
                acting_user_id=command.actor_user_id,
                list_id=command.list_id,
                action="read_balances",
            )
        )
        lst = self._repo.get_list_with_grant(grant, command.list_id)
        list_ledger = getattr(self._repo, "list_ledger_entries", None)
        entries = list(list_ledger(command.list_id)) if list_ledger is not None else []

        if command.statement_id is not None:
            entries = filter_entries_by_statement(entries, statement_id=command.statement_id)
            window = full_history_window(entries)
            period_start, period_end = window.period_start, window.period_end
            filter_period_start, filter_period_end = None, None
        else:
            period_start, period_end = resolve_effective_period(
                self._repo,
                list_id=command.list_id,
                period_start=command.period_start,
                period_end=command.period_end,
                entries=entries,
            )
            filter_period_start, filter_period_end = period_start, period_end

        unresolved = self._conflict_repo.list_unresolved_conflicts(command.actor_user_id)
        touching = conflicts_touching_list(unresolved, command.list_id)
        overlapping = conflicts_overlapping_period(
            touching, period_start=period_start, period_end=period_end
        )
        is_incomplete = len(overlapping) > 0

        get_settled_at = getattr(self._repo, "get_settled_at", None)
        settled_at = (
            get_settled_at(command.list_id, command.actor_user_id) if get_settled_at else None
        )
        you_are_owed, you_owe = compute_viewer_pairwise_edges(
            self._repo,
            list_id=command.list_id,
            actor_user_id=command.actor_user_id,
            owner_id=lst.owner_id,
            settled_at=settled_at,
            period_start=filter_period_start,
            period_end=filter_period_end,
            entries=entries,
        )

        return ListBalancesStub(
            list_id=command.list_id,
            balance_crc=compute_viewer_balance_crc(
                self._repo,
                list_id=command.list_id,
                actor_user_id=command.actor_user_id,
                owner_id=lst.owner_id,
                period_start=filter_period_start,
                period_end=filter_period_end,
                entries=entries,
            ),
            is_incomplete=is_incomplete,
            you_are_owed=you_are_owed,
            you_owe=you_owe,
            period_start=period_start,
            period_end=period_end,
        )


@dataclass(frozen=True, slots=True)
class GetListCyclesCommand:
    actor_user_id: UUID
    list_id: UUID


@dataclass(frozen=True, slots=True)
class CycleOption:
    statement_id: UUID
    card_id: UUID | None
    card_label: str | None
    period_start: date
    period_end: date


@dataclass(frozen=True, slots=True)
class ListCyclesResult:
    list_id: UUID
    cycles: tuple[CycleOption, ...]
    default_statement_id: UUID | None
    fallback_period: PeriodWindow | None


class GetListCyclesService:
    """Available statement/billing cycles for a list — authorize_list_access(read_balances).

    Derives cycles from already-fetched `list_ledger_entries` (Story 5.9,
    Task 1's `derive_statement_cycles`) — no new query path, no new schema.
    """

    def __init__(self, repo: ListRepository) -> None:
        self._repo = repo

    def execute(self, command: GetListCyclesCommand) -> ListCyclesResult:
        grant = AuthorizeListAccessService(self._repo).execute(
            AuthorizeListAccessCommand(
                acting_user_id=command.actor_user_id,
                list_id=command.list_id,
                action="read_balances",
            )
        )
        self._repo.get_list_with_grant(grant, command.list_id)

        list_ledger = getattr(self._repo, "list_ledger_entries", None)
        entries = list_ledger(command.list_id) if list_ledger is not None else []
        statement_cycles = derive_statement_cycles(entries)

        card_id_by_statement: dict[UUID, UUID | None] = {}
        for entry in entries:
            if entry.statement_id is None:
                continue
            # origin_card_id is set alongside statement_id at commit time for
            # bulk-committed rows, but the per-row assign flow can later point
            # an individual entry's origin_card_id at a different card than
            # the statement's — so take the first *non-null* value seen per
            # statement instead of the first entry regardless of value.
            if (
                entry.origin_card_id is not None
                and card_id_by_statement.get(entry.statement_id) is None
            ):
                card_id_by_statement[entry.statement_id] = entry.origin_card_id
            else:
                card_id_by_statement.setdefault(entry.statement_id, None)

        get_card_label = getattr(self._repo, "get_card_label", None)
        label_cache: dict[UUID, str | None] = {}

        def resolve_label(card_id: UUID | None) -> str | None:
            if card_id is None or get_card_label is None:
                return None
            if card_id not in label_cache:
                label_cache[card_id] = get_card_label(card_id)
            return label_cache[card_id]

        cycles = tuple(
            CycleOption(
                statement_id=cycle.statement_id,
                card_id=card_id_by_statement.get(cycle.statement_id),
                card_label=resolve_label(card_id_by_statement.get(cycle.statement_id)),
                period_start=cycle.period_start,
                period_end=cycle.period_end,
            )
            for cycle in statement_cycles
        )

        if cycles:
            return ListCyclesResult(
                list_id=command.list_id,
                cycles=cycles,
                default_statement_id=cycles[0].statement_id,
                fallback_period=None,
            )

        return ListCyclesResult(
            list_id=command.list_id,
            cycles=(),
            default_statement_id=None,
            fallback_period=current_calendar_month_window(),
        )


@dataclass(frozen=True, slots=True)
class GetListOriginSpendCommand:
    actor_user_id: UUID
    list_id: UUID
    period_start: date | None = None
    period_end: date | None = None
    statement_id: UUID | None = None


@dataclass(frozen=True, slots=True)
class OriginSpendItem:
    kind: str
    card_id: UUID | None
    card_label: str | None
    total_crc: str


@dataclass(frozen=True, slots=True)
class GetListOriginSpendResult:
    list_id: UUID
    origins: tuple[OriginSpendItem, ...]
    period_start: date
    period_end: date


class GetListOriginSpendService:
    """Period spend per origin (card/cash/blank) for the solo-list hero (Story 6.2, FR-47).

    Structural sibling of `GetListCyclesService` — same authorize action,
    same entries fetch, same card-label resolution pattern. Computes and
    returns origin totals for any list a member can read; the UI decides
    whether to render this or the settle chrome based on live member count
    (AD-29 — no member-count gate here).
    """

    def __init__(self, repo: ListRepository) -> None:
        self._repo = repo

    def execute(self, command: GetListOriginSpendCommand) -> GetListOriginSpendResult:
        grant = AuthorizeListAccessService(self._repo).execute(
            AuthorizeListAccessCommand(
                acting_user_id=command.actor_user_id,
                list_id=command.list_id,
                action="read_balances",
            )
        )
        self._repo.get_list_with_grant(grant, command.list_id)

        list_ledger = getattr(self._repo, "list_ledger_entries", None)
        entries = list(list_ledger(command.list_id)) if list_ledger is not None else []

        if command.statement_id is not None:
            filtered_entries = filter_entries_by_statement(
                entries, statement_id=command.statement_id
            )
            window = full_history_window(filtered_entries)
            period_start, period_end = window.period_start, window.period_end
        else:
            period_start, period_end = resolve_effective_period(
                self._repo,
                list_id=command.list_id,
                period_start=command.period_start,
                period_end=command.period_end,
                entries=entries,
            )
            filtered_entries = _filter_entries_by_period(
                entries, period_start=period_start, period_end=period_end
            )

        groups = compute_spend_by_origin(filtered_entries)

        get_card_label = getattr(self._repo, "get_card_label", None)
        label_cache: dict[UUID, str | None] = {}

        def resolve_label(card_id: UUID | None) -> str | None:
            if card_id is None or get_card_label is None:
                return None
            if card_id not in label_cache:
                label_cache[card_id] = get_card_label(card_id)
            return label_cache[card_id]

        origins = tuple(
            OriginSpendItem(
                kind=group.kind,
                card_id=group.card_id,
                card_label=resolve_label(group.card_id),
                total_crc=str(group.total_crc),
            )
            for group in groups
        )

        return GetListOriginSpendResult(
            list_id=command.list_id,
            origins=origins,
            period_start=period_start,
            period_end=period_end,
        )


class SimplifyGroupPlanService:
    """List-wide minimal-transaction settle plan — authorize_list_access(read_balances).

    A read, like balances: it computes and returns the plan even when
    `is_incomplete` is true (AC #5). The API route is what turns that flag
    into an HTTP 409 — domain/application stay permissive; gating lives at
    the edge (mirrors `ResolveSamePriceConflictService`, Story 5.6).
    """

    def __init__(
        self,
        repo: ListRepository,
        conflict_repo: SamePriceConflictRepository | None = None,
    ) -> None:
        self._repo = repo
        self._conflict_repo = conflict_repo or NullSamePriceConflictRepository()

    def execute(self, command: SimplifyGroupPlanCommand) -> SimplifyGroupPlan:
        grant = AuthorizeListAccessService(self._repo).execute(
            AuthorizeListAccessCommand(
                acting_user_id=command.actor_user_id,
                list_id=command.list_id,
                action="read_balances",
            )
        )
        lst = self._repo.get_list_with_grant(grant, command.list_id)
        unresolved = self._conflict_repo.list_unresolved_conflicts(command.actor_user_id)
        is_incomplete = len(conflicts_touching_list(unresolved, command.list_id)) > 0

        list_ledger = getattr(self._repo, "list_ledger_entries", None)
        list_members = getattr(self._repo, "list_members_with_alias", None)
        if list_ledger is None or list_members is None:
            return SimplifyGroupPlan(
                list_id=command.list_id, transfers=(), is_incomplete=is_incomplete
            )

        ledger_entries = list_ledger(command.list_id)
        members = list_members(command.list_id)
        alias_by_id = {m.user_id: m.alias for m in members}
        photo_by_id = {m.user_id: m.photo_base64 for m in members}
        stored_default_split = self._repo.get_stored_default_split(command.list_id)
        default_mode = stored_default_split.mode if stored_default_split else MODE_EVEN
        default_shares = stored_default_split.shares if stored_default_split else None
        get_split_override_fn = _split_override_fn_for(self._repo, command.list_id)

        def get_list_default_split_fn(_list_id):
            return default_shares

        net_balances = compute_settle_balance_for_list_members(
            ledger_entries,
            members,
            lst.owner_id,
            compute_share_allocations,
            get_split_override_fn,
            get_list_default_split_fn,
            default_mode=default_mode,
        )
        transfers = simplify_group_transfers(net_balances)
        views = tuple(
            SuggestedTransferView(
                from_member_id=t.from_member_id,
                from_alias=alias_by_id.get(t.from_member_id),
                from_photo_base64=photo_by_id.get(t.from_member_id),
                to_member_id=t.to_member_id,
                to_alias=alias_by_id.get(t.to_member_id),
                to_photo_base64=photo_by_id.get(t.to_member_id),
                amount_crc=str(t.amount_crc),
            )
            for t in transfers
        )
        return SimplifyGroupPlan(
            list_id=command.list_id, transfers=views, is_incomplete=is_incomplete
        )


class SettlePayablesService:
    """Assert "my payables are done" — authorize_list_access(settle_payables).

    Idempotent: settling again just moves `settled_at` forward. Never writes
    an inter-member transfer/payment ledger line (AD-21) — only a single
    upserted `(list_id, actor_user_id) -> settled_at` timestamp row.
    """

    def __init__(self, repo: ListRepository) -> None:
        self._repo = repo

    def execute(self, command: SettlePayablesCommand) -> None:
        AuthorizeListAccessService(self._repo).execute(
            AuthorizeListAccessCommand(
                acting_user_id=command.actor_user_id,
                list_id=command.list_id,
                action="settle_payables",
            )
        )
        self._repo.upsert_settle_assertion(
            command.list_id,
            command.actor_user_id,
            settled_at=datetime.now(UTC),
        )


class SetLastOpenedListService:
    """Remember last-opened list — authorize_list_access(set_last_opened_list) → 403 on deny."""

    def __init__(self, list_repo: ListRepository, prefs_repo: PreferencesRepository) -> None:
        self._list_repo = list_repo
        self._prefs_repo = prefs_repo

    def execute(self, command: SetLastOpenedListCommand) -> UUID:
        AuthorizeListAccessService(self._list_repo).execute(
            AuthorizeListAccessCommand(
                acting_user_id=command.actor_user_id,
                list_id=command.list_id,
                action="set_last_opened_list",
            )
        )
        self._prefs_repo.update_preferences(
            command.actor_user_id,
            last_opened_list_id=command.list_id,
        )
        return command.list_id


class SetDefaultImportListService:
    """Configurable review-routing default destination — Story 4.3 (FR-12).

    Same authorize_list_access(set_default_import_list) → 403 on deny shape as
    SetLastOpenedListService — membership, not ownership.
    """

    def __init__(self, list_repo: ListRepository, prefs_repo: PreferencesRepository) -> None:
        self._list_repo = list_repo
        self._prefs_repo = prefs_repo

    def execute(self, command: SetDefaultImportListCommand) -> UUID:
        AuthorizeListAccessService(self._list_repo).execute(
            AuthorizeListAccessCommand(
                acting_user_id=command.actor_user_id,
                list_id=command.list_id,
                action="set_default_import_list",
            )
        )
        self._prefs_repo.update_preferences(
            command.actor_user_id,
            default_import_list_id=command.list_id,
        )
        return command.list_id


def _build_default_split_view(
    *,
    list_id: UUID,
    owner_id: UUID,
    member_ids: list[UUID],
    stored: StoredDefaultSplit | None,
) -> DefaultSplitView:
    stored_mode = stored.mode if stored is not None else MODE_EVEN
    stored_shares = stored.shares if stored is not None else None
    mode, shares = resolve_effective_default(stored_mode, stored_shares, member_ids)
    ordered = sorted(member_ids, key=lambda uid: str(uid))
    share_views = tuple(
        DefaultSplitShareView(user_id=uid, percentage=shares[uid]) for uid in ordered
    )
    return DefaultSplitView(
        list_id=list_id,
        owner_id=owner_id,
        mode=mode,
        shares=share_views,
        member_ids=tuple(ordered),
    )


class GetListDefaultSplitService:
    """Member-readable standing default — authorize_list_access(read_list)."""

    def __init__(self, repo: ListRepository) -> None:
        self._repo = repo

    def execute(self, command: GetListDefaultSplitCommand) -> DefaultSplitView:
        grant = AuthorizeListAccessService(self._repo).execute(
            AuthorizeListAccessCommand(
                acting_user_id=command.actor_user_id,
                list_id=command.list_id,
                action="read_list",
            )
        )
        lst = self._repo.get_list_with_grant(grant, command.list_id)
        members = self._repo.list_member_ids(command.list_id)
        self._repo.clear_invalid_percentage_default(command.list_id)
        stored = self._repo.get_stored_default_split(command.list_id)
        return _build_default_split_view(
            list_id=lst.id,
            owner_id=lst.owner_id,
            member_ids=members,
            stored=stored,
        )


class SetListDefaultSplitService:
    """Owner-only standing default mutation — authorize_list_access(edit_default_split)."""

    def __init__(self, repo: ListRepository) -> None:
        self._repo = repo

    def execute(self, command: SetListDefaultSplitCommand) -> DefaultSplitView:
        AuthorizeListAccessService(self._repo).execute(
            AuthorizeListAccessCommand(
                acting_user_id=command.actor_user_id,
                list_id=command.list_id,
                action="edit_default_split",
            )
        )
        lst = self._repo.get_list(command.list_id)
        if lst is None:
            from domain.errors import ListNotFoundError

            raise ListNotFoundError()

        members = self._repo.list_member_ids(command.list_id)
        mode = command.mode.strip().lower()
        if mode == MODE_EVEN:
            self._repo.set_default_split(command.list_id, mode=MODE_EVEN, shares=None)
        elif mode == MODE_PERCENTAGE:
            if command.shares is None:
                raise InvalidDefaultSplitError(
                    "Percentage mode requires a share for each current member."
                )
            validated = validate_percentage_shares(members, command.shares)
            self._repo.set_default_split(command.list_id, mode=MODE_PERCENTAGE, shares=validated)
        else:
            raise InvalidDefaultSplitError("Default split mode must be even or percentage.")

        stored = self._repo.get_stored_default_split(command.list_id)
        return _build_default_split_view(
            list_id=lst.id,
            owner_id=lst.owner_id,
            member_ids=members,
            stored=stored,
        )
