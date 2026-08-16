---
title: 'Origin belongs to the payer: block non-self creation and non-payer assignment'
token_check: 'over 1600 target (~2100-2300 est); human chose Keep as one spec on 2026-08-15 — not independently splittable without reopening the create+PATCH bypass'
type: 'bugfix'
created: '2026-08-15'
status: 'done'
baseline_commit: '36b420fa56212bdf94ce59b536536840d5187cb3'
review_loop_iteration: 1
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `ManualExpenseForm` lets the acting user pick any list member as payer, but Origin always shows the *acting user's own* cards. An actor can attach their own card/Cash as origin to an expense paid by someone else. A first pass blocked this only at creation (forcing origin blank when `payer_id != actor_user_id`), but review found that's trivially bypassed: the existing `PATCH .../expenses/{id}/origin` endpoint (Story 4.2's no-origin assign flow) never checks who the entry's payer is — any list member can immediately re-attach their own card to someone else's blanked entry. "Later validation by the actual owner of the transaction" means origin can only ever be set, at any point, by the entry's actual payer.

**Approach:** Two enforcement points, both authoritative server-side (not UI-trusted): (1) **create** — `validate_manual_expense` blanks origin when `payer_id != actor_user_id`, after shape-validating whatever was sent (so malformed origin still 422s; only well-formed origin gets silently dropped). (2) **assign/update** — `UpdateExpenseOriginService`/`update_ledger_entry_origin` now reject the PATCH (403) whenever the acting user isn't the entry's `payer_id`. `NoOriginFilter` only surfaces/offers assignment for the viewer's own no-origin expenses, since anything else would always 403.

## Boundaries & Constraints

**Always:** Origin shape validation (`_validate_origin`) runs before the payer-mismatch override at create time — malformed origin always 422s regardless of payer. The PATCH-origin payer check runs after the existing `write_expense` ACL check and before the card-ownership check. Create-time mismatch stays a silent drop (still a valid create); PATCH-time mismatch is an explicit rejection (a non-payer attempting to set someone else's origin is a rule violation, not a benign no-op).

**Ask First:** None — resolved via two rounds of clarification (enforcement layer + UI behavior + assign-flow scope) before this spec.

**Never:** Do not change the `write_expense` ACL/list-membership check itself — the new payer check is additional, not a replacement. Do not restrict *viewing* an expense because its origin is unset — only who may *set* it. Do not build card-deletion cascade handling (still deferred per Story 4.2).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Self payer, card origin (create) | `payer_id == actor_user_id`, `origin_kind="card"` | Draft carries the chosen origin (unchanged) | N/A |
| Non-self payer, well-formed origin (create) | `payer_id != actor_user_id`, `origin_kind="card"`/`"cash"` set | Forced to `(None, None)`; expense still created (201) | N/A |
| Non-self payer, malformed origin (create) | `payer_id != actor_user_id`, `origin_kind="card"` with no `origin_card_id` | Still raises — shape is validated before the payer override | `InvalidManualExpenseError` (422) |
| Payer sets origin on their own entry via PATCH | `entry.payer_id == actor_user_id` | Origin updates as chosen (unchanged from Story 4.2) | N/A |
| Non-payer member attempts PATCH origin | `entry.payer_id != actor_user_id`, actor is a list member | Rejected, origin unchanged | New error, 403, `code: "not_entry_payer"` |
| UI: payer switched away from self (create form) | User selects a non-self payer | Origin field disappears; prior `originValue` cleared | N/A |
| UI: `NoOriginFilter` listing | Viewer is a list member but not every no-origin item's payer | Only rows where `expense.payer_id === currentUserId` appear as assignable | N/A |

</frozen-after-approval>

## Code Map

- `api/domain/expenses.py` -- `validate_manual_expense`: reorder so `_validate_origin` (shape check) runs before the `payer_id != actor_user_id` blank-override.
- `api/domain/errors.py` -- add `NotEntryPayerError(DomainError)`, mirroring `NotListOwnerError`'s shape (message + no-arg `__init__`).
- `api/application/expenses.py` -- `ExpenseRepository.update_ledger_entry_origin` Protocol gains `actor_user_id: UUID`; `UpdateExpenseOriginService.execute` passes `command.actor_user_id` through to it; `CreateManualExpenseService.execute` keeps passing `actor_user_id` into `validate_manual_expense`.
- `api/adapters/persistence/repositories.py:498` -- `SqlAlchemyListRepository.update_ledger_entry_origin` gains `actor_user_id: UUID`; after the existing `SubjectNotFoundError` guard, raise `NotEntryPayerError()` when `row.payer_id != actor_user_id`, before mutating.
- `api/api/routes/lists.py:461` -- `update_list_expense_origin`: catch `NotEntryPayerError` → `403` `{"detail": str(exc), "code": "not_entry_payer"}`, mirroring the existing `NotListOwnerError` except-clause pattern in this file.
- `api/tests/test_manual_expense_domain.py` -- `actor_user_id=` added to all existing calls (as before); forced-blank tests for card/cash (as before); new malformed-origin-with-non-self-payer test.
- `api/tests/test_expenses_application.py` -- `_FakeExpenseRepo.update_ledger_entry_origin` gains `actor_user_id` and the same `NotEntryPayerError` guard; new test for non-payer PATCH rejection; existing non-self-payer create test kept.
- `api/tests/test_manual_expense_api.py` -- existing non-self-payer create test kept; new integration test for PATCH-by-non-payer-member → 403.
- `ui/app/lists/ManualExpenseForm.tsx` -- hide Origin field when `payerId !== currentUserId`; clear `originValue` on non-self payer selection (as before).
- `ui/app/lists/NoOriginFilter.tsx` -- new required `currentUserId: string` prop; `noOrigin` filter becomes `e.origin_kind === null && e.payer_id === currentUserId`.
- `ui/app/lists/[listId]/page.tsx:405` -- pass `currentUserId={session.user_id}` into `<NoOriginFilter>`.
- `ui/app/lists/ManualExpenseForm.test.tsx`, `ui/app/lists/NoOriginFilter.test.tsx` -- new/updated cases (see Tasks).

## Tasks & Acceptance

**Execution:**
- [x] `api/domain/expenses.py` -- in `validate_manual_expense`, call `_validate_origin(origin_kind=origin_kind, origin_card_id=origin_card_id)` first (as already happens), then, only after that succeeds, if `payer_id != actor_user_id` overwrite the *validated* result to `(None, None)` before building the draft.
- [x] `api/domain/errors.py` -- add `NotEntryPayerError(DomainError)`: `MESSAGE = "Only the payer can set this expense's origin."`, no-arg `__init__` calling `super().__init__(self.MESSAGE)` (mirror `NotListMemberError`).
- [x] `api/application/expenses.py` -- extend `ExpenseRepository.update_ledger_entry_origin` Protocol signature with `actor_user_id: UUID`; in `UpdateExpenseOriginService.execute`, pass `actor_user_id=command.actor_user_id` into `self._repo.update_ledger_entry_origin(...)`; keep the existing `actor_user_id=command.actor_user_id` plumbing into `validate_manual_expense` in `CreateManualExpenseService.execute`.
- [x] `api/adapters/persistence/repositories.py` -- `update_ledger_entry_origin` gains `actor_user_id: UUID` param; immediately after the existing `if row is None or ... raise SubjectNotFoundError()` block, add `if row.payer_id != actor_user_id: raise NotEntryPayerError()`; import `NotEntryPayerError` from `domain.errors`.
- [x] `api/api/routes/lists.py` -- import `NotEntryPayerError`; in `update_list_expense_origin`'s `except` chain, add `except NotEntryPayerError as exc: return JSONResponse(status_code=status.HTTP_403_FORBIDDEN, content={"detail": str(exc), "code": "not_entry_payer"})` before the existing `SubjectNotFoundError`/ACL handlers.
- [x] `api/tests/test_manual_expense_domain.py` -- add `actor_user_id=payer` to every existing `validate_manual_expense(...)` call; add `test_validate_forces_blank_card_origin_when_payer_is_not_actor` and `..._cash_...` (both: non-self payer + well-formed origin → forced `(None, None)`, no raise); add `test_validate_rejects_malformed_origin_even_when_payer_is_not_actor` (non-self payer, `origin_kind="card"` with no `origin_card_id` → still raises `InvalidManualExpenseError`, proving shape validation isn't skipped).
- [x] `api/tests/test_expenses_application.py` -- update `_FakeExpenseRepo.update_ledger_entry_origin` to accept `actor_user_id: UUID` and raise `NotEntryPayerError()` when `existing.payer_id != actor_user_id` (mirror the real repo); add `test_create_with_non_self_payer_forces_origin_blank` (as before); add `test_update_origin_by_non_payer_member_rejected`: actor A creates an entry with payer B (origin ends up blank per the create rule), then `UpdateExpenseOriginService.execute` called with `actor_user_id=A` on that entry → raises `NotEntryPayerError`.
- [x] `api/tests/test_manual_expense_api.py` -- keep `test_create_expense_with_non_self_payer_forces_origin_blank` (as before, using `ListMembershipModel` direct-seed pattern from `test_list_members_roster_labels_with_alias`); add `test_patch_expense_origin_by_non_payer_member_forbidden`: owner creates an expense with themselves as payer, a second seeded member (not the payer) signs in and `PATCH`es its origin → `403`, `code == "not_entry_payer"`.
- [x] `ui/app/lists/ManualExpenseForm.tsx` -- wrap the Origin field block in `payerId === currentUserId ? (...) : null`; in the payer select's `onChange`, when `next !== currentUserId` also `setOriginValue("")` (unchanged from prior attempt).
- [x] `ui/app/lists/ManualExpenseForm.test.tsx` -- keep the 3 cases from the prior attempt (hides on non-self payer; submits no origin after a non-self detour; resets to blank on return to self).
- [x] `ui/app/lists/NoOriginFilter.tsx` -- add `currentUserId: string` to `Props`; change the `noOrigin` filter from `expenses.filter((e) => e.origin_kind === null)` to `expenses.filter((e) => e.origin_kind === null && e.payer_id === currentUserId)`.
- [x] `ui/app/lists/[listId]/page.tsx` -- add `currentUserId={session.user_id}` to the `<NoOriginFilter listId={listId} expenses={expenses} ...>` call (~line 405-413).
- [x] `ui/app/lists/NoOriginFilter.test.tsx` -- add `currentUserId="user-a"` to all 7 existing `<NoOriginFilter>` render call sites (matches the `expense()` helper's default `payer_id: "user-a"`, preserving current test intent); add one new test: an `expense({ payer_id: "user-b" })` with `origin_kind: null` is excluded from the rendered no-origin rows when `currentUserId="user-a"`.

**Acceptance Criteria:**
- Given a manual expense is created with `payer_id` different from the actor and a well-formed origin, when validated, then the persisted entry has `origin_kind: null`/`origin_card_id: null` regardless of what was sent; malformed origin still 422s.
- Given a list member who is not an expense's payer, when they `PATCH` that expense's origin (directly or via `NoOriginFilter`), then the request is rejected with `403`/`not_entry_payer` and origin is unchanged.
- Given the entry's actual payer, when they set origin via `PATCH` (including on an entry someone else created for them), then it succeeds exactly as Story 4.2 shipped.
- Given `ManualExpenseForm` has a non-self payer selected, when viewed, then no Origin control renders.
- Given `NoOriginFilter` is viewed by a list member, when the list has no-origin items belonging to other members, then only the viewer's own no-origin items appear as assignable.

## Design Notes

The PATCH-origin payer check lives in the persistence adapter (`update_ledger_entry_origin`), not a separate application-layer pre-fetch, mirroring this method's existing `SubjectNotFoundError` guard for incomplete-stub rows — one round trip, same established shape in this file, rather than introducing a second repo-read method for a single boolean check. `NotEntryPayerError` is a new domain error (not a reuse of `InvalidManualExpenseError`) because this is an authorization-style rejection on well-formed input, not a data-validity error — semantically closer to `NotListOwnerError` (also 403, also "wrong actor for this action"), which its shape mirrors.

## Spec Change Log

- 2026-08-15: `bmad-code-review` (Blind Hunter) found the create-only fix left the invariant trivially bypassable via the existing open `PATCH .../origin` assign flow — any member could immediately re-attach their own card to a just-blanked entry belonging to someone else. Root cause was the frozen spec's original "Never: do not touch `validate_origin_update`/`UpdateExpenseOriginService`" boundary, based on an unconfirmed assumption. Human resolved: restrict PATCH-origin to the entry's actual payer only. Known-bad state avoided: an actor logging an expense on another member's behalf being able to attach their own card to it, whether in one step (blocked in the first pass) or two (blocked now). KEEP: the create-time domain/application changes and the `ManualExpenseForm` UI-hide behavior from the first pass were correct and are carried forward unchanged.
- 2026-08-15: `bmad-review-edge-case-hunter` found the create-time blank-override ran before origin shape validation, so a non-self-payer request with a malformed `origin_kind`/`origin_card_id` was silently dropped instead of raising. Amended: `_validate_origin` now runs first; the payer-mismatch override only applies to an already-valid result.

## Verification

**Commands:**
- `docker compose -f docker-compose.yml -f docker-compose.test.yml build api && docker run --rm --network finance-helper_internal -e DATABASE_URL="postgresql+psycopg://finance:devdbpw@db:5432/finance_helper" finance-helper-api pytest -q` -- expected: full suite green (`db`'s Compose healthcheck is known to stall for up to an hour after a rebuild — see prior debug log; this bypasses `depends_on` by running the built image directly against the network).
- `npx vitest run` (in `ui/`) -- expected: full suite green including new/updated `ManualExpenseForm`/`NoOriginFilter` cases.
- `npx tsc --noEmit` (in `ui/`) -- expected: clean.

## Suggested Review Order

**Create-time enforcement**

- Entry point: origin is silently blanked whenever the payer isn't the actor, but only after shape validation already ran.
  [`expenses.py:118`](../../api/domain/expenses.py#L118)

- `CreateManualExpenseService` threads the actor identity down into that check.
  [`application/expenses.py:197`](../../api/application/expenses.py#L197)

**Assign-time enforcement (closes the PATCH bypass a first pass missed)**

- New domain error for "you didn't pay this, you can't set its origin."
  [`errors.py:240`](../../api/domain/errors.py#L240)

- Payer identity is checked *before* card-ownership/shape validation — a non-payer always gets 403, never a misleading 422.
  [`application/expenses.py:259`](../../api/application/expenses.py#L259)

- Lightweight payer lookup backing that check, plus the same guard kept in the write path as defense-in-depth.
  [`repositories.py:499`](../../api/adapters/persistence/repositories.py#L499) · [`repositories.py:536`](../../api/adapters/persistence/repositories.py#L536)

- Maps the new error to `403 not_entry_payer` on the PATCH route.
  [`lists.py:488`](../../api/api/routes/lists.py#L488)

**UI enforcement and UX**

- Origin control disappears entirely once a non-self payer is picked; any prior selection is cleared so it can't leak back in.
  [`ManualExpenseForm.tsx:286`](../../ui/app/lists/ManualExpenseForm.tsx#L286) · [`ManualExpenseForm.tsx:280`](../../ui/app/lists/ManualExpenseForm.tsx#L280)

- `NoOriginFilter` only lists/offers assignment for the viewer's own no-origin expenses, since anything else would always 403.
  [`NoOriginFilter.tsx:65`](../../ui/app/lists/NoOriginFilter.tsx#L65)

- `currentUserId` threaded from the server component into the filter.
  [`page.tsx:407`](../../ui/app/lists/%5BlistId%5D/page.tsx#L407)

- Copy tightened (EN+ES) to say "your items," matching the now payer-scoped filter.
  [`lists.ts:87`](../../ui/lib/i18n/lists.ts#L87)

**Tests**

- Validation-order + forced-blank cases for the create path.
  [`test_manual_expense_domain.py`](../../api/tests/test_manual_expense_domain.py)

- Fake-repo update + non-payer rejection, including the ordering-regression case (unowned card still 403s, never 422).
  [`test_expenses_application.py`](../../api/tests/test_expenses_application.py)

- Postgres integration coverage for both the create-blank and PATCH-forbidden paths, plus a persistence check that a rejected PATCH doesn't mutate the row.
  [`test_manual_expense_api.py`](../../api/tests/test_manual_expense_api.py)

- UI test coverage for the hide/reset behavior and the payer-scoped filter.
  [`ManualExpenseForm.test.tsx`](../../ui/app/lists/ManualExpenseForm.test.tsx) · [`NoOriginFilter.test.tsx`](../../ui/app/lists/NoOriginFilter.test.tsx)
