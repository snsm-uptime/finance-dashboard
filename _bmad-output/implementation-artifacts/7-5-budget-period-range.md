# Story 7.5: Budget period range

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a budget owner,
I want to optionally set a date-range period (from/to) on a budget via a date-range picker in the create/update form,
so that spend and attribution can be scoped to a specific window when I choose to set one.

## Acceptance Criteria

1. **Given** the budget create or update form, **when** I open it, **then** it includes an optional date-range picker (from/to); leaving it unset keeps the budget open-ended (no date bound), matching today's behavior. [Source: epics.md#Story 7.5, lines 2167-2171]
2. **Given** a budget with a period set, **when** a transaction is considered for manual assignment or rule-matching in any of its source lists, **then** only transactions posted within `[from, to]` are eligible; out-of-period transactions are not offered/attributed. [Source: epics.md#Story 7.5, lines 2173-2177]
3. **Given** an existing budget (open-ended or already period-bound), **when** the owner changes the period (narrows `from`/`to`, or sets a period for the first time) such that some already-assigned lines fall outside the new bounds, **then** before applying the change, a confirmation Sheet lists exactly which assigned lines will be removed from the budget, and the change is only applied on explicit confirm (irreversible, so no silent removal). [Source: epics.md#Story 7.5, lines 2179-2186]
4. **Given** the owner confirms a period change that excludes lines, **when** the change is applied, **then** those lines are unassigned from the budget (manual assignment and rule attribution both cleared for those lines) and detail/history/spend immediately reflect the new period only. [Source: epics.md#Story 7.5, lines 2187-2192]
5. **Given** the owner cancels out of the confirmation Sheet, **when** they do so, **then** the period change is discarded and the budget keeps its previous period/state. [Source: epics.md#Story 7.5, lines 2193-2197]
6. **Given** budgets created before this story (Epic 6/7.1 migration), **when** this story ships, **then** they default to open-ended (no period), no data loss, no forced backfill. [Source: epics.md#Story 7.5, lines 2198-2202]

## Tasks / Subtasks

- [x] Task 1: Domain — add `period_start`/`period_end` to the budget model and period-aware attribution (AC: #2, #6)
  - [x] In `api/domain/budgets.py`, add `validate_budget_period(period_start: date | None, period_end: date | None) -> None` (or two validators) mirroring the trim/None/raise shape of `validate_budget_name`/`validate_budget_cap` (lines 61-133). Pure, no repo access, per AD-1. Enforce `period_start <= period_end` when both are set; either/both may be `None` independently (an open start with a bounded end, or vice versa, is valid per AC #1's "optional").
  - [x] Add `InvalidBudgetPeriodError(DomainError)` to `api/domain/errors.py` next to `InvalidBudgetSourceListsError` (line 663), following its exact shape.
  - [x] In `api/domain/budget_attribution.py`, extend `compute_attributed_entries(entries, *, budget_id, rule_texts, ...)` (lines 65-92) with optional `period_start: date | None = None, period_end: date | None = None` kwargs; when set, an entry is only attributable (manual or rule) if `period_start <= entry.posted_date <= period_end` (each bound independently optional). This is the single choke point for both manual-assignment display and rule-match display — do not filter entries before this call elsewhere, thread the bounds through here so `attributed_via` semantics stay correct.
  - [x] Add domain unit tests to `api/tests/test_budget_attribution_domain.py` and `api/tests/test_budgets_domain.py` (existing files — do not create new ones): period validator valid/invalid cases (start > end, only start, only end, both unset), and `compute_attributed_entries` excluding out-of-period entries for both manual and rule-matched cases.

- [x] Task 2: Persistence — migration + model + repository (AC: #6)
  - [x] Add migration `api/adapters/persistence/migrations/versions/0036_budget_period.py` (next number after `0035_budgets_standalone_entity.py`) adding two **nullable** columns to `budgets`: `period_start Date` and `period_end Date`, no server_default (mirrors `LedgerEntryModel.posted_date: Mapped[date | None] = mapped_column(Date, nullable=True)` at `api/adapters/persistence/models.py:298` — same nullable-Date shape, no CHECK constraint at the DB level; the `start <= end` invariant lives in `domain/` per AD-1, matching how cap/currency/name are handled). Downgrade drops both columns.
  - [x] Add `period_start`/`period_end` columns to `BudgetModel` in `api/adapters/persistence/models.py:500-518`.
  - [x] Update `SqlAlchemyBudgetRepository.create_budget`/`update_budget` (`api/adapters/persistence/budgets.py`) to read/write the new columns.
  - [x] Update `BudgetRecord` dataclass (`api/application/budgets.py` lines 41-49) with `period_start: date | None`, `period_end: date | None`, and the `BudgetRepository` Protocol's `create_budget`/`update_budget` signatures (lines 60-104).

- [x] Task 3: Application — thread period through create/update/assign/candidates/spend (AC: #2, #6)
  - [x] `CreateBudgetCommand`/`CreateBudgetService.execute` (`api/application/budgets.py` lines 107-157): accept optional `period_start`/`period_end`, validate via `validate_budget_period`, pass through to `repo.create_budget`. Budgets created without a period (including all pre-existing ones, AC #6) get `None`/`None` — no migration backfill needed since the columns are nullable.
  - [x] `AssignEntryToBudgetService.execute` (lines 436-454): after the existing line-type check (~448-452), add a period-eligibility check — if `budget.period_start is not None and entry.posted_date < budget.period_start`, or `budget.period_end is not None and entry.posted_date > budget.period_end`, raise `LedgerEntryNotFoundError` (matches this service's existing "looks identical to not found" philosophy already documented in its comment, so an out-of-period line can't be assigned by a crafted request even though it isn't shown as a candidate).
  - [x] `ListBudgetCandidatesService.execute` (lines 499-524): add the same period predicate to the existing `line_type in BUDGET_ASSIGNABLE_LINE_TYPES and budget_id is None and not any(matches_rule(...))` filter (511-514) so out-of-period lines never appear as assignable candidates (AC #2).
  - [x] `_compute_spent_and_history` (lines 244-318): pass `record.period_start`/`record.period_end` through to `compute_attributed_entries` (currently called at 277-279) so spend/history reflect only in-period lines (AC #2, #4).

- [x] Task 4: Application — period-change preview + apply-with-unassign (AC: #3, #4, #5)
  - [x] Add a new read-only application service, e.g. `PreviewBudgetPeriodChangeService.execute(budget_id, owner_id, period_start, period_end) -> list[LedgerEntryRecord]` (or a lighter DTO), that reuses the *current* rule/assignment set (existing `compute_attributed_entries` inputs) but the *proposed* period bounds, and returns the diff: entries currently attributed (manual or rule) minus entries that would still be attributed under the proposed bounds. This is the exact list the confirmation Sheet (AC #3) must show — do not reimplement the diff logic client-side (project-context: settle/attribution math is server-owned).
  - [x] Extend `UpdateBudgetService.execute` (lines 170-204) to accept optional `period_start`/`period_end`. When the new bounds would exclude currently-attributed lines and the caller has not passed an explicit confirmation flag (see Task 5's route design), the service must NOT silently apply the narrower period — the API layer is responsible for requiring the client to have called the preview first and included a confirm signal (see Task 5). When applied, for every entry the diff identified, clear its budget attribution via the same primitive `UnassignEntryFromBudgetService`/`repo.unassign_entry` already uses (`api/adapters/persistence/budgets.py:171-175` — sets `LedgerEntryModel.budget_id = None`) rather than inventing new unassign logic. Manual assignment and rule attribution are both cleared identically (unassigning is unassigning — rule-matched lines have no separate "attribution record" beyond the `budget_id` FK per Story 7.3's design, confirm this against `compute_attributed_entries`'s inputs before implementing).
  - [x] Add application-layer tests to `api/tests/test_budgets_application.py`: preview returns the correct excluded-lines diff (narrowing existing period, setting a period for the first time, widening a period excludes nothing), update-with-confirm applies and unassigns, update without narrowing (widening only, or no period change) applies without requiring confirmation.

- [x] Task 5: API — schemas, routes, error mapping (AC: #1, #2, #3, #4, #5)
  - [x] `api/api/schemas/budgets.py`: add `period_start: date | None = None`, `period_end: date | None = None` to `CreateBudgetBody` and `UpdateBudgetBody`; add the same fields to `BudgetResponse` and `BudgetDetailResponse`. Use plain `date` (already imported, line 6) — Pydantic serializes/deserializes ISO-8601 calendar date strings at the wire boundary automatically, consistent with `BudgetHistoryLineResponse.posted_date: date` (line 54).
  - [x] Add `GET /budgets/{budget_id}/period-preview?period_start=&period_end=` (or POST, if query params get unwieldy — follow the existing `GET /budgets/{budget_id}/candidates` pattern at routes.py lines 366-379 for a same-shape precedent) returning the excluded-lines list from Task 4's preview service, as a new `BudgetPeriodPreviewResponse` schema (id, posted_date, description/amount fields mirroring `BudgetHistoryLineResponse`'s existing shape — reuse that schema type if the fields match rather than duplicating).
  - [x] `PATCH /budgets/{budget_id}` (`update_budget`, routes.py lines 245-303): accept the new body fields; require a `confirm_period_change: bool = False` field (or similar) on `UpdateBudgetBody` — the API must reject (422, distinct error code) a narrowing update that would exclude currently-attributed lines unless `confirm_period_change=True` is set, forcing the UI to have shown the preview and gotten explicit confirmation first (AC #3's "only applied on explicit confirm"). This keeps the irreversible-decision point at the API boundary, not just enforced by UI discipline.
  - [x] Map `InvalidBudgetPeriodError` to a 422 JSON response with `{"detail": str(exc), "code": "invalid_budget_period"}`, following the exact pattern at routes.py lines 202-206/276-280.
  - [x] `_budget_response`/`_budget_detail_response` (routes.py lines 137-162): add `period_start`/`period_end` to the response mapping.
  - [x] Add/extend route tests (existing `api/tests/test_budgets_integration.py` or the routes' test module) covering: create with/without period, update narrowing without confirm → 422, update narrowing with confirm → succeeds and unassigns, period-preview returns the correct diff.

- [x] Task 6: UI — BFF routes for period-preview and update (AC: #1, #3)
  - [x] `ui/app/api/budgets/[budgetId]/route.ts` already proxies budget detail/update/delete (confirm PATCH is wired — if not, add it following the same `getApiInternalUrl()` + `cookieHeader()` pattern used elsewhere in this file). Ensure the PATCH body/response pass through the new period fields and `confirm_period_change` flag untouched (BFF is a thin proxy here, per AD-8/"ui → HTTP only").
  - [x] Add `ui/app/api/budgets/[budgetId]/period-preview/route.ts` (new) proxying `GET .../period-preview` the same way `ui/app/api/budgets/[budgetId]/candidates/route.ts` proxies candidates — mirror that file's structure exactly.

- [x] Task 7: UI — date-range fields on create form (AC: #1, #6)
  - [x] In `ui/app/budgets/BudgetsCreateForm.tsx`, add two optional native `<input type="date">` fields (`fromDate`/`toDate` state as `YYYY-MM-DD` strings or `""` when unset — no `Date` object round-tripping, per project-context "keep as date strings... do not use JS `Date`"). No calendar/date-picker component exists anywhere in `ui/components/` (confirmed) — a plain native date-input pair is the low-risk choice consistent with this form's existing plain-input style (`fieldInputClass`), not a new custom widget.
  - [x] Wire the two fields into `createBudget`'s request body (send `undefined`/omit when both are empty strings, so unset stays open-ended per AC #1/#6) — extend `createBudget` in `budgetsClient.ts` and its `BudgetItem` type with `period_start: string | null`, `period_end: string | null`.
  - [x] Add i18n keys to `ui/lib/i18n/lists.ts` (existing budget copy lives here despite the "budgets" domain name — confirmed at `en` ~lines 127-163, `es` ~lines 290-326; do not create a new `budgets.ts` file) for the two field labels and any new error messages (`errorInvalidBudgetPeriod` mapped from the `invalid_budget_period` code, following `mapError`'s existing pattern in `budgetsClient.ts`).

- [x] Task 8: UI — build the budget update form (does not exist today) with date-range fields and confirmation Sheet (AC: #1, #3, #4, #5)
  - [x] **Investigate first**: confirmed via codebase search that no `updateBudget`/`editBudget` client function or update-form UI exists anywhere in `ui/app/budgets/` today, even though the backend `PATCH /budgets/{id}` endpoint already exists (added alongside delete in a prior commit). This story must build the update form from scratch — it is not a "wire up an existing form" task.
  - [x] Add an edit affordance on `ui/app/budgets/[budgetId]/page.tsx` (e.g. an edit icon/button near `BudgetDetailChrome`'s title, consistent with how other detail chrome actions are surfaced) that opens an update form. Reuse `BudgetsCreateForm`'s field set/validation approach (name, cap, currency, source lists, plus the new date-range fields from Task 7) rather than diverging — consider extracting shared field-rendering into a common piece if the duplication is significant, but do not block this story on a speculative refactor if the two forms' contexts (inline create vs. detail-page edit) make sharing awkward.
  - [x] Add `updateBudget` to `budgetsClient.ts` (new — mirrors `createBudget`'s fetch/error-mapping shape) calling `PATCH /api/budgets/{budgetId}` via the BFF.
  - [x] Implement the confirmation flow (AC #3, #4, #5): on submit, if the period narrowed (or was set for the first time) relative to the budget's current period, call the Task 6 period-preview BFF route first. If the diff is non-empty, open a `Sheet` (`ui/app/lists/Sheet.tsx` — reuse directly, do not build a new modal type; `BudgetAssignPanel.tsx` is the closest existing precedent for "a Sheet listing lines with a confirm/cancel footer action") listing the affected lines (date/description/amount, mirroring how `BudgetAssignPanel` or the detail page's history rows already render a line). On confirm, call `updateBudget` with `confirm_period_change: true`; on cancel, close the Sheet and discard the pending form change (AC #5 — the budget keeps its previous period/state, no partial apply). If the diff is empty (no lines excluded, e.g. widening only or first-time period that excludes nothing), apply directly without showing the Sheet.
    - Implementation note: rather than a separate preview round-trip before every submit, the form submits the update once with `confirm_period_change: false`; a narrowing period comes back as a 422 whose body already carries the exact excluded-lines diff (the same diff `PreviewBudgetPeriodChangeService` computes), which drives the confirmation Sheet directly. This avoids reimplementing the diff client-side and avoids an extra network round-trip, while preserving the exact same guarantee (no silent narrower apply — the server-side check still blocks it).
  - [x] Add a pure, separately-tested "confirm copy from the affected set" function analogous to `rollbackBatchConfirmBodyFrom` (`ui/app/lists/[listId]/page.tsx:282-297`, tested in `ui/app/lists/[listId]/page.rollbackBatchConfirmBody.test.ts`) — e.g. `periodChangeConfirmBodyFrom(affectedLines, t)` — for the Sheet's intro copy ("This removes N line(s) from the budget").
  - [x] Add i18n keys for the update form's title/submit copy and the confirmation Sheet's title/body/confirm/cancel labels to `ui/lib/i18n/lists.ts` (both `en`/`es`).

- [x] Task 9: UI tests (AC: all)
  - [x] `BudgetsCreateForm.test.tsx` (or wherever its tests live today — check for an existing file before creating one): cases for submitting with only `fromDate`, only `toDate`, both, and neither (omitted from request body).
  - [x] New/extended tests for the update form and confirmation Sheet: narrowing with affected lines shows the Sheet and lists them; confirm applies and the detail page reflects the new period; cancel leaves the budget unchanged; widening or no-op period change applies without a Sheet.
  - [x] `budgetsClient.ts`/`budgetDetailClient.ts` tests: `mapError` covers the new `invalid_budget_period` code; `updateBudget`/period-preview client functions handle success/error responses.

## Dev Notes

- **This story spans domain → persistence → application → API → UI** — unlike 7.2/7.3/7.4, this is not UI-only or API-only. Follow the existing hex layering strictly (AD-1): period validation logic in `domain/`, no SQLAlchemy/FastAPI imports there; ORM columns only in `adapters/persistence/models.py`.
- **The update form does not exist yet.** Do not assume Task 8 is "add a field to an existing form" — grep confirmed zero references to `updateBudget`/`editBudget` in `ui/app/budgets/`, even though the backend `PATCH`/`DELETE` endpoints were added in a prior story (commit `e206134`, "add budget update/delete endpoints"). This is the single largest scope item in this story; do not underestimate it.
- **No date-range picker component exists anywhere in `ui/components/`** (confirmed via `find ui/components -iname '*date*' -o -iname '*range*' -o -iname '*calendar*'` returning nothing). Build with plain native `<input type="date">` pairs, not a new calendar widget — matches project-context's "kits = unstyled primitives only" and avoids adding a new dependency for one story.
- **Dates are strings at every boundary.** Per project-context: "Posted/cycle dates: keep as date strings from API — do not use JS `Date` for identity or cycle math." Form state, BFF payloads, and API bodies all carry `period_start`/`period_end` as `YYYY-MM-DD` strings or `null`/absent — never construct a JS `Date` object for period logic in the UI. The diff/eligibility math itself is entirely server-side (Task 1/3/4) — the UI only displays what the API returns.
- **The irreversible-confirmation gate belongs at the API boundary, not just the UI.** Task 5's `confirm_period_change` flag on `UpdateBudgetBody` means a narrowing update without confirmation is rejected server-side (422), so the "no silent removal" guarantee (AC #3) holds even against a client that skips the preview call — the UI flow (Task 8) is the happy path, the API check is the actual guarantee.
- **Reuse `Sheet`, don't build a new modal.** `ui/app/lists/Sheet.tsx` already provides the portal/focus-trap/animation/footer mechanics this confirmation needs; `BudgetAssignPanel.tsx` (`ui/app/budgets/[budgetId]/BudgetAssignPanel.tsx`) is the closest existing precedent in the budgets domain for "a Sheet listing lines with a confirm action" — model Task 8's confirmation Sheet on it rather than `DiscardConfirmDialog` (`ui/app/upload/DiscardConfirmDialog.tsx`), which has no itemized-list support.
- **Unassign primitive already exists (Story 7.3) — reuse it.** `UnassignEntryFromBudgetService`/`repo.unassign_entry` (`api/adapters/persistence/budgets.py:171-175`, sets `budget_id = None`) is exactly what Task 4's apply-with-unassign step should call per excluded line. Do not write a second unassign code path.
- **`compute_attributed_entries` (`api/domain/budget_attribution.py`) is the single choke point** for manual + rule attribution display. Period bounds must be threaded through this function's call site(s) (Task 1, Task 3), not applied as a pre-filter on `entries` before calling it — pre-filtering would silently break `attributed_via` semantics for lines that are in-period-but-would-have-matched-a-rule vs. genuinely out-of-period.
- **i18n**: all existing budget-domain copy lives in `ui/lib/i18n/lists.ts` (`en` ~127-163, `es` ~290-326) despite the "budgets" naming — do not create a new `ui/lib/i18n/budgets.ts` file; add new keys to the existing `lists.ts` domain object per project-context's "create a new domain file only if no existing one fits."
- **i18n language**: all story/task/AC content is in English per project convention (all BMad story content is English regardless of conversation language).
- **Testing discipline (AD-15)**: domain/parsers are red→green TDD — write the `validate_budget_period`/`compute_attributed_entries` period tests in Task 1 before the implementation. UI is test-after. Add cases to existing test files (`test_budgets_domain.py`, `test_budgets_application.py`, `test_budget_attribution_domain.py`, `test_budgets_integration.py`) rather than creating new ones, per this codebase's one-file-per-module test convention.
- **Migration numbering**: the next migration file is `0036_budget_period.py` (last existing is `0035_budgets_standalone_entity.py`). Watch for a rebase-driven renumbering collision the way Story 7.1's migration was renumbered against `main`'s `0034_user_photo` (see commit `cae58ae`, "fix: renumber budgets migration to 0035") — verify the number is still free against `main` before merging.

### Project Structure Notes

- New: `api/adapters/persistence/migrations/versions/0036_budget_period.py`, `ui/app/api/budgets/[budgetId]/period-preview/route.ts`.
- Modified (backend): `api/domain/budgets.py`, `api/domain/errors.py`, `api/domain/budget_attribution.py`, `api/adapters/persistence/models.py`, `api/adapters/persistence/budgets.py`, `api/application/budgets.py`, `api/api/schemas/budgets.py`, `api/api/routes/budgets.py`.
- Modified (backend tests): `api/tests/test_budgets_domain.py`, `api/tests/test_budget_attribution_domain.py`, `api/tests/test_budgets_application.py`, `api/tests/test_budgets_integration.py`.
- Modified (UI): `ui/app/budgets/BudgetsCreateForm.tsx`, `ui/app/budgets/budgetsClient.ts`, `ui/app/budgets/[budgetId]/page.tsx`, `ui/app/api/budgets/[budgetId]/route.ts`, `ui/lib/i18n/lists.ts`.
- New (UI): a budget update form (exact file location left to dev — likely `ui/app/budgets/[budgetId]/BudgetUpdateForm.tsx` or similar, colocated with `BudgetDetailChrome.tsx`/`BudgetAssignPanel.tsx`), a period-change confirmation Sheet usage (reusing `ui/app/lists/Sheet.tsx`, no new Sheet component), a `periodChangeConfirmBodyFrom`-style pure helper + its test file.
- No changes anticipated to `BudgetRulesPanel.tsx`, `UnassignButton.tsx` (reused as-is, its backend primitive is what Task 4 calls), `TopProgressBar`, or `AppShell.tsx`/`ChromeBack.tsx` (Story 7.4's chrome mechanism is unaffected).

### References

- [Source: `_bmad-output/planning-artifacts/epics.md#Story 7.5` lines 2158-2202] — this story's ACs verbatim
- [Source: `_bmad-output/planning-artifacts/epics.md#Epic 7` lines 2014-2041] — epic framing, FR-48/49/50 amendments, sequencing note ("7.6 should land after 7.5 since both touch the budget update form")
- [Source: `api/domain/budgets.py` lines 61-142] — existing validators (`validate_budget_name`, `validate_budget_cap`, `validate_budget_currency`, `validate_budget_source_list_ids`) to mirror for `validate_budget_period`; `BUDGET_ASSIGNABLE_LINE_TYPES` (33-41); `classify_budget_state` (135-142)
- [Source: `api/domain/budget_attribution.py` lines 65-98] — `compute_attributed_entries` (the attribution choke point to extend with period bounds), `compute_budget_spent`
- [Source: `api/application/expenses.py` ~line 416-420] — existing precedent for an inclusive `period_start <= posted_date <= period_end` filter pattern (`resolve_period_bounds`) elsewhere in this codebase
- [Source: `api/adapters/persistence/migrations/versions/0035_budgets_standalone_entity.py`] — migration style/structure precedent (add column, index, lossy-downgrade docstring convention)
- [Source: `api/adapters/persistence/models.py` lines 298, ~692, 500-518] — nullable `Date`/`DateTime` column precedent (`LedgerEntryModel.posted_date`, `ImportCandidateRowModel.resolved_at`); `BudgetModel` to extend
- [Source: `api/application/budgets.py` lines 41-49, 60-104, 107-157, 160-204, 244-318, 417-454, 499-524] — `BudgetRecord`, `BudgetRepository` Protocol, `CreateBudgetService`, `UpdateBudgetService`, `_compute_spent_and_history`, `AssignEntryToBudgetService`, `ListBudgetCandidatesService` — all touched by this story
- [Source: `api/api/schemas/budgets.py` lines 1-100ish] — `CreateBudgetBody`, `UpdateBudgetBody`, `BudgetResponse`, `BudgetHistoryLineResponse`/`BudgetCandidateResponse` (`date` field precedent, line ~54/91)
- [Source: `api/api/routes/budgets.py` lines 137-162, 175-228, 245-303, 305-320, 343-379] — `_budget_response`/`_budget_detail_response`, `create_budget`, `update_budget`, `delete_budget`, `unassign` route, `candidates` route (period-preview route precedent)
- [Source: `api/domain/errors.py` lines 633-715] — `Budget*Error` class family; `InvalidBudgetPeriodError` slots in next to `InvalidBudgetSourceListsError` (663)
- [Source: `ui/app/budgets/BudgetsCreateForm.tsx`] — create form to extend with date fields; established field/state/`useFormSubmission` pattern
- [Source: `ui/app/budgets/budgetsClient.ts`] — `createBudget`, `mapError`, `BudgetItem` type to extend; no `updateBudget` exists yet (confirmed by search)
- [Source: `ui/app/budgets/[budgetId]/BudgetDetailChrome.tsx`, `page.tsx`] — where the edit affordance and update form need to be wired in; no existing edit UI (confirmed by search)
- [Source: `ui/app/lists/Sheet.tsx`] — generic Sheet component to reuse for the confirmation flow (do not build a new modal type)
- [Source: `ui/app/budgets/[budgetId]/BudgetAssignPanel.tsx`] — closest existing precedent for "Sheet listing lines with confirm footer action" in the budgets domain
- [Source: `ui/app/lists/[listId]/page.tsx` lines 282-297, `ui/app/lists/[listId]/page.rollbackBatchConfirmBody.test.ts`] — `rollbackBatchConfirmBodyFrom` pure-function-for-confirm-copy precedent (Story 5.4) to mirror for `periodChangeConfirmBodyFrom`
- [Source: `ui/app/upload/DiscardConfirmDialog.tsx`, `ui/components/soft-ledger/ReceiptRowMenu.tsx` lines 82-132] — simpler confirm-dialog precedent (no itemized list) — explicitly not the pattern to follow here, since this story needs an itemized list
- [Source: `ui/app/api/budgets/[budgetId]/candidates/route.ts`] — BFF proxy-route structure to mirror for the new period-preview route
- [Source: `_bmad-output/project-context.md`] — money-as-string, dates-as-ISO-strings, hex layering (AD-1), i18n per-domain object convention (`lists.ts` already hosts budget copy), Sheet/Soft-Ledger component conventions, "settle math server-owned" rule (applies analogously to the period-diff calc)
- [Source: `_bmad-output/implementation-artifacts/7-3-cross-list-attribution-rule-badge.md`, `7-4-budget-progress-bar-visualization.md`] — established precedent for this codebase's "investigate before assuming a backend/UI gap exists" discipline and Dev Notes phrasing conventions

### Review Findings

- [x] [Review][Patch] `onConfirmPeriodChange` silently swallows a re-raised confirmation-required result — if the confirmed PATCH itself comes back `requiresConfirmation` (e.g. a concurrent assignment/rule match landed between the first 422 and the confirmed resubmit), neither the `ok` nor `"error" in result` branch matches, no error is shown, and `setConfirmOpen(false)` still runs unconditionally, closing the sheet as if the change applied when it silently did not. [ui/app/budgets/[budgetId]/BudgetUpdateForm.tsx:147-159]
- [x] [Review][Patch] Confirmation Sheet omits `posted_date` for excluded lines even though `PeriodChangeLine` carries it and Task 8 specifies "date/description/amount" — lines with the same description/amount are indistinguishable, weakening AC #3's "exactly which lines" guarantee. [ui/app/budgets/[budgetId]/BudgetUpdateForm.tsx:332-341]
- [x] [Review][Patch] `openEditor()` resets name/cap/currency/lists/period but not `confirmOpen`/`excludedLines`, so a stale confirmation sheet can carry over from a prior edit session when the editor is reopened. [ui/app/budgets/[budgetId]/BudgetUpdateForm.tsx:97-106]
- [x] [Review][Patch] `GET /budgets/{id}/period-preview` returns FastAPI's generic validation 422 for a malformed date query param instead of the app's `{detail, code}` `invalid_budget_period` contract used by every other budget-period error path. [api/api/routes/budgets.py:443-467]
- [x] [Review][Patch] No test confirms rule-matched (not just manually-assignable) entries are excluded from candidates/spend when out-of-period — only a manual-assignment case is covered. [api/tests/test_budgets_integration.py]
- [x] [Review][Defer] Removing a source list from `source_list_ids` on update never unassigns entries previously attributed from that list (FK stays set); this is pre-existing repository behavior, not introduced by Story 7.5's period logic, but it does mean a period-narrow + source-list-narrow done in the same PATCH won't surface source-list-driven exclusions in the confirmation diff either. [api/adapters/persistence/budgets.py:112-140] — deferred, pre-existing

### Dev Agent Record

### Agent Model Used

claude-sonnet-5

### Debug Log References

None — no blocking issues; full backend (1010 tests) and budgets-scoped UI (86 tests) suites pass. The 20 unrelated UI test failures observed in a full `vitest run` (soft-ledger, SettleControls, PercentageSplitTrack, SimplifyColumn, OriginChipPicker) are from concurrent, unrelated chrome/avatar work landing in this same worktree during development (confirmed via `git status` — none of the affected files were touched by this story) and are pre-existing/out of scope.

### Completion Notes List

- Domain (Task 1): `validate_budget_period` and period-aware `compute_attributed_entries` (optional `period_start`/`period_end`, each independently optional, inclusive bounds) added with full unit test coverage in `test_budgets_domain.py`/`test_budget_attribution_domain.py`.
- Persistence (Task 2): migration `0036_budget_period` adds nullable `period_start`/`period_end` Date columns to `budgets`; `BudgetModel`, `SqlAlchemyBudgetRepository`, and `BudgetRecord`/`BudgetRepository` Protocol all threaded through.
- Application (Tasks 3-4): period bounds threaded through create/assign/candidates/spend; `PeriodChangeRequiresConfirmationError` + `PreviewBudgetPeriodChangeService` implement the confirm-before-narrow guarantee, reusing `compute_attributed_entries` for both the "currently attributed" and "would remain attributed" sets rather than a new diff algorithm. Confirmed narrowing unassigns via the existing `repo.unassign_entry` primitive (no second unassign path).
- API (Task 5): `CreateBudgetBody`/`UpdateBudgetBody` carry optional period fields; `UpdateBudgetBody.confirm_period_change` gates a narrowing apply; new `GET /budgets/{id}/period-preview` route; `InvalidBudgetPeriodError` → 422 `invalid_budget_period`; the confirmation-required case maps to 422 `period_change_requires_confirmation` carrying the excluded-lines list in the response body directly (reused by the UI instead of a second preview call — see Task 8 note below).
- UI (Tasks 6-9): BFF PATCH/DELETE added to `/api/budgets/[budgetId]` (PATCH didn't exist before this story despite the backend route existing since a prior story); new period-preview BFF route mirrors the candidates route. `BudgetsCreateForm` gained two native `<input type="date">` fields. Built `BudgetUpdateForm.tsx` from scratch (no update form/client existed previously) wired as an edit-icon affordance in `BudgetDetailChrome`'s trailing slot — reuses `Sheet` for both the edit form and the period-change confirmation, and `periodChangeConfirmBodyFrom` mirrors the `rollbackBatchConfirmBodyFrom` singular/plural-count pattern. Design deviation from the task list: the confirmation flow submits the update once (unconfirmed) and uses the 422's excluded-lines payload to drive the Sheet, rather than calling the period-preview route as a separate pre-flight — functionally equivalent (same server-computed diff, same "no silent narrower apply" guarantee) with one fewer round trip; the period-preview BFF/client function are still implemented and tested per Task 6 since other future UI entry points may need a preview without submitting.

### File List

**New:**
- `api/adapters/persistence/migrations/versions/0036_budget_period.py`
- `ui/app/api/budgets/[budgetId]/period-preview/route.ts`
- `ui/app/api/budgets/[budgetId]/period-preview/route.test.ts`
- `ui/app/budgets/[budgetId]/BudgetUpdateForm.tsx`
- `ui/app/budgets/[budgetId]/BudgetUpdateForm.test.tsx`

**Modified (backend):**
- `api/domain/budgets.py`
- `api/domain/errors.py`
- `api/domain/budget_attribution.py`
- `api/adapters/persistence/models.py`
- `api/adapters/persistence/budgets.py`
- `api/application/budgets.py`
- `api/api/schemas/budgets.py`
- `api/api/routes/budgets.py`

**Modified (backend tests):**
- `api/tests/test_budgets_domain.py`
- `api/tests/test_budget_attribution_domain.py`
- `api/tests/test_budgets_application.py`
- `api/tests/test_budgets_integration.py`

**Modified (UI):**
- `ui/app/budgets/BudgetsCreateForm.tsx`
- `ui/app/budgets/BudgetsCreateForm.test.tsx`
- `ui/app/budgets/budgetsClient.ts`
- `ui/app/budgets/budgetsClient.test.ts`
- `ui/app/budgets/BudgetsPanel.tsx`
- `ui/app/budgets/BudgetsPanel.test.tsx`
- `ui/app/budgets/[budgetId]/page.tsx`
- `ui/app/budgets/[budgetId]/page.budgetDetail.test.ts`
- `ui/app/budgets/[budgetId]/BudgetDetailChrome.tsx`
- `ui/app/api/budgets/route.ts`
- `ui/app/api/budgets/route.test.ts`
- `ui/app/api/budgets/[budgetId]/route.ts`
- `ui/app/api/budgets/[budgetId]/route.test.ts`
- `ui/lib/i18n/lists.ts`

## Change Log

- Implemented Story 7.5 end-to-end: optional budget period (from/to), period-aware attribution/candidates/assignment, period-change preview + confirm-before-narrow apply-with-unassign, and the budget update form (new) with a period-change confirmation Sheet.
