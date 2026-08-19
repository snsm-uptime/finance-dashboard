---
title: 'Hide "Your items with no origin" when the viewer has nothing to assign'
type: 'refactor'
created: '2026-08-18'
status: 'done'
baseline_commit: '54bf68bd6b4b56df03d0daccaf591605f06d05d9'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/project-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** List detail always shows the "Your items with no origin" disclosure once expenses load, even when the viewer has zero blank-origin expenses of their own. The empty-state copy ("None of your expenses are missing an origin.") is noise; it also makes it look like the section might be listing other people's blanks.

**Approach:** Treat the disclosure as an action surface, not a status message. Render it only when the viewer has at least one actionable item (`origin_kind === null` and `payer_id === currentUserId`). Otherwise render nothing. Drop empty-state UI, copy, and tests. Keep the existing client-side payer-scope filter as the contract — do not add a backend expenses query filter.

## Boundaries & Constraints

**Always:** Actionable set = `origin_kind === null && payer_id === currentUserId`. Other members' blank-origin expenses never appear and never keep the disclosure visible. Host still mounts the component only when `!expensesLoadError`. Assign flows (row, batch, partial-failure retry) stay unchanged when the actionable set is non-empty. EN+ES product chrome stays in `ui/lib/i18n/lists.ts`.

**Ask First:** None.

**Never:** Do not change API/list expense queries, PATCH origin ACL (`not_entry_payer`), or `ManualExpenseForm`. Do not show other users' blank-origin rows. Do not keep `noOriginFilterEmpty` or an empty `<details>` shell. Do not duplicate the filter predicate on `page.tsx` — visibility lives in `NoOriginFilter`. Do not add a second expenses-fetch path; keep `router.refresh()` after successful assign.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Viewer has ≥1 own blank-origin expense | Mix of blank/cash/card; some other payers | `<details>` with toggle + count; only viewer's blank rows | N/A |
| Viewer has zero own blanks (empty list, all assigned, or only others' blanks) | Any expenses array with no self-payer `origin_kind === null` | Component renders `null` — no disclosure, no empty copy | N/A |
| Only other members have blank origin | Other `payer_id` + `origin_kind === null`; viewer has none | Same as zero own blanks — hidden, not their rows | N/A |
| Expenses failed to load | `expensesLoadError` on list detail | Host omits `NoOriginFilter` (unchanged) | Existing load-error copy |
| Last own blank assigned | `router.refresh()` then props with zero own blanks | Disclosure gone after refresh | Existing assign error path unchanged |

</frozen-after-approval>

## Code Map

- `ui/app/lists/NoOriginFilter.tsx` -- hook-free `NoOriginFilter` returns `null` when `ownBlankOriginExpenses` is empty; `NoOriginFilterPanel` holds hooks/`fetchCards` and always shows the count
- `ui/app/lists/[listId]/page.tsx` -- sole host (~404–422); mounts only when `!expensesLoadError`; no empty-state copy
- `ui/lib/i18n/lists.ts` -- EN+ES toggle/assign chrome; `noOriginFilterEmpty` removed
- `ui/app/lists/NoOriginFilter.test.tsx` -- hide-when-idle (empty list, own cash, other-user-only, re-render after last blank); keep origin-null, mixed payer-exclusion, and assign cases

## Tasks & Acceptance

**Execution:**
- [x] `ui/app/lists/NoOriginFilter.tsx` -- hook-free wrapper returns `null` when the actionable set is empty; inner client UI keeps hooks/`fetchCards` and drops the empty-state branch plus `noOriginFilterEmpty` from `NoOriginFilterMessages`
- [x] `ui/app/lists/[listId]/page.tsx` -- stop passing `noOriginFilterEmpty`; keep mounting `NoOriginFilter` only when `!expensesLoadError` (no duplicated filter)
- [x] `ui/lib/i18n/lists.ts` -- remove `noOriginFilterEmpty` from `en` and `es`
- [x] `ui/app/lists/NoOriginFilter.test.tsx` -- replace the empty-copy test with: renders nothing (and does not call `fetchCards`) when the viewer has no own blanks, including other-user-only blanks; drop `noOriginFilterEmpty` from the messages fixture; keep origin-null filter, mixed payer-exclusion, and assign cases

**Acceptance Criteria:**
- Given the viewer has no expenses with blank origin and themselves as payer, when list detail loads, then "Your items with no origin" is not in the document.
- Given another member has a blank-origin expense and the viewer does not, when list detail loads, then the disclosure is hidden and that description is not shown.
- Given the viewer has at least one own blank-origin expense, when list detail loads, then the disclosure is shown with only those rows (count suffix included).
- Given a successful assign that leaves the viewer with zero own blanks, when the page refreshes, then the disclosure is gone.

## Spec Change Log

## Design Notes

Story 4.2 required an always-visible disclosure plus `noOriginFilterEmpty`. This spec replaces that reassurance copy with hide-when-idle.

Do not early-return before hooks inside the current hook-bearing function. A tiny wrapper with no hooks that returns `null` (and only then renders the existing UI) is the intended simplification: one filter, no empty branch, no wasted `fetchCards` on idle.

## Verification

**Commands:**
- `npx vitest run app/lists/NoOriginFilter.test.tsx` (cwd `ui/`) -- expected: suite green; empty-copy assertion gone; hidden-when-idle + other-user-only cases pass; `fetchCards` not called when hidden
- `npx tsc --noEmit` (cwd `ui/`) -- expected: clean after removing `noOriginFilterEmpty`

## Suggested Review Order

**Hide when idle**

- Hook-free wrapper returns `null` so `fetchCards` never runs when there is nothing to assign.
  [`NoOriginFilter.tsx:41`](../../ui/app/lists/NoOriginFilter.tsx#L41)

- One predicate: blank origin and the viewer is the payer.
  [`NoOriginFilter.tsx:28`](../../ui/app/lists/NoOriginFilter.tsx#L28)

- Host still mounts the filter only after expenses load; it does not duplicate the predicate.
  [`page.tsx:405`](../../ui/app/lists/[listId]/page.tsx#L405)

**Assign surface**

- When shown, the toggle always includes the count; the empty-state branch is gone.
  [`NoOriginFilter.tsx:141`](../../ui/app/lists/NoOriginFilter.tsx#L141)

**Copy**

- EN/ES empty-state strings removed; toggle/assign chrome kept.
  [`lists.ts:87`](../../ui/lib/i18n/lists.ts#L87)

**Tests**

- Empty list, other-user-only blanks, and a post-assign re-render all hide the disclosure.
  [`NoOriginFilter.test.tsx:149`](../../ui/app/lists/NoOriginFilter.test.tsx#L149)
