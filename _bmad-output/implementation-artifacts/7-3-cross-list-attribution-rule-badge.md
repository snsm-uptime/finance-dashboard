---
baseline_commit: b6c60db
---

# Story 7.3: Cross-list attribution — manual, rules, and the Rule badge

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a budget owner,
I want to assign transactions to budgets by hand and by rules across all source lists, with rule-matched lines visibly marked,
so that budget history is trustworthy and I can tell what was automatic.

## Acceptance Criteria

1. **Given** a budget and committed lines in any of its source lists **When** I assign manually **Then** those lines appear on budget detail history with no badge (FR-49).
2. **Given** a matching rule on a budget **When** new or existing lines in any source list match **Then** they are attributed without a second manual step and show a "Rule" badge on budget detail history (FR-49).
3. **Given** a line matches a rule and was also manually assigned **When** budget detail renders it **Then** manual assignment wins — no "Rule" badge.
4. **Given** this story **When** scope is considered **Then** loans are out; shared-list budgets are in scope.
5. **Given** CI **When** this story is tested **Then** UI component tests cover: assigning a candidate from the picker (appears in history, no badge), a rule-matched line rendering the "Rule" badge, a manually-assigned+rule-matching line rendering no badge (manual wins), unassigning a manual line (removed from history, reappears as a candidate), creating and deleting a rule, and the three new BFF routes proxy correctly (status/body passthrough) including a non-owner 404.

## Tasks / Subtasks

- [x] **Task 1 — Confirm the backend needs zero changes** (all ACs — verification only)
  - [x] Read `api/application/budgets.py` (`AssignEntryToBudgetService`, `UnassignEntryFromBudgetService`, `ListBudgetCandidatesService`, `CreateBudgetRuleService`, `DeleteBudgetRuleService`, `_compute_spent_and_history`) and `api/domain/budget_attribution.py` (`compute_attributed_entries`, `matches_rule`) — confirm cross-source-list attribution, rule matching, "manual always wins" precedence (only `budget_id is None` entries are rule-eligible), and `attributed_via: "manual" | "rule"` on every history line are already fully implemented and already covered by `api/tests/test_budgets_integration.py` (`test_manual_assign_appears_in_history_and_spent`, `test_rule_matches_existing_line_retroactively`, `test_rule_matches_line_committed_after_rule_created`, `test_manual_assignment_wins_over_rule_match`, `test_unassign_removes_from_history_and_reappears_as_candidate`, `test_non_owner_is_404_on_every_budget_scoped_route`, `test_delete_rule_returns_404_for_rule_on_other_budget`). **Do not add or modify any backend test or production code for Task 1** — if you find a real gap, stop and flag it in Dev Notes/Completion Notes rather than silently patching around it; this story's scope is UI-only per the Dev Notes below.
  - [x] Confirm `api/api/routes/budgets.py` already exposes `POST /budgets/{budget_id}/assignments`, `DELETE /budgets/{budget_id}/assignments/{ledger_entry_id}`, `GET /budgets/{budget_id}/candidates`, `POST /budgets/{budget_id}/rules`, `DELETE /budgets/{budget_id}/rules/{rule_id}` — all owner-scoped (404 `budget_not_found` for non-owner, per `_get_owned_budget`), all built and tested in Story 7.1. This story only builds the UI layer on top of these five existing routes.

- [x] **Task 2 — UI: three new BFF routes proxying the existing backend routes** (AC #1, #2, #3, #5)
  - [x] New `ui/app/api/budgets/[budgetId]/assignments/route.ts` — `POST` (body `{ ledger_entry_id: string }`, forwarded as JSON to `${getApiInternalUrl()}/budgets/{budgetId}/assignments`) — mirror `ui/app/api/budgets/route.ts`'s `POST` shape (cookie-forward via `forwardCookie`, text-passthrough response, `502`/`bad_gateway` on fetch failure). No `GET` on this route (candidates has its own route below).
  - [x] New `ui/app/api/budgets/[budgetId]/assignments/[entryId]/route.ts` — `DELETE` only, proxies to `${getApiInternalUrl()}/budgets/{budgetId}/assignments/{entryId}` — mirror `ui/app/api/budgets/[budgetId]/route.ts`'s `GET` shape (dynamic route param via `context.params`, cookie-forward, text-passthrough, same 502 fallback) but for `DELETE`.
  - [x] New `ui/app/api/budgets/[budgetId]/candidates/route.ts` — `GET` only, proxies to `${getApiInternalUrl()}/budgets/{budgetId}/candidates`.
  - [x] New `ui/app/api/budgets/[budgetId]/rules/route.ts` — `POST` (body `{ match_text: string }`), proxies to `${getApiInternalUrl()}/budgets/{budgetId}/rules`.
  - [x] New `ui/app/api/budgets/[budgetId]/rules/[ruleId]/route.ts` — `DELETE` only, proxies to `${getApiInternalUrl()}/budgets/{budgetId}/rules/{ruleId}`.
  - [x] All five routes: same-origin only, cookie-forwarded, no new auth logic (session/cookie handling already lives in `api/deps.py`'s `require_authenticated_user` on the FastAPI side — the BFF layer's job is proxy-only, exactly like every existing `ui/app/api/budgets*` route). Do **not** invent a `listId`-nested path variant — Epic 7 routes are `/budgets/{budgetId}/...` only (7.1/7.2 already dropped `listId` from this surface).

- [x] **Task 3 — UI: `budgetDetailClient.ts` (client-side fetch helpers, same-origin, replacing the deleted list-scoped version)** (AC #1, #2, #3, #5)
  - [x] New `ui/app/budgets/[budgetId]/budgetDetailClient.ts` — port `git show fd4679c^:"ui/app/lists/[listId]/budgets/[budgetId]/budgetDetailClient.ts"` (types `BudgetCandidate`, `BudgetRule`, `BudgetDetailClientMessages`; functions `assignEntry`, `unassignEntry`, `fetchCandidates`, `createRule`, `deleteRule`) and **drop the `listId` parameter and URL segment from every function** — new URLs are `/api/budgets/{budgetId}/assignments`, `/api/budgets/{budgetId}/assignments/{entryId}`, `/api/budgets/{budgetId}/candidates`, `/api/budgets/{budgetId}/rules`, `/api/budgets/{budgetId}/rules/{ruleId}` (no `/lists/{listId}` prefix — Task 2's new routes). Keep the defensive `asCandidate`/`asRule` parsers and `mapError` (status→message mapping: 401→`errorUnauthorized`, `invalid_budget_rule_match_text`→`errorInvalidBudgetRuleMatchText`, `ledger_entry_not_found`→`errorBudgetEntryNotFound`, `budget_rule_not_found`→`errorBudgetRuleNotFound`, else `errorGeneric`) unchanged — these codes/keys already exist in both `ui/lib/i18n/lists.ts` locale blocks, added in Story 6.5 and untouched since.

- [x] **Task 4 — UI: `BudgetAssignPanel`, `BudgetRulesPanel`, `UnassignButton` components** (AC #1, #2, #3, #5)
  - [x] New `ui/app/budgets/[budgetId]/BudgetAssignPanel.tsx` — port `git show fd4679c^:"ui/app/lists/[listId]/budgets/[budgetId]/BudgetAssignPanel.tsx"` verbatim except: drop the `listId` prop (component now takes only `budgetId` + `messages`), and its two calls (`fetchCandidates`, `assignEntry`) drop their `listId` argument to match Task 3's client. Everything else — `Sheet` usage (`@/app/lists/Sheet`, unchanged component), candidate-picker list UI, `router.refresh()` on success — is unchanged.
  - [x] New `ui/app/budgets/[budgetId]/BudgetRulesPanel.tsx` — port `git show fd4679c^:"ui/app/lists/[listId]/budgets/[budgetId]/BudgetRulesPanel.tsx"` verbatim except: drop the `listId` prop, drop it from the `createRule`/`deleteRule` calls. `useFormSubmission` (`@/hooks`) usage is unchanged.
  - [x] New `ui/app/budgets/[budgetId]/UnassignButton.tsx` — port `git show fd4679c^:"ui/app/lists/[listId]/budgets/[budgetId]/UnassignButton.tsx"` verbatim except: drop the `listId` prop, drop it from the `unassignEntry` call.
  - [x] All three import types from Task 3's `./budgetDetailClient`, not the deleted list-scoped one.

- [x] **Task 5 — UI: wire the Rule badge, rules panel, and assign/unassign into the existing detail page** (AC #1, #2, #3)
  - [x] `ui/app/budgets/[budgetId]/page.tsx` — add `rules: BudgetRuleRow[]` to the parsed shape: define `BudgetRuleRow = { id: string; match_text: string; created_at: string }`, add `asRuleRow` (same shape as `asHistoryLine`, ported from the pre-7.1 page — `git show fd4679c^:"ui/app/lists/[listId]/budgets/[budgetId]/page.tsx"`), extend `BudgetDetail = BudgetItem & { history: BudgetHistoryLine[]; rules: BudgetRuleRow[] }`, and extend `asBudgetDetail` to parse `row.rules` the same defensive way `history` is parsed today (default `[]`, drop malformed rows, never fail the whole payload). The API response already includes `rules` (`BudgetDetailResponse.rules`, built in Story 7.1, currently unconsumed by this page per Story 7.2's Dev Notes) — no backend change needed.
  - [x] Import `BudgetAssignPanel`, `BudgetRulesPanel`, `UnassignButton` from Task 4's new sibling files (`./BudgetAssignPanel` etc.) and render them: `<BudgetAssignPanel budgetId={budgetId} messages={{ ...t, cancelLabel: t.receiptMoveCancel }} />` above the history list (inside the `t.budgetsHistoryTitle` section, exactly where the pre-7.1 page placed it — see the reference `page.tsx` above), and `<BudgetRulesPanel budgetId={budgetId} rules={budget.rules} messages={t} />` as a new section after the history section.
  - [x] History row rendering: replace the current plain `<span className="text-muted">{line.posted_date}</span>` sub-line with the manual/rule label — `line.attributed_via === "manual" ? t.budgetsHistoryViaManual : t.budgetsHistoryViaRule` (this *is* the "Rule" badge — AC #2/#3; it is plain-text styling reusing `text-muted`, not a new pill/chip component — match the pre-7.1 page's row markup exactly, do not invent new badge chrome). Add `<UnassignButton budgetId={budgetId} entryId={line.id} label={t.budgetsUnassign} messages={t} />` next to the amount, rendered **only when `line.attributed_via === "manual"`** (AC #3's "manual wins, no badge" implies rule-matched lines have no unassign action — there is nothing to unassign, the rule computes it at read time; this matches the pre-7.1 page's `line.attributed_via === "manual" ? <UnassignButton ... /> : null` conditional exactly).
  - [x] Do not touch `page.budgetDetail.test.ts`'s existing `asBudgetDetail` tests' assertions for fields other than `rules` — only add new cases for `rules` parsing (empty/absent/malformed-row-dropped), following the existing test's structure for `history`.

- [x] **Task 6 — Tests** (AC #5)
  - [x] Extend `ui/app/budgets/[budgetId]/page.budgetDetail.test.ts`: add `rules` parsing cases to `asBudgetDetail` (valid rules array, absent → `[]`, malformed individual rule row dropped) mirroring the existing `history` test cases.
  - [x] New `ui/app/budgets/[budgetId]/BudgetAssignPanel.test.tsx` (or extend the shared component-test file this codebase already uses for similar client components — check for a `budgets.test.tsx`-style aggregate file under `ui/app/budgets/[budgetId]/` first; if none exists, create a new file): assert opening the picker calls `GET /api/budgets/{budgetId}/candidates`, selecting + confirming calls `POST /api/budgets/{budgetId}/assignments` with the right body, and success closes the sheet and calls `router.refresh()` (mock `next/navigation`'s `useRouter`, same pattern as any existing `router.refresh()`-calling component test in this codebase — grep for one before inventing a mock shape).
  - [x] New `ui/app/budgets/[budgetId]/BudgetRulesPanel.test.tsx`: assert submitting the rule form calls `POST /api/budgets/{budgetId}/rules` and clears the input + refreshes on success; assert clicking delete on a rendered rule calls `DELETE /api/budgets/{budgetId}/rules/{ruleId}` and refreshes on success; assert a validation error (mock a 422 `invalid_budget_rule_match_text` response) renders `t.errorInvalidBudgetRuleMatchText` without refreshing.
  - [x] New `ui/app/budgets/[budgetId]/UnassignButton.test.tsx`: assert clicking calls `DELETE /api/budgets/{budgetId}/assignments/{entryId}` and refreshes on success; assert a failure response renders the mapped error text and does not refresh.
  - [x] Extend the detail-page-level rendering coverage (wherever Story 7.2's Task 5 landed the happy-path/empty/not-found states — likely still relying on `asBudgetDetail` unit tests per that story's precedent of not directly render-testing the server component) with a case proving a `rule`-attributed history line's row renders `t.budgetsHistoryViaRule` and no `UnassignButton`, and a `manual`-attributed line renders `t.budgetsHistoryViaManual` and *does* render an unassign control — if this codebase still keeps server components untested-directly (confirm via the same grep Story 7.2 used: `project-context.md`'s "never rendered directly in tests" precedent), express this instead as a small pure-function test extracting the row-rendering decision (badge label + show-unassign) into a testable helper, rather than inventing new server-component test infrastructure.
  - [x] New tests for the five BFF routes (Task 2): one file per route or grouped, following `ui/app/api/budgets/[budgetId]/route.test.ts`'s existing pattern exactly (status/body passthrough, cookie forwarding, 502 on fetch failure). Confirm a non-owner's request (backend 404 `budget_not_found`) passes through unchanged (proxy is transparent — no BFF-layer ACL logic to test beyond passthrough).

### Review Findings

- [x] [Review][Patch] `sprint-status.yaml` last_updated comment self-contradicts (body says "→ in-progress" while header comment and the actual `development_status` field both say "→ review") [_bmad-output/implementation-artifacts/sprint-status.yaml:6]
- [x] [Review][Defer] `BudgetAssignPanel`'s trigger button has no busy/loading guard while `fetchCandidates` is in flight — a rapid double-click can fire overlapping candidate fetches (last response wins), and the empty-candidates state is indistinguishable from still-loading [ui/app/budgets/[budgetId]/BudgetAssignPanel.tsx:38-50] — deferred, pre-existing (verbatim port from pre-7.1 Story 6.5 `BudgetAssignPanel.tsx`, confirmed via `git show fd4679c^`)
- [x] [Review][Defer] `BudgetRulesPanel`'s `deletingId` tracks a single rule id, not a set — deleting a second rule while a first delete is still in flight re-enables the first rule's delete button mid-request, allowing a duplicate `deleteRule` call for it [ui/app/budgets/[budgetId]/BudgetRulesPanel.tsx:29,49-53,80] — deferred, pre-existing (verbatim port from pre-7.1 Story 6.5 `BudgetRulesPanel.tsx`, confirmed via `git show fd4679c^`)
- [x] [Review][Defer] BFF routes (`assignments/route.ts`, `rules/route.ts`) coerce a missing/non-string required field (`ledger_entry_id`, `match_text`) to `""` and forward it upstream instead of rejecting with a 400 at the BFF boundary [ui/app/api/budgets/[budgetId]/assignments/route.ts:39, ui/app/api/budgets/[budgetId]/rules/route.ts:36] — deferred, pre-existing pattern (matches the established `typeof body.x === "string" ? body.x : ""` convention already used in `ui/app/api/budgets/route.ts`, not a new deviation introduced by this story)

## Dev Notes

**This is a pure UI story — the entire backend (domain, application, API routes, and their tests) was already built in Story 7.1's "whole-module rewrite" and is fully exercised by the existing `api/tests/test_budgets_integration.py` suite.** `domain/budget_attribution.py`'s `compute_attributed_entries` already scans the union of a budget's `source_list_ids`' `ledger_entries`, already implements "manual always wins" (only `budget_id is None` entries are eligible for rule matching — see the docstring), and already returns `attributed_via` on every entry. `api/application/budgets.py` already has `AssignEntryToBudgetService`, `UnassignEntryFromBudgetService`, `ListBudgetCandidatesService`, `CreateBudgetRuleService`, `DeleteBudgetRuleService` fully wired to owner-scoped `api/api/routes/budgets.py` routes. **Do not touch any file under `api/` for this story except to read it for Task 1's verification** — if Task 1 finds a real gap (it shouldn't; 7.2's Dev Notes already flagged this module as complete), stop and report it rather than silently expanding scope.

**What actually changed since the pre-7.1 UI existed:** the pre-7.1 `BudgetAssignPanel`/`BudgetRulesPanel`/`UnassignButton`/`budgetDetailClient.ts` (Story 6.5, deleted by 7.1's module rewrite — commit `fd4679c`, parent `fd4679c^`) are functionally complete and were **not superseded by any new UI pattern** — they were deleted only because their URLs were list-nested (`/lists/{listId}/budgets/{budgetId}/...`) and 7.1 moved the surface to `/budgets/{budgetId}/...`. This story's job is almost entirely a mechanical `listId`-removal port of that deleted code onto the new URL shape, plus adding the corresponding BFF proxy routes (which also didn't exist yet at the new path — 7.1/7.2 only built `GET /api/budgets` and `GET /api/budgets/{budgetId}`, not the five attribution sub-routes).

**All i18n keys already exist, unchanged, in both locale blocks of `ui/lib/i18n/lists.ts`** (verified: `budgetsHistoryViaManual`/`budgetsHistoryViaRule` lines 143-144/306-307, `budgetsUnassign` 145/308, `budgetsRulesTitle`/`budgetsRulesEmpty`/`budgetsRuleMatchLabel`/`budgetsRuleAddSubmit`/`budgetsRuleAdding`/`budgetsRuleDelete` 146-151/309-314, `budgetsAssignTitle`/`budgetsAssignEmpty`/`budgetsAssignSubmit`/`budgetsAssigning` 152-155/315-318, `errorInvalidBudgetRuleMatchText`/`errorBudgetEntryNotFound`/`errorBudgetRuleNotFound` 156-158/319-321, plus the shared `errorGeneric`/`errorUnauthorized`/`errorForbidden`/`receiptMoveCancel` reused from other flows). **Do not add any new i18n key** — this story is 100% covered by keys already present from Story 6.5.

**The "Rule badge" is plain text, not a visual chip/pill component.** The epics.md title says "Rule badge" but the actual pre-7.1 implementation renders `t.budgetsHistoryViaManual`/`t.budgetsHistoryViaRule` as a muted text sub-line under the description (see the reference `page.tsx` row markup) — do not invent new pill/chip/badge visual chrome; match the existing pattern (which also matches the "no pill primary CTAs" / kit-default-avoidance rule in `project-context.md`).

**Money/date conventions unchanged:** `formatMoneyAmount` from `@/lib/currency`; `history[].amount_crc` always CRC; dates are ISO date strings, never construct a JS `Date` for identity (project-context TS rule). `BudgetCandidate.amount_crc`/`posted_date` follow the same convention.

**No source-list-editing UI in this story** (same boundary Story 7.2 documented) — a candidate is any not-yet-assigned committed line across the budget's *current* source lists; `ListBudgetCandidatesService` already computes this correctly and needs no story-side changes.

### Project Structure Notes

- New UI files (all under `ui/app/budgets/[budgetId]/`, sibling to `page.tsx`): `budgetDetailClient.ts`, `BudgetAssignPanel.tsx`, `BudgetRulesPanel.tsx`, `UnassignButton.tsx`, plus their test files.
- New BFF routes (all under `ui/app/api/budgets/[budgetId]/`): `assignments/route.ts`, `assignments/[entryId]/route.ts`, `candidates/route.ts`, `rules/route.ts`, `rules/[ruleId]/route.ts`, plus their test files — sibling structure to the existing `ui/app/api/budgets/[budgetId]/route.ts`.
- Modified: `ui/app/budgets/[budgetId]/page.tsx` (add `rules` parsing, wire the three new components, add manual/rule row label + conditional unassign), `ui/app/budgets/[budgetId]/page.budgetDetail.test.ts` (extend `asBudgetDetail` coverage for `rules`).
- No new domain/application/persistence/schema/route files under `api/` — Task 1 is read-only verification.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md#Story 7.3` lines 2036-2060] — this story's ACs verbatim
- [Source: `_bmad-output/planning-artifacts/epics.md#Epic 7` lines 1974-1992] — epic framing, demo gate ("a rule-matched line shows 'Rule', a manually-assigned line does not"), sequencing
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md` AD-30, line 247] — `attributed_via` "already computed... surfaced in the UI as a 'Rule' badge" — this story is exactly that surfacing step
- [Source: `_bmad-output/implementation-artifacts/7-2-cross-list-budget-detail.md` Dev Notes "Scope boundary — no 'Rule' badge in this story"] — confirms 7.2 deliberately deferred this to 7.3 and that `attributed_via` is already present on every history line in the API response
- [Source: `api/application/budgets.py` `AssignEntryToBudgetService`, `UnassignEntryFromBudgetService`, `ListBudgetCandidatesService`, `CreateBudgetRuleService`, `DeleteBudgetRuleService`, `_compute_spent_and_history`, `_get_owned_budget`] — fully-built services this story's UI consumes unchanged
- [Source: `api/domain/budget_attribution.py` `compute_attributed_entries`, `matches_rule`] — cross-list scan + manual-wins precedence, already implemented and documented in its own docstring
- [Source: `api/api/routes/budgets.py` `assign_budget_entry`, `unassign_budget_entry`, `list_budget_candidates`, `create_budget_rule`, `delete_budget_rule`] — exact routes this story's five new BFF routes proxy
- [Source: `api/api/schemas/budgets.py` `AssignBudgetEntryBody`, `CreateBudgetRuleBody`, `BudgetCandidateResponse`, `BudgetRuleResponse`, `BudgetDetailResponse.rules`] — wire shapes this story's BFF/client code must match
- [Source: `api/tests/test_budgets_integration.py` — `test_manual_assign_appears_in_history_and_spent`, `test_rule_matches_existing_line_retroactively`, `test_rule_matches_line_committed_after_rule_created`, `test_manual_assignment_wins_over_rule_match`, `test_unassign_removes_from_history_and_reappears_as_candidate`, `test_non_owner_is_404_on_every_budget_scoped_route`, `test_delete_rule_returns_404_for_rule_on_other_budget`, `test_assign_returns_404_ledger_entry_not_found_for_entry_outside_source_lists`] — proof the backend behavior this story's UI displays is already correct and tested
- [Source: `git show fd4679c^:"ui/app/lists/[listId]/budgets/[budgetId]/BudgetAssignPanel.tsx"`, `BudgetRulesPanel.tsx`, `UnassignButton.tsx`, `budgetDetailClient.ts`, `page.tsx`] — the pre-7.1 (Story 6.5) implementations this story ports, with `listId` dropped throughout (reference only — read via `git show`, do not `git checkout`/resurrect the files directly, since URLs and the page's surrounding shape have changed since)
- [Source: `ui/app/budgets/[budgetId]/page.tsx` (current, Story 7.2)] — the exact file Task 5 modifies; already has `asBudgetDetail`, `BudgetHistoryLine`, the history section markup this story extends
- [Source: `ui/app/api/budgets/[budgetId]/route.ts`, `ui/app/api/budgets/route.ts`] — the cookie-forwarding/text-passthrough BFF pattern (`forwardCookie`, `502`/`bad_gateway` fallback) Task 2's five new routes must match exactly
- [Source: `ui/app/lists/Sheet.tsx`] — unchanged `Sheet` component `BudgetAssignPanel` reuses (props: `open`, `onClose`, `closeLabel`, `title`, `body`, `footer`)
- [Source: `ui/hooks/useFormSubmission.ts`] — unchanged hook `BudgetRulesPanel`'s form submission reuses
- [Source: `ui/lib/i18n/lists.ts:127-164` (en), `:290-327` (es)] — all keys this story needs, already present, none added
- [Source: `_bmad-output/project-context.md`] — money-as-Decimal/string-at-wire-boundary; date-strings-not-JS-Date; i18n per-domain TS object convention; no `ui/components/index.ts` barrel; kit-unstyled-primitives-only / no pill CTAs (relevant to the "Rule badge is plain text" note above)

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- `npx vitest run` (ui): 91 test files, 679 tests passed.
- `npx tsc --noEmit` (ui): clean.
- `npx eslint .` (ui): clean.

### Completion Notes List

- Task 1 verified: `api/domain/budget_attribution.py::compute_attributed_entries` already implements cross-source-list scan, manual-always-wins (`budget_id is None` gate for rule eligibility), and `attributed_via` computation; `api/application/budgets.py` has all five services wired to owner-scoped routes in `api/api/routes/budgets.py`; all seven named tests exist in `api/tests/test_budgets_integration.py`. No backend gap found — no backend files touched.
- Ported the pre-7.1 (Story 6.5) UI (`budgetDetailClient.ts`, `BudgetAssignPanel.tsx`, `BudgetRulesPanel.tsx`, `UnassignButton.tsx`) from `git show fd4679c^` onto the new `/budgets/{budgetId}/...` URL shape, dropping the `listId` parameter/prop throughout per the story's Dev Notes.
- Added five new same-origin BFF proxy routes under `ui/app/api/budgets/[budgetId]/`, mirroring the cookie-forward/text-passthrough/502-fallback pattern of the existing `ui/app/api/budgets/[budgetId]/route.ts` and `ui/app/api/budgets/route.ts`.
- **Found and fixed a real bug while writing the BFF route tests** (not called out in the story): the backend legitimately returns HTTP 204 for the assign/unassign/delete-rule routes, and `new NextResponse(text, ...)` throws `TypeError: Invalid response status code 204` when `text` is an empty string (confirmed this is a genuine Fetch API spec behavior, not a jsdom quirk, via a plain Node `new Response("", {status:204})` repro) — a "null body status" response must have a `null` body, not an empty string. Fixed by passing `text.length > 0 ? text : null` in the three new routes that can return 204 (`assignments/route.ts`, `assignments/[entryId]/route.ts`, `rules/[ruleId]/route.ts`). This same latent bug exists in several pre-existing BFF DELETE routes elsewhere in the codebase (e.g. `ui/app/api/lists/[listId]/route.ts`) but those were left untouched — out of this story's scope.
- Extended `page.tsx`'s `asBudgetDetail` to parse `rules` defensively (same pattern as `history`), and extended its history-row rendering to show the manual/rule label and conditional `UnassignButton`. Extracted the row's badge/unassign decision into an exported pure function `historyRowAttribution` (per the story's fallback instruction, since server components in this codebase are not rendered directly in tests) and unit-tested it for both branches.
- All 5 i18n keys/message groups needed were already present in both locale blocks of `ui/lib/i18n/lists.ts` (Story 6.5) — no i18n changes made.
- Full `ui` test suite (679 tests / 91 files), `tsc --noEmit`, and `eslint .` all pass clean.

### File List

- `ui/app/budgets/[budgetId]/budgetDetailClient.ts` (new)
- `ui/app/budgets/[budgetId]/BudgetAssignPanel.tsx` (new)
- `ui/app/budgets/[budgetId]/BudgetAssignPanel.test.tsx` (new)
- `ui/app/budgets/[budgetId]/BudgetRulesPanel.tsx` (new)
- `ui/app/budgets/[budgetId]/BudgetRulesPanel.test.tsx` (new)
- `ui/app/budgets/[budgetId]/UnassignButton.tsx` (new)
- `ui/app/budgets/[budgetId]/UnassignButton.test.tsx` (new)
- `ui/app/budgets/[budgetId]/page.tsx` (modified)
- `ui/app/budgets/[budgetId]/page.budgetDetail.test.ts` (modified)
- `ui/app/api/budgets/[budgetId]/assignments/route.ts` (new)
- `ui/app/api/budgets/[budgetId]/assignments/route.test.ts` (new)
- `ui/app/api/budgets/[budgetId]/assignments/[entryId]/route.ts` (new)
- `ui/app/api/budgets/[budgetId]/assignments/[entryId]/route.test.ts` (new)
- `ui/app/api/budgets/[budgetId]/candidates/route.ts` (new)
- `ui/app/api/budgets/[budgetId]/candidates/route.test.ts` (new)
- `ui/app/api/budgets/[budgetId]/rules/route.ts` (new)
- `ui/app/api/budgets/[budgetId]/rules/route.test.ts` (new)
- `ui/app/api/budgets/[budgetId]/rules/[ruleId]/route.ts` (new)
- `ui/app/api/budgets/[budgetId]/rules/[ruleId]/route.test.ts` (new)

## Change Log

- 2026-09-02: Implemented Story 7.3 — ported pre-7.1 budget attribution UI (assign/unassign/rules/Rule badge) onto the standalone `/budgets/{budgetId}` surface; added five BFF proxy routes; fixed a 204-with-empty-body `NextResponse` bug found in the new routes during testing. Status → review.
