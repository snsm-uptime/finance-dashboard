---
title: 'Member-scoped list hide (personal archive for non-owned lists)'
type: 'feature'
created: '2026-09-21'
status: 'done'
review_loop_iteration: 0
context: []
baseline_commit: 'f7781c39955bdf2ef44afc14f84bf9e5ccaf2cb7'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Lists have owner-only archiving (Story 9.1/9.2): only the owner can archive a list, and archiving hides it for everyone. A non-owner member has no way to stop seeing a list on their own dashboard (e.g. a list a relative added them to) without leaving/being removed, and they can't delete it since they don't own it.

**Approach:** Add a new per-membership `is_hidden` flag on `ListMembershipModel`, independent from the existing owner-only `lists.is_archived`. Non-owner members get a hide/unhide action, purely a personal view filter — invisible to the owner and other members, no effect on membership, ledger, or balances. Reuse the existing Archive/Unarchive UI (box-icon toggle, same Lists homepage card) but gated to non-owners instead of owners.

## Boundaries & Constraints

**Always:**
- New column is per-membership (`ListMembershipModel.is_hidden`, default `false`), not per-list — never touch `lists.is_archived` or its existing owner-only service/route behavior.
- Hide/unhide is available only to non-owner members. If the actor is the list's owner, reject (they must use the existing owner archive instead).
- `GET /lists?archived=true|false` filtering becomes per-row: for a row where the actor is the owner, filter on `list.is_archived`; for a row where the actor is a non-owner member, filter on `membership.is_hidden`. No other query/response field changes.
- Hiding/unhiding never touches `ListMembershipModel.role`, ledger entries, import batches, or balance computation — same "view-only" guarantee as the existing archive feature.
- Mirror the existing ACL/service style used by `RenameListService`/`ArchiveListService` in `api/application/lists.py` (fetch `get_list` + `get_membership`; missing either → `NotListMemberError`), but skip the owner check — instead reject if actor IS the owner.

**Ask First:** none — approach is fully determined by the clarifying answers already given.

**Never:**
- Do not let the owner or other members see/know that a member hid the list (no indicator, no notification).
- Do not reuse or repurpose `lists.is_archived` for this — it must stay a distinct, separate flag.
- Do not add this action to `IconButtonPopup`'s owner-only menu column path — it needs its own non-owner branch.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Member hides a list they belong to (not owner) | `POST /lists/{id}/hide`, actor is non-owner member | `membership.is_hidden = true`; list drops out of actor's default `GET /lists`, appears under `?archived=true` | N/A |
| Member unhides | `POST /lists/{id}/unhide`, actor is non-owner member with `is_hidden=true` | `membership.is_hidden = false`; list reappears in default `GET /lists` | N/A |
| Owner attempts hide/unhide | `POST /lists/{id}/hide`, actor is the list owner | Rejected | 403 `not_list_member`-style domain error (new `CannotHideOwnedListError`), no state change |
| Non-member / nonexistent list | `POST /lists/{id}/hide`, actor has no membership row | Rejected | `NotListMemberError` → existing `_access_denied()` 403 shape |
| Owner archives the list while a member has it hidden | Owner calls existing `POST /lists/{id}/archive` | `lists.is_archived = true`; unrelated to `membership.is_hidden`, no cross-effect | N/A |
| Other members' view | Member A hides list; Member B and owner call `GET /lists` | List still appears normally for B and owner | N/A |

</frozen-after-approval>

## Code Map

- `api/adapters/persistence/migrations/versions/0041_list_membership_hidden.py` -- new migration, chained off `0040_user_default_origin_card` (actual head at implementation time — 0040 was already taken), adds `list_memberships.is_hidden boolean NOT NULL DEFAULT false`
- `api/adapters/persistence/models.py` -- `ListMembershipModel.is_hidden` column (~line 137-154)
- `api/domain/errors.py` -- new `CannotHideOwnedListError` near `NotListOwnerError` (line 198)
- `api/application/lists.py` -- `HideListCommand`/`HideListService`, `UnhideListCommand`/`UnhideListService` mirroring `ArchiveListService`/`UnarchiveListService` (~line 353-431) minus the owner check, plus the owner-IS-actor rejection; `MembershipRecord`/`ListMembershipsService.execute` gain per-row effective-archived logic
- `api/adapters/persistence/repositories.py` -- `hide_list_for_member`/`unhide_list_for_member` on `SqlAlchemyListRepository` (mirror `archive_list`/`unarchive_list`, lines ~314-327, scoped by `(list_id, user_id)` not just `list_id`); `list_for_user` (lines 358-401) per-row filter: owner rows compare `ListModel.is_archived`, member rows compare `ListMembershipModel.is_hidden`
- `api/api/routes/lists.py` -- `POST /lists/{list_id}/hide`, `POST /lists/{list_id}/unhide` routes near `archive_list`/`unarchive_list` routes; catch `CannotHideOwnedListError` → 403
- `ui/app/lists/listsClient.ts` -- `hideList(listId, messages)` / `unhideList(listId, messages)` mirroring `archiveList`/`unarchiveList` (line 267, 279)
- `ui/app/api/lists/[listId]/hide/route.ts`, `ui/app/api/lists/[listId]/unhide/route.ts` -- new Next.js route handlers mirroring the existing archive/unarchive ones
- `ui/app/lists/ListsPanel.tsx` -- non-owner branch (currently `isOwner ? <menuCol>...</menuCol> : null` at line ~424/509) gains its own `menuCol` with only a hide/unhide `IconButtonPopupItem` using `ArchiveToggleIcon`, wired to `onHide`/`onUnhide` handlers mirroring `onArchive`/`onUnarchive`
- `ui/lib/i18n/lists.ts` -- reuse `listsArchive`/`listsUnarchive` copy keys (same UI text) or add member-specific copy if distinct wording is needed — reuse existing keys, no new copy, since it's the same user-facing action

## Tasks & Acceptance

**Execution:**
- [x] `api/adapters/persistence/migrations/versions/0041_list_membership_hidden.py` -- add `is_hidden` boolean column to `list_memberships` -- persists per-member hide state
- [x] `api/adapters/persistence/models.py` -- add `ListMembershipModel.is_hidden` -- ORM mapping for the new column
- [x] `api/domain/errors.py` -- add `CannotHideOwnedListError` -- distinct error for owner misusing the member-only action
- [x] `api/application/lists.py` -- add `HideListService`/`UnhideListService` + commands; thread `is_hidden` through membership records; update `list_for_user`/`ListMembershipsService` filtering to be per-row (owner vs member) -- core hide/unhide business logic and correct archived-tab filtering
- [x] `api/adapters/persistence/repositories.py` -- add `hide_list_for_member`/`unhide_list_for_member`; rewrite `list_for_user`'s archived filter to branch on ownership per row -- persistence + query support
- [x] `api/api/routes/lists.py` -- add `POST /lists/{list_id}/hide` and `POST /lists/{list_id}/unhide` routes -- HTTP surface
- [x] `ui/app/api/lists/[listId]/hide/route.ts`, `ui/app/api/lists/[listId]/unhide/route.ts` -- new Next.js proxy routes -- BFF wiring mirroring archive/unarchive
- [x] `ui/app/lists/listsClient.ts` -- add `hideList`/`unhideList` client functions -- frontend API calls
- [x] `ui/app/lists/ListsPanel.tsx` -- render a non-owner menu with hide/unhide toggle, wire handlers, update local state on success -- UI entry point
- [x] `api/tests/test_lists_integration.py` -- extend with hide/unhide cases: member hides own-membership list (excluded from default `GET /lists`, present under `?archived=true`, unhide restores); owner attempting hide → `CannotHideOwnedListError`; non-member → `NotListMemberError`; hiding doesn't affect other members'/owner's view or balances/membership rows -- test coverage for the I/O matrix

**Acceptance Criteria:**
- Given a non-owner member of a list, when they hide it, then it disappears from their default `GET /lists` and appears under `?archived=true`, with no change to the owner's or other members' view
- Given a non-owner member has hidden a list, when they unhide it, then it reappears in their default view
- Given the list owner, when they attempt to call hide/unhide, then the request is rejected and `lists.is_archived`/membership rows are unaffected
- Given a hidden list, when membership, ledger, import batches, or balances are inspected, then none are affected by the hide state

## Design Notes

The trickiest part is `list_for_user`'s per-row filter: it currently does one `ListModel.is_archived == archived` clause for all rows. Switch to a `case()` expression (or equivalent) comparing against `ListModel.is_archived` when `ListMembershipModel.user_id == ListModel.owner_id`, else `ListMembershipModel.is_hidden`, then filter `== archived`. Keep it in SQL (not Python-side post-filtering) since the same query already joins both tables.

## Verification

**Commands:**
- `docker compose exec api alembic upgrade head` -- migration applies cleanly
- `uv run pytest -q` (inside api container) -- full suite green, including new hide/unhide cases
- `uv run ruff check . && uv run ruff format --check .` -- lint/format clean

**Manual checks (if no CLI):**
- In the browser, as a non-owner member: confirm a hide/unhide icon appears on lists you don't own, hiding removes it from the homepage, and the "show archived" tab surfaces it; confirm the owner's own view of that list is unaffected.

## Suggested Review Order

**Archive/hide interaction (the core correctness risk)**

- Entry point: the per-row effective-archived filter — owner rows follow `is_archived` alone, non-owner rows OR it with their personal `is_hidden` so an owner's archive still reaches everyone, additively.
  [`repositories.py:392`](../../../finance-dashboard-wt-member-hide/api/adapters/persistence/repositories.py#L392)

- Regression guard proving the OR-combine: owner archiving still moves the list to a never-hidden member's archived view.
  [`test_lists_domain.py:361`](../../../finance-dashboard-wt-member-hide/api/tests/test_lists_domain.py#L361)

- Same guard against real Postgres, plus per-member isolation (member A's hide never affects member B).
  [`test_lists_integration.py:364`](../../../finance-dashboard-wt-member-hide/api/tests/test_lists_integration.py#L364)

**Member-only ACL (hide is not the owner's archive)**

- `HideListService`/`UnhideListService`: same ad-hoc ACL shape as rename/archive, but rejects the owner instead of non-owners.
  [`application/lists.py:451`](../../../finance-dashboard-wt-member-hide/api/application/lists.py#L451)

- New domain error distinguishing "you own this, use archive" from "you're not a member."
  [`domain/errors.py:207`](../../../finance-dashboard-wt-member-hide/api/domain/errors.py#L207)

- Persistence: flips `is_hidden` scoped to `(list_id, user_id)`, never touching the list-wide `is_archived`.
  [`repositories.py:358`](../../../finance-dashboard-wt-member-hide/api/adapters/persistence/repositories.py#L358)

- HTTP surface: `POST /lists/{id}/hide`, mirrors the archive route's 403 branching for the new error.
  [`routes/lists.py:1077`](../../../finance-dashboard-wt-member-hide/api/api/routes/lists.py#L1077)

**UI: non-owner menu**

- The non-owner branch that previously rendered nothing now renders a hide/unhide-only menu (no invite/rename/delete).
  [`ListsPanel.tsx:612`](../../../finance-dashboard-wt-member-hide/ui/app/lists/ListsPanel.tsx#L612)

- `onHide`/`onUnhide` handlers, mirroring `onArchive`/`onUnarchive`'s existing local-state update shape.
  [`ListsPanel.tsx:418`](../../../finance-dashboard-wt-member-hide/ui/app/lists/ListsPanel.tsx#L418)

- Client fetch helpers for the new `hide`/`unhide` actions (204-response shape, unlike archive's 200+body).
  [`listsClient.ts:316`](../../../finance-dashboard-wt-member-hide/ui/app/lists/listsClient.ts#L316)

**Peripherals**

- Migration adding `list_memberships.is_hidden`.
  [`0041_list_membership_hidden.py`](../../../finance-dashboard-wt-member-hide/api/adapters/persistence/migrations/versions/0041_list_membership_hidden.py#L1)

- BFF proxy routes mirroring the existing archive/unarchive Next.js routes.
  [`hide/route.ts`](../../../finance-dashboard-wt-member-hide/ui/app/api/lists/[listId]/hide/route.ts#L1)
  [`unhide/route.ts`](../../../finance-dashboard-wt-member-hide/ui/app/api/lists/[listId]/unhide/route.ts#L1)

- Updated component test: non-owner menu now shows exactly one item (Hide or Unhide, never both).
  [`ListsPanel.test.tsx:208`](../../../finance-dashboard-wt-member-hide/ui/app/lists/ListsPanel.test.tsx#L208)
