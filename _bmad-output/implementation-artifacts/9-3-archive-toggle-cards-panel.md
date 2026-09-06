---
baseline_commit: 83ff32b
---

# Story 9.3: Archive toggle on Cards panel

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a card owner,
I want to archive a registered card and toggle a filtered "archived" view via a box icon on the Cards panel,
so that I can hide cards I no longer use without losing their import history.

## Acceptance Criteria

1. **Given** the Cards panel title (`CardsPanel.tsx`), **when** the page renders, **then** a box icon appears at the opposite end of the title, acting as a toggle (closed box = showing active cards, open box = showing archived cards) — same anatomy and morph animation as Story 7.6/9.2. [Source: epics.md#Story 9.3] Unlike Story 9.2, `CardsPanel.tsx` already IS the component that calls `useChromeHeader` directly (no `ListsPanel`/`HomeChrome` sibling split needed) — the toggle's `showArchived` state and the chrome `trailing` icon both live in this one file, mirroring `BudgetsPanel.tsx` exactly.
2. **Given** the toggle is OFF (closed box), **when** the page renders, **then** only non-archived cards are shown, and the register-card form is visible as today.
3. **Given** the user clicks the toggle to turn it ON, **when** it activates, **then** the icon morphs to an open box, the card list filters to archived cards only (via Story 9.1's `archived` query param), and the register-card form is hidden.
4. **Given** the toggle is ON, **when** the user clicks it again, or navigates away from the Cards panel to a different screen, **then** it (or the next visit) reverts to OFF, showing non-archived cards with the register form visible. (`showArchived` is local `useState` inside `CardsPanel`, which unmounts on navigation — same "revert by construction" reasoning as Story 9.2.)
5. **Given** a card I registered, **when** I archive it, **then** it's excluded from the default (non-archived) view, its import history and past ledger lines are preserved (archiving only flips `cards.is_archived`; no cascade touches `origin_card_id`, `fixed_list_id`, or ledger entries — already guaranteed server-side by Story 9.1 AC #5), and it can be unarchived from the archived view.
6. **Given** an archived card, **when** a new statement import for that card's IBAN is attempted, **then** the import flow surfaces that the matched card is archived and offers unarchiving before continuing (no silent import against a hidden card) — exact confirmation UX is this story's to design, consistent with Story 7.6/9.2's owner-facing tone (UX-DR17). **Note:** this AC requires a small backend addition beyond Story 9.1's contract — `CardIdentificationResponse` (`api/api/schemas/import_sessions.py`) has no `archived` field today, and `identify_card_for_statement` (`api/api/routes/import_sessions.py`) auto-assigns any IBAN match silently regardless of `is_archived`. This makes the AC's backend piece a schema/route change, not `--lite`-compatible on its own — see Dev Notes.

## Tasks / Subtasks

- [x] Task 1: Cards client — `archived` filter, `is_archived` field, archive/unarchive actions (AC: #3, #5)
  - [x] Add `is_archived: boolean` to `CardItem` (`ui/app/cards/cardsClient.ts`) — `CardResponse` always includes this field since Story 9.1 (`is_archived: bool = False` in `api/api/schemas/cards.py`), so treat it as present; update `asCard()` to parse it (`typeof row.is_archived === "boolean" ? row.is_archived : false`, matching this file's existing loose-parsing style — `routing_mode`/`fixed_list_id` already fall back rather than reject).
  - [x] Change `fetchCards(messages: CardsClientMessages)` to `fetchCards(messages: CardsClientMessages, options: { archived?: boolean } = {})`, mirroring `fetchBudgets`/`fetchLists` exactly: `const url = options.archived ? "/api/cards?archived=true" : "/api/cards";`.
  - [x] Add `archiveCard(cardId: string, messages: CardsClientMessages)` and `unarchiveCard(cardId: string, messages: CardsClientMessages)`, mirroring `postBudgetAction`/`postListAction`: a shared `postCardAction(cardId, action: "archive" | "unarchive", messages)` helper that `POST`s `/api/cards/{cardId}/{action}`, maps errors via the existing `mapError`, and on success parses the response into a full `CardItem` via `asCard()` (the `POST /cards/{id}/archive` route already returns the full `CardResponse`, so no need for a separate result shape).

- [x] Task 2: BFF proxy routes for archive/unarchive + `archived` passthrough on `GET /api/cards` (AC: #3, #5)
  - [x] `ui/app/api/cards/route.ts`: extend the existing `GET` handler to forward an `archived=true` query param to the upstream `/cards` call, same conditional-URL shape as `ui/app/api/budgets/route.ts`'s `GET` / `ui/app/api/lists/route.ts`'s `GET`.
  - [x] New `ui/app/api/cards/[cardId]/archive/route.ts` and `ui/app/api/cards/[cardId]/unarchive/route.ts`, each a `POST` handler proxying to `${getApiInternalUrl()}/cards/{cardId}/archive` (or `/unarchive`) — copy `ui/app/api/lists/[listId]/archive/route.ts` verbatim, swapping `listId`/`lists` for `cardId`/`cards` (cards have no membership ACL, so no additional error mapping needed beyond the existing pass-through).

- [x] Task 3: Box-icon toggle directly in `CardsPanel` (AC: #1, #2, #3, #4)
  - [x] `ui/app/cards/CardsPanel.tsx`: add `const [showArchived, setShowArchived] = useState(false)`. Extend the existing `useChromeHeader({...})` call's `trailing` to render the reused `BoxIcon`/`IconButton` toggle **before** the existing `DocsHelpButton`, same composition as `BudgetsPanel.tsx` lines ~138-143: `<IconButton icon={<BoxIcon active={showArchived} className="size-5" />} label={showArchived ? t.cardsShowActive : t.cardsShowArchived} aria-pressed={showArchived} onClick={() => setShowArchived((prev) => !prev)} />` followed by the unchanged `<DocsHelpButton .../>`.
  - [x] Because `CardsPanel` is a single component (no `HomeListsSection`-style wrapper needed — see AC #1 note), navigating away from `/cards` unmounts it and `showArchived` resets to `false` by construction, satisfying AC #4's "navigates away … reverts to OFF" with no extra reset code.

- [x] Task 4: `CardsPanel` — archived-view fetch, hidden register form, per-card archive control (AC: #2, #3, #5)
  - [x] Add `const [archivedCards, setArchivedCards] = useState<CardItem[]>([])` and an effect keyed on `[showArchived]` that, when `showArchived` is true, calls `fetchCards(messages, { archived: true })` and sets `archivedCards` on success (mirrors `ListsPanel`'s `archivedLists` effect from Story 9.2 — the non-archived branch keeps using the existing `load()` effect/`cards` state untouched). On a failed archived fetch, fall back to an empty array and surface it via the existing `loadError`/`error` slot already wired to `StackedListPanel`'s `error` prop (`CardsPanel` has no separate error slot the way `ListsPanel` does — reuse this one, same simplicity as `BudgetsPanel`).
  - [x] Compute `const visibleCards = showArchived ? archivedCards : cards;` and pass `items={visibleCards}` to `StackedListPanel` instead of the current `items={cards}`.
  - [x] Hide the register-card form when `showArchived` is true: `input={showArchived ? null : (<RegisterCardForm .../>)}` (AC #2/#3 — `StackedListPanel`'s `input` prop is already `null`-safe, same pattern `ListsPanel`/`BudgetsPanel` use).
  - [x] Distinct empty-state label for the archived view: `emptyLabel={showArchived ? t.cardsArchivedEmpty : t.emptyState}` (mirrors `budgetsArchivedEmpty`/`listsArchivedEmpty` naming).
  - [x] Archive/unarchive control per card: `CardRoutingControl` already accepts a `trailing?: ReactNode` slot (currently used for the masked-IBAN `CopyButton`). Add a small `IconButton` (reuse an existing box/archive icon — `BoxIcon` is the only precedent in this codebase for archive affordances; do not invent a new icon) placed alongside the existing `trailing` content passed from `CardsPanel`'s `renderItem`, wired to a new `onArchive(card)` / `onUnarchive(card)` handler depending on `showArchived`. Cards have no owner-vs-non-owner ambiguity in this UI (`GET /cards` is already scoped to the caller's own cards server-side — there is no "other user's card" row to ever render here, unlike Lists' AC #6), so no ownership check is needed client-side.
  - [x] `onArchive(card)`: call `archiveCard(card.id, messages)`; on success, remove it from local `cards` state (`setCards((prev) => prev.filter((c) => c.id !== card.id))`) so it disappears from the OFF-state view immediately (unlike Lists, cards have no shared cross-page store to patch — `cards` here is `CardsPanel`'s own local state, so a direct filter is sufficient and correct).
  - [x] `onUnarchive(card)`: call `unarchiveCard(card.id, messages)`; on success, remove it from local `archivedCards` (`setArchivedCards((prev) => prev.filter((c) => c.id !== card.id))`) so it disappears from the currently-open archived view. Do not also push it into `cards` — that state was populated once at mount and would silently duplicate on the next full navigation; the OFF view will pick it up naturally on the next mount's `fetchCards()` call, same as any card registered/changed while the OFF view isn't showing.

- [x] Task 5: Import flow — surface an archived-card match before continuing (AC: #6)
  - [x] **Backend** (`api/`, not `--lite`-compatible — schema/route change): add `archived: bool = False` to `CardIdentificationResponse` (`api/api/schemas/import_sessions.py`). In `identify_card_for_statement` (`api/api/routes/import_sessions.py`, the `match_result.matched_card is not None` branch), read `match_result.matched_card.is_archived` (already present on `CardRecord` since Story 9.1) and set it on the response — do **not** change the auto-assign/persist behavior itself (the statement still gets `card_id` assigned exactly as today; only the response now discloses the archived state so the UI can react). Add a test in `api/tests/test_import_sessions_integration.py` asserting a match against an archived card returns `archived=True` while the persisted assignment is unaffected.
  - [x] **UI**: extend `CardIdentificationResponse`/`asCardIdentificationResponse`/`identifyCardForStatement`'s return shape in `ui/app/upload/uploadClient.ts` with `archived?: boolean`, threaded through the same way `iban`/`card_label` already are. Extend `useCardIdentification` (`ui/hooks/useCardIdentification.ts`) with a `cardArchived` boolean mirrored from the identify result (parallel to `cardMatched`).
  - [x] In `IndividualReviewPanel.tsx`, when `card.cardMatched && card.cardArchived`, render a small inline notice (reuse the existing owner-facing tone/copy style already used for `needsRegistration` messaging in this file — do not invent a new dialog component) offering an "Unarchive card" action that calls the new `unarchiveCard` client function (Task 1) and, on success, re-runs identification (or optimistically flips `cardArchived` to `false`) so review can proceed against the now-active card. Do not block the row's swipe/assign actions outright — the AC says "offers unarchiving before continuing," which this notice satisfies without introducing a new blocking modal; keep the row otherwise interactive so a user who intentionally still wants to import against an archived card is not hard-stopped (consistent with this codebase's existing preference for non-blocking, gesture-first review over confirm dialogs, except where AD-9/AD-10 explicitly call for a harder confirm).

- [x] Task 6: i18n — EN/ES copy (AC: #1, #3, #5, #6)
  - [x] `ui/lib/i18n/cards.ts`: add `cardsShowArchived`, `cardsShowActive` (toggle labels, same pairing as `listsShowArchived`/`budgetsShowArchived`), `cardsArchivedEmpty` (archived-view empty state), `cardsArchive`, `cardsUnarchive` (per-card control labels), to both the `en` and `es` blocks.
  - [x] Add the archived-card-during-import notice copy (Task 5) to whichever i18n file already backs `IndividualReviewPanel.tsx`'s copy (grep the file's existing `messages`/`t.` usage before creating a new key group — likely `ui/lib/i18n/upload.ts` or similar; follow that file's existing per-domain convention, do not add a new file).

- [x] Task 7: Tests
  - [x] `ui/app/cards/cardsClient.test.ts`: extend for `fetchCards(messages, { archived: true })` hitting `/api/cards?archived=true`; default `fetchCards(messages)` still hitting plain `/api/cards` (regression); `archiveCard`/`unarchiveCard` success paths posting to `/api/cards/{id}/archive`/`/unarchive` and returning the updated `CardItem` with `is_archived` flipped.
  - [x] New `ui/app/api/cards/[cardId]/archive/route.test.ts` and `.../unarchive/route.test.ts` (mirror `ui/app/api/lists/[listId]/archive/route.test.ts`): asserts the route POSTs to the correct upstream path and forwards status/cookie.
  - [x] `ui/app/cards/CardsPanel.test.tsx`: add cases — `showArchived=false` (default) renders the register form and non-archived `cards`; clicking the toggle hides the form, fetches and renders `archivedCards`; per-card archive/unarchive control calls the corresponding client function and updates visible rows per Task 4's local-state wiring; toggling again (or unmount+remount, simulating navigation) reverts to OFF.
  - [x] `api/tests/test_import_sessions_integration.py`: new case per Task 5's backend bullet (archived-card match → `CardIdentificationResponse.archived=True`, statement still gets `card_id` assigned).
  - [x] `ui/hooks/useCardIdentification.test.ts` (or wherever this hook's existing tests live — check before creating a new file): extend for a matched-but-archived response setting `cardArchived=true`.
  - [x] `ui/app/upload/review/[sessionId]/IndividualReviewPanel.test.tsx`: add a case for the archived-card notice rendering when `card.cardMatched && card.cardArchived`, and that its unarchive action calls `unarchiveCard` and clears the notice on success.

## Dev Notes

- **`CardsPanel.tsx` does not need Story 9.2's `HomeListsSection` split.** Story 9.2 needed a new wrapper component because `HomeChrome` and `ListsPanel` are independent sibling client components under a Server Component `page.tsx` — neither could safely call `useChromeHeader` without clobbering the other, and the toggle state had to be visible to both. `CardsPanel.tsx` is the single component that both renders the title (via `useChromeHeader`) and the card list — same shape as `BudgetsPanel.tsx`, which this story should mirror directly rather than re-deriving Story 9.2's sibling-split pattern. See AC #1's note; this is a scope *simplification* relative to 9.2, not a gap.
- **AC #6 is genuinely bigger than 9.1's UI-only contract for the rest of this story.** Stories 9.2 and 9.3 were scoped in the epic header as "`--lite`-compatible once 9.1's API is available" — true for Tasks 1-4/6-7 here, which only touch `ui/`. Task 5's backend half (`CardIdentificationResponse.archived`, `identify_card_for_statement` reading `is_archived`) is a small but real `api/` schema/route change Story 9.1 did not anticipate (9.1 only added `archived` filtering to the list endpoints and archive/unarchive actions — it never touched `identify_card_for_statement`). **This means Task 5's backend bullet must run against a full (non-`--lite`) worktree stack**, same rule Story 9.1 itself followed, even though the rest of this story can run `--lite`. If the dev agent is running in a `--lite` worktree wired to a read-only primary `api`, do this backend change on the primary checkout first (or flag it back for a separate small pass) before attempting Task 5's UI half, since the UI half depends on the new `archived` field actually being served.
- **`identifyCardForStatement` currently has no UI caller wiring it to a "surfaces archived" flow** — it's only invoked from `useCardIdentification`, which `IndividualReviewPanel.tsx` already uses for its `needsRegistration` flow. Task 5's UI notice is additive to that existing hook/component pair, not a new integration point.
- **Cards have no ownership ambiguity to gate the archive control on**, unlike Lists' AC #6 (non-owner rows exist and must hide the control). `GET /cards` (and by extension any `archivedCards`/`cards` state in `CardsPanel`) is already scoped server-side to `actor_user_id` — every row rendered here is always the current user's own card, so the per-card archive/unarchive `IconButton` from Task 4 needs no visibility gate.
- **No shared cross-page card store exists** (unlike `membershipListsStore` for lists) — `CardsPanel`'s `cards`/`archivedCards` are its own local `useState`, so Task 4's archive/unarchive handlers only need to mutate local state, not patch a shared store. This is simpler than Story 9.2's Task 4/`onUnarchive` store-patch step; don't introduce a new store for this story.
- **Reuse Story 7.6's box-icon toggle primitives as-is** — `BoxIcon` (`ui/app/icons/BoxIcon.tsx`), the `IconButton` `aria-pressed` pattern, and the CSS lid-morph animation in `globals.css` — zero new icon/animation code, only new call sites and new i18n copy (same reuse note as Story 9.2).
- **`--lite` worktree scope**: Tasks 1-4, 6 (cards-panel half), and their tests only touch `ui/` and are `--lite`-compatible now that Story 9.1's API is live on `main`. Task 5's backend bullet is the one exception — see the note above.

### Project Structure Notes

- New: `ui/app/api/cards/[cardId]/archive/route.ts`, `ui/app/api/cards/[cardId]/archive/route.test.ts`, `ui/app/api/cards/[cardId]/unarchive/route.ts`, `ui/app/api/cards/[cardId]/unarchive/route.test.ts`.
- Modified: `ui/app/cards/cardsClient.ts` (`CardItem.is_archived`, `fetchCards` options param, `archiveCard`/`unarchiveCard`), `ui/app/cards/cardsClient.test.ts`, `ui/app/cards/CardsPanel.tsx` (toggle state + chrome trailing icon, archived-view fetch, hidden register form, per-card archive control), `ui/app/cards/CardsPanel.test.tsx`, `ui/app/cards/CardRoutingControl.tsx` (archive/unarchive `IconButton` alongside existing `trailing`), `ui/app/api/cards/route.ts` (`archived` query passthrough on `GET`), `ui/lib/i18n/cards.ts` (new `cards*` keys, EN+ES).
- Modified (import-flow AC #6): `api/api/schemas/import_sessions.py` (`CardIdentificationResponse.archived`), `api/api/routes/import_sessions.py` (`identify_card_for_statement` sets `archived`), `api/tests/test_import_sessions_integration.py`; `ui/app/upload/uploadClient.ts` (`CardIdentificationResponse.archived`, `identifyCardForStatement` return shape), `ui/hooks/useCardIdentification.ts` (`cardArchived`), `ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx` (archived-card notice), plus their existing test files; whichever i18n file backs `IndividualReviewPanel.tsx`'s copy today (locate before adding keys — do not assume a filename).
- No changes to `ui/app/lists/*`, `ui/app/budgets/*`, `ui/app/icons/BoxIcon.tsx`, or `ui/app/cards/RegisterCardForm.tsx` (reused/unmodified).

### References

- [Source: `_bmad-output/planning-artifacts/epics.md#Story 9.3`, lines 2451-2489] — this story's ACs verbatim
- [Source: `_bmad-output/planning-artifacts/epics.md#Epic 9` header, lines 2351-2367] — 9.2/9.3 independent, both `--lite`-compatible once 9.1's API is live (see Dev Notes for AC #6's partial exception)
- [Source: `_bmad-output/implementation-artifacts/9-1-archive-flag-endpoints-lists-cards.md`] — the API contract this story consumes for Tasks 1-4: `GET /cards?archived=`, `POST /cards/{id}/archive`, `POST /cards/{id}/unarchive`, `is_archived` on `CardResponse`/`CardRecord`
- [Source: `_bmad-output/implementation-artifacts/9-2-archive-toggle-lists-homepage.md`] — sibling UI precedent (`ListsPanel`), including why 9.2 needed a wrapper component that 9.3 does not (see Dev Notes)
- [Source: `ui/app/budgets/BudgetsPanel.tsx`, lines ~130-260] — the closer structural precedent for 9.3: single-component toggle + chrome trailing `BoxIcon`/`IconButton`, `fetchBudgets(messages, { archived: showArchived })` effect, `input={null}` when archived
- [Source: `ui/app/cards/CardsPanel.tsx`] — current panel structure this story extends: `useChromeHeader` call, `load()` effect, `StackedListPanel` `input`/`items`/`emptyLabel` props, `renderItem` → `CardRoutingControl`
- [Source: `ui/app/cards/cardsClient.ts`] — `CardItem`, `fetchCards`, `mapError`, `asCard` to extend
- [Source: `ui/app/cards/CardRoutingControl.tsx`] — existing `trailing` slot to extend with the new archive/unarchive control
- [Source: `api/api/schemas/import_sessions.py`, `CardIdentificationResponse`, lines 152-166] — schema to extend with `archived: bool = False`
- [Source: `api/api/routes/import_sessions.py`, `identify_card_for_statement`, lines 756-847] — route where the archived match must be surfaced without changing the existing auto-assign persistence
- [Source: `ui/app/upload/uploadClient.ts`, lines 741-828] — `CardIdentificationResponse`/`identifyCardForStatement` client shape to extend
- [Source: `ui/hooks/useCardIdentification.ts`] — hook to extend with `cardArchived`
- [Source: `ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx`, `card = useCardIdentification(...)`, `needsRegistration` usage around lines 505, 897-900, 1213] — integration point for the new archived-card notice
- [Source: `ui/lib/i18n/cards.ts`] — `en`/`es` blocks to extend with `cards*` archive keys
- [Source: `_bmad-output/project-context.md`] — Tailwind utilities co-located, no new CSS Modules; i18n as per-domain TS message objects; `ui` → HTTP only, no direct DB/parsers; money/Decimal rules not implicated here
- [[feedback_worktree_bootstrap]] — Tasks 1-4/6/7 (ui-only) are `--lite`-compatible; Task 5's backend bullet is not (see Dev Notes)
- [[feedback_check_all_worktrees_for_fixes]] — if the dev agent is in a `--lite` worktree pointed at a shared primary `api`, Task 5's backend change must land on the primary checkout, not silently skipped

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- `--lite` worktree's `ui/node_modules` volume is read-only, which breaks Vite's own config-bundling temp-file write (`node_modules/.vite-temp`) — same issue Story 9.2 hit. Worked around locally for this dev session only by pointing `vitest --config` at a plain-object config file outside `node_modules` (`/tmp/vitest.config.mts` inside the `ui` container, importing `vitest/config` by absolute path); no repo files changed for this.
- Task 5's backend bullet (`CardIdentificationResponse.archived`, `identify_card_for_statement`) was implemented and tested against the **primary checkout** (`~/Documents/github/personal/finance-dashboard/api`), per the story's Dev Notes and [[feedback_check_all_worktrees_for_fixes]] — the `--lite` worktree here has no writable `api/` container of its own. Full primary `api` suite (`uv run pytest -q`): 1033 passed.
- Full `ui/` suite via the workaround config: 109 test files, 799 tests — 798 passed, 1 pre-existing failure (`app/budgets/BudgetsPanel.test.tsx > archiving a tile removes it from the current view on success`) reproduced identically on the primary checkout's unmodified `main`, confirming it predates this story and is unrelated to these changes.

### Completion Notes List

- Cards client (Task 1): `CardItem.is_archived`, `fetchCards(messages, { archived })`, `archiveCard`/`unarchiveCard` via a shared `postCardAction` helper — mirrors `budgetsClient.ts`'s `postBudgetAction` pattern exactly.
- BFF routes (Task 2): `GET /api/cards` now forwards `archived=true`; new `POST /api/cards/{cardId}/archive` and `.../unarchive` proxy routes, copied from the Lists precedent.
- `CardsPanel.tsx` (Tasks 3-4): single-component toggle (`showArchived` local state) drives the chrome `trailing` `BoxIcon`/`IconButton`, a second `archivedCards` fetch effect, `input={null}` + distinct empty label when archived, and a per-card archive/unarchive `IconButton` passed into `CardRoutingControl`'s existing `trailing` slot (no changes needed to `CardRoutingControl.tsx` itself — its `trailing` prop already accepts arbitrary `ReactNode`).
- i18n (Task 6): `cardsShowArchived`/`cardsShowActive`/`cardsArchivedEmpty`/`cardsArchive`/`cardsUnarchive` added to `ui/lib/i18n/cards.ts`; `cardIdentificationArchivedNotice`/`cardIdentificationUnarchive`/`cardIdentificationUnarchiving` added to `ui/lib/i18n/upload.ts` (EN+ES both).
- Import flow (Task 5): backend discloses `archived` on a matched card without changing auto-assign persistence; `useCardIdentification` exposes `cardArchived` + an optimistic `clearCardArchived()` (chosen over a full re-identify round-trip, per the Dev Notes' "or optimistically flip" option) that `IndividualReviewPanel.tsx`'s new non-blocking notice calls after a successful `unarchiveCard`.
- Tests (Task 7): extended `cardsClient.test.ts` (3 pre-existing assertions updated for the new `is_archived` field + 3 new tests), new archive/unarchive route test files, 5 new `CardsPanel.test.tsx` cases, a new `api/tests/test_import_sessions_integration.py` case, and a new `IndividualReviewPanel.test.tsx` case covering the archived-card notice end-to-end (through the real `useCardIdentification` hook, not a hook-level mock — no dedicated `useCardIdentification.test.ts` exists in this codebase and none was warranted since the integration test already exercises `cardArchived`).
- Manual verification: confirmed via the `--lite` worktree's UI container that the `/cards` page renders the toggle/per-card controls (see test coverage above for behavioral assertions); did not do an additional live click-through since the automated suite already exercises the full flow end-to-end.

### File List

- `ui/app/cards/cardsClient.ts` (modified)
- `ui/app/cards/cardsClient.test.ts` (modified)
- `ui/app/cards/CardsPanel.tsx` (modified)
- `ui/app/cards/CardsPanel.test.tsx` (modified)
- `ui/app/api/cards/route.ts` (modified)
- `ui/app/api/cards/[cardId]/archive/route.ts` (new)
- `ui/app/api/cards/[cardId]/archive/route.test.ts` (new)
- `ui/app/api/cards/[cardId]/unarchive/route.ts` (new)
- `ui/app/api/cards/[cardId]/unarchive/route.test.ts` (new)
- `ui/lib/i18n/cards.ts` (modified)
- `ui/lib/i18n/upload.ts` (modified)
- `ui/app/upload/uploadClient.ts` (modified)
- `ui/hooks/useCardIdentification.ts` (modified)
- `ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx` (modified)
- `ui/app/upload/review/[sessionId]/IndividualReviewPanel.test.tsx` (modified)
- `api/api/schemas/import_sessions.py` (modified — primary checkout)
- `api/api/routes/import_sessions.py` (modified — primary checkout)
- `api/tests/test_import_sessions_integration.py` (modified — primary checkout)
- `ui/app/cards/CardRoutingControl.test.tsx` (modified — added `is_archived` to a `CardItem` fixture after Task 1's type change)
- `ui/app/lists/OriginChipPicker.test.tsx` (modified — same `is_archived` fixture fix)
- `ui/app/icons/OpenBoxIcon.tsx` (modified — unrelated pre-existing `strokeWidth` reference bug already fixed uncommitted on the primary checkout; reapplied here per [[feedback_check_all_worktrees_for_fixes]] so `tsc --noEmit` is clean in this worktree too)

## Change Log

| Date | Change |
| --- | --- |
| 2026-09-05 | Story drafted via create-story workflow, mirroring Story 7.6/9.1/9.2's archive-toggle contract for the Cards panel; flagged AC #6's import-flow requirement as needing a small non-`--lite` backend addition beyond Story 9.1's shipped API. |
| 2026-09-05 | Implemented Tasks 1-7: cards client archive/unarchive + `archived` filter, BFF proxy routes, `CardsPanel` toggle/archived-view/per-card control, import-flow archived-card notice (backend on primary checkout + UI here), EN/ES copy, and full test coverage. Full `api` suite (1033 passed) and full `ui` suite (798/799 passed, 1 pre-existing unrelated failure) green. Status → review. |
