---
baseline_commit: ee6d31d
---

# Story 9.2: Archive toggle on Lists homepage

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a list owner,
I want to archive a list and toggle a filtered "archived" view via a box icon on the Lists homepage,
so that I can hide lists I no longer use without losing their history or membership.

## Acceptance Criteria

1. **Given** the Lists homepage title, **when** the page renders, **then** a box icon appears at the opposite end of the title, acting as a toggle (closed box = showing active lists, open box = showing archived lists) — same anatomy and morph animation as Story 7.6's budgets toggle. [Source: epics.md#Story 9.2] **Note:** the title actually lives in `ui/app/home/HomeChrome.tsx` (Home now hosts Lists — see `ui/app/lists/page.tsx`'s permanent redirect to `/home`), not in `ListsPanel.tsx` as the epics text says; the toggle goes in the chrome trailing slot next to the existing Docs help icon, mirroring `BudgetsPanel`'s chrome trailing icon.
2. **Given** the toggle is OFF (closed box), **when** the page renders, **then** only non-archived lists are shown, and the create-list input is visible as today.
3. **Given** the user clicks the toggle to turn it ON, **when** it activates, **then** the icon morphs to an open box, the list filters to archived lists only (via Story 9.1's `archived` query param), and the create-list input is hidden.
4. **Given** the toggle is ON, **when** the user clicks it again, or navigates away from the Lists homepage to a different screen, **then** it (or the next visit) reverts to OFF, showing non-archived lists with the create input visible.
5. **Given** a list I own (from its homepage row), **when** I archive it, **then** it's excluded from the default (non-archived) view, its data, membership, and history are preserved, and it can be unarchived from the archived view.
6. **Given** a list I do not own, **when** I view its row on the homepage, **then** no archive control is shown to me — only the owner can archive.

## Tasks / Subtasks

- [x] Task 1: Lists client — wire the `archived` filter and archive/unarchive actions (AC: #3, #5)
  - [x] Add `is_archived: boolean` to `ListItem` (`ui/app/lists/listsClient.ts`) — API now always returns this field per Story 9.1's `ListMembershipItem`/`ListResponse` schema change, so treat it as required (no default-parsing needed, unlike `BudgetItem`'s stricter `asBudget` validator — `fetchLists` here doesn't validate shape field-by-field today, just checks `Array.isArray(data.lists)`; leave that loose-typing style as-is, just widen the type).
  - [x] Change `fetchLists(messages: ListsClientMessages)` to `fetchLists(messages: ListsClientMessages, options: { archived?: boolean } = {})`, mirroring `fetchBudgets`'s shape exactly: `const url = options.archived ? "/api/lists?archived=true" : "/api/lists";`. **Only call `replaceMembershipLists(lists)` when `options.archived` is falsy** — the shared membership store backs source-list pickers elsewhere (Budgets' `GhostBudgetCard`, `InviteForm`, etc.) that must keep seeing only non-archived lists; an archived-view fetch must never overwrite that store. When `options.archived` is true, still return `{ ok: true, lists }` but skip the `replaceMembershipLists` call.
  - [x] Add `archiveList(listId: string, messages: ListsClientMessages)` and `unarchiveList(listId: string, messages: ListsClientMessages)`, mirroring `archiveBudget`/`unarchiveBudget`'s `postBudgetAction` pattern: a shared `postListAction(listId, action: "archive" | "unarchive", messages)` helper that `POST`s `/api/lists/{listId}/{action}`, maps errors via the existing `mapError`, and on success parses the `ListPayload`-shaped body (reuse `asListPayload`, extended to also read `is_archived`) into a `{ ok: true, list: { id, name, owner_id, is_archived } }` result. On successful `archiveList`, call `patchMembershipLists((prev) => prev.filter((item) => item.id !== listId))` — same removal shape `deleteList` already uses — since an archived list must disappear from the shared non-archived store immediately, exactly like a delete does today.

- [x] Task 2: BFF proxy routes for archive/unarchive + `archived` passthrough on `GET /api/lists` (AC: #3, #5)
  - [x] `ui/app/api/lists/route.ts`: `GET` handler forwards an `archived=true` query param to the upstream `/lists` call, mirroring `ui/app/api/budgets/route.ts`'s `GET` exactly (`const archived = new URL(request.url).searchParams.get("archived"); const upstreamUrl = archived === "true" ? ... : ...`).
  - [x] New `ui/app/api/lists/[listId]/archive/route.ts` and `ui/app/api/lists/[listId]/unarchive/route.ts`, each a `POST` handler that proxies to `${getApiInternalUrl()}/lists/{listId}/archive` (or `/unarchive`), forwarding the session cookie — copy `ui/app/api/budgets/[budgetId]/archive/route.ts` verbatim, swapping `budgetId`/`budgets` for `listId`/`lists`.

- [x] Task 3: Box-icon toggle in the Home chrome, state shared with `ListsPanel` (AC: #1, #2, #3, #4)
  - [x] New `ui/app/home/HomeListsSection.tsx` (`"use client"`): owns `const [showArchived, setShowArchived] = useState(false)` and renders `<HomeChrome .../>` (extended, see next bullet) plus `<ListsPanel initialLists={...} currentUserId={...} showArchived={showArchived} />`. Because this component (not `page.tsx`) is the one holding the toggle state, navigating away from `/home` unmounts it and the state is gone by construction — satisfies AC #4's "navigates away … reverts to OFF" without any extra reset code. Toggling again while still on the page is the explicit `setShowArchived((prev) => !prev)` path.
  - [x] `ui/app/home/HomeChrome.tsx`: add optional `showArchived?: boolean` and `onToggleArchived?: () => void` props (both optional, undefined by default) so the existing `HomeChrome.test.tsx` call site — which passes neither — keeps rendering without the toggle and stays green unmodified. Add `const { locale } = usePreferences(); const t = listsMessages[locale];` (locale is already the only field the mocked `usePreferences` in that test provides) and, in `trailing`, render the `BoxIcon` `IconButton` **before** `DocsHelpButton` only `onToggleArchived ? (...) : null` — same `IconButton`/`BoxIcon` composition `BudgetsPanel.tsx` uses (`icon={<BoxIcon active={showArchived} className="size-5" />}`, `aria-pressed={showArchived}`), labelled with the new `t.listsShowArchived`/`t.listsShowActive` i18n keys (Task 4).
  - [x] `ui/app/home/page.tsx`: replace the direct `<HomeChrome .../>` + `<ListsPanel .../>` pair with a single `<HomeListsSection title={t.title} alias={me.alias} userId={me.user_id} photoBase64={me.photo_base64} initialLists={loaded.lists} currentUserId={session.user_id} />` (only reachable in the `loaded.ok` branch — the error branch keeps rendering the plain error `<p>`, no chrome/toggle needed there since there's nothing to toggle).

- [x] Task 4: `ListsPanel` — archived-view fetch, hidden create input, per-row archive control (AC: #2, #3, #5, #6)
  - [x] Add `showArchived?: boolean` (default `false`) to `ListsPanel`'s `Props`.
  - [x] Add `const [archivedLists, setArchivedLists] = useState<ListItem[]>([])` and an effect keyed on `[showArchived]` that, when `showArchived` is true, calls `fetchLists(messages, { archived: true })` and sets `archivedLists` on success (mirrors `BudgetsPanel`'s `useEffect(() => { ... fetchBudgets(messages, { archived: showArchived }) ... }, [showArchived])`, except here only the archived branch needs a network call — the non-archived branch already has its data live in `useMembershipLists()`). On a failed fetch, fall back to an empty archived list rather than surfacing a new error UI (`ListsPanel` has no existing generic load-error slot analogous to `BudgetsPanel`'s `loadError`/`StackedListPanel error=` prop wired to this path — reuse `createError`'s existing `<p role="alert">` slot only if a fetch fails, setting a generic message via `t.errorGeneric`, not a new error state).
  - [x] Compute `const lists = showArchived ? archivedLists : (useMembershipLists() ?? initialLists);` — i.e. keep today's live/store-backed list untouched for the OFF state, and only branch to the separately-fetched archived array for the ON state. `StackedListPanel`'s existing `items={lists}` continues to work unchanged.
  - [x] Hide the create-list `input` (the `<form>` currently passed as `StackedListPanel`'s `input` prop, including the upload `Link`) when `showArchived` is true: `input={showArchived ? null : (<form>...</form>)}` (AC #2/#3 — `StackedListPanel` already renders `input` conditionally as `null`-safe, matching `BudgetsPanel`'s own `input={null}` usage in its archived masonry).
  - [x] Use a distinct empty-state label for the archived view: `emptyLabel={showArchived ? t.listsArchivedEmpty : t.emptyHint}` (mirrors `BudgetsPanel`'s `emptyLabel={showArchived ? t.budgetsArchivedEmpty : t.budgetsEmpty}`).
  - [x] Owner-only archive control: inside the existing `isOwner ? <IconButtonPopup>...</IconButtonPopup> : null` block in `renderListRow`, add one more `IconButtonPopupItem` (AC #6 is already satisfied structurally here — the whole menu, including this new item, only renders `isOwner`). When `showArchived` is false, render an "Archive" item calling a new `onArchive(list)` handler; when `showArchived` is true, render an "Unarchive" item calling a new `onUnarchive(list)` handler instead of showing Invite/Rename/Delete (an archived list is not being actively invited/renamed/deleted from this view — only unarchive makes sense there, avoiding a confusing menu that offers to invite people to or rename a list currently hidden as archived).
  - [x] `onArchive(list)`: call `archiveList(list.id, messages)`; on success, no local `lists` mutation is needed here since `archiveList` itself already patches the shared store (Task 1) which `useMembershipLists()` reads reactively — the row disappears from the OFF-state view automatically.
  - [x] `onUnarchive(list)`: call `unarchiveList(list.id, messages)`; on success, remove it from local `archivedLists` (`setArchivedLists((prev) => prev.filter((item) => item.id !== list.id))`) so it disappears from the currently-open archived view, and also patch it back into the shared store (`patchMembershipLists((prev) => prev.some((item) => item.id === list.id) ? prev : [...prev, { ...list, is_archived: false }])`, imported alongside the other store helpers already used in this file) so it's immediately available again to source-list pickers without waiting for a full refetch.
  - [x] Add `errorGeneric` is already present on `messages`; no new message plumbing needed beyond the two new labels from Task 5.

- [x] Task 5: i18n — EN/ES copy for the toggle and archive controls (AC: #1, #3, #5)
  - [x] `ui/lib/i18n/lists.ts`: add to both the `en` and `es` blocks: `listsShowArchived`, `listsShowActive` (toggle labels, same pairing as `budgetsShowArchived`/`budgetsShowActive`), `listsArchivedEmpty` (empty-state copy for the archived view), `listsArchive`, `listsUnarchive` (per-row menu item labels). Follow the file's existing per-domain object convention — these are plain keys alongside the existing `budgets*` keys already in the same `listsMessages` object, not a new file (this whole file already covers both Lists and Budgets copy).

- [x] Task 6: Tests
  - [x] `ui/app/lists/listsClient.test.ts`: extend for `fetchLists(messages, { archived: true })` hitting `/api/lists?archived=true` and **not** calling `replaceMembershipLists`; a `fetchLists(messages)` (default/false) call still hitting plain `/api/lists` and still calling `replaceMembershipLists` (regression coverage for the existing behavior); `archiveList`/`unarchiveList` success paths posting to `/api/lists/{id}/archive`/`/unarchive` and patching the store as Task 1 describes; an owner-vs-non-owner 403 mapping case (`errorForbidden`) for both actions.
  - [x] New `ui/app/api/lists/[listId]/archive/route.test.ts` and `.../unarchive/route.test.ts` (mirror `ui/app/api/budgets/[budgetId]/archive/route.test.ts` if it exists, else the plain proxy-forwarding assertions already used by sibling `ui/app/api/lists/[listId]/...` route tests): asserts the route POSTs to the correct upstream path and forwards status/cookie.
  - [x] `ui/app/lists/ListsPanel.test.tsx`: add cases — `showArchived=false` (default) renders the create input and the non-archived `lists` prop rows, owner sees an "Archive" menu item and non-owner does not (AC #6); `showArchived=true` hides the create input, fetches and renders `archivedLists`, and shows "Unarchive" instead of the full owner menu; clicking Archive/Unarchive calls the corresponding client function and updates the visible rows per Task 4's store/local-state wiring.
  - [x] `ui/app/home/HomeChrome.test.tsx`: extend the existing render to also pass `showArchived`/`onToggleArchived`, and assert the `BoxIcon` toggle button renders at the trailing end (before the Docs help button) with the right `aria-pressed`/label, and that clicking it invokes `onToggleArchived`. Keep the existing no-args assertion path intact (verifies the toggle button is absent — see Task 3's optional-prop note) rather than deleting it.
  - [x] New `ui/app/home/HomeListsSection.test.tsx`: mounts the section, verifies the toggle starts OFF (create input visible, non-archived lists shown), clicking the chrome's box icon flips `ListsPanel` into archived mode (create input hidden, an archived-fetch call fires), and clicking again reverts — this is the one place that actually exercises the cross-component state wiring from Task 3, since `HomeChrome.test.tsx` and `ListsPanel.test.tsx` each test their own half in isolation with props/mocks.

### Review Findings

- [x] [Review][Patch] `postListAction` drops `is_archived` from its returned result despite Task 1 specifying `{ id, name, owner_id, is_archived }` [ui/app/lists/listsClient.ts:253]

## Dev Notes

- **The epics doc names the wrong file for "the title."** `ui/app/lists/page.tsx` is a legacy redirect to `/home` (comment: "Lists now lives on the combined Home screen"). The real Lists-homepage title/chrome lives in `ui/app/home/HomeChrome.tsx`, rendered from `ui/app/home/page.tsx` alongside `<ListsPanel>` as a sibling — not inside `ListsPanel.tsx` itself. This story targets the actual chrome location; see AC #1's note. This is a naming-drift discrepancy in planning docs, not a scope change — the toggle still ends up in the same visual place (opposite end of the Lists title) the epic describes.
- **Why a new `HomeListsSection` wrapper instead of putting `useChromeHeader` directly in `ListsPanel`** (like `BudgetsPanel` does): `useChromeHeader` sets a single shared chrome slot; `HomeChrome` and `ListsPanel` are independent sibling client components under a Server Component page (`page.tsx`), so whichever called `useChromeHeader` last would silently clobber the other's config if both called it. The toggle's boolean state also has to be visible to *both* siblings (chrome renders the icon, `ListsPanel` reacts to it by filtering/hiding its input) — a plain lifted `useState` in one new thin wrapper client component is simpler and lower-risk than either merging `HomeChrome`'s whole avatar/title/help-button surface into `ListsPanel` (which would touch far more of `HomeChrome.test.tsx` than necessary) or introducing a new module-level store for what is purely this page's local UI state (unlike `membershipListsStore`, which is genuinely cross-page shared data).
- **Two independent list sources inside `ListsPanel`, do not merge them into one array.** The non-archived (`showArchived=false`) view keeps reading live from `useMembershipLists()` (SSR-hydrated + reactively patched by create/rename/delete/archive elsewhere in the app) exactly as it does today — untouched. The archived (`showArchived=true`) view is a separate, locally-fetched-and-held array (`archivedLists`) that is deliberately *not* pushed into the shared membership store, because that store backs source-list pickers on other pages (Budgets' ghost-create card, `InviteForm`) that must only ever offer non-archived lists. This mirrors the reasoning already documented in Story 9.1 for why `GET /lists` filters (`archived` param) rather than the detail endpoint, extended here to "the UI's own client-side cache must respect the same non-archived-by-default assumption everywhere it's read."
- **Archive is owner-only, same 403-vs-404 split as Story 9.1's API** (`NotListOwnerError` → 403 `not_list_owner`, non-member/nonexistent → `_access_denied()`). The UI enforces this only by *not rendering the control* for non-owners (AC #6) — it does not need to special-case a 403 response body beyond the existing generic `errorForbidden` mapping already in `mapError`, since a non-owner can never reach the archive action through this UI in the first place.
- **`ListsPanel`'s owner-only row menu swaps its full contents based on `showArchived`**, not just appends an item: in the archived view, Invite/Rename/Delete don't make sense for a list currently hidden from the default surface (inviting a new member to a list you've tucked away, or renaming/deleting it mid-archive, is more likely a mistake than an intended action) — only Unarchive is offered there. In the non-archived view, the existing Invite/Rename/Delete trio gains one more item, Archive, appended after Delete (least-destructive-looking new addition at the end, consistent with `BudgetsPanel`'s archive control being the one small icon added to an otherwise-unchanged card, not inserted ahead of existing actions).
- **`--lite` worktree scope**: per the Epic 9 header, this story only touches `ui/` files (see File List below) and is `--lite`-compatible now that Story 9.1's API (already merged to `main`, see `git log`) is live — this matches the activation-time scope check that routes this worktree to `worktree-bootstrap.sh --lite` against the primary checkout's already-running `api`.
- **Reuse, don't rebuild, Story 7.6's box-icon toggle primitives** — `BoxIcon` (`ui/app/icons/BoxIcon.tsx`), the `IconButton` `aria-pressed` pattern, and the CSS lid-morph animation in `globals.css` are already generic and used as-is; this story adds zero new icon/animation code, only new call sites and new i18n copy.
- **`ListItem.is_archived` is required, not optional-with-default** — unlike `BudgetItem`'s narrower `asBudget()` validator (which enforces every field including `is_archived: boolean`), `fetchLists` today does a much looser `Array.isArray(data.lists)` check and casts straight to `ListItem[]` without per-field validation; keep that existing looseness (don't introduce a new strict validator as part of this story — that would be a bigger refactor of `listsClient.ts`'s existing conventions than this story's scope calls for).

### Project Structure Notes

- New: `ui/app/home/HomeListsSection.tsx`, `ui/app/home/HomeListsSection.test.tsx`, `ui/app/api/lists/[listId]/archive/route.ts`, `ui/app/api/lists/[listId]/unarchive/route.ts`, matching `route.test.ts` files.
- Modified: `ui/app/lists/listsClient.ts` (`ListItem.is_archived`, `fetchLists` options param, `archiveList`/`unarchiveList`), `ui/app/lists/listsClient.test.ts`, `ui/app/lists/ListsPanel.tsx` (`showArchived` prop, archived-view state, per-row archive/unarchive control), `ui/app/lists/ListsPanel.test.tsx`, `ui/app/home/HomeChrome.tsx` (optional toggle props), `ui/app/home/HomeChrome.test.tsx`, `ui/app/home/page.tsx` (renders `HomeListsSection` instead of the `HomeChrome`+`ListsPanel` pair), `ui/app/api/lists/route.ts` (`archived` query passthrough on `GET`), `ui/lib/i18n/lists.ts` (new `listsShowArchived`/`listsShowActive`/`listsArchivedEmpty`/`listsArchive`/`listsUnarchive` keys, EN+ES).
- No changes to any `api/` file — Story 9.1 already shipped the backend contract this story consumes. No changes to `ui/app/lists/page.tsx` (stays a plain redirect) or to `BudgetsPanel.tsx`/`BoxIcon.tsx` (reused, not modified).

### References

- [Source: `_bmad-output/planning-artifacts/epics.md#Story 9.2`, lines 2409-2444] — this story's ACs verbatim (see Dev Notes for the `ListsPanel.tsx` vs. actual `HomeChrome.tsx` title-location correction)
- [Source: `_bmad-output/planning-artifacts/epics.md#Epic 9` header, lines 2351-2367] — 9.2 is independent of 9.3 and `--lite`-compatible once 9.1's API is live
- [Source: `_bmad-output/implementation-artifacts/9-1-archive-flag-endpoints-lists-cards.md`] — the API contract this story consumes: `GET /lists?archived=`, `POST /lists/{id}/archive`, `POST /lists/{id}/unarchive`, `is_archived` on `ListResponse`/`ListMembershipItem`; owner-only 403 (`not_list_owner`) vs. non-member 403 (`not_list_member`) split
- [Source: `_bmad-output/implementation-artifacts/7-6-archive-budgets.md`] — the UI precedent this story mirrors: box-icon chrome toggle, `showArchived` state driving a filtered fetch + hidden create input, per-item archive icon
- [Source: `ui/app/budgets/BudgetsPanel.tsx`, lines 131-258] — `showArchived` state, chrome trailing `BoxIcon`/`IconButton` composition, `fetchBudgets(messages, { archived: showArchived })` effect, `input={null}` when archived, `onToggleArchive` pattern
- [Source: `ui/app/budgets/budgetsClient.ts`, lines 169-201, 334-373] — `fetchBudgets` archived-query shape and `postBudgetAction`/`archiveBudget`/`unarchiveBudget` to mirror for lists
- [Source: `ui/app/api/budgets/route.ts`, lines 27-54] and [`ui/app/api/budgets/[budgetId]/archive/route.ts`] — BFF proxy shapes to replicate for `/api/lists`
- [Source: `ui/app/home/HomeChrome.tsx`, `ui/app/home/page.tsx`, `ui/app/home/HomeChrome.test.tsx`] — current chrome/page wiring this story extends; existing test's no-toggle-args call site must keep passing
- [Source: `ui/app/lists/ListsPanel.tsx`, lines 126-599] — current panel structure: `StackedListPanel` `input`/`emptyLabel` props, owner-only `IconButtonPopup` menu (Invite/Rename/Delete) to extend with Archive/Unarchive
- [Source: `ui/app/lists/listsClient.ts`] — `ListItem`, `fetchLists`, `deleteList`'s `patchMembershipLists` removal pattern, `mapError`
- [Source: `ui/app/lists/membershipListsStore.ts`] — `useMembershipLists`, `patchMembershipLists`, `replaceMembershipLists` — the shared store this story must not pollute with archived-only data
- [Source: `ui/app/icons/BoxIcon.tsx`] — reused as-is, no changes
- [Source: `ui/lib/i18n/lists.ts`, `budgetsShowArchived`/`budgetsShowActive`/`budgetsArchivedEmpty`/`budgetsArchive`/`budgetsUnarchive` keys] — naming precedent for the new `lists*` keys
- [Source: `_bmad-output/project-context.md`] — Tailwind utilities co-located, no new CSS Modules; i18n as per-domain TS message objects; `ui` → HTTP only, no direct DB/parsers
- [[feedback_worktree_bootstrap]] — this story is `--lite`-compatible (ui-only) once Story 9.1's API is live on the primary checkout

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Debug Log References

- Ran the worktree's `--lite` Compose stack (`fh-feat-9-9-2-archive-toggle-lists-homepage-ui-1`, wired to the primary checkout's already-running `api`/`db`); confirmed `ui`/`api` `/health` both `{"status":"ok"}` before implementing.
- `npx tsc --noEmit`: clean. `npx eslint .`: 0 errors (3 pre-existing unrelated warnings in `app/budgets/[budgetId]/BudgetAssignPanel.tsx`/`BudgetRulesPanel.tsx`).
- Vitest inside the `--lite` container's mounted `node_modules` is a read-only shared volume (by design, per `worktree-bootstrap.sh --lite`), which broke Vite's config-bundling temp-file write; worked around locally for this session only by pointing `--config` at a plain-object config file outside `node_modules` — no repo files changed for this, purely a local run workaround.
- Full `npx vitest run` (whole `ui/` suite): 107 files / 784 tests passed, no regressions.
- Manual smoke: registered a fresh account + alias against the running stack, confirmed `GET /home` renders the `ListsPanel` (create input, list row) without a 500; `HomeChrome`'s chrome content (title/toggle/help) is populated via `useChromeHeader`'s existing effect-driven mechanism (same as `BudgetsPanel`), so it isn't present in the raw SSR HTML pre-hydration — this is pre-existing behavior, not new to this story, and is covered by the jsdom component tests instead.

### Completion Notes List

- Lists client (`listsClient.ts`): added `ListItem.is_archived` (optional, matching the file's existing loose-typing convention), `fetchLists(messages, { archived })` (only replaces the shared membership store on the non-archived fetch), and `archiveList`/`unarchiveList` via a shared `postListAction` helper mirroring `budgetsClient`'s `postBudgetAction`. `archiveList` removes the list from the shared store on success.
- New BFF proxy routes `POST /api/lists/{listId}/archive` and `/unarchive` (copied from the budgets archive/unarchive route shape); `GET /api/lists` now forwards `?archived=true`.
- Home chrome: `HomeChrome.tsx` gained optional `showArchived`/`onToggleArchived` props rendering the reused `BoxIcon`/`IconButton` toggle before the existing Docs help button (no-op when the props are omitted, so the existing no-args test path is unchanged). New `HomeListsSection.tsx` owns the `showArchived` boolean state shared between `HomeChrome` and `ListsPanel` (the two are chrome/panel siblings under the Server Component `page.tsx`, so the state has to live in a small shared client parent); `page.tsx` now renders `HomeListsSection` in the success branch instead of the old `HomeChrome`+`ListsPanel` pair (the error branch is unchanged).
- `ListsPanel.tsx`: added `showArchived` prop; the non-archived view is untouched (still reads live from `useMembershipLists()`); the archived view holds its own locally-fetched `archivedLists` array and is never merged into the shared membership store. Create-input hidden and empty-state copy swapped when `showArchived`. Owner-only row menu now swaps its full contents based on `showArchived`: Invite/Rename/Delete + a new Archive item when off, only Unarchive when on (non-owners see no menu at all in either state, satisfying AC #6). A separate `archiveActionError` banner (not the list-gating `StackedListPanel` `error` prop) surfaces per-action archive/unarchive failures so a failed action never hides the whole row list.
- i18n: added `listsShowArchived`/`listsShowActive`/`listsArchivedEmpty`/`listsArchive`/`listsUnarchive` to both `en`/`es` blocks in `lib/i18n/lists.ts`.
- Corrected the epics doc's stated title location (`ListsPanel.tsx`) to the actual `HomeChrome.tsx` in the story's AC #1 and Dev Notes — see the Change Log entry from story creation.

### File List

- New: `ui/app/home/HomeListsSection.tsx`
- New: `ui/app/home/HomeListsSection.test.tsx`
- New: `ui/app/api/lists/[listId]/archive/route.ts`
- New: `ui/app/api/lists/[listId]/archive/route.test.ts`
- New: `ui/app/api/lists/[listId]/unarchive/route.ts`
- New: `ui/app/api/lists/[listId]/unarchive/route.test.ts`
- Modified: `ui/app/lists/listsClient.ts`
- Modified: `ui/app/lists/listsClient.test.ts`
- Modified: `ui/app/lists/ListsPanel.tsx`
- Modified: `ui/app/lists/ListsPanel.test.tsx`
- Modified: `ui/app/home/HomeChrome.tsx`
- Modified: `ui/app/home/HomeChrome.test.tsx`
- Modified: `ui/app/home/page.tsx`
- Modified: `ui/app/api/lists/route.ts`
- Modified: `ui/lib/i18n/lists.ts`

## Change Log

| Date | Change |
| --- | --- |
| 2026-09-05 | Story drafted via create-story workflow, mirroring Story 7.6/9.1's archive-toggle contract for the Lists homepage; corrected the epics doc's `ListsPanel.tsx` title-location reference to the actual `HomeChrome.tsx`. |
| 2026-09-05 | Implemented the archive toggle end-to-end: `listsClient`/BFF proxy routes for archive/unarchive + `archived` filter, `HomeChrome`/`HomeListsSection` box-icon toggle, `ListsPanel` archived-view fetch + owner-only row menu, EN/ES copy. Full `ui/` suite (107 files / 784 tests) + typecheck + lint green. |
