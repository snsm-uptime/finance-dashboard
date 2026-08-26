---
baseline_commit: 78a1c77
---

# Story 5.4: Roll back an import batch

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

> **Batch grain (AD-4, Story 4.10):** one Import Batch = one **commit action**. Bulk review → one batch for the whole statement (N ledger rows). Individual review → one batch per assigned candidate row (usually 1 ledger row). Rollback always keys off `batch_id`, never an ad-hoc `DELETE` of a single ledger row that happens to sit in a multi-row batch.
>
> **Story 5.3 is still backlog.** Do not implement reassign. Rollback must use the batch’s **current** `import_batches.list_id` (and delete every `ledger_entries` row with that `import_batch_id`). When 5.3 later moves a statement, it must keep `batch_id` stable and update `list_id` on batch + ledger together so this API stays correct.
>
> **Not review undo.** Card undo / sheet unassign (`_undo_assign`) restores a **pending** candidate inside an open Import Session. FR-30 is a **post-commit escape hatch** on Soft-Ledger: session stays finalized/discarded; do **not** resurrect the Import Session to reviewing (architecture adversarial pair 12). Re-import = new upload.

## Story

As a user who imported the wrong batch,
I want to remove a single journaled Import Batch,
so that its ledger effect is undone and a later re-import does not leave duplicate leftovers.

## Acceptance Criteria

1. **Given** a committed Import Batch (one row’s commit under row-level review, or one statement’s commit under bulk review) **When** I remove that batch **Then** that batch’s ledger effect is fully undone (FR-30, NFR-5, AD-4) **And** the operation targets `batch_id` **And** it undoes rows on the list where the batch currently resides.

2. **Given** the batch is rolled back **When** I re-import the same or overlapping statement later **Then** there are no leftover duplicates from the rolled-back batch (FR-30, NFR-4): `import_identity` rows for that batch are gone, so destination-list dedup (Story 4.12) does not skip the re-import as already present.

3. **Given** other Import Batches on the same list — including sibling row-level batches from the same statement **When** I roll back one batch **Then** sibling batches and their ledger rows remain intact.

4. **Given** Soft-Ledger after rollback **When** I view the list **Then** settle figures come from the existing Epic 3/4 balance path on the remaining ledger only. Incomplete disclosure stays the 3.6 **slot** — do **not** wire FR-43 live data (Story 5.7).

## Scope — do not build

- Story 5.3 reassign (move statement between lists).
- Story 5.5–5.6 same-price / aliases.
- Story 5.7 `IncompleteDisclosure` live wiring.
- Persisting **Edit** on `ReceiptRowMenu` (still a no-op chrome).
- Persisting **Delete** for **hand** expenses (`import_batch_id` null) — still a no-op.
- Ad-hoc delete of one ledger row inside a **bulk** batch (that would leave a half-rolled journal).
- Resurrecting Import Session / flipping candidates back to `pending` / reopening `committed` statements for review.
- Tombstone / `rolled_back` batch table unless you prove hard-delete is insufficient (prefer hard-delete; matches `_hard_delete_ledger_for_row` emptying batches so empty journals do not pollute FR-30).
- Changing `ix_ledger_entries_list_import_identity` to UNIQUE (4.12 deferred: fallback identities can collide).
- New Compose service, Redis, workers (AD-2).
- Alembic unless you change FK behavior; HEAD today is `0028_stmt_parse_evidence`. Prefer no migration: delete ledger rows **then** delete the `import_batches` row. Do **not** `DELETE` the batch first — `ledger_entries.import_batch_id` is `ON DELETE SET NULL`, which would orphan identities and break AC #2.
- Quarantine (retired 2026-08-25).

## Tasks / Subtasks

- [ ] Task 0: Branch + reads
  - [ ] 0.1 Branch: `feat/5/5-4-roll-back-an-import-batch` from current `main` (one story per branch).
  - [ ] 0.2 Read this file, `_bmad-output/project-context.md`, AD-4 in `ARCHITECTURE-SPINE.md`, `commit_statement_batch` + `_hard_delete_ledger_for_row` in `api/adapters/persistence/import_sessions.py`, `LedgerEntryModel` / `ImportBatchModel` / `SplitOverrideModel` in `models.py`, `ExpenseItemResponse` + list GET expenses, `ReceiptRowMenu.tsx`, `ui/app/lists/[listId]/page.tsx`, BFF `ui/app/api/lists/[listId]/expenses/[entryId]/origin/route.ts` (cookie-forward template).

- [ ] Task 1: Persistence + application — atomic batch undo (AC: #1, #2, #3)
  - [ ] 1.1 New `RollbackImportBatchService` (name flexible) in `api/application/` — **not** a FastAPI/SQLAlchemy import in `domain/`. Command: `actor_user_id`, `list_id`, `batch_id`.
  - [ ] 1.2 Load `ImportBatchModel` by id. Missing → not-found. `batch.list_id != list_id` → **same not-found** (no existence leak). Authorize `import_to_list` (or `write_ledger` — both are member mutations; pick **one** and use `AuthorizeListAccessService`; non-member → existing 404/403 pattern of list writes, prefer **404** if GET list already 404s strangers).
  - [ ] 1.3 Inside one request transaction (reuse `get_db`; use `begin_nested()` if you need a clean IntegrityError mapping like commit):
      1. Collect ledger ids where `import_batch_id == batch_id`.
      2. Delete `split_overrides` with `subject_kind` item and `subject_id` in those ids (imported rows can carry item overrides from 3.2-style split attach if any exist).
      3. Hard-delete those `ledger_entries` (frees `uq_ledger_entries_import_candidate_row_id` and `import_identity`).
      4. Delete the `import_batches` row.
      5. **Do not** UPDATE candidate rows back to `pending`. Leave `committed` / `dedup_skipped` as-is. Do not call `_reopen_statement_if_pending`. Do not touch sibling batches.
  - [ ] 1.4 Idempotency: second call → 404 `import_batch_not_found` (or reuse a generic not-found code already used on this router family). Do not 500.
  - [ ] 1.5 Manual expenses (`import_batch_id` IS NULL) are never selected. A batch that only ever existed as all-duplicate (no row in `import_batches`, Story 4.12) has nothing to roll back — there is no id.
  - [ ] 1.6 Repository method on the import-session repo **or** list/expense repo — do **not** duplicate `_hard_delete_ledger_for_row`’s per-row loop if you can `DELETE … WHERE import_batch_id = :id` then delete batch. Reuse that helper only if it stays correct for multi-row bulk batches (today it deletes **one** entry then maybe the batch). Prefer a dedicated `rollback_batch(batch_id)` that deletes **all** matching ledger rows in one go.
  - [ ] 1.7 Application tests (fakes): bulk-shaped batch (2 ledger rows) → both gone, sibling batch’s row remains; individual-shaped batch (1 row) → only that row gone; wrong list_id → not found, ledger untouched; stranger → not found; empty leftover identities so a fake “dedup lookup” would not see them; split override on one entry is gone.

- [ ] Task 2: HTTP + BFF + DTO (AC: #1, #4)
  - [ ] 2.1 FastAPI: `DELETE /lists/{list_id}/import-batches/{batch_id}` (cookie auth). 204 empty body on success (or 200 with `{batch_id, removed_entry_count}` — pick 204 to match discard-ish mutations unless tests already prefer JSON). `response` error `code` snake_case.
  - [ ] 2.2 Expose `import_batch_id: UUID | null` on `ExpenseItemResponse` / `LedgerEntryRecord` / `ListedExpense` mapping / `asExpense` in `listsClient.ts`. Null for hand rows. Wire through `list_ledger_entries` — today the record **omits** `import_batch_id`; add it without breaking money-as-string.
  - [ ] 2.3 BFF: `ui/app/api/lists/[listId]/import-batches/[batchId]/route.ts` — DELETE, cookie-forward, no JSON body, 502 on upstream down (copy origin route style).
  - [ ] 2.4 `rollbackImportBatch(listId, batchId, messages)` in `listsClient.ts` + tests: 204, 404, 401.

- [ ] Task 3: Soft-Ledger UI (AC: #1, #3, #4)
  - [ ] 3.1 Entry is **spine-only** (no mock). Use list-detail `ReceiptRowMenu`. For rows with non-null `import_batch_id`: **Delete** becomes the rollback affordance (danger). **Confirm** before the network call (high-intent): reuse confirm-dialog pattern (`DiscardConfirmDialog` or a small list-domain dialog — do not invent a third confirm primitive if one exists). Copy must say the **whole batch** is undone; if `expenses.filter(e => e.import_batch_id === id).length > 1`, mention that count so bulk rollback is not a silent multi-row wipe.
  - [ ] 3.2 After success: `router.refresh()` like `OriginChipPicker` / `ManualExpenseForm` so BalanceStrip + receipt list + existing incomplete slot re-read server data. Do **not** recompute shares/FX in the browser.
  - [ ] 3.3 Hand rows: Delete stays non-persisting (current `ReceiptRowMenu` items with no `onClick`). Edit stays non-persisting for everyone.
  - [ ] 3.4 Do not use `@use-gesture` on this menu. Keyboard/click only (UX-DR19). Not a pill primary CTA (AD-12).
  - [ ] 3.5 i18n: both `en` and `es` on `ui/lib/i18n/lists.ts` (e.g. `rollbackBatchConfirmTitle`, `rollbackBatchConfirmBody`, `rollbackBatchConfirmAction`, error generic). Calm voice: undo this import, not “paid” / settlement language.
  - [ ] 3.6 Tests (jsdom, test-after): parser row with batch id → confirm → DELETE `/api/lists/{id}/import-batches/{batchId}` (not DELETE expense id); two rows same batch → one confirm rolls back once; hand row Delete does not fetch; EN/ES keys present. Mock fetch; no Playwright required.

- [ ] Task 4: Integration (Postgres 16)
  - [ ] 4.1 Bulk path: upload synthetic BAC (or existing fixture) → bulk-commit list A → `DELETE` batch → GET expenses empty (or only unrelated rows); GET balances hero matches remaining ledger; `import_batches` row gone.
  - [ ] 4.2 Sibling: two individual assigns (two batches) on same statement → rollback batch 1 → batch 2 ledger remains.
  - [ ] 4.3 Re-import: after rollback, upload the **same** synthetic PDF again to the same list → commit produces a **new** batch and ledger rows (not `skipped_duplicate` for those identities). Uses existing content-hash / session rules; if active-session hash blocks a second upload of an in-flight file, use a **finalized** first session (normal 4.14 Save) then second upload.
  - [ ] 4.4 ACL: non-member 404/401; batch on list B cannot be deleted via list A’s URL.

- [ ] Task 5: Story-close overview
  - [ ] 5.1 Fill Completion Notes using `_bmad-output/implementation-artifacts/story-close-overview-checklist.md`.
  - [ ] 5.2 Sync story Status with `sprint-status.yaml` at close (Epic 3.5 retro). Include Review Findings (or explicit zero-findings) when review runs.

### Review Findings

_(filled at code-review)_

## Dev Notes

### Current system (must preserve)

- **Commit:** `commit_statement_batch` writes `ImportBatchModel` only if surviving `rows` is non-empty; all-duplicate commits journal **no** batch (empty journal would pollute FR-30). Ledger rows carry `import_batch_id`, `import_candidate_row_id` UNIQUE, `import_identity`. [Source: `api/adapters/persistence/import_sessions.py` `commit_statement_batch`, `_insert_ledger_entries`]
- **Review undo ≠ rollback:** `_undo_assign` / `_hard_delete_ledger_for_row` restores `pending` and deletes an emptied batch so Epic 5 rollback would not see a ghost journal. That path is **session-scoped** and blocked after `finalized_at`. FR-30 is for committed data already on the list. [Source: same file; `UnassignCandidateRowService`]
- **FK trap:** `ledger_entries.import_batch_id` → `import_batches.id` **ON DELETE SET NULL**. Deleting the batch first nulls FKs and **leaves** identities → re-import skip. Always delete ledger (and item split overrides) first.
- **Dedup:** `ix_ledger_entries_list_import_identity` is **not** unique; skip is application-side at commit, scoped to **destination list** (4.12). Rolling back a batch must remove those identities from that list or AC #2 fails. [Source: `0024_import_dedup_identity_and_finalize.py`; `deferred-work.md` 4.12 — notes still say “5.6 rollback”; this story **is** that hatch, old numbering]
- **List DTO:** `ExpenseItemResponse` has no `import_batch_id` today. `ReceiptRowMenu` Edit/Delete do not persist. List page is a Server Component; mutations use client islands + `router.refresh()`. [Source: `api/api/schemas/lists.py`, `ui/components/soft-ledger/ReceiptRowMenu.tsx`, `ui/app/lists/[listId]/page.tsx`]
- **Balances:** server-owned CRC; UI displays `GET /lists/{id}/balances` — do not add a parallel settle function.
- **Alembic HEAD:** `0028_stmt_parse_evidence`.
- **ACL:** membership only (AD-19). Reuse `AuthorizeListAccessService`; do not invent admin bypass.

### What this story changes

- New member mutation: delete one `import_batches` journal and all of its ledger (+ item split overrides).
- Expense JSON grows nullable `import_batch_id`.
- List-detail Delete on **parser/batch** rows becomes confirmed rollback; hand Delete stays chrome-only.

### Architecture compliance

| Rule | Apply |
|------|--------|
| AD-1 | Domain stays pure; UI talks HTTP only; parsers untouched. |
| AD-4 | Rollback keys `batch_id`; one commit action; siblings intact; nothing resurrected into settle without a remaining batch. |
| AD-5 | No float; amounts on remaining rows stay `Decimal` / string wire. |
| AD-7 / AD-21 | Do not recompute FX or “record payment”; strip reads remaining materialized CRC. |
| AD-8 | Session cookie via BFF. |
| AD-12 / AD-23 | Tailwind / existing Soft-Ledger; no new `*.module.css`; no pill primary. |
| AD-15 | Application TDD for rollback; UI test-after; Postgres integration for re-import. |
| AD-18 | Dedup identity is domain-at-commit; removing ledger rows is what makes re-import legal. |
| AD-19 | Member of **current** list only. |
| AD-22 | Do not recreate the Postgres volume. |

### UX

- **Wins:** EXPERIENCE spine-only “Reassign statement / rollback import batch” — this story is **rollback only**. DESIGN.md has no dedicated mock; Soft-Ledger receipt overflow is the surface.
- **Voice:** correction, not punishment. Confirm that **all expenses from that import action** go away.
- **Reduce motion:** menu + dialog, no swipe-required path.

### Files to touch (expected)

**UPDATE:** `api/adapters/persistence/import_sessions.py` (or expenses repo), `api/adapters/persistence/models.py` only if mapping comments, `api/application/import_session.py` or new `import_rollback.py`, `api/application/expenses.py` (`LedgerEntryRecord.import_batch_id`), `api/application/ports.py` if Protocol lives there, `api/api/routes/lists.py`, `api/api/schemas/lists.py`, `api/domain/errors.py`, tests `test_import_session_application.py` / `test_import_sessions_integration.py` / list expense tests, `ui/app/lists/listsClient.ts` + tests, `ui/app/lists/[listId]/page.tsx`, `ui/components/soft-ledger/ReceiptRow.tsx` / `ReceiptRowMenu.tsx` / `soft-ledger.test.tsx`, `ui/lib/i18n/lists.ts`.

**NEW:** `RollbackImportBatchService`; FastAPI route; BFF `import-batches/[batchId]/route.ts`; optional confirm wrapper next to list chrome.

### Anti-patterns (do not)

- `DELETE /lists/{id}/expenses/{entryId}` that removes one bulk-batch row and leaves the rest of the journal.
- `session.delete(batch)` before ledger rows (SET NULL orphan).
- Calling `_undo_assign` from list-detail (reopens pending, 409s finalized sessions).
- Implementing 5.3 “move both lists” inside this story.
- Treating Continue/dismiss/parse-failure UI as the rollback surface.
- JSON number amounts; client-side share math after refresh.
- Unique index on `import_identity` “to be safe.”
- New `dismissed`/`rolled_back` statement status.

### Testing requirements

- Postgres 16 for upload → commit → rollback → re-import (not SQLite).
- Money asserts: `Decimal` / string equality on remaining rows.
- UI: mock fetch; jsdom.
- Do not commit real bank PDFs.

### Previous story intelligence (5.2 / 5.1)

- 5.2 dismiss is **uncommitted** failed parse / session discard — it must **not** unwind committed batches (AD-4). Rollback is the opposite: committed journal only.
- 5.2 PDF refcount / `skipped` status are irrelevant here (PDF already deleted on clean finalize).
- Alembic: 5.1 added `0028`; 5.2 added **no** revision. This story should also avoid a migration if possible.
- BFF: cookie-forward, `code` on JSON errors, 502 if api down.
- `sprint-status`: 5.2 is `review` as of story creation; 5.3 still `backlog`. Do not wait on 5.3.

### Git intelligence

- Recent: `78a1c77` merge 5.2 dismiss; `1547323` persist dismiss. Follow list BFF + import commit patterns from 4.12 (`b706e01`).
- Reuse `begin_nested()` + domain error mapping from `commit_statement_batch`; do not invent a second transaction manager.

### Latest tech

- FastAPI 0.141.x / SQLAlchemy 2.0: one request-scoped Session; `flush` inside the handler; **commit only in `get_db`**. Use `begin_nested()` (real SAVEPOINT) if a sub-block may `IntegrityError` without aborting the outer request pattern already used on commit. Do not `session.commit()` in the service. [Source: SQLAlchemy 2.0 nested transaction / project `get_db` pattern, 2026-08-26]
- No new npm libraries. Next 16.2 / React 19.2 already in lockfile.

### Project context reference

Follow `_bmad-output/project-context.md`: Import Session ≠ Batch; rollback = undo a committed `batch_id`; Decimal/string money; i18n TS objects; Tailwind; membership ACL; synthetic fixtures only.

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
