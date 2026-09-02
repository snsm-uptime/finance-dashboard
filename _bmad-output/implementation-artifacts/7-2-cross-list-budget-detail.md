---
baseline_commit: 5623a79
---

# Story 7.2: Cross-list budget detail

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a budget owner,
I want a budget detail page with related transactions pulled from all its source lists,
so that I can see what counted toward a cap.

## Acceptance Criteria

1. **Given** a budget with two or more source lists **When** I open its detail **Then** I see the cap and a single newest-first history merged across all source lists (FR-48).
2. **Given** a budget's source-list selection changes (list added/removed) **When** I reopen its detail **Then** history and spend reflect the current source-list set only — no stale/cached result from a prior fetch.
3. **Given** a budget I do not own (or a nonexistent budget id) **When** I open its detail route or call `GET /budgets/{budget_id}` directly **Then** it 404s with `budget_not_found` — same shape either way, per AD-30 (already enforced by `GetBudgetDetailService`, Story 7.1; this story's UI must render that 404 as a normal page state, not crash).
4. **Given** CI **When** this story is tested **Then**: an API integration test proves `GET /budgets/{budget_id}` merges and newest-first-sorts history across ≥2 source lists (no existing test covers >1 source list on this endpoint); an API integration test proves detail reflects the *current* `budget_source_lists` rows on every call (add a row, refetch, see it added; remove a row, refetch, see it gone — no caching) covering AC #2; a UI test covers the detail page's happy path (cap/spent/state + history rendered), the budget-not-found state, and the budget tile on `/budgets` linking to `/budgets/{id}`.

## Tasks / Subtasks

- [x] **Task 1 — Close the backend test gap** (AC #1, #2, #4)
  - [x] `api/tests/test_budgets_integration.py`: add `test_get_budget_detail_merges_history_across_source_lists` — create a budget with 2 source lists (reuse the `create_budget` helper already in this file with `source_list_ids=[list_a, list_b]`), commit a CRC ledger entry in each list, assign both to the budget (via existing `assign_budget_entry` helper/route), `GET /budgets/{id}`, assert `history` contains both entries ordered newest-first by `posted_date` (use distinct dates to make order unambiguous) and `spent` sums both.
  - [x] Add `test_get_budget_detail_reflects_current_source_list_set` — create a budget with source lists `[list_a]`, commit+assign an entry in `list_b` is impossible yet (not a source list), so instead: directly manipulate `budget_source_lists` via the test DB session (insert a row adding `list_b`, or delete the row for `list_a`) between two `GET /budgets/{id}` calls, and assert the second response's `source_lists` and `history`/`spent` reflect the new set, not the first call's. This is the only way to exercise AC #2 — there is no source-list-edit endpoint in this epic (7.1/7.2/7.3 epics.md do not add one); do not build one, this test manipulates the join table directly to prove the read has no caching layer.
  - [x] No production code changes are expected for Task 1 — `GetBudgetDetailService`/`_compute_spent_and_history` (built in Story 7.1) already query `list_ledger_entries_for_lists(record.source_list_ids)` fresh on every call with no memoization. If either new test fails, that is a real regression to fix, not a test-authoring mistake — investigate before assuming the test is wrong.

- [x] **Task 2 — UI: `/budgets/{budgetId}` detail page** (AC #1, #3)
  - [x] New `ui/app/budgets/[budgetId]/page.tsx` — server component, same auth/redirect/alias-gate shape as `ui/app/budgets/page.tsx` (`fetchSession` → redirect to `/sign-in?returnTo=/budgets/{budgetId}` if absent; `requireAlias`) and same `getApiInternalUrl()` + forwarded-cookie fetch shape as the pre-7.1 detail page (`git show 30e9939:ui/app/lists/[listId]/budgets/[budgetId]/page.tsx` — reference only, do not resurrect it: that version had `list_id` in its URL/response and an assign/rules UI this story does not build). Import `budgetStateLabel`, `budgetUsageRatio`, and `type BudgetItem` from `../budgetsClient` — do not redefine those there.
  - [x] Export a pure `asBudgetDetail(data: unknown): BudgetDetail | null` from this page file (mirrors the old page's function, and the established `page.<feature>.test.ts` extraction pattern already used by `ui/app/lists/[listId]/page.tsx` — see `asBalances`, `balanceStripPropsFrom`, etc.). `BudgetDetail = BudgetItem & { history: BudgetHistoryLine[] }` where `BudgetHistoryLine = { id: string; description: string; posted_date: string; amount_crc: string; attributed_via: "manual" | "rule" }`. Parse the wire shape defensively exactly like `asBudgetFromWire` in `budgetsClient.ts` (response has `source_lists`, not `source_list_ids` — reuse that same field-rename step). **Do not parse or render `rules`** — this story's response includes `rules: []` today (Story 7.1 built `GetBudgetDetailView.rules` for 7.3, not this story) but this page has no UI for it; only consume `history`.
  - [x] Render: a back link to `/budgets` (reuse `t.budgetsBackToList` i18n key, now pointing at `/budgets` instead of a list), a header section with name + `budgetStateLabel(...)` + `formatMoneyAmount(spent, currency)} / {formatMoneyAmount(cap, currency)`, and a `t.budgetsHistoryTitle` section rendering `history` newest-first (already sorted server-side — do not re-sort) as plain rows: description, formatted date, `formatMoneyAmount(amount_crc, "CRC")`. **Do not render the manual/rule distinction** (`t.budgetsHistoryViaManual`/`budgetsHistoryViaRule` labels, or any badge) — Story 7.3 owns "the Rule badge" per its title; adding it here is scope creep this story must not do, even though `attributed_via` is present on every history line already. Empty history renders `t.budgetsHistoryEmpty`.
  - [x] 404 handling: on `response.status === 404` with `code === "budget_not_found"`, render `t.budgetNotFound` (reuse the existing key, already present in both locales from Epic 6/7.1) as a normal page state — same pattern as the pre-7.1 page's `budgetNotFound` branch. On 401, redirect to sign-in. On any other non-ok response, render `t.loadError`.

- [x] **Task 3 — UI: BFF route for detail** (AC #1, #3)
  - [x] New `ui/app/api/budgets/[budgetId]/route.ts` — `GET` only, mirrors `ui/app/api/budgets/route.ts`'s cookie-forwarding shape (not the old list-nested version, which had a `listId` param this route doesn't need), proxying to `${getApiInternalUrl()}/budgets/${encodeURIComponent(budgetId)}`. No POST/other methods — assignments/candidates/rules sub-routes are Story 7.3's job, do not build them here.

- [x] **Task 4 — UI: wire the budget tile as a link** (AC #1 — feature is unreachable otherwise)
  - [x] `ui/app/budgets/BudgetsPanel.tsx`: the tile's outer `<div className="flex h-full flex-col justify-between">` in `renderItem` becomes a Next `<Link href={`/budgets/${budget.id}`} className="flex h-full flex-col justify-between no-underline text-inherit">` wrapping the same content unchanged. Remove the now-stale "Static tile, not a link (Story 7.1)... Revisit in 7.2" comment above it. No nested interactive elements exist inside the tile today (chips/dot are non-interactive spans), so a whole-tile `<Link>` is safe — do not add a second nested `<a>`/button inside.

- [x] **Task 5 — Tests** (AC #4)
  - [x] `ui/app/budgets/[budgetId]/page.budgetDetail.test.ts` (new file, following the `page.<feature>.test.ts` convention): unit-test `asBudgetDetail` — valid full payload, missing/malformed required field → `null`, `history` defaulting to `[]` when absent/non-array, malformed individual history rows dropped (not the whole payload).
  - [x] `ui/app/budgets/BudgetsPanel.test.tsx` or the shared `soft-ledger.test.tsx`-style location this codebase already uses for `BudgetsPanel` coverage (check for an existing `BudgetsPanel.test.tsx`; if none exists, add one) — assert the tile renders as a link to `/budgets/{id}`.
  - [x] A component/page-level test for the detail page's rendered states (happy path with 2+ history lines in given order, budget-not-found, empty history) — if this codebase's Next server-component pages are not directly render-tested elsewhere (confirm via grep: `ui/app/lists/[listId]/page.tsx` is "never rendered directly in tests" per `project-context.md`), follow that same precedent and keep this story's page.tsx *thin and untested directly*, relying on the `asBudgetDetail` unit tests (Task 5.1) plus a manual smoke check instead of inventing new server-component test infrastructure this story doesn't need.

### Review Findings

- [x] [Review][Defer] `redirect()` on 401 is swallowed by the surrounding `try/catch`, so an expired/invalid session on `GET /budgets/{id}` renders a generic load-error page instead of navigating to sign-in [ui/app/budgets/[budgetId]/page.tsx:126-128] — deferred, pre-existing. Fourth instance of the identical `NEXT_REDIRECT`-swallowing pattern (confirmed byte-for-byte in `ui/app/lists/[listId]/page.tsx:573-574`, and already deferred twice before from Stories 6.3/6.4); this is a whole-codebase fix, not a story-scoped patch.

## Dev Notes

**Backend is already done — this is primarily a UI + test-coverage story.** Story 7.1 built `GetBudgetDetailService`/`GetBudgetDetailCommand`/`BudgetDetailView` (`api/application/budgets.py`), the `GET /budgets/{budget_id}` route (`api/api/routes/budgets.py`), and `BudgetDetailResponse` (`api/api/schemas/budgets.py`) as part of its "whole-module rewrite" (see 7.1's Dev Notes) — `_compute_spent_and_history` already fetches `repo.list_ledger_entries_for_lists(record.source_list_ids)` and `compute_attributed_entries`/`compute_budget_spent` (`domain/budget_attribution.py`) already merge + newest-first-sort across an arbitrary source-list set. **Do not rewrite any of this.** Verify it with tests (Task 1), then build UI on top of it (Tasks 2-4).

**Scope boundary — no "Rule" badge in this story.** `BudgetHistoryLine.attributed_via` (`"manual" | "rule"`) is already computed and present in the API response, but Story 7.3 ("Cross-list attribution — manual, rules, and the Rule badge") explicitly owns rendering that distinction. This story's history rows are plain (description/date/amount only) — no badge, no manual-vs-rule chrome. Building it here would step on 7.3's AC #1-3 and its "manual wins over rule" precedence UI, which isn't built yet anyway (assign/rule endpoints exist server-side per 7.1 but have no UI until 7.3).

**No source-list-editing UI or endpoint exists in this epic.** AC #2 ("source-list selection changes... reflected") is a statement about the *read path having no caching*, not a feature to build — there's no way for a user to add/remove a budget's source lists after creation anywhere in Epic 7 (7.1 = create-time only, 7.3 = attribution, not source-list edits). Task 1's test for AC #2 manipulates the `budget_source_lists` join table directly in the test DB session to prove this, matching how 7.1's migration-verification task directly manipulated fixture rows rather than going through an API.

**Reuse, don't rebuild, the pre-7.1 detail page's shape.** `git show 30e9939:ui/app/lists/[listId]/budgets/[budgetId]/page.tsx` (Story 6.4/6.5, deleted by 7.1's Task 9) has the right skeleton — auth/redirect, 404-vs-not-found branching, `asBudgetDetail` parsing, section layout. Port its structure to the new `/budgets/{budgetId}` path and response shape (`source_lists` not `list_id`, no `list_id` in the URL), and strip out everything this story doesn't own: `BudgetAssignPanel`, `BudgetRulesPanel`, `UnassignButton` imports/usage, and the manual/rule badge in the history row (`UnassignButton` rendering, `budgetsHistoryViaManual`/`ViaRule` labels).

**i18n needs no new keys.** `budgetsBackToList`, `budgetsHistoryTitle`, `budgetsHistoryEmpty`, `budgetNotFound`, `loadError`, `detailNotFound` all already exist in both locale blocks in `ui/lib/i18n/lists.ts` (from Epic 6, retained through 7.1). Only their *usage context* changes (`budgetsBackToList` now links to `/budgets`, not a list).

**Money/date rendering conventions (unchanged, follow existing code):** `formatMoneyAmount(amount, currency)` from `@/lib/currency`; `history[].amount_crc` is always CRC-denominated regardless of the budget's own `currency` field (per 7.1: non-CRC budgets get `spent=0`/`history=[]` entirely, so this only ever matters for CRC budgets — no dual-currency display logic needed). Dates arrive as ISO date strings (`posted_date`) — render directly, do not construct a JS `Date` for identity/comparison (project-context TS rule).

### Project Structure Notes

- New UI route: `ui/app/budgets/[budgetId]/page.tsx` — sibling to `ui/app/budgets/page.tsx`, first nested dynamic segment under the new top-level `/budgets` route Story 7.1 created.
- New BFF route: `ui/app/api/budgets/[budgetId]/route.ts` (GET only) — sibling to `ui/app/api/budgets/route.ts`.
- No new domain/application/persistence/schema files — Task 1 only adds test cases to an existing file.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md#Story 7.2` lines 2018-2035] — this story's ACs verbatim
- [Source: `_bmad-output/planning-artifacts/epics.md#Epic 7` lines 1974-1992] — epic framing, demo gate, sequencing (after Epic 6, this is 7.1's successor)
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md` AD-30, line 247] — owner-only ACL, `budget_source_lists` shape, "Rule" badge ownership (attributed_via surfaced as UI badge — this story explicitly defers that surfacing to 7.3)
- [Source: `_bmad-output/implementation-artifacts/7-1-standalone-budget-list-create.md`] — full context on the module rewrite this story builds on; Task 7's note "Revisit in 7.2" for the static tile; Completion Notes flagging `list_ledger_entries_for_lists`'s N-query-loop implementation (unchanged, still fine for this story's scale)
- [Source: `api/application/budgets.py` `GetBudgetDetailService`, `GetBudgetDetailCommand`, `BudgetDetailView`, `_compute_spent_and_history`, `_get_owned_budget`] — exact service this story's UI consumes, unchanged
- [Source: `api/api/routes/budgets.py` `get_budget_detail`, `_budget_detail_response`] — exact route/response shape this story's UI/BFF consume, unchanged
- [Source: `api/api/schemas/budgets.py` `BudgetDetailResponse`, `BudgetHistoryLineResponse`] — wire shape (`source_lists`, `history[].attributed_via`) this story's `asBudgetDetail` must parse
- [Source: `api/tests/test_budgets_integration.py` `test_get_budget_detail_happy_path` (single source list), `create_budget`/`assign_budget_entry` test helpers already in this file] — reuse these helpers for Task 1's new multi-source-list tests
- [Source: `git show 30e9939:ui/app/lists/[listId]/budgets/[budgetId]/page.tsx`] — the pre-7.1 detail page this story's page.tsx adapts (reference only, not resurrected as-is — see Dev Notes)
- [Source: `ui/app/budgets/budgetsClient.ts` `BudgetItem`, `budgetStateLabel`, `budgetUsageRatio`, `asBudgetFromWire`] — reused directly, not redefined
- [Source: `ui/app/budgets/BudgetsPanel.tsx` tile `renderItem`] — the static-`<div>`-to-`<Link>` change (Task 4)
- [Source: `ui/app/budgets/page.tsx`] — auth/redirect/alias-gate pattern this story's `[budgetId]/page.tsx` follows
- [Source: `ui/app/api/budgets/route.ts`] — BFF cookie-forwarding pattern this story's new BFF route follows
- [Source: `ui/app/lists/[listId]/page.tsx` — `asBalances`, `balanceStripPropsFrom`, etc., and its untested-server-component precedent noted in `project-context.md`] — the pure-function-extraction + `page.<feature>.test.ts` convention this story's Task 2/5 follow
- [Source: `ui/lib/i18n/lists.ts:140-159` (en), `:303-322` (es)] — existing keys this story reuses without modification
- [Source: `_bmad-output/project-context.md`] — money-as-Decimal/string-at-wire-boundary; date-strings-not-JS-Date rule; i18n per-domain TS message object convention; "no `ui/components/index.ts` barrel, import by direct path" convention

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Debug Log References

- Backend integration suite: `docker compose -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.worktree.yml -f docker-compose.test.yml run --rm api pytest -q` → 962 passed, 1 pre-existing unrelated failure (`tests/test_photo_api.py::test_invalid_photo_rejected` — confirmed failing on baseline commit `5623a79` too, via `git stash`/`git stash pop` around the run; not touched by this story).
- Budget-specific suite: `... run --rm --build api pytest tests/test_budgets_integration.py -v` → 30 passed (28 pre-existing + 2 new for AC #1/#2).
- UI suite: `npx vitest run` → 82 files / 624 tests passed. `npx tsc --noEmit` and `npx eslint .` both clean.
- Mid-session correction: an earlier ad-hoc `docker compose -f docker-compose.yml -f docker-compose.test.yml run ...` (omitting `docker-compose.dev.yml`/`docker-compose.worktree.yml`) hung — base compose's healthcheck `interval: 1h` never fired inside the run's timeframe. Recreated the stack with the full worktree overlay chain (`dev.yml` + `worktree.yml`, which set 5s intervals) and reran cleanly.

### Completion Notes List

- Task 1: added `test_get_budget_detail_merges_history_across_source_lists` and `test_get_budget_detail_reflects_current_source_list_set` to `api/tests/test_budgets_integration.py`. No production code changes — `GetBudgetDetailService`/`_compute_spent_and_history` (Story 7.1) already merge and newest-first-sort across the current `source_list_ids` with no caching; both new tests passed against the existing implementation, confirming the AC #1/#2 gap was purely test coverage.
- Task 2: added `ui/app/budgets/[budgetId]/page.tsx` — server component adapting the pre-7.1 detail page's shape (auth/alias-gate, `asBudgetDetail` parsing, 404-vs-load-error branching) to the new standalone `/budgets/{budgetId}` route and `source_lists`-keyed response. Deliberately excludes the manual/rule badge and `BudgetAssignPanel`/`BudgetRulesPanel`/`UnassignButton` (Story 7.3 scope) and does not parse/render `rules`.
- Task 3: added `ui/app/api/budgets/[budgetId]/route.ts` (GET-only BFF, cookie-forwarding, no listId param).
- Task 4: `BudgetsPanel.tsx` tile is now a `<Link href="/budgets/{id}">`; removed the stale "Static tile... Revisit in 7.2" comment.
- Task 5: added `page.budgetDetail.test.ts` (asBudgetDetail unit tests), `BudgetsPanel.test.tsx` (new file — asserts tile-as-link), and `route.test.ts` for the new BFF route. Per the established `ui/app/lists/[listId]/page.tsx` precedent, the server-component page itself is not directly render-tested — coverage relies on the `asBudgetDetail` unit tests plus a manual smoke check.
- Manual smoke check (real end-to-end, not just unit tests): ran the api on Compose (`localhost:8160`) and the Next dev server directly on the host (`localhost:3260`, `API_INTERNAL_URL=http://localhost:8160`), registered a user via curl, created a budget over 2 source lists, committed and assigned one CRC expense per list, then fetched `/budgets/{id}` with the session cookie — confirmed the rendered page shows "Groceries", `₡30 / ₡500`, and both history rows (Automercado ₡10, Walmart ₡20) merged from both source lists. Also confirmed `/budgets/{nonexistent-id}` renders "This budget is unavailable." (the `budgetNotFound` page state) rather than crashing.

### File List

- `api/tests/test_budgets_integration.py` (modified — 2 new tests)
- `ui/app/budgets/[budgetId]/page.tsx` (new)
- `ui/app/budgets/[budgetId]/page.budgetDetail.test.ts` (new)
- `ui/app/api/budgets/[budgetId]/route.ts` (new)
- `ui/app/api/budgets/[budgetId]/route.test.ts` (new)
- `ui/app/budgets/BudgetsPanel.tsx` (modified — tile is now a Link)
- `ui/app/budgets/BudgetsPanel.test.tsx` (new)

## Change Log

- 2026-09-02: Implemented Story 7.2 — cross-list budget detail. Closed the AC #1/#2 backend test gap (2 new integration tests proving history merges across ≥2 source lists newest-first, and that the read reflects the current `budget_source_lists` set with no caching). Built the `/budgets/{budgetId}` detail page, its BFF route, and wired the `/budgets` tile as a link — reusing `GetBudgetDetailService`/`BudgetDetailResponse` unchanged from Story 7.1. Deferred the manual/rule attribution badge to Story 7.3 per scope. Verified end-to-end against a live Compose stack (not just unit tests) before marking review.
