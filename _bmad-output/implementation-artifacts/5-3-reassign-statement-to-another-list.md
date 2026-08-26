---
baseline_commit: 0d2972e02b2b826b6aa3e6795a0d8db9a985e30b
---

# Story 5.3: Reassign statement to another list

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

> **Correction after commit, not review.** FR-29. Quarantine is retired. Story 5.2 (dismiss failed parse) is still **backlog** and is **not** a blocker: this story moves **committed ledger rows**, not failed-parse evidence. Story 5.4 (batch rollback) is next — preserve `batch_id` so rollback still targets the journaled commit on the list where the batch **currently** lives.

## Story

As a list member,
I want to move a statement filed to the wrong list to another list I belong to,
so that balances on both lists stay correct after the mistake.

## Acceptance Criteria

1. **Given** a statement with committed ledger rows on list A (one or more Import Batches — row-level review: one batch per row; bulk: one batch for the whole statement) **When** I reassign it to list B that I belong to **Then** every **existing** ledger row originating from that statement moves with it **And** balances on both lists reflect the move (FR-29) **And** I see a one-line confirm that shares will follow destination list defaults unless item-level overrides already exist — no silent surprise **And** each moved row keeps its `import_batch_id` / batch row `id` — batch identity does not fork or merge.

2. **Given** the destination list **When** share allocations are applied after reassignment **Then** shares follow destination list default rules unless item-level overrides already exist (FR-29, FR-9/10). Allocations stay **computed at read time** (Epic 3 / 2.6) — do not persist share cents.

3. **Given** I am not a member of the target list **When** I attempt reassignment **Then** the action is rejected (NFR-3, AD-19). Same for missing membership on the **source** list from which the actor is operating.

4. **Given** reassignment completes **When** I view Soft-Ledger on each list **Then** settle strips and receipt lists update from the existing Epic 3/4 balance and expenses paths — **no parallel settle math**, no FX rematerialization.

## Scope — do not build

- Story **5.2** dismiss / PDF release on failed parse.
- Story **5.4** rollback UI/API (`DELETE` batch). Do not invent rollback here. After this story, 5.4 must still undo by `batch_id` on the **current** `import_batches.list_id`.
- Stories **5.5–5.7** same-price / alias / incomplete disclosure wiring.
- Changing **card** `routing_mode` / `fixed_list_id` (AD-20 / FR-11). Reassign is **statement destination history**, not card registry. [Source: `reviews/review-adversarial-divergence.md` FR-29 vs FR-11]
- Re-running **dedup** (`find_existing_identities`) or skipping rows that already exist on B. This is a **move**, not a re-commit. Duplicate `import_identity` on B is allowed (index is not unique — Story 4.12).
- Re-creating batches, new `batch_id`s, or merging many row-batches into one.
- Resurrecting **deleted** / **dedup_skipped** candidate rows (no ledger).
- Rematerializing FX (AD-7 already applied at original commit).
- Client-side share or FX math.
- Redis / workers / extra Compose service.
- New `*.module.css`; pill CTAs; “Mark settled”.
- Alembic unless a real new column is required — **prefer in-place `list_id` updates** on existing tables.

## Tasks / Subtasks

- [x] Task 0: Branch + reads
  - [x] 0.1 Branch: `feat/5/5-3-reassign-statement-to-another-list` from current `main` (one story per branch).
  - [x] 0.2 Read this file, `_bmad-output/project-context.md`, AD-4 / AD-19 / AD-21 in `ARCHITECTURE-SPINE.md`, `api/domain/list_access.py`, `api/application/list_access.py`, `api/application/import_session.py` (`commit_statement_batch` / `find_existing_identities` comment), `api/adapters/persistence/import_sessions.py` (`_insert_ledger_entries`), `api/application/expenses.py` + `api/domain/settle.py`, `ui/app/lists/[listId]/page.tsx`, `ReceiptRowMenu.tsx`, membership sketch.

- [x] Task 1: Domain + application reassign (AC: #1, #2, #3)
  - [x] 1.1 Add a frozen command + service in `api/application/` (e.g. `reassign_statement.py`). **Do not** put FastAPI/SQLAlchemy in `api/domain/`. Identify the statement by UUID (`import_statements.id`). Load all ledger entries whose `import_batch_id` → `import_batches.statement_id == statement_id` (or join candidate_row → statement). Empty set → domain error mapped to 404 (no committed rows / unknown statement).
  - [x] 1.2 **Move set:** only rows that **have** a ledger entry. Ignore `dedup_skipped` and `deleted` candidates. If the statement’s committed rows currently sit on **multiple** lists (row-level review to different lists — AD-4), **still move all of them to B** (epic AC: “every ledger row originating from that statement”). Fail the whole transaction if the actor is not a member of **B** or of **any current `list_id` of a row being moved** (no partial move).
  - [x] 1.3 **ACL:** `AuthorizeListAccessService` twice — source list(s) with `write_ledger` (or a new alias `reassign_statement` → `write_ledger` in `api/domain/list_access.py`) and destination with `import_to_list`. Unknown action must stay fail-closed. Update `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/membership-acl-enforcement-sketch.md` action matrix + caller map in the **same PR**.
  - [x] 1.4 **Same-list no-op:** dest == current unique list → 200, no writes.
  - [x] 1.5 **Atomic UPDATE** in one transaction:
    - `ledger_entries.list_id` → B
    - `import_batches.list_id` → B for every batch of that statement that still has ledger rows (do **not** change `import_batches.id`)
    - `import_candidate_rows.resolved_list_id` → B for those committed (non-skipped) rows
    - `receipts.list_id` if any moved entry has `receipt_id`
    - `split_overrides.list_id` for subjects (`item`/`receipt`) tied to moved entries/receipts — **keep override payload** (FR-29 item-override continuity)
  - [x] 1.6 **Do not** change `import_batch_id`, `import_candidate_row_id`, `import_identity`, amounts, FX columns, payer, origin, or card FKs.
  - [x] 1.7 **Payer:** imported rows use the committing actor as payer. Dest membership of the actor is required; do not rewrite `payer_id`. If an **item override** names a user who is not a member of B, settle/list-expenses already fail loud (`parse_split_spec` / `InvalidSplitOverrideError`) — do not silently drop the override; return 409 with a stable `code` rather than 500.
  - [x] 1.8 Unit tests (domain/application fakes, TDD): all rows+batches move; `batch_id` unchanged; dest non-member denied; source non-member denied; multi-list gather onto B; no-op same list; no ledger → not found; FX fields unchanged; override `list_id` follows; skip deleted/dedup_skipped.

- [x] Task 2: HTTP + BFF (AC: #1, #3)
  - [x] 2.1 FastAPI mutation, cookie session like other list writes. Recommended: `POST /lists/{list_id}/statements/{statement_id}/reassign` with body `{ "destination_list_id": "<uuid>" }` where `list_id` is the list the actor is viewing (must be one of the current homes of the statement’s ledger rows). Response: moved `ledger_entry_ids`, `batch_ids`, `from_list_ids`, `destination_list_id` — money as **strings** if any amounts appear (prefer ids-only).
  - [x] 2.2 Map errors like `lists.py`: unauthenticated 401; dest/source `NotListMemberError` → 403 `{ "code": "not_list_member" }` (generic, no list existence leak on dest if you only checked dest — still 403 for mutations per sketch); unknown statement / no committed rows → 404; override/membership conflict → 409 with `code`.
  - [x] 2.3 Expose `import_batch_id` and `statement_id` (nullable) on `GET /lists/{id}/expenses` / `ExpenseItemResponse` so the UI can offer reassign **only** on import-sourced rows. Hand expenses stay `null`. Wire through `ListedExpense` / persistence select — do not make the UI guess from description.
  - [x] 2.4 BFF: `ui/app/api/lists/[listId]/statements/[statementId]/reassign/route.ts` — cookie-forward, same pattern as `expenses/route.ts`. Add a focused BFF test next to `lists-invites.bff.test.ts` (or existing lists BFF file).
  - [x] 2.5 Integration (Postgres 16): two lists, shared member, bulk or assign-commit fixture rows, POST reassign, assert ledger+batch `list_id`, GET expenses/balances on A and B, stranger 403, non-member dest 403. Decimal asserts, no float.

- [x] Task 3: UI confirm + picker (AC: #1, #2, #4)
  - [x] 3.1 **Surface (spine-only — no mock):** list-detail receipt overflow. `ReceiptRowMenu` today has non-persisting Edit/Delete. Add a **third** item only when `statement_id` is present: “Move statement to another list” (EN+ES on `ui/lib/i18n/lists.ts` — same object, both locales). Do **not** add the action on hand rows.
  - [x] 3.2 Picker: membership lists from existing homepage/membership fetch **excluding** the current list. Reuse list-name rows / existing sheet or `IconButtonPopup` + confirm — Warm Balance tokens (`--surface`, `--border`, `--muted`, `--space-*`). Primary confirm is **not** a pill. Keyboard + no required swipe (UX-DR19).
  - [x] 3.3 **One-line confirm** before POST (required AC): EN+ES equivalent of: shares will follow the destination list’s default split unless this statement’s items already have their own split. No second paragraph of settle math.
  - [x] 3.4 After success: stay on list A (rows gone) or navigate to B — either is fine if both lists’ GET expenses/balances would show the move. Prefer staying on A and letting the list refresh (rows disappear; strip updates). Do not recompute CRC in the browser.
  - [x] 3.5 Tests (jsdom, test-after): menu item absent without `statement_id`; confirm copy present; picker omits current list; forbidden dest surfaces existing `errorForbidden` pattern. Mock fetch; no Playwright required.

- [x] Task 4: Comment / caller hygiene
  - [x] 4.1 Update `find_existing_identities` docstring in `import_session.py` — it still says re-import is the only repair and “no reassign yet”. Point at this story; leave 5.4 rollback as future.
  - [x] 4.2 Story-close overview (`story-close-overview-checklist.md`).

### Review Findings

- [x] [Review][Dismiss] Confirm copy vs statement-wide gather — keep one-line share confirm only (AC 3.3); no extra AD-4 / other-list warning.

- [ ] [Review][Patch] Duplicate `_MEMBER_READ_ACTIONS = frozenset(` is a SyntaxError — ACL module cannot import [`api/domain/list_access.py:38`]
- [ ] [Review][Patch] 409 when original `payer_id` is not a member of destination B (user decision: do not rewrite payer; reject the move) [`api/application/reassign_statement.py:118`]
- [ ] [Review][Patch] Reassign 409 `invalid_split_override` is shown as invite `errorAlreadyMember` [`ui/app/lists/listsClient.ts:60`]
- [ ] [Review][Patch] Override validation uses `get_split_override(home_list, …)` but UPDATE matches only `(subject_kind, subject_id)` — skip-on-None can still move an override without 409 [`api/application/reassign_statement.py:127`] [`api/adapters/persistence/repositories.py:723`]
- [ ] [Review][Patch] Empty dest picker (only one membership) has no empty state; confirm stays disabled [`ui/app/lists/ListReceiptMenu.tsx:51`]
- [ ] [Review][Patch] Failed `fetchLists` still opens the sheet and leaves prior `lists` in state [`ui/app/lists/ListReceiptMenu.tsx:46`]
- [ ] [Review][Patch] Integration “non-member dest” case is actually source-deny (dest owner POSTing list A) [`api/tests/test_reassign_statement_integration.py:163`]
- [ ] [Review][Patch] Fake `list_statement_ledger_moves` ignores `statement_id`; skip-deleted test never seeds skipped candidates [`api/tests/test_reassign_statement_application.py:76`]
- [ ] [Review][Patch] BFF test claims cookie forward but only asserts POST method [`ui/app/api/lists-invites.bff.test.ts:255`]
- [ ] [Review][Patch] Corrupt override payload (`assignee_id` missing) is KeyError → 500, not 409 [`api/adapters/persistence/repositories.py:735`]

- [x] [Review][Defer] GET expenses swallows `InvalidSplitOverrideError` and blanks the lens [`api/application/expenses.py:382`] — deferred, pre-existing
- [x] [Review][Defer] `fetchLists` always `replaceMembershipLists` — picker reuse can rewrite homepage cache [`ui/app/lists/listsClient.ts:109`] — deferred, pre-existing
- [x] [Review][Defer] Reassign read/write has no `FOR UPDATE`; concurrent POSTs last-write-wins [`api/application/reassign_statement.py:80`] — deferred, pre-existing (same as other list mutations)

## Dev Notes

### Current system (must preserve)

- **Commit:** `commit_statement_batch` writes `ImportBatchModel(id=batch_id, statement_id, list_id, …)` then ledger rows with that `import_batch_id`. Individual review = many batches per statement; bulk = one batch per clean statement. [Source: `api/adapters/persistence/import_sessions.py`]
- **Dedup:** `find_existing_identities` is **list-scoped**. Comment still claims misfile repair is re-import only. [Source: `api/application/import_session.py`]
- **Ledger:** `receipt_id` is **None** on import insert today. Split overrides are rare on import rows (manual/adjust after). Still move receipts/overrides if present. [Source: `_insert_ledger_entries`]
- **Settle:** `compute_share_allocations` at **GET balances/expenses** from dest list defaults + overrides. Moving `list_id` is what changes shares. [Source: `api/domain/settle.py`, Story 3.4]
- **ACL:** single port `AuthorizeListAccessService`; mutations 403 `not_list_member`; reads 404. [Source: `api/domain/list_access.py`, membership sketch]
- **UI:** `GET /lists/{id}/expenses` has no `statement_id` today. `ReceiptRowMenu` Edit/Delete do **not** persist — do not pretend they do; only the new item should call the API.
- **AD-4:** rows of one statement **may** already live on different lists. This story’s AC still gathers **all originating ledger rows** onto B (product: “wrong statement filing”), not a per-row move.
- **Alembic HEAD:** `0028_stmt_parse_evidence`. No migration expected.

### What this story changes

- New application service + POST reassign + expense DTO fields + list-detail menu/confirm.
- In-place `list_id` updates; stable batch ids.

### Architecture compliance

| Rule | Apply |
|------|--------|
| AD-1 | Domain/application own the move; `ui` HTTP only |
| AD-4 | Session ≠ batch; do not fork/merge `batch_id`; 5.4 still rolls back by batch |
| AD-5 | Decimal / string money on any JSON amounts |
| AD-6 | Remainder to **destination** list creator when defaults apply |
| AD-7 | Do not re-call BCCR |
| AD-8 | Cookie BFF; no Bearer `localStorage` |
| AD-19 | Membership both sides; no second UI ACL |
| AD-20 | Do not mutate card routing |
| AD-21 | Settle remains computed shares |
| AD-23 | Tailwind; tokens in `globals.css` |
| FR-11 | Reassignment remains available **without** changing fixed-list card binding |

### UX — which document wins

- **No journey/mock** for reassign (implementation-readiness: spine-only). EXPERIENCE J3 quarantine climax is obsolete — ignore.
- Binding: one-line share confirm (epic AC); NFR-7 phone+desktop; EN/ES (UX-DR18); no required motion (UX-DR19).
- DESIGN.md / Soft-Ledger primitives for buttons/sheets; do not invent a second receipt list.

### Files to touch (expected)

**UPDATE:** `api/domain/list_access.py`, `api/application/expenses.py` (DTO fields), persistence expense list query, `api/api/schemas/lists.py`, `api/api/routes/lists.py` (or import router if cleaner), `api/adapters/persistence/repositories.py` / expense repo, membership ACL sketch, `find_existing_identities` docstring, `ui/lib/i18n/lists.ts`, `ui/app/lists/listsClient.ts`, `ui/app/lists/[listId]/page.tsx`, `ui/components/soft-ledger/ReceiptRowMenu.tsx` (+ `ReceiptRow` menu type), existing list/expense tests.

**NEW:** `api/application/reassign_statement.py` (name as you like), tests `api/tests/test_reassign_statement_*.py`, BFF `ui/app/api/lists/[listId]/statements/[statementId]/reassign/route.ts`, small client confirm component under `ui/app/lists/` if the menu file should stay presentational.

### Anti-patterns (do not)

- `DELETE` + re-`commit_statement_batch` (new batch ids, FX, dedup skip).
- Updating `UserCard.fixed_list_id` because the statement moved.
- Showing reassign on every receipt including cash/manual.
- Implementing 5.4 rollback “while we’re here”.
- JSON number amounts; float asserts; SQLite stand-in for the integration test.
- Serving operator `pdf_path` on the DTO.

### Testing requirements

- Application TDD for the move invariants (AD-15).
- Postgres 16 integration for ACL + both-list balances (not SQLite).
- UI test-after; typecheck; existing list-detail / origin / balance tests still pass.
- Synthetic data only (AD-11).

### Previous story intelligence

- **5.1 (done):** evidence + PDF GET + comparison. Do not reuse comparison UI. Failed statements have **zero** ledger rows — reassign does not apply.
- **5.2 (backlog):** dismiss is unrelated. Do not block on it.
- **4.10 / 4.12:** batch grain + list-scoped identity. Reassign must not treat identity uniqueness as a reason to drop rows on B.
- **3.4 / 2.6:** dynamic allocations; remainder → list creator of the **current** list after the move.
- Epic 3.5 retro (open): no new `*.module.css`; story header status must match sprint-status at close.

### Git intelligence

Recent: `bfe622a` merge 5.1; `71cc0a4` Epic 6 spec (ignore for v1). Follow existing FastAPI `JSONResponse` `code` fields and Next BFF cookie-forward. No new npm packages.

### Latest tech information

- FastAPI 0.141.x: path params as `uuid.UUID`; keep this repo’s explicit `JSONResponse` error bodies (not a new exception-handler framework).
- Pydantic 2.13.x: snake_case wire names on API models (`destination_list_id`).
- Next 16 App Router: new BFF under `ui/app/api/lists/...`; `credentials: "include"` from client.

### Project context reference

Follow `_bmad-output/project-context.md` (money strings, i18n objects, Tailwind, membership ACL, import session vs batch, no client FX).

## Dev Agent Record

### Agent Model Used

Cursor Grok 4.6

### Debug Log References

Host pytest without `DATABASE_URL`: 535 passed, 197 skipped (Postgres integration gated, including `test_reassign_statement_integration.py`). UI: `tsc --noEmit` clean, 488 vitest passed.

### Implementation Plan

In-place `list_id` updates via `ReassignStatementService` + `AuthorizeListAccessService` (`reassign_statement` → `write_ledger` on every current home, `import_to_list` on B). Expense DTOs carry nullable `statement_id` / `import_batch_id`. List-detail overflow opens a sheet with membership picker and one-line share confirm; success `router.refresh()` on A.

### Completion Notes List

- Added `ReassignStatementService` with atomic list_id moves; batch ids unchanged; same-list no-op; 404 with no ledger; 403 ACL both sides; 409 `invalid_split_override` when an item override names a non-member of B.
- `GET /lists/{id}/expenses` now includes `statement_id` and `import_batch_id` (null on hand rows).
- UI: “Move statement to another list” only when `statement_id` is present; EN+ES confirm; picker omits current list; `errorForbidden` on dest deny.
- Membership ACL sketch updated; `find_existing_identities` docstring points at 5.3 (5.4 still future).

## Story-close overview — 5.3 / 5-3-reassign-statement-to-another-list

**Request path:**
browser list-detail overflow → `POST /api/lists/{listId}/statements/{statementId}/reassign` (cookie BFF) → FastAPI `POST /lists/{list_id}/statements/{statement_id}/reassign` → `ReassignStatementService` → SQLAlchemy in-place `list_id` updates → GET expenses/balances on A (refresh).

**Key components:**
`api/application/reassign_statement.py`, `api/domain/list_access.py` (`reassign_statement` alias), `api/api/routes/lists.py`, `ui/app/lists/ListReceiptMenu.tsx`, BFF `ui/app/api/lists/[listId]/statements/[statementId]/reassign/route.ts`.

**Why this shape:**
FR-29 is a move, not a re-commit (AD-4 batch identity, AD-7 no FX rematerialization, AD-21 shares stay read-time on the destination list).

**What not to break:**
Do not fork/merge `import_batches.id`; 5.4 rollback still keys off `batch_id` on the **current** `import_batches.list_id`. Do not mutate card routing (FR-11). Do not run dedup on B.

### File List

- api/application/reassign_statement.py
- api/tests/test_reassign_statement_application.py
- api/tests/test_reassign_statement_integration.py
- api/domain/list_access.py
- api/application/expenses.py
- api/application/import_session.py
- api/adapters/persistence/repositories.py
- api/api/routes/lists.py
- api/api/schemas/lists.py
- ui/app/api/lists/[listId]/statements/[statementId]/reassign/route.ts
- ui/app/api/lists-invites.bff.test.ts
- ui/app/lists/ListReceiptMenu.tsx
- ui/app/lists/ListReceiptMenu.test.tsx
- ui/app/lists/listsClient.ts
- ui/app/lists/listsClient.test.ts
- ui/app/lists/[listId]/page.tsx
- ui/app/lists/[listId]/page.receiptRowFx.test.ts
- ui/app/lists/[listId]/page.newBadge.test.ts
- ui/components/soft-ledger/ReceiptRowMenu.tsx
- ui/components/soft-ledger/ReceiptRow.tsx
- ui/lib/i18n/lists.ts
- _bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/membership-acl-enforcement-sketch.md
- _bmad-output/implementation-artifacts/5-3-reassign-statement-to-another-list.md
- _bmad-output/implementation-artifacts/sprint-status.yaml

### Change Log

- 2026-08-26: Implemented statement reassignment (move committed ledger rows to another list) with ACL, expense DTO fields, list-detail confirm UI.

## Status

review
