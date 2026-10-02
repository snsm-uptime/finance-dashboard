---
title: Fix CI/CD Linting Violations (eslint & ruff)
type: fix
created: 2026-10-01
status: done
route: one-shot
---

# Fix CI/CD Linting Violations (eslint & ruff)

## Intent

**Problem:** CI/CD lint checks failing on main — eslint warnings (8 unused variables/imports) + 1 error (explicit any), plus ruff check finding 2 unused imports in Python test.

**Approach:** Remove all unused imports and variables, replace explicit `any` with proper type. All changes are linting-only with zero functional impact.

## Changes Made

### API (`api/`)
- **tests/test_reassign_entry_application.py:11** — Remove unused imports (`AuthorizeListAccessCommand`, `AuthorizeListAccessService`)

### UI (`ui/`)
- **app/alias/AliasSetupForm.test.tsx:93** — Remove unused `_value` parameter from setter
- **app/budgets/[budgetId]/BudgetAssignPanel.tsx:7,17** — Remove unused imports (`PrimaryButton`, `GhostButton`)
- **app/lists/ListReceiptMenu.tsx:6** — Remove unused import (`FormIconSubmit`)
- **components/AccountMenu.test.tsx:154** — Remove unused `_value` parameter from setter
- **components/ItemChipSelector/ItemChipSelector.tsx:72** — Remove unused `handleCancel` function
- **components/soft-ledger/ReceiptRowMenu.test.tsx:37** — Replace `any` with proper type `{ title: string; body: string; confirmLabel: string }`
- **lib/imageEncode.test.ts:127,152** — Remove unused `_value` parameters from setters (2 occurrences)

## Verification

✅ **npm run lint** — No errors (0 problems)  
✅ **uv run ruff check** — All checks passed  
✅ **uv run ruff format --check** — 237 files already formatted

## Suggested Review Order

1. **API fix** → api/tests/test_reassign_entry_application.py (simple unused import removal)
2. **UI component fixes** → ui/app/budgets/[budgetId]/BudgetAssignPanel.tsx (removed PrimaryButton, GhostButton imports)
3. **UI component fixes** → ui/app/lists/ListReceiptMenu.tsx (removed FormIconSubmit import)
4. **Test fixes** → ui/app/alias/AliasSetupForm.test.tsx (removed _value parameter)
5. **Test fixes** → ui/components/AccountMenu.test.tsx (removed _value parameter)
6. **Test fixes** → ui/components/ItemChipSelector/ItemChipSelector.tsx (removed handleCancel function)
7. **Test type safety** → ui/components/soft-ledger/ReceiptRowMenu.test.tsx (replaced any with proper type)
8. **Test fixes** → ui/lib/imageEncode.test.ts (removed _value parameters)

**Commit:** `efab2db` — fix: resolve eslint and ruff linting violations
