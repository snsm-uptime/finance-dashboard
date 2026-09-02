---
title: 'Budget update/delete endpoints + viewer share on history lines'
type: 'feature'
created: '2026-09-02'
status: 'done'
review_loop_iteration: 0
context: []
baseline_commit: 'd8255c8d65a047e3d27aa55eb2053f805f2051a6'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `/budgets/{id}` has no update or delete route (only create/list/get/assign/rules), and `BudgetHistoryLine` only carries the full ledger-entry `amount_crc` — for an entry on a shared list this is the whole receipt, not the viewer's portion, so any future UI cannot show "what I actually paid."

**Approach:** Add `PATCH`/`DELETE /budgets/{budget_id}` mirroring the existing owner-only, 404-on-deny `RenameListService`/`DeleteListService` pattern in `api/application/lists.py`. Extract the per-entry viewer-share resolution already used by `ListExpensesService._with_viewer_lens` (`api/application/expenses.py:362`) into a reusable function, and call it per history-line entry (each entry's own `list_id` supplies its members/default-split/overrides via `SqlAlchemyListRepository`) to populate a new `viewer_share_crc` + `payer_id` on `BudgetHistoryLine`.

## Boundaries & Constraints

**Always:**
- Update/delete follow AD-30: a budget not owned by the actor is indistinguishable from nonexistent — 404 `budget_not_found`, never 403 (matches `_get_owned_budget` in `api/application/budgets.py:262`).
- `UpdateBudgetBody` mirrors `CreateBudgetBody` (name, cap, currency, source_list_ids) — full-replace PATCH, validated with the same `validate_budget_*` functions and the same `NotListMemberError` check for source lists.
- Reject a rename to a name already used by another budget owned by the same actor (case-sensitive exact match), excluding the budget being updated. New domain error `DuplicateBudgetNameError` → 422 `code: "budget_name_taken"`.
- `viewer_share_crc`/`payer_id` are computed the same way as today's `spent`/`history` (CRC-only per AD from Story 6.5; non-CRC budgets keep `history=()`). When lens resolution is unavailable (solo-member list, or the same exceptions `_with_viewer_lens` already swallows), `viewer_share_crc` falls back to the full `amount_crc`.
- Reuse `SqlAlchemyListRepository` (already duck-type-compatible with `ExpenseRepository`) for the per-entry member/default-split/override lookups — do not add a parallel repository.
- Deleting a budget relies on existing `ON DELETE CASCADE`/`SET NULL` FKs (`budget_rules.budget_id` CASCADE, `budget_source_lists.budget_id` CASCADE, `ledger_entries.budget_id` SET NULL) — no manual cascade code.

**Ask First:** none — behavior fully specified above.

**Never:** No frontend changes in this spec (deferred as `budget-detail-page-redesign` in `deferred-work.md`). Do not add a 403 path for update/delete. Do not change `spent`/`state` computation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Rename to unique name | `PATCH /budgets/{id}` `{name: "New"}`, no other budget of this owner named "New" | 200, updated `BudgetResponse` | N/A |
| Rename collides | `PATCH` name matches another of the actor's budgets | 422 `budget_name_taken` | No write performed |
| Update foreign budget | `PATCH`/`DELETE` on a budget owned by a different user | 404 `budget_not_found` | No write performed |
| Delete budget with rules + assigned entries | `DELETE /budgets/{id}` where budget has rules and CRC entries with `budget_id` set | 204; rules gone, those entries' `budget_id` now NULL | N/A |
| Shared-list history line | CRC budget's source list has >1 member, entry has a resolvable split | `viewer_share_crc` = viewer's allocated share (not full `amount_crc`), `payer_id` set | N/A |
| Solo-list history line | Source list has exactly 1 member | `viewer_share_crc` == `amount_crc` | N/A |
| Split resolution fails | Same exceptions `_with_viewer_lens` already catches (e.g. missing override subject) | `viewer_share_crc` falls back to full `amount_crc` | Swallowed, matches existing lens-failure behavior |

</frozen-after-approval>

## Code Map

- `api/application/lists.py:333` `RenameListService`/`358` `DeleteListService` — pattern to mirror for budgets (owner-only, 404-on-deny variant).
- `api/application/expenses.py:362` `ListExpensesService._with_viewer_lens` — logic to extract into a reusable function for per-entry viewer share.
- `api/application/budgets.py` — add `UpdateBudgetCommand`/`UpdateBudgetService`, `DeleteBudgetCommand`/`DeleteBudgetService`; extend `_compute_spent_and_history` to populate `viewer_share_crc`/`payer_id` per line; extend `BudgetHistoryLine`, `BudgetRepository` Protocol (`update_budget`, `delete_budget`, `list_budgets_for_owner` reuse for uniqueness check).
- `api/adapters/persistence/budgets.py` — add `update_budget`/`delete_budget` on `SqlAlchemyBudgetRepository`.
- `api/api/routes/budgets.py` — add `PATCH`/`DELETE /budgets/{budget_id}`, mirroring `rename_list`/`delete_list` in `api/api/routes/lists.py:892,973`.
- `api/api/schemas/budgets.py` — add `UpdateBudgetBody` (mirrors `CreateBudgetBody`); add `viewer_share_crc: str`, `payer_id: UUID` to `BudgetHistoryLineResponse`.
- `api/domain/errors.py:633` — add `DuplicateBudgetNameError(DomainError)` near the other `InvalidBudget*Error` classes.
- `api/domain/expense_lens.py` — no change; reused as-is via the extracted helper.

## Tasks & Acceptance

**Execution:**
- [x] `api/domain/errors.py` -- add `DuplicateBudgetNameError` -- new 422 case not covered by existing errors
- [x] `api/application/expenses.py` or `api/domain/expense_lens.py` -- extract `_with_viewer_lens`'s body into a module-level `resolve_viewer_lens_for_entry(...)` helper, call it from `ListExpensesService` unchanged -- avoid duplicating split-resolution logic across two domains
- [x] `api/application/budgets.py` -- add `UpdateBudgetCommand/Service`, `DeleteBudgetCommand/Service`; extend `BudgetHistoryLine` with `viewer_share_crc: Decimal`, `payer_id: UUID`; wire the extracted helper into `_compute_spent_and_history` per entry using its own `list_id` -- new CRUD + share data
- [x] `api/adapters/persistence/budgets.py` -- implement `update_budget`, `delete_budget` -- persistence for the new services
- [x] `api/api/schemas/budgets.py` -- add `UpdateBudgetBody`; extend `BudgetHistoryLineResponse` -- wire response
- [x] `api/api/routes/budgets.py` -- add `PATCH`/`DELETE /budgets/{budget_id}` -- expose new services
- [x] `api/api/tests/...` (mirror existing budgets route/service test files) -- cover the I/O matrix rows above -- required by matrix

**Acceptance Criteria:**
- Given a budget the actor owns, when `PATCH` with a name unique to that owner, then the budget is renamed and `200` returned.
- Given a budget the actor owns, when `PATCH` with a name already used by another of the actor's budgets, then `422 budget_name_taken` and no change is persisted.
- Given a budget the actor does not own, when `PATCH` or `DELETE`, then `404 budget_not_found`.
- Given a CRC budget whose source list has multiple members, when its detail is fetched, then each shared entry's `viewer_share_crc` reflects the actor's resolved share, not the full entry amount.

## Design Notes

The extracted lens helper takes `(entry, *, viewer_id, list_repo)` and internally does the member/default-split/override lookups keyed by `entry.list_id` — this is what lets a single history line loop work across a budget's multiple source lists without per-list branching in `_compute_spent_and_history`.

## Verification

**Commands:**
- `cd api && uv run pytest -k budgets` -- expected: all budgets route/service/repo tests pass, including new update/delete/share-line cases
- `cd api && uv run ruff check .` -- expected: clean

## Suggested Review Order

**Budget update/delete — service layer**

- Entry point: owner-only update, mirrors `RenameListService`, adds same-owner name-uniqueness guard before writing.
  [`budgets.py:170`](../../api/application/budgets.py#L170)

- Delete relies entirely on existing FK cascades — no manual cascade code.
  [`budgets.py:213`](../../api/application/budgets.py#L213)

- Persistence: row fetch now null-checked (post-review patch) before mutation, unlike the original diff.
  [`budgets.py:113`](../../api/adapters/persistence/budgets.py#L113)

- Delete drops the `BudgetModel` row; `budget_rules`/`budget_source_lists` CASCADE, `ledger_entries.budget_id` SET NULL.
  [`budgets.py:128`](../../api/adapters/persistence/budgets.py#L128)

- New `PATCH`/`DELETE` routes, error-mapping style copied from the existing `create_budget` handler.
  [`routes/budgets.py:246`](../../api/api/routes/budgets.py#L246)
  [`routes/budgets.py:306`](../../api/api/routes/budgets.py#L306)

- New domain error for the duplicate-name rejection (422 `budget_name_taken`).
  [`errors.py:684`](../../api/domain/errors.py#L684)

**Viewer share on history lines**

- Per-entry share resolution wired into the existing history loop, keyed by each entry's own `list_id` (multi-source-list aware).
  [`budgets.py:283`](../../api/application/budgets.py#L283)

- Extracted reusable resolver — same logic `ListExpensesService` already used, now shared by budgets.
  [`expenses.py:328`](../../api/application/expenses.py#L328)

- `GetBudgetDetailService` now threads `list_repo`/actor through; `ListBudgetsService` intentionally omits both (history discarded there).
  [`budgets.py:389`](../../api/application/budgets.py#L389)

- Response schema: `viewer_share_crc`/`payer_id` added alongside the existing `amount_crc`.
  [`schemas/budgets.py:51`](../../api/api/schemas/budgets.py#L51)

**Peripherals**

- `UpdateBudgetBody` mirrors `CreateBudgetBody` — full-replace PATCH shape.
  [`schemas/budgets.py:26`](../../api/api/schemas/budgets.py#L26)

- Integration coverage for rename/collision/foreign-404/cascade-delete/shared-vs-solo share, plus the post-review regression test for the null-guard fix.
  [`test_budgets_integration.py:707`](../../api/tests/test_budgets_integration.py#L707)

- Fake-repo unit coverage for the same service behaviors, faster feedback loop than the Postgres-backed suite.
  [`test_budgets_application.py:1`](../../api/tests/test_budgets_application.py#L1)
