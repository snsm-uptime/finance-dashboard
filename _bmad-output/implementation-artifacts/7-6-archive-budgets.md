---
baseline_commit: 03712b0
---

# Story 7.6: Archive budgets

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a budget owner,
I want to archive a budget and toggle a filtered "archived" view via a box icon on the budgets page,
so that I can hide budgets I no longer track without deleting their history.

## Acceptance Criteria

1. **Given** the `/budgets` page title, **when** the page renders, **then** a box icon appears at the opposite end of the title, acting as a toggle (closed box = showing active budgets, open box = showing archived budgets). [Source: epics.md#Story 7.6]
2. **Given** the toggle is OFF (closed box), **when** the page renders, **then** only non-archived budgets are shown, and the create form is visible as today.
3. **Given** the user clicks the toggle to turn it ON, **when** it activates, **then** the icon morphs to an open box, the list filters to archived budgets only, and the create form is hidden.
4. **Given** the toggle is ON, **when** the user clicks it again, **then** it morphs back to closed, and the view returns to non-archived budgets with the create form visible.
5. **Given** the toggle is ON, **when** the user navigates away from `/budgets` to a different screen, **then** the toggle resets to OFF; returning to `/budgets` later shows non-archived budgets by default.
6. **Given** a budget (from the list tile or its detail page), **when** the owner archives it, **then** it's excluded from the default (non-archived) view, its data/history is preserved, and it can be unarchived from the archived view.
7. **Given** this story, **when** scope is considered, **then** archiving lists and cards is out of scope here (deferred, tracked separately per the Epic 7 header note — not a story in this epic).

## Tasks / Subtasks

- [x] Task 1: Persist archive state (AC: #6)
  - [x] Add Alembic migration `0036_budget_archived.py` (chain off `0035_budgets_standalone_entity`, the current head — confirm no newer head landed since, e.g. from Story 7.5, before setting `down_revision`) adding `budgets.is_archived boolean NOT NULL DEFAULT false` — no index needed (owner-scoped, small per-user row counts, same reasoning the repo already uses for `list_budgets_for_owner`'s unindexed name lookup).
  - [x] Add `is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=sa.false())` to `BudgetModel` in `api/adapters/persistence/models.py`, matching the migration's default.
  - [x] Add `is_archived: bool` to `BudgetRecord` (`application/budgets.py`) and thread it through `_budget_record()` in `adapters/persistence/budgets.py`.

- [x] Task 2: API — archive/unarchive actions + filtered listing (AC: #2, #3, #6)
  - [x] Add `archive_budget(self, budget_id: UUID) -> None` and `unarchive_budget(self, budget_id: UUID) -> None` to the `BudgetRepository` Protocol and `SqlAlchemyBudgetRepository` — each sets `is_archived` and flushes, mirroring `delete_budget`'s `session.get` + mutate + flush shape (not a full `update_budget`-style replace; this is a single-field toggle, don't route it through `UpdateBudgetCommand`).
  - [x] Add `list_budgets_for_owner(self, owner_user_id: UUID, *, archived: bool) -> list[BudgetRecord]` — **change the existing method's signature** to accept `archived: bool = False` and filter `BudgetModel.is_archived == archived` in the `select()`. Update both call sites in `application/budgets.py` (`ListBudgetsService.execute`, `UpdateBudgetService.execute`'s sibling-name-uniqueness loop — that loop must check across **both** archived and non-archived siblings for name collisions, so give it its own unscoped query or call the method for both values and concatenate; do not accidentally let archiving free up a name).
  - [x] Add `ArchiveBudgetCommand`/`ArchiveBudgetService` and `UnarchiveBudgetCommand`/`UnarchiveBudgetService` to `application/budgets.py`, same shape as `DeleteBudgetService` (owner-only via `_get_owned_budget`, 404-on-deny per AD-30 — no distinct 403).
  - [x] Add `ListBudgetsCommand.archived: bool = False` field; `ListBudgetsService.execute` passes it through to `list_budgets_for_owner`.
  - [x] Add `is_archived: bool` to `BudgetView` and `BudgetDetailView` (`application/budgets.py`) — set from `record.is_archived` at both construction sites in `api/api/routes/budgets.py` (`create_budget`, `update_budget`, `_budget_response`/`_budget_detail_response` helpers, and the new archive/unarchive route handlers below).
  - [x] Add `is_archived: bool` to `BudgetResponse` and `BudgetDetailResponse` in `api/api/schemas/budgets.py`.
  - [x] Route: `GET /budgets` gains an optional query param `archived: bool = False` (FastAPI query param, not body — mirrors typical list-filter shape elsewhere in this router) forwarded into `ListBudgetsCommand(actor_user_id=user_id, archived=archived)`.
  - [x] Routes: `POST /budgets/{budget_id}/archive` and `POST /budgets/{budget_id}/unarchive`, `response_model=BudgetResponse`, each catching `BudgetNotFoundError` → `_budget_not_found()` (same pattern as `delete_budget`), returning the updated `_budget_response(view)`. Do **not** overload `PATCH /budgets/{budget_id}` (`UpdateBudgetBody`) for this — that body requires `name`/`cap`/`currency`/`source_list_ids` together and is a full-replace; archiving is a single independent action triggerable from the list tile *or* the detail page per AC #6, and must not force the caller to resend the whole budget.
  - [x] Add `BudgetNotFoundError`-only error handling (already defined in `domain/errors.py`, already imported in `api/api/routes/budgets.py`) — no new error type needed.

- [x] Task 3: UI — client + BFF plumbing (AC: #2, #3, #6)
  - [x] `ui/app/budgets/budgetsClient.ts`: add `is_archived: boolean` to `BudgetItem`, thread through `asBudget`/`asBudgetFromWire`'s shape checks (add `typeof row.is_archived !== "boolean"` to the guard, include it in the returned object). Add `fetchBudgets(messages, { archived }: { archived?: boolean } = {})` — append `?archived=true` to the fetch URL when `archived` is `true`, omit the param otherwise (keeps the default-view request identical to today's, no behavior change for AC #2's "as today"). Add `archiveBudget(budgetId, messages)` and `unarchiveBudget(budgetId, messages)`, POST to `/api/budgets/{budgetId}/archive` / `/unarchive`, same `OkBudget | ErrorResult` return shape as `createBudget`.
  - [x] `ui/app/api/budgets/route.ts`: forward the `archived` query param from the incoming request URL onto the upstream fetch (`GET` handler) — read `request.nextUrl.searchParams.get("archived")`, append `?archived=true` to the upstream URL only when present and `"true"`.
  - [x] `ui/app/api/budgets/[budgetId]/route.ts`: add `POST` is not applicable here (this file has no dynamic action segment) — instead add two new route files `ui/app/api/budgets/[budgetId]/archive/route.ts` and `ui/app/api/budgets/[budgetId]/unarchive/route.ts`, each a thin `POST` proxy to `${getApiInternalUrl()}/budgets/{budgetId}/archive|unarchive` with `forwardCookie`, matching this directory's existing GET handler's error/response-passthrough shape exactly (502 on fetch failure, passthrough status/body otherwise).

- [x] Task 4: UI — box-icon toggle in chrome + view filtering (AC: #1, #2, #3, #4, #5)
  - [x] Add a new icon component `ui/app/icons/BoxIcon.tsx` (closed/open box glyph — a simple two-state box with a lid, styled like this codebase's other line icons per `ICON_STROKE`/`stroke.ts`) plus an `active`-driven morph following `FileImportMorphIcon.tsx`'s established pattern (parent owns hover/focus/toggle state, one glyph serves both, `requestAnimationFrame`-driven `d`-attribute interpolation between closed-lid and open-lid path templates, `prefers-reduced-motion` short-circuits straight to the end state). A simpler CSS-only lid-rotation (`transform`-based) is acceptable if it reads clearly as "open vs closed" at icon size — this is an implementation judgment call, not an AC; do not skip the animated transition entirely (AC #3/#4 both say "morphs"). Export from `ui/app/icons/index.ts`.
  - [x] `ui/app/budgets/BudgetsPanel.tsx`: add local `const [showArchived, setShowArchived] = useState(false)` — **do not** persist this in a store/URL param; AC #5 explicitly requires it to reset to OFF on navigate-away/return, and local component state unmounting on route change already gives this for free (no extra reset code needed).
  - [x] Add an `IconButton` with the `BoxIcon` (mirroring `DocsHelpButton`'s `IconButton` usage) to the `useChromeHeader({ trailing: ... })` call — `trailing` currently renders only `<DocsHelpButton .../>`; wrap both in the existing `flex gap-1` trailing container (already how `AppShell.tsx` renders `header.trailing`, no layout change needed there) so the box toggle sits alongside the help icon at the header's trailing (opposite-title) end per AC #1. `aria-pressed={showArchived}` for a11y state; label toggles between "Show archived budgets" / "Show active budgets" (new i18n keys, see Task 5).
  - [x] Wire `showArchived` into the `fetchBudgets` call (re-fetch on toggle change — add `showArchived` to the load effect's dependency array, replacing the current mount-only `[]` deps, or add a second effect keyed on `showArchived` that re-runs `fetchBudgets(messages, { archived: showArchived })` and replaces `budgets` state; keep the one-time membership-lists seeding logic mount-only, don't refetch lists on toggle).
  - [x] Hide `BudgetsCreateForm` (and its `SectionLabel`) when `showArchived` is `true` (AC #3) — conditionally omit that block from `StackedListPanel`'s `input` prop; keep `budgetsHistoryTitle`'s `SectionLabel` regardless (view still needs a list, just archived-only).
  - [x] Empty-state message: when `showArchived` is true and the archived list is empty, the existing `emptyLabel={t.budgetsEmpty}` reads oddly ("No budgets yet." while non-archived ones clearly exist) — add a distinct `t.budgetsArchivedEmpty` key (Task 5) and select between the two based on `showArchived`.

- [x] Task 5: Archive action UI — tile and detail page (AC: #6)
  - [x] `BudgetsPanel.tsx` tile: add an archive/unarchive `IconButton` (or overflow action, project's existing pattern — check `DotsIcon`-driven menus elsewhere, e.g. `ListsPanel.tsx`, before inventing a new interaction) to each tile. Must not trigger the tile's own `<Link>` navigation on click (`event.preventDefault()`/`stopPropagation()`, same nested-interactive-inside-anchor concern already documented in Story 7.4's Dev Notes for `TopProgressBar`). On success, remove the budget from the current view's `budgets` list (optimistic — archiving in the non-archived view or unarchiving in the archived view both mean "no longer belongs in what's currently shown").
  - [x] `ui/app/budgets/[budgetId]/page.tsx` + `BudgetDetailChrome.tsx`: add an archive/unarchive action to the detail page's chrome (owner-only — this page is already owner-scoped end-to-end via `BudgetNotFoundError`-as-404, so no extra ACL check needed client-side). Reuse the same `archiveBudget`/`unarchiveBudget` client calls from Task 3. On success, either update local `budget.is_archived` state to flip the action's own label, or navigate back to `/budgets` — pick whichever reads better once built; not prescribed by the ACs.
  - [x] Add loading/error handling around these actions consistent with existing `useFormSubmission`/inline-error patterns already used in `BudgetsCreateForm.tsx` and `BudgetRulesPanel.tsx` — don't invent a new async-action pattern.

- [x] Task 6: i18n (EN + ES)
  - [x] Add to `ui/lib/i18n/lists.ts` (the file that already owns all `budgets*` keys — confirmed by grep, this domain file covers budgets copy, not a separate `budgets.ts`): `budgetsShowArchived` ("Show archived budgets" / "Mostrar presupuestos archivados"), `budgetsShowActive` ("Show active budgets" / "Mostrar presupuestos activos"), `budgetsArchivedEmpty` ("No archived budgets." / "No hay presupuestos archivados."), `budgetsArchive` ("Archive" / "Archivar"), `budgetsUnarchive` ("Unarchive" / "Desarchivar"), `budgetsArchived` (a small "Archived" badge/label if the detail page or tile needs to indicate state while in the archived view — optional, only add if the UI implementation needs it). Add every new key to **both** the `en` and `es` blocks in the same file (matches this file's existing structure — `en` block ~line 1-260s, `es` block ~line 260s+, exact keys mirrored).

- [x] Task 7: Tests
  - [x] `api/tests/test_budgets_domain.py`: no new pure-domain logic here (archiving is pure persistence + application-layer, no validation function) — skip unless a helper is extracted.
  - [x] `api/tests/test_budgets_application.py`: extend the existing fake `BudgetRepository` test double to support `is_archived`/`archive_budget`/`unarchive_budget`/`archived`-filtered `list_budgets_for_owner`; add cases for `ArchiveBudgetService`/`UnarchiveBudgetService` (owner-only 404-on-deny, mirrors `DeleteBudgetService`'s existing test), and `ListBudgetsService` returning only matching-`archived`-state budgets.
  - [x] `api/tests/test_budgets_integration.py`: end-to-end on real Postgres — create budget, archive it, assert it's absent from default `GET /budgets`, present under `?archived=true`, unarchive, assert it's back to default. Assert archiving preserves `history`/`rules`/assignments (AC #6 "data/history is preserved") — archive a budget with an assigned entry, then fetch its detail directly by id (`GET /budgets/{id}` is unfiltered by archive state — detail-by-id must keep working for an archived budget, only the *list* endpoint filters) and confirm history/rules are unchanged.
  - [x] `ui/app/budgets/budgetsClient.test.ts`: extend `asBudget`/`asBudgetFromWire` fixtures with `is_archived`; add cases for `archiveBudget`/`unarchiveBudget`; add a case proving `fetchBudgets(messages, { archived: true })` requests the `?archived=true` URL.
  - [x] `ui/app/budgets/BudgetsPanel.test.tsx`: cover the toggle's three states (default non-archived + create form visible; toggled-on archived-only + create form hidden; toggle-off returns to default) and the per-tile archive action removing a tile from view on success.
  - [x] New `ui/app/icons/BoxIcon.test.tsx` only if `FileImportMorphIcon`-style animation logic is non-trivial enough to warrant direct testing (check whether `FileImportMorphIcon` itself has a dedicated test file first — if not, don't add one here either, stay consistent). Confirmed `FileImportMorphIcon` has no dedicated test file — skipped for consistency.

## Dev Notes

- **⚠️ Sequencing flag (surface to the human/PO before or during dev-story):** `epics.md`'s Epic 7 header note (line ~2035) says *"7.6 (archive) should land after 7.5 (period range) since both touch the budget update form."* As of this story's creation, **Story 7.5 (`budget-period-range`) has not been created yet** — it's still `backlog` in `sprint-status.yaml`, no story file exists. This story's design (Task 2) deliberately does **not** touch `UpdateBudgetBody`/`PATCH /budgets/{budget_id}` at all — archiving is implemented as two new standalone `POST .../archive` / `.../unarchive` endpoints instead, specifically to avoid the collision the epics note warns about. If Story 7.5 lands first and *does* modify the update form/`UpdateBudgetBody` shape, this story's Task 2 additions (new fields on `BudgetView`/`BudgetResponse`, new routes) should not conflict, since none of it touches the `PATCH` body. If you (the dev agent or reviewer) determine mid-implementation that the two stories *do* collide in a way not anticipated here, stop and flag it — don't silently reconcile.
- **This is primarily a full-stack story** (DB column + application services + routes + UI), unlike 7.2-7.4 which were UI-only or API-only. Follow the existing `DeleteBudgetService`/`delete_budget` route as the closest precedent for a simple owner-scoped single-budget action with no request body.
- **AD-30 (owner-only ACL, 404-not-403)** applies identically here: archiving/unarchiving someone else's budget, or a nonexistent one, must 404 via `BudgetNotFoundError` — no new 403 path. `_get_owned_budget` already encodes this; reuse it, don't write a parallel check.
- **`GET /budgets/{budget_id}` (detail) must stay unfiltered by archive state.** Only the list endpoint (`GET /budgets`) filters. An archived budget must still be fully viewable/manageable at its detail URL (that's exactly where AC #6's unarchive action lives) — do not add an `is_archived` check to `GetBudgetDetailService`/`_get_owned_budget`.
- **Chrome/header mechanism is already generic and proven** (Story 7.4 built exactly this kind of "opt-in trailing content" extensibility into `ChromeHeaderConfig`/`AppShell.tsx`) — `trailing` already accepts arbitrary `ReactNode`, so adding a second icon button next to `DocsHelpButton` requires zero changes to `ChromeBack.tsx`/`AppShell.tsx`, only to `BudgetsPanel.tsx`'s own `useChromeHeader` call. Do not add a new `ChromeHeaderConfig` field for this.
- **No existing "box" icon.** Closest is `FolderIcon` (used for the budgets nav-rail entry itself — do not reuse that one here, it would be visually confusing to show the same glyph as both the nav icon and the archive toggle). Build a new `BoxIcon`. `FileImportMorphIcon.tsx` is the codebase's one existing precedent for an animated two-state icon driven by an `active` prop and is the pattern to imitate for the "morphs" language in AC #3/#4 — read it fully before implementing, including its comment about why the animation is done via JS `d`-attribute interpolation rather than CSS (Safari does not support animating the SVG `d` property).
- **`useMasonryColumns`/`useIsScreenAtLeast` and the whole masonry-column layout in `BudgetsPanel.tsx` are unaffected** — they operate on whatever `budgets` array is currently in state, so swapping between non-archived/archived arrays on toggle "just works" through the existing layout code. No changes needed there.
- **Toggle reset on navigate-away (AC #5) is free** — `showArchived` as local `useState` in `BudgetsPanel` (a client component mounted only while `/budgets` is the active route) naturally resets because the component unmounts. Do not reach for `sessionStorage`/URL query params/a global store for this — that would make AC #5 harder to satisfy, not easier, since those would need explicit clearing logic instead of relying on unmount.
- **Money/state formatting unchanged** — archiving doesn't touch `spent`/`cap`/`state` computation (`_compute_spent_and_history`, `classify_budget_state`); an archived budget still computes and displays these identically wherever it's shown.
- **Filtering approach:** query-param filtering on the existing `GET /budgets` list endpoint (not a separate `GET /budgets/archived` endpoint) was chosen to keep one list endpoint with one response shape, consistent with how the rest of this router already works (no other list-shaped endpoint here has a second URL for a filtered variant).
- **Don't add archiving for lists or cards** — AC #7 and the Epic 7 header's explicit deferred-note are unambiguous: out of scope, no FR, no story. Resist any temptation to generalize the `BoxIcon`/toggle pattern into a shared component beyond what this story needs; a future correct-course explicitly owns that decision per the epics note.

### Project Structure Notes

- New: `api/adapters/persistence/migrations/versions/0036_budget_archived.py`, `ui/app/icons/BoxIcon.tsx`, `ui/app/api/budgets/[budgetId]/archive/route.ts`, `ui/app/api/budgets/[budgetId]/unarchive/route.ts`.
- Modified (API): `api/adapters/persistence/models.py` (`BudgetModel.is_archived`), `api/adapters/persistence/budgets.py` (`archive_budget`/`unarchive_budget`, `list_budgets_for_owner` gains `archived` param), `api/application/budgets.py` (`BudgetRecord.is_archived`, `BudgetView.is_archived`, `BudgetDetailView.is_archived`, `ArchiveBudgetCommand`/`Service`, `UnarchiveBudgetCommand`/`Service`, `ListBudgetsCommand.archived`), `api/api/routes/budgets.py` (two new routes, `archived` query param on list, `is_archived` in response builders), `api/api/schemas/budgets.py` (`is_archived` on `BudgetResponse`/`BudgetDetailResponse`).
- Modified (UI): `ui/app/budgets/budgetsClient.ts` (`is_archived`, `fetchBudgets` archived param, `archiveBudget`/`unarchiveBudget`), `ui/app/budgets/BudgetsPanel.tsx` (toggle state, trailing icon, conditional create-form, per-tile archive action), `ui/app/budgets/[budgetId]/page.tsx` + `BudgetDetailChrome.tsx` (detail-page archive/unarchive action), `ui/app/api/budgets/route.ts` (forward `archived` query param), `ui/app/icons/index.ts` (export `BoxIcon`), `ui/lib/i18n/lists.ts` (new keys, EN+ES).
- Test files modified/added per Task 7 above.
- No changes anticipated to `BudgetAssignPanel.tsx`, `BudgetRulesPanel.tsx`, `budgetDetailClient.ts` (assignment/rules flows untouched by archiving), or any non-budgets route/component.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md#Story 7.6`, lines 2203-2247] — this story's ACs verbatim
- [Source: `_bmad-output/planning-artifacts/epics.md#Epic 7` header, lines 2033-2041] — sequencing note re: Story 7.5, deferred lists/cards archiving note
- [Source: `_bmad-output/project-context.md`] — AD-30 owner-only ACL / 404-not-403 pattern; money-as-Decimal/string; Alembic-only schema changes; i18n per-domain TS object convention; no barrel-file component imports
- [Source: `api/api/routes/budgets.py` `delete_budget`, lines 305-317] — closest precedent for a simple owner-scoped single-budget action route
- [Source: `api/application/budgets.py` `DeleteBudgetService`, `_get_owned_budget`, lines 213-224, 379-385] — 404-on-deny pattern to mirror for `ArchiveBudgetService`/`UnarchiveBudgetService`
- [Source: `api/adapters/persistence/migrations/versions/0035_budgets_standalone_entity.py`] — most recent budgets migration, model the new one's structure/docstring after it (current Alembic head as of this story's creation — re-verify before setting `down_revision`)
- [Source: `ui/components/ChromeBack.tsx` `ChromeHeaderConfig`, `useChromeHeader`] — generic trailing-content mechanism already supporting multiple trailing elements, no changes needed here
- [Source: `ui/components/AppShell.tsx`, trailing render, lines ~89-91] — confirms `header.trailing` already renders as a `flex gap-1` container, ready for a second icon button
- [Source: `ui/app/docs/DocsHelpButton.tsx`] — pattern to mirror for a new icon-only header `IconButton`
- [Source: `ui/app/icons/FileImportMorphIcon.tsx`] — this codebase's only existing animated two-state icon; pattern and Safari-`d`-attribute rationale to follow for `BoxIcon`'s "morph"
- [Source: `ui/app/budgets/BudgetsPanel.tsx`] — full current tile/list markup this story extends (masonry layout, `useChromeHeader` call, `fetchBudgets` load effect)
- [Source: `ui/app/budgets/budgetsClient.ts`] — `BudgetItem`, `asBudget`/`asBudgetFromWire` defensive parsing, `fetchBudgets`/`createBudget` client shape to extend
- [Source: `ui/app/api/budgets/route.ts`, `ui/app/api/budgets/[budgetId]/route.ts`] — existing BFF proxy pattern (`forwardCookie`, passthrough status/body, 502-on-fetch-failure) to replicate for the two new archive/unarchive proxy routes
- [Source: `ui/lib/i18n/lists.ts`, `budgets*` keys, EN block ~127-163, ES block ~290-326] — the domain file all budgets copy already lives in; add new keys here, not a new file
- [Source: `_bmad-output/implementation-artifacts/7-4-budget-progress-bar-visualization.md`, Dev Notes] — nested-interactive-inside-`<Link>` a11y handling precedent (relevant to Task 5's per-tile archive button), component-folder/test-file conventions, "investigate before assuming a backend gap" discipline
- [Source: `api/tests/test_budgets_application.py`] — existing fake `BudgetRepository` test double to extend for archive/unarchive coverage
- [Source: `api/tests/test_budgets_integration.py`] — existing Postgres-integration test file/fixtures to extend

## Dev Agent Record

### Agent Model Used

claude-sonnet-5

### Debug Log References

### Completion Notes List

- Migration `0036_budget_archived` adds `budgets.is_archived boolean NOT NULL DEFAULT false`, chained off `0035_budgets_standalone_entity` (confirmed still current head).
- `list_budgets_for_owner` gained an `archived: bool = False` keyword-only filter param; both call sites (`ListBudgetsService`, `UpdateBudgetService`'s sibling-name-uniqueness check) updated — the uniqueness check now queries both archived and non-archived siblings so archiving never frees up a name (covered by `test_archiving_does_not_free_up_name_for_reuse`).
- `ArchiveBudgetService`/`UnarchiveBudgetService` mirror `DeleteBudgetService`'s owner-only, 404-on-deny shape; new `POST /budgets/{id}/archive` and `POST /budgets/{id}/unarchive` routes return the full `BudgetResponse` rather than overloading `PATCH`.
- `GET /budgets/{id}` (detail) stays unfiltered by archive state per Dev Notes — verified with `test_archive_preserves_history_and_rules_detail_unfiltered`.
- `BoxIcon` uses a CSS `transform`-based lid rotation (the simpler, explicitly-permitted alternative to `FileImportMorphIcon`'s JS `d`-attribute interpolation), with `prefers-reduced-motion` handled via a media query in `globals.css` rather than JS, since there's no path geometry to interpolate.
- `showArchived` is local `useState` in `BudgetsPanel` (not persisted) so AC #5's reset-on-navigate-away is free via unmount, per Dev Notes.
- Detail-page archive/unarchive action lives in a new client component `ArchiveBudgetButton.tsx`, wired into `BudgetDetailChrome`'s trailing icons alongside `DocsHelpButton`; on success it calls `router.refresh()` to reflect the new state via the server component re-fetch.
- No `BoxIcon.test.tsx` added — confirmed `FileImportMorphIcon` (the pattern it follows) has no dedicated test file either, so skipped for consistency per Task 7's own instruction.
- Full regression: API suite 993 passed; UI suite 713 passed / 20 pre-existing failures (Tooltip/IconButton/TopProgressBar/TriSwitch/soft-ledger/SimplifyColumn tests) confirmed unrelated to this story — they fail identically in isolation on the pre-existing baseline and touch no budgets code.

### File List

**New:**
- `api/adapters/persistence/migrations/versions/0036_budget_archived.py`
- `ui/app/icons/BoxIcon.tsx`
- `ui/app/api/budgets/[budgetId]/archive/route.ts`
- `ui/app/api/budgets/[budgetId]/unarchive/route.ts`
- `ui/app/budgets/[budgetId]/ArchiveBudgetButton.tsx`

**Modified (API):**
- `api/adapters/persistence/models.py`
- `api/adapters/persistence/budgets.py`
- `api/application/budgets.py`
- `api/api/routes/budgets.py`
- `api/api/schemas/budgets.py`
- `api/tests/test_budgets_application.py`
- `api/tests/test_budgets_integration.py`

**Modified (UI):**
- `ui/app/budgets/budgetsClient.ts`
- `ui/app/budgets/budgetsClient.test.ts`
- `ui/app/budgets/BudgetsPanel.tsx`
- `ui/app/budgets/BudgetsPanel.test.tsx`
- `ui/app/budgets/BudgetsCreateForm.test.tsx`
- `ui/app/budgets/[budgetId]/BudgetDetailChrome.tsx`
- `ui/app/budgets/[budgetId]/BudgetDetailChrome.test.tsx`
- `ui/app/budgets/[budgetId]/page.tsx`
- `ui/app/budgets/[budgetId]/page.budgetDetail.test.ts`
- `ui/app/api/budgets/route.ts`
- `ui/app/icons/index.ts`
- `ui/app/globals.css`
- `ui/lib/i18n/lists.ts`

## Change Log

| Date | Change |
| --- | --- |
| 2026-09-04 | Implemented Story 7.6: archive/unarchive budgets with box-icon toggle on `/budgets`, filtered listing, and detail-page action. |
