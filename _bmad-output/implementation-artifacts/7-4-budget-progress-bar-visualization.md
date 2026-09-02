# Story 7.4: Budget progress-bar visualization

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a budget owner,
I want the budget's cap progress shown as a thin bar instead of a colored circle — on the tile's top border in the budgets list, and as a full-width bar at the very top of the budget detail page — with a hover/focus tooltip showing current/total,
so that I can read near-cap state at a glance, and the app gets a reusable top-of-page progress affordance for future use (e.g. import progress, CSV export).

## Acceptance Criteria

1. **Given** `BudgetsPanel.tsx` renders a budget tile, **when** it shows spend against the cap, **then** the colored circle is replaced by a thin progress bar along the top border of the tile card, using the same severity colors (near-cap/over-cap) as today. [Source: epics.md#Story 7.4]
2. **Given** a user hovers (or focuses, for keyboard/a11y) a tile's top-border bar, **when** the pointer/focus rests on it, **then** a tooltip shows "current/total" formatted in the budget's currency.
3. **Given** `/budgets/[budgetId]/page.tsx`, **when** the page renders, **then** a full-width progress bar spans the very top of the page (above `BudgetDetailChrome`), reflecting this budget's cap usage with the same severity coloring, and is reachable/focusable for the same current/total tooltip.
4. **Given** this top-of-page bar is introduced, **when** it's implemented, **then** it's built as a generic, reusable component (e.g. `TopProgressBar`) parameterized by ratio/color/tooltip — not hardcoded to budgets — so a later story can reuse it for import/export progress without rework.
5. **Given** the previous bottom-of-card placement idea, **when** this story lands, **then** no bottom-of-card bar is added — the cap card on detail keeps its existing content, only the page-top bar communicates progress.
6. **Given** the budget detail page, **when** the source-list chips render, **then** they appear below the cap card (not beside or above it).

## Tasks / Subtasks

- [x] Task 1: Build the reusable `TopProgressBar` component (AC: #4)
  - [x] Create `ui/components/TopProgressBar/TopProgressBar.tsx` — a thin (`~3px`), full-width bar. Props: `ratio: number | null` (0-100+, clamp fill width to `Math.min(ratio, 100)`), `colorClassName: string` (caller supplies the severity class, e.g. `bg-owed`/`bg-warn`/`bg-owe`/`bg-muted` — keep the component itself severity-agnostic per AC #4's "not hardcoded to budgets"), `tooltipLabel: string` (pre-formatted text, e.g. `"$45.00 / $100.00"` — component does not know about currency/money formatting, caller does), and `ariaLabel: string` for the non-tooltip accessible name.
  - [x] Render as a focusable element (`tabIndex={0}`, `role="progressbar"`, `aria-valuenow`/`aria-valuemin={0}`/`aria-valuemax={100}` when ratio is a number, omitted when `ratio` is `null`) wrapped in the existing `Tooltip` component (`@/components/Tooltip`) with `label={tooltipLabel}`. Reuse `Tooltip` as-is — it already clones a single focusable/hoverable child and portals the bubble (see `ui/components/Tooltip/Tooltip.tsx`); do not build a second tooltip mechanism.
  - [x] Structure: an outer track `div` (full width, thin height, `bg-border` or similar neutral background for the unfilled portion) containing an inner filled `div` sized `width: ${clampedRatio}%` with the caller's color class and a smooth `transition-[width]` (nice-to-have, not an AC).
  - [x] Add `ui/components/TopProgressBar/index.ts` re-exporting the component (matches `Tooltip`/`Chip`/`IconButton` folder convention — component + `index.ts`, imported via `@/components/TopProgressBar`, no barrel file per project-context.md's "no `ui/components/index.ts`" rule).
  - [x] Add `ui/components/TopProgressBar/TopProgressBar.test.tsx` (own file, following the `Tooltip`/`IconButton` per-component-folder test convention — this is a generic `ui/components/` atom, not a Soft-Ledger primitive, so it does **not** go in `soft-ledger.test.tsx`). Cover: renders filled width proportional to ratio; clamps ratio > 100 to 100% fill width; `ratio === null` renders with no `aria-valuenow` and (if you choose) a muted/empty fill; tooltip text appears on hover and on keyboard focus (mirror `Tooltip.test.tsx`'s existing hover/focus assertions).

- [x] Task 2: Replace the colored dot in `BudgetsPanel.tsx` with a top-border `TopProgressBar` (AC: #1, #2)
  - [x] In `ui/app/budgets/BudgetsPanel.tsx`, remove the `usageDotClass` span (lines ~254-258, the `role="img"` colored dot) and its containing flex-between wrapper for the name row — the name row becomes just the truncated name.
  - [x] Add a `TopProgressBar` positioned along the tile card's top border. Since the tile is a `<Link>` with `rounded-[8px] border border-border`, the simplest correct placement is to make the `<Link>` a positioning context (`relative`) and absolutely position the bar at `top-0 left-0 right-0` with a border-radius matching the card's top corners (`rounded-t-[8px]`) so it visually sits "along the top border" rather than the browser's default border painting.
  - [x] Keep computing `ratio` via the existing `budgetUsageRatio(budget)` helper (already imported) and keep the existing three-tier severity mapping (`ratio < 70` → `bg-owed`, `70 <= ratio <= 90` → `bg-warn`, `ratio > 90` → `bg-owe`, `null` → `bg-muted`) — do not invent new thresholds, this exact mapping is what AC #1 means by "same severity colors ... as today".
  - [x] Tooltip label: `${formatMoneyAmount(budget.spent, budget.currency)} / ${formatMoneyAmount(budget.cap, budget.currency)}` (identical format to the existing spent/cap line already rendered lower in the card at lines 260-263 — reuse, don't reformat differently).
  - [x] `ariaLabel` for the bar: reuse `budgetStateLabel(budget.state, t)` (same value the removed dot used) so the accessible name doesn't regress.
  - [x] Verify the bar sits *outside* the `<Link>`'s click-target semantics correctly — since `tabIndex={0}` on the bar plus the `<Link>` itself both being focusable/tabbable is intentional here (the bar needs independent keyboard focus for its own tooltip per AC #2), confirm this doesn't produce duplicate-announcement a11y issues worse than the existing dot's `role="img"` pattern; a nested interactive element inside an anchor is unusual but matches the story's explicit "reachable/focusable" requirement — if you find a cleaner pattern (e.g. `event.stopPropagation()` on the bar's own focus so the anchor's focus ring doesn't also show) apply it, but do not drop keyboard-focusability to sidestep the nesting.

- [x] Task 3: Add the full-width bar to the budget detail page (AC: #3, #5, #6)
  - [x] In `ui/app/budgets/[budgetId]/page.tsx`, add a `TopProgressBar` rendered **above** `<BudgetDetailChrome title={budget.name} />` (line 206) — i.e. the very first element inside the `budgetNotFound`/`loadError` success branch, spanning full page width (no `mx-strip-inset`/`px-[var(--page-gutter)]` inset — this bar should bleed edge-to-edge at the very top, unlike the rest of the page's inset content).
  - [x] Compute `ratio` for the detail page using the same `budgetUsageRatio` helper (import it from `../budgetsClient`) — do not invent a second ratio calculation; detail page's `budget` object has the same `spent`/`cap` shape as `BudgetItem`.
  - [x] Reuse the exact same three-tier severity → color-class mapping from Task 2 (extract it as a small shared helper if you want to avoid duplicating the ternary in two files — e.g. add `budgetSeverityColorClass(ratio: number | null): string` to `budgetsClient.ts` alongside `budgetUsageRatio`/`budgetStateLabel`; not required by the ACs but avoids drift between list and detail if thresholds ever change).
  - [x] Same tooltip-label convention as Task 2: `${formatMoneyAmount(budget.spent, budget.currency)} / ${formatMoneyAmount(budget.cap, budget.currency)}`.
  - [x] **AC #5 — do not touch the cap card's existing content** (lines 207-218, the `SectionLabel`/state-label/spent-cap `<section>`) beyond what's needed for AC #6 below. No second bar, no bottom-of-card bar.
  - [x] **AC #6 — add source-list chips below the cap card.** These do not currently exist on the detail page at all (confirmed: `budget.source_list_ids` is parsed by `asBudgetDetail` but never rendered in `page.tsx` today — this is new markup, not a relocation). **Confirmed:** `api/api/schemas/budgets.py`'s `BudgetDetailResponse.source_lists` is `list[UUID]` — ids only, no names. No backend change needed and none should be made (stay UI-only): resolve names by fetching the lists the current user belongs to server-side. `ui/app/lists/listsClient.ts`'s `fetchLists()` is a client-side `fetch("/api/lists", ...)` call meant for browser use (relative URL, no cookie-forwarding) — do not call it directly from the server component. Instead, add a second internal fetch in `page.tsx` alongside the existing budget-detail fetch, using the exact same pattern already in this file: `getApiInternalUrl()` + `cookieHeader()` (see lines 154-173), hitting whatever internal route/service backs `GET /api/lists` (check `ui/app/api/lists/route.ts` for the upstream path it proxies to, e.g. `${getApiInternalUrl()}/lists`), then match `source_list_ids` against the returned lists by id, rendering `<Chip tone="muted">{list.name}</Chip>` per match and silently skipping unmatched/stale ids (mirrors `BudgetsPanel.tsx`'s existing `if (!list) return null;` defensive behavior — same rationale: a source list the user left or that was deleted shouldn't crash the page).

- [x] Task 4: Update existing tests for removed/changed markup
  - [x] `ui/app/budgets/BudgetsPanel.test.tsx`: update/remove any assertion tied to the old dot markup (`role="img"` colored dot) if present; add coverage that the tile renders a `TopProgressBar`-driven element with the expected `aria-label` per severity tier (ok/near/over — check existing fixtures' `state`/`spent`/`cap` values, or add fixtures covering all three tiers if not already present).
  - [x] `ui/app/budgets/[budgetId]/page.budgetDetail.test.ts`: if you extract `budgetSeverityColorClass` or similar pure helper, unit-test it directly (this file's established pattern — pure functions extracted from the server component, since `page.tsx` itself is never rendered directly in tests per project-context.md).
  - [x] If Task 3 required fetching lists server-side, add a case (or extend an existing one) proving unmatched/missing list ids are skipped defensively (mirrors `BudgetsPanel`'s existing `if (!list) return null;` behavior) — no crash on a stale/deleted source list id.

## Dev Notes

- **This is a UI-only story** — same framing as 7.2/7.3. No backend `spent`/`cap`/`state`/ratio logic changes; `budgetUsageRatio` and `budgetStateLabel` in `budgetsClient.ts` already compute everything needed. The only possible backend touch is Task 3's source-list-name resolution (investigate before assuming a backend change is needed — see Task 3's last subtask).
- **The "colored circle" in the epic's wording is this codebase's existing colored *dot*** — a `10px` `rounded-full` `<span role="img">` in `BudgetsPanel.tsx` (lines 254-258), not an SVG circle or ring. AC #1 replaces this dot with the new top-border bar. There is no circle component anywhere in the codebase to search for — don't waste time looking for one.
- **Existing severity mapping to preserve exactly** (from `BudgetsPanel.tsx`, computed via `budgetUsageRatio`): `ratio === null` → `bg-muted`; `ratio < 70` → `bg-owed`; `70 <= ratio <= 90` → `bg-warn`; `ratio > 90` → `bg-owe`. Note this is a *different* two-tier scheme from what the detail page's cap card currently shows (`budget.state === "ok" ? "text-muted" : "text-owe font-semibold"`, collapsing "near" and "over" into one visual treatment) — this pre-existing inconsistency between list-tile and detail-page severity granularity is not in scope to fix; the new bars on both surfaces should use the three-tier ratio-based mapping (matching AC #1's "same severity colors ... as today", i.e. today's list-tile colors), independent of the cap card's separate two-tier text styling which this story does not touch.
- **`Tooltip` component is a drop-in fit, already proven** (used elsewhere for header icon buttons) — it clones its single child, attaches hover/focus-visible handlers, and portals a bubble positioned from `getBoundingClientRect()`; it already flips above/below near the viewport top (relevant here since the detail-page bar sits at the very top of the page — verify the "flip below" threshold logic (`TOP_FLIP_THRESHOLD_PX = 48`) actually triggers for this bar's position so the tooltip doesn't render off-screen above the viewport).
- **Component-folder convention**: `TopProgressBar` goes in its own `ui/components/TopProgressBar/` folder (`TopProgressBar.tsx` + `index.ts`, imported as `@/components/TopProgressBar`), matching `Tooltip/`, `Chip/`, `IconButton/` — **not** `ui/components/soft-ledger/`, which is reserved for the Soft-Ledger design-system primitives family (`BalanceStrip`, `Hint`, etc.) and shares one aggregate test file (`soft-ledger.test.tsx`). `TopProgressBar` is a generic reusable atom (per AC #4, meant for future import/export reuse too) — give it its own test file like `Tooltip.test.tsx`/`IconButton.test.tsx` do.
- **Money/formatting conventions unchanged**: `formatMoneyAmount` from `@/lib/currency`, same as every other money display in this codebase. Ratios are plain numbers (0-100+), not `Decimal`/string — `budgetUsageRatio` already returns `number | null`.
- **No new i18n keys anticipated** — the tooltip content is data (formatted money), not translatable copy; `budgetStateLabel`/`t` messages already used for `ariaLabel` are pre-existing keys. If you find you need a static string (e.g. a fallback aria-label when `ratio` is `null`), check `ui/lib/i18n/lists.ts` for an existing key before adding a new one.
- **No pill/kit-default styling** — per project-context.md's "no pill primary CTAs / kit-unstyled-primitives-only" rule, keep the bar a plain two-`div` track+fill structure with Tailwind utility classes, no third-party progress-bar library.

### Project Structure Notes

- New: `ui/components/TopProgressBar/TopProgressBar.tsx`, `ui/components/TopProgressBar/index.ts`, `ui/components/TopProgressBar/TopProgressBar.test.tsx`.
- Modified: `ui/app/budgets/BudgetsPanel.tsx` (dot → top-border bar), `ui/app/budgets/BudgetsPanel.test.tsx`, `ui/app/budgets/[budgetId]/page.tsx` (add top-of-page bar above `BudgetDetailChrome`, add source-list chips below cap card), `ui/app/budgets/[budgetId]/page.budgetDetail.test.ts` (if a pure helper is extracted).
- Possibly modified (only if Task 3 investigation finds it's needed): `ui/app/budgets/budgetsClient.ts` (optional shared `budgetSeverityColorClass` helper), `api/api/schemas/budgets.py`/`api/application/budgets.py` (only if `source_lists` doesn't already carry names — investigate first, this should be UI-only).
- No changes anticipated to `BudgetDetailChrome.tsx`, `BudgetAssignPanel.tsx`, `BudgetRulesPanel.tsx`, `UnassignButton.tsx`, or any BFF route — this story doesn't touch attribution/assignment flows.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md#Story 7.4` lines 2111-2156] — this story's ACs verbatim
- [Source: `_bmad-output/planning-artifacts/epics.md#Epic 7` lines 2014-2041] — epic framing, FR-48 amendment, sequencing note ("7.4 is independent UI-only and can parallelize with 7.5/7.6 prep")
- [Source: `_bmad-output/planning-artifacts/sprint-change-proposal-2026-09-02.md` §4.3] — origin of this story's exact text and rationale (progress bar > colored circle, reusable `TopProgressBar` for future import/export use)
- [Source: `ui/app/budgets/BudgetsPanel.tsx` lines 232-278] — the tile markup this story modifies: `usageDotClass` severity mapping (lines 234-241), the dot span to remove (254-258), spent/cap line to mirror in the tooltip label (260-263), source-list chips pattern to reuse in Task 3 (264-274)
- [Source: `ui/app/budgets/budgetsClient.ts` `budgetUsageRatio`, `budgetStateLabel`] — existing helpers this story reuses unchanged; `BudgetItem` type shape
- [Source: `ui/app/budgets/[budgetId]/page.tsx` lines 198-219] — the detail page's success-branch markup this story modifies: where the new top bar goes (above line 206's `BudgetDetailChrome`), the cap card to leave alone (207-218) except for adding chips below it
- [Source: `ui/components/Tooltip/Tooltip.tsx`] — the tooltip mechanism `TopProgressBar` wraps its trigger with; hover/focus-visible dual-tracking, portal-to-body, above/below flip logic (`TOP_FLIP_THRESHOLD_PX`)
- [Source: `ui/components/Chip/Chip.tsx`] — the chip component Task 3's source-list chips reuse (`tone="muted"` per existing `BudgetsPanel` usage)
- [Source: `ui/app/lists/listsClient.ts` `fetchLists`] — existing lists-fetch client, referenced if Task 3 needs a server-side lists fetch
- [Source: `_bmad-output/implementation-artifacts/7-3-cross-list-attribution-rule-badge.md` Dev Notes] — established precedent for this codebase's "UI-only story, investigate backend before assuming a gap" discipline and the "pure function extracted for testing, server component never rendered directly" pattern this story's Task 4 follows
- [Source: `_bmad-output/project-context.md` lines 148-151] — component location/testing conventions (Soft-Ledger vs. generic `ui/components/` atoms, no barrel file, dark mode via CSS variables not duplicated rule blocks)
- [Source: `_bmad-output/project-context.md`] — money-as-string-at-wire-boundary, i18n per-domain object convention, kit-unstyled-primitives / no pill CTAs

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- Worktree lite stack's `ui/node_modules` volume is mounted read-only (see `docker-compose.worktree-lite.yml`); `vitest run` fails with `ENOENT .../.vite-temp` because Vite bundles its config next to `node_modules`. Worked around per-session by pointing `vitest --config` at a copy of `vitest.config.mts` placed under `/tmp` (a writable path) with `vitest`/`vite`/`esbuild`/`rollup` symlinked into a real `/tmp/node_modules` dir alongside it — no repo files changed, this only affects how tests are invoked in this lite worktree.

### Completion Notes List

- Built `ui/components/TopProgressBar` as a generic, severity-agnostic atom (ratio/color/tooltip/ariaLabel props) reusing the existing `Tooltip` component; added its own test file per the `Tooltip`/`IconButton` per-component-folder convention.
- Replaced `BudgetsPanel.tsx`'s colored dot with an absolutely-positioned `TopProgressBar` along the tile's top border, preserving the exact three-tier severity mapping (now extracted as `budgetSeverityColorClass` in `budgetsClient.ts` so list-tile and detail-page bars can't drift) and the dot's prior `aria-label`.
- Added a full-width `TopProgressBar` above `BudgetDetailChrome` on `/budgets/[budgetId]/page.tsx`, bleeding edge-to-edge (outside the page's `--page-gutter` inset), and left the cap card's existing content untouched (AC #5).
- Added source-list chips below the cap card (AC #6): investigated first per Dev Notes — confirmed `BudgetDetailResponse.source_lists` is ids-only, so resolved list names via a second server-side fetch to `${getApiInternalUrl()}/lists` (same `cookieHeader()`/`getApiInternalUrl()` pattern already used for the budget-detail fetch), matching ids through a new pure `resolveSourceListChips` helper that silently drops unmatched/stale ids.
- Updated `BudgetsPanel.test.tsx` with a case-per-severity-tier check on the new `role="progressbar"` element's `aria-label`; extended `page.budgetDetail.test.ts` with `resolveSourceListChips` unit tests (match, stale-id skip, empty).
- Full `ui` test suite (92 files / 690 tests), `tsc --noEmit`, and `eslint` all pass with no regressions.
- **Follow-up (user feedback):** the detail-page top bar was initially rendered as the first child of `page.tsx`'s scrollable `<main>`, so it scrolled away with the rest of the content instead of staying visible. Fixed by threading it through the existing chrome-header mechanism instead: added an optional `progressBar?: ReactNode` field to `ChromeHeaderConfig` (`ChromeBack.tsx`), rendered by `AppShellFrame` (`AppShell.tsx`) as a `shrink-0` strip *above* the header row but still inside the shell's fixed, non-scrolling column (siblings of the `overflow-y-auto` children container) — so it now behaves like the rest of AppShell's persistent chrome and stays pinned regardless of page scroll. `BudgetDetailChrome` gained a `progressBar` prop it forwards to `useChromeHeader`; `page.tsx` now passes the `TopProgressBar` through `BudgetDetailChrome` instead of rendering it inline. Added `AppShell.test.tsx` coverage asserting the opted-in `progressBar` renders outside `.overflow-y-auto` and is absent when not opted in. This mechanism is intentionally generic (any screen can opt in via `useChromeHeader({ progressBar: ... })`), matching AC #4's "reusable for future use" intent one level up.

### File List

- `ui/components/TopProgressBar/TopProgressBar.tsx` (new)
- `ui/components/TopProgressBar/index.ts` (new)
- `ui/components/TopProgressBar/TopProgressBar.test.tsx` (new)
- `ui/app/budgets/BudgetsPanel.tsx` (modified — dot → top-border `TopProgressBar`)
- `ui/app/budgets/BudgetsPanel.test.tsx` (modified — severity-tier `aria-label` coverage)
- `ui/app/budgets/budgetsClient.ts` (modified — added `budgetSeverityColorClass`)
- `ui/app/budgets/[budgetId]/page.tsx` (modified — top-of-page bar via chrome, source-list chips, `resolveSourceListChips`)
- `ui/app/budgets/[budgetId]/page.budgetDetail.test.ts` (modified — `resolveSourceListChips` coverage)
- `ui/app/budgets/[budgetId]/BudgetDetailChrome.tsx` (modified — added `progressBar` prop)
- `ui/components/ChromeBack.tsx` (modified — added `progressBar` to `ChromeHeaderConfig`/`useChromeHeader`)
- `ui/components/AppShell.tsx` (modified — renders `header.progressBar` as a fixed, non-scrolling strip above the header row)
- `ui/components/AppShell.test.tsx` (modified — coverage for the `progressBar` strip)

## Change Log

- 2026-09-02: Implemented Story 7.4 — `TopProgressBar` component, budgets-list tile top-border bar, budget-detail full-width top bar, source-list chips on detail page. All tasks complete, full test suite green.
- 2026-09-02: Fixed the detail-page top bar to AppShell's chrome (via a new `progressBar` field on `ChromeHeaderConfig`) so it stays visible while the page scrolls, instead of scrolling away as part of page content.
