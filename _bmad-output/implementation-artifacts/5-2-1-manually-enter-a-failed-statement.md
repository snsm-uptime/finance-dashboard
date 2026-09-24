---
baseline_commit: 8062613
context: _bmad-output/planning-artifacts/sprint-change-proposal-2026-09-23-manual-entry-parse-failure.md
---

# Story 5.2.1: Manually enter a failed statement

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user facing a failed parse,
I want to hand-enter the statement's transaction as a manual expense right on the comparison surface,
so that I don't have to leave the review flow, re-find the list, and re-type what the PDF already shows me.

## Acceptance Criteria

1. **Given** the comparison surface from Story 5.1, **when** I activate "Add manually," **then** on desktop a third column appears alongside the existing extracted-items and PDF columns (no overlay/Sheet) — on phone, the extracted-items region (top) is replaced by the form; the PDF region stays fixed in its existing position (lower half on phone) throughout, unaffected (FR-25, FR-55).
2. **Given** the manual-entry form is showing, **when** it first renders, **then** every field (list picker, amount, currency, date, description, payer, split) is visible immediately — it is not withheld until a list is chosen (FR-55). Amount/description/currency/date are pre-filled from the failed statement's `parse_evidence` (first `kind: "row"` item, when one exists).
3. **Given** no list is yet chosen, **when** the form is showing, **then** the payer selector and split controls render with no options / are inert (no valid payer to submit) rather than being hidden — choosing a list populates them from that list's members without re-rendering the rest of the form.
4. **Given** the manual-entry form is showing, **when** I activate its back/close control, **then** the prior view returns (extracted items on phone, two-column layout on desktop) and nothing is dismissed or discarded — equivalent to never having opened it.
5. **Given** a list and a valid payer are chosen and the form is submitted, **when** the expense is created successfully, **then** the statement is also dismissed (Story 5.2's dismiss-statement action) in the same flow — the user does not perform two separate actions.
6. **Given** the currency/date fields already added to `ManualExpenseForm` (this story's groundwork, shipped ahead of this story as an ad-hoc build), **when** they render outside this flow (the existing list-detail "Add expense" entry points), **then** their behavior is unchanged — no regression to the existing manual-expense flow.

## Tasks / Subtasks

- [x] **Task 1: Remove the Sheet, delete `ManualEntrySheet.tsx`** (AC: #1)
  - [x] Delete `ui/app/upload/ManualEntrySheet.tsx` (the ad-hoc build this story replaces — read it fully first, Dev Notes below inventory exactly what to carry forward vs. drop).
  - [x] Remove its import/usage from `ui/app/upload/ParseComparisonPanel.tsx` (currently rendered unconditionally at the bottom, toggled by `manualEntryOpen` state).

- [x] **Task 2: Make `ManualExpenseForm` tolerate zero members** (AC: #2, #3, #6)
  - [x] `ui/app/lists/ManualExpenseForm.tsx` currently assumes `members` is non-empty at mount (e.g. `defaultAssigneeId = currentUserId`, `percentMapFromDefault(members, ...)`, the split-adjust block is already conditionally gated on `members.length > 1` — confirm that gate degrades gracefully to `members.length === 0`, not just `=== 1`). The payer `SoftLedgerSelect` (`memberOptions = members.map(...)`) must render with zero options rather than error or omit the field entirely.
  - [x] `canSubmit` already requires `!!activePayerId` — confirm this naturally stays `false` when `members` is empty (no payer can be active), so the existing submit-guard needs no new empty-members special case; the field must still be **visible**, just non-functional until members arrive.
  - [x] This must not regress any of the form's other 5 call sites (all pass non-empty `members` today) — the zero-members path is new but must be additive, not a rewrite of the non-empty path.

- [x] **Task 3: Desktop inline third column** (AC: #1)
  - [x] In `ParseComparisonPanel.tsx`'s desktop layout (`md:flex-row`), add a third `<section>` sibling to the existing items/PDF sections, shown only when the "Add manually" action has been activated (new local state, e.g. `manualEntryOpen`, replacing the Sheet-open boolean the ad-hoc build already has).
  - [x] The existing two columns (items, PDF) stay exactly as they are today — this is additive, not a reflow. Reuse the already-fetched `file`/`pdfError` state for the PDF column; do not re-fetch.

- [x] **Task 4: Mobile top-region swap** (AC: #1)
  - [x] On phone (`md:hidden` / stacked layout), when manual entry is active, the extracted-items region (top, currently the `<section role="region" aria-label={t.parseFailureItemsRegion}>` block) is replaced by the form region. The PDF region (already `role="region" aria-label={t.parseFailurePdfRegion}`, lower half) is unaffected — confirm no change to its DOM position/props for this path (FR-25's phone contract, already established by Story 5.1/5.2, must hold).

- [x] **Task 5: List picker + pre-fill, inline (not Sheet-owned)** (AC: #2, #3)
  - [x] Carry forward from `ManualEntrySheet.tsx` (being deleted): `fetchLists`/`fetchListMembers` wiring, the `listId`/`listOptions`/`members`/`membersListId` state shape (the `membersListId` pattern was added specifically to satisfy `react-hooks/set-state-in-effect` — keep it), and `initialValuesFrom(statement)` (reads `statement.parse_evidence.items`, first `kind: "row"` entry).
  - [x] `currentUserId` via `useOptionalPreferences()?.me?.user_id` (same as before).
  - [x] Default `listId` to the same `defaultListId` prop `ParseComparisonPanel` already receives (wired from `BulkReviewPanel`'s `listId` state / `IndividualReviewPanel`'s `session?.landing_list_id` — already plumbed, no change needed there).

- [x] **Task 6: Back/close control** (AC: #4)
  - [x] Add a visible back/close affordance on the form section (both platforms) that flips `manualEntryOpen` back to `false` — no API call, no state mutation beyond the local UI toggle. This replaces the Sheet's implicit "X = dismiss" semantics, which must **not** carry over: closing manual entry is not the same action as dismissing the statement anymore.

- [x] **Task 7: Submit → create + dismiss** (AC: #5)
  - [x] Unchanged from the ad-hoc build: `ManualExpenseForm`'s `onSuccess` calls the existing `dismissFailedStatement` (via the same `dismiss()` helper `ManualEntrySheet.tsx` had), then calls the panel's own `onDismissStatement(session)` callback and closes the inline form.
  - [x] `FormIconSubmit`/`formRef.current?.requestSubmit()` wiring carries over from the ad-hoc build's cornerAction pattern — just re-anchor it in the new inline layout instead of a `Sheet`'s `cornerAction` slot.

- [x] **Task 8: Tests** (AC: all)
  - [x] `ManualExpenseForm.test.tsx`: add a case for `members={[]}` — payer select renders empty (not omitted, not throwing), `canSubmit` stays `false`, and adding members via a rerender populates the payer options without remounting the amount/description/currency/date field values.
  - [x] `ParseComparisonPanel.test.tsx`: desktop three-column render on "Add manually" activation; mobile top-region swap; back/close returns to the prior view without calling the dismiss API; submit success calls both create-expense and dismiss, in that order, and closes the inline form.
  - [x] Remove/replace any existing `ManualEntrySheet`-specific tests if they exist (check `ui/app/upload/` for a `ManualEntrySheet.test.tsx` — none was created in the ad-hoc build session, confirm before assuming there's nothing to delete).

### Review Findings

- [x] [Review][Dismissed] AC3 split controls hidden (not inert) below 2 members — `ManualExpenseForm.tsx:479` gates the split-adjust block on `members.length > 1`. User confirmed intentional: a split is meaningless with fewer than 2 members, so hiding it (rather than rendering an inert/disabled control) satisfies AC3's actual intent. No change needed.
- [x] [Review][Patch] Create-then-dismiss is not atomic — `ParseComparisonPanel.tsx:147-156` (`handleSuccess`) calls `dismissFailedStatement` after `ManualExpenseForm`'s `onSuccess` already created the expense. If dismiss fails, `setLoadError` fires but the expense already exists, and the form has already reset to its pre-filled `initialValues` (still submittable) — a retry creates a duplicate expense with no warning. User decision (2026-09-23): block resubmission after a create-succeeds/dismiss-fails partial failure. Fixed: new `dismissFailed` state hides the form/submit and shows a dismiss-only retry button (`t.manualEntryDismissRetry`) that re-calls `handleSuccess` (which only re-invokes `dismissFailedStatement`, never `createExpense`).
- [x] [Review][Patch] Desktop column order is items → manual-entry form → PDF (`ParseComparisonPanel.tsx` ~317-410), but FR-55 and the Sprint Change Proposal both specify "extracted items | original PDF | manual-entry form." User decision (2026-09-23): reorder to match FR-55. Fixed: applied `md:order-1`/`md:order-2` to the PDF and manual-entry sections respectively (items keep default order 0) so desktop renders items | PDF | form without disturbing the mobile stacked DOM order (items hidden, form takes its place, PDF unaffected).
- [x] [Review][Patch] `ui/package.json`'s `dev` script dropped `--turbopack` (now plain `next dev`), reintroducing the exact webpack/pdfjs-dist crash `docker-compose.dev.yml`'s own comment (same diff) explains switching to turbopack to avoid. Fixed: restored `"dev": "next dev --turbopack"`. [ui/package.json:6]
- [x] [Review][Patch] `FormIconSubmit`'s submit button reused `t.parseFailureManualEntryRegion` ("Manual entry") as its accessible `label` — identical to the section `<h2>` heading text in the same region. Fixed: new distinct `t.manualEntrySave` ("Save expense" / "Guardar gasto") label. [ui/app/upload/ParseComparisonPanel.tsx]
- [x] [Review][Patch] `fetchLists`/`fetchListMembers` failures set a static `loadError` with no retry affordance — a transient network failure permanently strands the user in the manual-entry column until they close and reopen it. Fixed: new `reloadKey` state (bumped by a `t.manualEntryLoadRetry` button) re-runs both fetch effects. [ui/app/upload/ParseComparisonPanel.tsx:130-149]
- [x] [Review][Patch] When `currentUserId` (`useOptionalPreferences()?.me?.user_id`) hasn't resolved yet, `ManualEntryColumn` rendered `null` in place of the whole form with no loading indicator. Fixed: shows a `SpinnerIcon` with `aria-label={t.manualEntryLoadingUser}` instead of a bare gap, per project convention (no literal "Loading…" text). [ui/app/upload/ParseComparisonPanel.tsx]
- [x] [Review][Defer] `posted_date` has no bounds validation (accepts arbitrarily far future/past ISO dates) — deferred, pre-existing backend groundwork per this story's own Dev Notes ("do not touch `api/` for this story"). [api/domain/expenses.py:39]
- [x] [Review][Defer] `todayIso()` computes the default posted date from client-local midnight rather than Costa Rica's timezone, which can be off by one day near midnight for users outside CR — deferred, pre-existing ad-hoc groundwork per Dev Notes, out of this story's scope. [ui/app/lists/ManualExpenseForm.tsx:81]

## Dev Notes

- **Why this story exists:** A manual-entry capability was built ad hoc in the same session as Story 4.9.2's code review, layered onto Story 5.1's comparison surface without ever being a formal story. It used a `Sheet` overlay and gated the form behind list selection — both wrong per direct UX feedback. See `_bmad-output/planning-artifacts/sprint-change-proposal-2026-09-23-manual-entry-parse-failure.md` for the full impact analysis and the Q&A that produced this story's ACs.
- **This is UI recomposition, not new capability.** The backend (`posted_date` on `CreateExpenseBody`/`CreateManualExpenseCommand`, domain validation in `validate_manual_expense`) and `ManualExpenseForm`'s new currency/date fields already shipped in the ad-hoc build and are **correct as-is** — do not touch `api/` for this story. Only the UI composition (Sheet → inline) and `ManualExpenseForm`'s empty-members tolerance change.
- **Current state of the code this story modifies (read fully before touching):**
  - `ui/app/upload/ManualEntrySheet.tsx` (new, uncommitted, being deleted by this story) — the Sheet-based version. Contains the exact logic this story carries forward: `fetchLists`/`fetchListMembers` effects, `membersListId` staleness-tracking pattern, `initialValuesFrom()`, the `dismiss()` helper, and the `FormIconSubmit`/`formRef.current?.requestSubmit()` submit-trigger pattern. Read it to lift this logic into the new inline layout — do not reinvent it.
  - `ui/app/upload/ParseComparisonPanel.tsx` (modified, uncommitted) — currently renders `<ManualEntrySheet open={manualEntryOpen} .../>` unconditionally at the bottom, toggled by an "Add manually" `GhostButton` in the items-list actions row. The two-column desktop / stacked-mobile layout (`md:flex-row` on the outer wrapper) is the layout this story extends to three columns / top-swap, not replaces.
  - `ui/app/lists/ManualExpenseForm.tsx` (modified, uncommitted) — already has `initialValues` prop, `currency`/`postedDate` state and fields, all shipped in the ad-hoc build. Only its zero-members tolerance is new work for this story.
- **Sheet removal is a deletion, not a refactor-in-place** — `ManualEntrySheet.tsx`'s JSX structure (its own `<section>` for the PDF pane, duplicating `Document`/`Page` rendering already in `ParseComparisonPanel.tsx`) should not be preserved as a component; `ParseComparisonPanel.tsx` already owns PDF rendering — reuse that, don't duplicate it a second time in the new inline column.
- **`react-hooks/set-state-in-effect` lint rule bit the ad-hoc build twice** (once for `pending_interest_concept`-style "clear on empty" pattern, once for a loading flag) — both already fixed via the `membersListId`-tracks-what-was-fetched pattern instead of a separate boolean loading state. Carry that pattern forward; don't reintroduce a `membersLoading` boolean.
- **FR-25's phone contract is load-bearing and pre-existing** — "PDF comparison ... only on failure ... phone PDF lower half" (`project-context.md`, verbatim). This story's mobile top-swap must not touch the PDF region's position or props.
- **UX-DR19 applies to the new/swapped region too** — Story 5.1's AC requires "comparison regions are labeled for assistive tech." The existing items region (`role="region" aria-label={t.parseFailureItemsRegion}`) and PDF region already comply; the new desktop third column and the mobile swapped-in form region need their own `role="region"` + `aria-label` (new i18n key, e.g. `parseFailureManualEntryRegion`) — don't leave the new region unlabeled.
- **No settle/domain/API changes** — this is `ui/app/upload/` and `ui/app/lists/ManualExpenseForm.tsx` only, per the Sprint Change Proposal's Technical Impact section (no new AD, no architecture doc changes).

### Project Structure Notes

- Deleted: `ui/app/upload/ManualEntrySheet.tsx`
- Modified: `ui/app/upload/ParseComparisonPanel.tsx`, `ui/app/lists/ManualExpenseForm.tsx`, their respective test files
- No new files expected — this story's layout logic is small enough to live inline in `ParseComparisonPanel.tsx` rather than warranting a new component; if implementation pressure suggests otherwise (e.g. the inline form column grows unwieldy), a new co-located component under `ui/app/upload/` is acceptable but not required by any AC.
- No backend changes. No i18n domain changes beyond what already shipped (`parseFailureAddManually`, `manualEntryChooseList`, `manualEntryLoadingLists` in `lib/i18n/upload.ts`; `expenseCurrency`/`expenseCurrencyCrc`/`expenseCurrencyUsd`/`expenseDateLabel` in `lib/i18n/lists.ts` — both already added).

### References

- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-09-23-manual-entry-parse-failure.md] — this story's trigger, impact analysis, and the layout Q&A that produced its ACs
- [Source: _bmad-output/planning-artifacts/prds/prd-finance-helper-2026-08-02/prd.md#FR-55] — the FR this story implements
- [Source: epics.md#Story 5.1: Parse failure → side-by-side comparison] — FR-25's phone/desktop layout contract this story must not break
- [Source: epics.md#Story 5.2: Dismiss failed statement or file] — the dismiss action this story's submit flow reuses; its own AC5 anticipated "a manual expense entry (FR-21)" as the intended path
- [Source: _bmad-output/implementation-artifacts/5-2-dismiss-failed-statement-or-file.md] — prior story's Dev Notes: PDF confinement, `next_status_after_dismiss_failed`, dismiss API contract
- [Source: ui/app/upload/ManualEntrySheet.tsx] — the ad-hoc build this story replaces; read fully, most of its non-Sheet logic carries forward as-is
- [Source: ui/app/upload/ParseComparisonPanel.tsx] — the surface this story's layout changes are made inside
- [Source: ui/app/lists/ManualExpenseForm.tsx] — the form component needing empty-members tolerance

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

None.

### Completion Notes List

- Deleted `ui/app/upload/ManualEntrySheet.tsx`; its logic (list/member fetch wiring, `initialValuesFrom`, dismiss-on-success, `FormIconSubmit` submit-trigger pattern) was lifted into a new non-exported `ManualEntryColumn` function component defined inline in `ParseComparisonPanel.tsx` (per Dev Notes' "no new files required" guidance).
- `ManualExpenseForm` already tolerated zero members structurally (empty `memberOptions` renders fine in `SoftLedgerSelect`; `activePayerId` naturally resolves to `""`; the `members.length > 1` split-adjust gate already degrades to 0). While implementing/testing Task 8's zero→populated-members transition, found and fixed a real bug: `percentages` state was computed once from `members` at mount and never resynced when `members` grew from empty to populated later (list chosen after the form was already showing), leaving a stale `{}` baseline that made `buildSplitOverride()` fail on submit. Extended the existing `previousMemberCountRef` effect (which already resets adjust fields on a 1→>1 count drop) to also reset on a 0→>0 rise. Covered by a new regression test.
- Desktop: items region keeps its existing classes; when `manualEntryOpen`, `ManualEntryColumn` renders as an additional third `<section role="region">` sibling (items, manual entry, PDF) — items and PDF sections are untouched.
- Mobile: items section swaps to `hidden md:flex` while `manualEntryOpen`, so `ManualEntryColumn` (unconditionally `flex`) takes its place in the stacked top position; the PDF section's classes/props are unchanged for this path.
- New i18n keys (`parseFailureManualEntryRegion`, `manualEntryBack`) added to both `en`/`es` in `ui/lib/i18n/upload.ts` for the new region's accessible name and the back control's label.
- Every field (list picker, amount, currency, date, description, payer, split) renders immediately in `ManualEntryColumn` — no gating on list/members being loaded (AC #2/#3), a deliberate behavior change from the deleted Sheet, which had blocked the whole form behind a loaded list+members check.
- All 8 tasks' automated tests pass; full `ui` unit test suite run clean except two pre-existing failures unrelated to this story (`app/alias/AliasSetupForm.test.tsx`, `components/AvatarCropSheet.test.tsx` — both fail on a missing `react-easy-crop` dependency from Story 11.1, not touched here).

### File List

- Deleted: `ui/app/upload/ManualEntrySheet.tsx`
- Modified: `ui/app/upload/ParseComparisonPanel.tsx`
- Modified: `ui/app/upload/ParseComparisonPanel.test.tsx`
- Modified: `ui/app/lists/ManualExpenseForm.tsx`
- Modified: `ui/app/lists/ManualExpenseForm.test.tsx`
- Modified: `ui/lib/i18n/upload.ts`

## Change Log

| Date | Change |
| --- | --- |
| 2026-09-23 | Implemented Story 5.2.1: replaced the ad-hoc `ManualEntrySheet` overlay with an inline desktop third-column / mobile top-region-swap layout; made `ManualExpenseForm` tolerate zero members without gating field visibility; fixed a percentage-split baseline resync bug for the members-arrive-after-mount case; all 8 tasks complete, all ACs satisfied. |
