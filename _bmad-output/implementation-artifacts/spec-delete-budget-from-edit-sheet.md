---
title: 'Delete budget from the edit sheet (pencil icon)'
type: 'feature'
created: '2026-09-09'
status: 'done'
review_loop_iteration: 0
context: []
route: 'one-shot'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `/budgets/{id}` has always had a `DELETE` endpoint (Story 7.5) but no UI ever called it — the budget detail chrome offers archive/unarchive and edit via the pencil icon, with no way to permanently delete a budget.

**Approach:** Add a destructive "delete" action inside the existing pencil-icon edit sheet (`BudgetUpdateForm`), reusing its Sheet as a three-state view (edit form / period-change confirm / delete confirm) and a new `deleteBudget` client helper that calls the already-existing `DELETE /api/budgets/{id}` BFF route, then navigates back to `/budgets` on success.

</frozen-after-approval>

## Suggested Review Order

**Delete flow wiring**

- Entry point — the trash-icon trigger inside the edit form that opens the delete-confirm view.
  [`BudgetUpdateForm.tsx:384`](../../ui/app/budgets/[budgetId]/BudgetUpdateForm.tsx#L384)

- Confirm/cancel handler — calls `deleteBudget`, resets the confirm state uniformly on both outcomes, and only navigates away on success.
  [`BudgetUpdateForm.tsx:129`](../../ui/app/budgets/[budgetId]/BudgetUpdateForm.tsx#L129)

- Sheet's three-way branch (edit / period-confirm / delete-confirm) driving title, corner action, and body.
  [`BudgetUpdateForm.tsx:214`](../../ui/app/budgets/[budgetId]/BudgetUpdateForm.tsx#L214)

**Client + copy**

- New client call — thin wrapper over the pre-existing `DELETE /api/budgets/{id}` BFF route.
  [`budgetsClient.ts:387`](../../ui/app/budgets/budgetsClient.ts#L387)

- Confirm-action copy deliberately distinct from the trigger's aria-label ("Yes, delete" vs. "Delete budget") to avoid two identically-named controls.
  [`lists.ts:213`](../../ui/lib/i18n/lists.ts#L213)

**Tests**

- Delete confirm/cancel/error/in-flight coverage added alongside the existing period-change tests.
  [`BudgetUpdateForm.test.tsx:182`](../../ui/app/budgets/[budgetId]/BudgetUpdateForm.test.tsx#L182)
