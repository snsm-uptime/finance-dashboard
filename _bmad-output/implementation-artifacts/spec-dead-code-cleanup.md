---
title: 'Dead code and unused i18n key cleanup'
type: 'chore'
created: '2026-09-06'
status: 'done'
review_loop_iteration: 0
context: []
baseline_commit: 'febbd090781684dce48778983634c978003713eb'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The `ui/` codebase has accumulated dead components and unused i18n translation keys from superseded work, adding noise and false signal for future maintainers.

**Approach:** Remove confirmed-dead code and translation keys (per user sign-off on each item), and fix three straightforward unused-import/unused-variable lint issues in otherwise-live files. Keep `ButtonGroup/` — user chose to retain it despite being test-only.

## Boundaries & Constraints

**Always:** Verify each target has zero references (beyond its own file/test) before deleting — re-grep at execution time, not just trust the spec, in case something changed. Run lint/typecheck/tests after each removal group.

**Ask First:** Anything not explicitly listed below that looks unused during execution — do not delete opportunistically; only remove what's itemized here.

**Never:** Do not remove `ButtonGroup/` (component or test) — explicitly kept. Do not touch `budgetsHistoryViaManual`/`budgetsHistoryViaRule` i18n keys (confirmed live via dynamic key lookup) or `budgetsArchivedEmpty` (distinct from `budgetsArchived`, confirmed live).

</frozen-after-approval>

## Code Map

- `ui/components/AccountNavLink.tsx` -- dead component, zero references anywhere, no test -- delete file
- `ui/components/soft-ledger/OriginCards.tsx` -- dead component, only referenced by its own tests -- delete file
- `ui/components/soft-ledger/soft-ledger.test.tsx` -- contains `OriginCards` import and 5 `describe`/`it` blocks (lines ~12, ~203-290ish) -- remove the import and those test cases
- `ui/lib/i18n/lists.ts` -- unused keys `balanceLabel` (en:26/es:228), `budgetsHistoryTitle` (en:141/es:344), `budgetsSourcesHeading` (en:144/es:347), `budgetsManageSourcesAria` (en:147/es:350), `budgetsArchived` (en:175/es:378), `budgetsOpenEnded` (en:192/es:395) -- remove both locale entries for each key
- `ui/lib/i18n/upload.ts` -- unused keys `individualReviewAllCaughtUp` (en:98/es:237), `cardIdentificationIban` (en:129/es:268) -- remove both locale entries for each key
- `ui/lib/i18n/account.ts` -- unused key `manageCards` (en:26/es:53) -- remove both locale entries
- `ui/lib/i18n/cards.ts` -- unused key `listTitle` (en:14/es:48) -- remove both locale entries
- `ui/app/budgets/[budgetId]/BudgetAssignPanel.tsx` -- unused imports `PrimaryButton`, `GhostButton` (line ~7,17) -- remove unused imports
- `ui/app/budgets/[budgetId]/BudgetRulesPanel.tsx` -- unused local `headers` (line ~13) -- remove unused variable
- `ui/app/budgets/[budgetId]/BudgetUpdateForm.tsx` -- unused import `useRef` (line ~3) -- remove unused import

## Tasks & Acceptance

**Execution:**
- [x] `ui/components/AccountNavLink.tsx` -- delete file -- confirmed zero references
- [x] `ui/components/soft-ledger/OriginCards.tsx` -- delete file -- confirmed only referenced by its own tests
- [x] `ui/components/soft-ledger/soft-ledger.test.tsx` -- remove `OriginCards` import and its describe/it blocks -- test target no longer exists
- [x] `ui/lib/i18n/lists.ts` -- remove 6 unused keys (both `en` and `es`) -- confirmed unused via grep
- [x] `ui/lib/i18n/upload.ts` -- remove 2 unused keys (both `en` and `es`) -- confirmed unused via grep
- [x] `ui/lib/i18n/account.ts` -- remove 1 unused key (both `en` and `es`) -- confirmed unused via grep
- [x] `ui/lib/i18n/cards.ts` -- remove 1 unused key (both `en` and `es`) -- confirmed unused via grep
- [x] `ui/app/budgets/[budgetId]/BudgetAssignPanel.tsx` -- remove unused `PrimaryButton`/`GhostButton` imports -- eslint no-unused-vars
- [x] `ui/app/budgets/[budgetId]/BudgetRulesPanel.tsx` -- remove unused `headers` local -- eslint no-unused-vars
- [x] `ui/app/budgets/[budgetId]/BudgetUpdateForm.tsx` -- remove unused `useRef` import -- eslint no-unused-vars

**Acceptance Criteria:**
- Given the cleanup is applied, when running the full lint/typecheck/test suite, then it passes with no new failures.
- Given `AccountNavLink` and `OriginCards` are deleted, when grepping the repo for their symbol names, then zero remaining references exist.
- Given the 10 i18n keys are removed from both `en` and `es` objects, when grepping the repo for each key name, then zero remaining references exist (aside from the locale files themselves, now removed).
- Given `ButtonGroup/` is untouched, when checking the diff, then no changes appear under `ui/components/ButtonGroup/`.

## Spec Change Log

## Verification

**Commands:**
- `npm --prefix ui run lint` -- expected: no errors, no new warnings in touched files
- `npm --prefix ui run typecheck` -- expected: passes (if a typecheck script exists; otherwise rely on lint + tsc via build)
- `npm --prefix ui test` -- expected: all tests pass, no failures from removed `OriginCards` test blocks

## Suggested Review Order

**Dead components removed**

- Component deleted outright — zero references anywhere, tied to a since-removed Account tab.
  [`AccountNavLink.tsx`](../../ui/components/AccountNavLink.tsx)

- Component deleted outright — Story 6.2 origin-spend cards, only ever referenced by its own tests.
  [`OriginCards.tsx`](../../ui/components/soft-ledger/OriginCards.tsx)

- Import and 5 test cases for the deleted `OriginCards` removed alongside it.
  [`soft-ledger.test.tsx:12`](../../ui/components/soft-ledger/soft-ledger.test.tsx#L12)

**Unused i18n keys removed (en/es pairs)**

- 6 unused keys removed; `budgetsArchivedEmpty`/`budgetsHistoryViaManual`/`budgetsHistoryViaRule` deliberately kept.
  [`lists.ts:26`](../../ui/lib/i18n/lists.ts#L26)

- 2 unused upload-review keys removed.
  [`upload.ts:98`](../../ui/lib/i18n/upload.ts#L98)

- 1 unused key removed.
  [`account.ts:26`](../../ui/lib/i18n/account.ts#L26)

- 1 unused key removed.
  [`cards.ts:14`](../../ui/lib/i18n/cards.ts#L14)

**Peripheral lint fixes (unused imports/vars)**

- Removed unused `PrimaryButton`/`GhostButton` imports.
  [`BudgetAssignPanel.tsx:7`](../../ui/app/budgets/%5BbudgetId%5D/BudgetAssignPanel.tsx#L7)

- Removed unused `headers` import from `next/headers`.
  [`BudgetRulesPanel.tsx:13`](../../ui/app/budgets/%5BbudgetId%5D/BudgetRulesPanel.tsx#L13)

- Removed unused `useRef` import.
  [`BudgetUpdateForm.tsx:3`](../../ui/app/budgets/%5BbudgetId%5D/BudgetUpdateForm.tsx#L3)
