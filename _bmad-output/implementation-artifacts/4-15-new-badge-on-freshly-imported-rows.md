---
baseline_commit: a737a06
---

# Story 4.15: "New" badge on freshly imported rows

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

> **Scope boundary (epics.md AC #4).** This story ships the badge only. It does
> **not** wire a real split-edit control into `ReceiptRow` —
> `ReceiptRowMenu`'s Edit item stays non-persisting, tracked separately
> (`deferred-work.md`). Do not attempt to build split editing here.
>
> **Badge lifetime (amended 2026-08-24).** Visibility is `provenance === "parser"`
> and `created_at`'s calendar date in `America/Costa_Rica` is today. The
> statement `posted_date` is ignored. There is no "mark reviewed" control;
> origin edits do not clear the badge early.
>
> **Independent of 4.13/4.14.** This story depends only on Story 4.11 (row-level
> commit already exists and is `done`). It does not touch `IndividualReviewPanel`,
> `ImportReviewSheet`, or anything under `ui/app/upload/`.

## Story

As a user who just imported transactions,
I want newly imported rows marked in the destination list,
so that I can find them to adjust splits without hunting through history.

## Acceptance Criteria

1. **Given** a ledger entry in a list view, **when** it has `provenance == 'parser'` and its `created_at` calendar date in `America/Costa_Rica` is today, **then** `ReceiptRow` renders a "New" badge via optional `newBadgeLabel`, using the existing `Chip` / `ChipTone` (`tone="accent"`) near the amount rather than a bespoke element. **And** `posted_date` does not affect the badge.
2. **Given** a parser-imported ledger entry, **when** its `created_at` calendar date in `America/Costa_Rica` is no longer today, **then** the badge is not shown. **And** there is no explicit "mark reviewed" control — origin edit and other row actions do not dismiss the badge early.
3. **Given** a hand-entered ledger entry (`provenance == 'hand'`), **when** I view the list, **then** no New badge, regardless of `created_at`.
4. **Given** this story's scope, **when** the badge points the user at adjusting a split, **then** wiring an actual split-edit control into `ReceiptRow` remains out of scope — `ReceiptRowMenu`'s Edit item is currently non-persisting, and that gap is tracked separately.

The Tasks/Subtasks below record the first implementation pass (`import_reviewed_at` / mark-reviewed). Shipped behavior follows the amended ACs above.

## Tasks / Subtasks

### Task 1 — Migration: `ledger_entries.import_reviewed_at` (AC: 1)

- [x] 1.1 New Alembic revision `0025_import_reviewed_at.py`, `down_revision = "0024_import_dedup_identity"` — confirmed: that file's `revision` string (`api/adapters/persistence/migrations/versions/0024_import_dedup_identity_and_finalize.py:38`) is `"0024_import_dedup_identity"`, shorter than its filename. Keep the new `revision` under 32 chars (alembic_version is `VARCHAR(32)`) — use `"0025_import_reviewed_at"`.
- [x] 1.2 `op.add_column("ledger_entries", sa.Column("import_reviewed_at", sa.DateTime(timezone=True), nullable=True))`. No index, no server default, no backfill — every existing row (hand or parser) simply gets `NULL`, which is correct: hand rows never show the badge (gated on `provenance == 'parser'` too) and pre-migration parser rows were never "freshly imported" in this feature's sense.
- [x] 1.3 `downgrade()` drops the column.
- [x] 1.4 `models.py`: add `import_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)` to `LedgerEntryModel` (near `provenance`/`created_at`).
- [x] 1.5 **Do not** touch `api/adapters/persistence/import_sessions.py`'s `LedgerEntryModel(...)` construction sites (row-level commit at ~line 123, bulk at ~line 194). The column is nullable with no default — omitting it in those constructors already yields `NULL`, satisfying AC #1 for both Individual and Bulk commit paths with zero code change there.

### Task 2 — Application: expose the field, wire the two edit paths (AC: 1, 3, 4)

- [x] 2.1 `api/application/expenses.py`: add `import_reviewed_at: datetime | None = None` to `LedgerEntryRecord` (after `origin_card_id`).
- [x] 2.2 `ExpenseRepository` Protocol: add `def mark_ledger_entry_reviewed(self, *, list_id: UUID, entry_id: UUID, actor_user_id: UUID) -> LedgerEntryRecord: ...`.
- [x] 2.3 New `MarkLedgerEntryReviewedCommand(actor_user_id: UUID, list_id: UUID, entry_id: UUID)` + `MarkLedgerEntryReviewedService(repo)`. `execute()`: `AuthorizeListAccessService(self._repo).execute(AuthorizeListAccessCommand(acting_user_id=..., list_id=..., action="write_expense"))` (list-membership check only — **no** payer restriction, unlike `UpdateExpenseOriginService`). Then `return self._repo.mark_ledger_entry_reviewed(list_id=..., entry_id=..., actor_user_id=...)`.
  - **Design decision:** any list member with write access can dismiss a badge, not just the payer. `write_expense` normalizes to `write_ledger`, a `_MEMBER_MUTATION_ACTIONS` capability (`api/domain/list_access.py`) — open to every member, matching origin edit's ACL tier but skipping the extra payer-only gate `UpdateExpenseOriginService` layers on top. Rationale: dismissing is an acknowledgment, not a financial edit; any member reviewing the list benefits from clearing it.
- [x] 2.4 `UpdateExpenseOriginService.execute` needs no change — the timestamp write happens in the repo method (Task 3), so *every* successful origin PATCH clears the badge unconditionally (AC #3's "any edit" — origin update is currently the **only** real persisting edit path on a ledger entry; `ReceiptRowMenu`'s Edit/Delete remain non-persisting per AC #5).
- [x] 2.5 Export `MarkLedgerEntryReviewedCommand`, `MarkLedgerEntryReviewedService` from `application/expenses.py`'s `__all__`.

### Task 3 — Persistence (AC: 1, 3, 4)

`api/adapters/persistence/repositories.py`, `SqlAlchemyListRepository`:

- [x] 3.1 `create_ledger_entry`, `list_ledger_entries`: add `import_reviewed_at=row.import_reviewed_at` to each `LedgerEntryRecord(...)` construction (mechanical — the model column already exists after Task 1).
- [x] 3.2 `update_ledger_entry_origin`: set `row.import_reviewed_at = datetime.now(UTC)` **unconditionally** right before `self._session.flush()` (mirrors the `created_at = datetime.now(UTC)` app-code convention already used in `create_ledger_entry` — do not rely on Postgres `now()`/a server-side trigger). Add the field to the returned `LedgerEntryRecord(...)`.
- [x] 3.3 New `mark_ledger_entry_reviewed(self, *, list_id, entry_id, actor_user_id)`: load the row via `self._session.get(LedgerEntryModel, entry_id)`, apply the **same not-found guard** as `update_ledger_entry_origin` (`row is None or row.list_id != list_id or row.normalized_description is None or row.payer_id is None or row.provenance is None or row.line_type is None or row.posted_date is None` → raise `SubjectNotFoundError()`) — **omit** the `NotEntryPayerError` check (any member may call this). Set `row.import_reviewed_at = datetime.now(UTC)` unconditionally (idempotent — calling it twice just refreshes the timestamp, harmless), flush, return the mapped `LedgerEntryRecord`.

### Task 4 — API schema + route (AC: 1, 3, 4)

- [x] 4.1 `api/api/schemas/lists.py`: add `import_reviewed_at: datetime | None = None` to `ExpenseItemResponse` and `CreateExpenseResponse` (the latter always `None` — hand entries are never `provenance == 'parser'`).
- [x] 4.2 `api/api/routes/lists.py`, `_expense_item(row)`: add `import_reviewed_at=entry.import_reviewed_at,` to the `ExpenseItemResponse(...)` it returns.
- [x] 4.3 `create_list_expense`: add `import_reviewed_at=created.import_reviewed_at,` to `CreateExpenseResponse(...)` for DTO-shape consistency (mechanical, always `None`).
- [x] 4.4 New route `PATCH /{list_id}/expenses/{entry_id}/reviewed`, `response_model=ExpenseItemResponse`, **no request body param** (nothing to validate — the action is "mark this row reviewed", not a field update). Gate with `require_authenticated_user` only, same as the origin route. Body:
  ```python
  service = MarkLedgerEntryReviewedService(SqlAlchemyListRepository(db))
  try:
      updated = service.execute(
          MarkLedgerEntryReviewedCommand(actor_user_id=user_id, list_id=list_id, entry_id=entry_id)
      )
  except SubjectNotFoundError:
      return _subject_not_found()
  except (ListNotFoundError, NotListMemberError):
      return _access_denied()
  logger.info("manual_expense_marked_reviewed list_id=%s entry_id=%s", list_id, entry_id)
  return _expense_item(ListedExpense(entry=updated))
  ```
  Import `MarkLedgerEntryReviewedCommand`, `MarkLedgerEntryReviewedService` alongside the existing `application.expenses` import block. No new schema body class needed.

### Task 5 — UI types + client (AC: 2, 3, 4)

- [x] 5.1 `ui/app/lists/listsClient.ts`: add `import_reviewed_at: string | null;` to `ExpenseItem`. In `asExpense()`, add `import_reviewed_at: typeof row.import_reviewed_at === "string" ? row.import_reviewed_at : null,` (same tolerant-parse style as `fx_rate_date`).
- [x] 5.2 New minimal message type + client function in `listsClient.ts` (do **not** reuse the full `ListsClientMessages` — this endpoint only ever returns 401/403/404/generic, no `invalid_name`/`smtp`/`already_member` concepts apply):
  ```ts
  export type MarkReviewedMessages = {
    errorGeneric: string;
    errorUnauthorized: string;
    errorForbidden: string;
  };

  export async function markExpenseReviewed(
    listId: string,
    entryId: string,
    messages: MarkReviewedMessages,
  ): Promise<OkExpense | ErrorResult> {
    // PATCH /api/lists/{listId}/expenses/{entryId}/reviewed, body "{}",
    // credentials: "same-origin" — mirror updateExpenseOrigin's fetch/error shape,
    // mapping 401→errorUnauthorized, 403→errorForbidden, else→errorGeneric.
  }
  ```
- [x] 5.3 `ui/app/lists/[listId]/page.tsx`: new pure function, alongside `originChipFrom`/`receiptRowFxPropsFrom`:
  ```ts
  export function newBadgeLabelFrom(
    e: ExpenseItem,
    t: { receiptNewBadge: string },
  ): string | undefined {
    return e.provenance === "parser" && e.import_reviewed_at === null
      ? t.receiptNewBadge
      : undefined;
  }
  ```
- [x] 5.4 New BFF route `ui/app/api/lists/[listId]/expenses/[entryId]/reviewed/route.ts` — copy `.../origin/route.ts` verbatim (cookie forward, same-shape proxy), swap the upstream path segment from `/origin` to `/reviewed`. `context.params` is a `Promise<{ listId: string; entryId: string }>` (Next App Router convention already used everywhere in this repo).

### Task 6 — `ReceiptRow` badge + `ReceiptRowMenu` dismissal (AC: 2, 4)

`ui/components/soft-ledger/ReceiptRow.tsx`:

- [x] 6.1 Add two new optional props to `ReceiptRowProps`: `newBadgeLabel?: string` (already-localized Chip text — same convention as `originChip: string`, not a boolean + separate i18n object) and `markReviewed?: { listId: string; entryId: string }` (identifiers only, forwarded to the menu; inert unless `newBadgeLabel` is also set).
- [x] 6.2 In the `title` grid-area flex row (currently `{title span}{amount span}`), render `{newBadgeLabel ? <Chip tone="accent">{newBadgeLabel}</Chip> : null}` **after** the amount span — UX spec: "rendered as a Chip near the amount" (`row-level-individual-review-2026-08-20.md` §7).
- [x] 6.3 Forward `menu` unchanged plus the new `markReviewed` prop into `<ReceiptRowMenu messages={menu} markReviewed={newBadgeLabel ? markReviewed : undefined} />` (gate on `newBadgeLabel` truthiness so the dismiss item never appears on an already-reviewed row even if a caller forgets to omit `markReviewed`).

`ui/components/soft-ledger/ReceiptRowMenu.tsx` (already `"use client"` — this is the only client boundary that needs to move; **do not** create a new wrapper component, and do not try to pass an `onDismissed` callback down from `page.tsx` — it is an async Server Component and cannot hand a closure to a Client Component):

- [x] 6.4 Extend `ReceiptRowMenuMessages` with `markReviewedLabel?: string`, `errorGeneric: string`, `errorUnauthorized: string`, `errorForbidden: string` (all four required going forward — this widens the type, so **both** existing call sites must be updated: `ui/app/lists/[listId]/page.tsx`'s `rowShared.menu` object, and the `menu={{...}}` fixture in `ui/components/soft-ledger/soft-ledger.test.tsx`).
- [x] 6.5 New prop `markReviewed?: { listId: string; entryId: string }`. Import `useRouter` from `next/navigation` and `useFormSubmission` from `@/hooks` (same pair `OriginChipPicker` already uses). When `markReviewed && messages.markReviewedLabel`, render a third `IconButtonPopupItem` (not `danger`) with `stayOpen` while `pending || Boolean(error)` (the `data-stay-open` escape hatch `IconButtonPopup` already supports — without it, the popup's own `onPanelClick` closes it on every item click before an error could ever be shown), `disabled={pending}`, `onClick={() => void submit(undefined)}`. `submit` calls `markExpenseReviewed(markReviewed.listId, markReviewed.entryId, messages)`; `onSuccess: () => router.refresh()` (same re-fetch-the-whole-page pattern `OriginChipPicker` uses — there is no local badge state to reconcile manually). On error, render `{error ? <p role="alert">{error}</p> : null}` inside the popup panel, mirroring `OriginChipPicker`'s inline error convention.
- [x] 6.6 Edit/Delete items are untouched — still non-persisting placeholders (AC #5).

### Task 7 — Wire `page.tsx` + i18n (AC: 2, 3, 4)

- [x] 7.1 `ui/lib/i18n/lists.ts`: add `receiptNewBadge` and `receiptMarkReviewed` keys to **both** `en` and `es` blocks, near the existing `receiptMenuAria`/`receiptEdit`/`receiptDelete` keys. Suggested copy: en `"New"` / `"Mark reviewed"`; es `"Nuevo"` / `"Marcar revisado"`.
- [x] 7.2 In the expenses-map loop (`ui/app/lists/[listId]/page.tsx`, where `rowShared` is built), add:
  ```ts
  newBadgeLabel: newBadgeLabelFrom(e, t),
  markReviewed: { listId, entryId: e.id },
  menu: {
    menuAria: t.receiptMenuAria,
    editLabel: t.receiptEdit,
    deleteLabel: t.receiptDelete,
    markReviewedLabel: t.receiptMarkReviewed,
    errorGeneric: t.errorGeneric,
    errorUnauthorized: t.errorUnauthorized,
    errorForbidden: t.errorForbidden,
  },
  ```
  This is a single change point — `rowShared` already flows into **both** branches below it (the `OriginChipPicker`-wrapped payer branch and the bare `<ReceiptRow>` branch for everyone else), so the badge and its dismissal are visible to **every** list member viewing the row, not just the payer (consistent with the ACL decision in Task 2.3). `OriginChipPicker`'s own `Props` type is `Omit<ReceiptRowProps, "originChip" | "originChipTone" | "originAction" | "originPanel"> & {...}` and spreads `{...row}` straight into `<ReceiptRow>` — `newBadgeLabel`/`markReviewed` are not in that `Omit` list, so they pass through with **zero changes needed in `OriginChipPicker.tsx` itself**.

### Task 8 — Tests (AC: all)

- [x] 8.1 `api/tests/test_expenses_application.py`: extend `_FakeExpenseRepo` with `mark_ledger_entry_reviewed` (Protocol + fake, per the 4.11/4.13.1 lesson that both must exist or application tests lie) — mirror `update_ledger_entry_origin`'s fake but without the payer check. New tests: mark-reviewed on a fresh entry sets `import_reviewed_at`; mark-reviewed by a non-payer member succeeds (proves the ACL difference from origin update); mark-reviewed on a nonexistent/other-list entry raises `SubjectNotFoundError`; mark-reviewed by a non-member raises `NotListMemberError`; `update_origin_*` existing tests get one added assertion that `import_reviewed_at` is set on the returned record.
- [x] 8.2 `api/tests/test_manual_expense_api.py` (or wherever the origin PATCH route is exercised end-to-end): add a case that PATCHing origin on a `provenance='parser'` row clears `import_reviewed_at`; add the new `PATCH .../reviewed` route: happy path (200, `import_reviewed_at` set, non-payer member allowed), 404 on foreign/missing entry, 403 on non-member, 401 unauthenticated.
- [x] 8.3 `api/tests/test_import_sessions_integration.py`: extend `test_bulk_commit_happy_path_lands_ledger_rows_payer_is_actor` (or add one line to it) to assert the freshly committed `LedgerEntryModel.import_reviewed_at is None` — Postgres 16, `DATABASE_URL`-gated, skip without it (do not add a SQLite path).
- [x] 8.4 `ui/components/soft-ledger/soft-ledger.test.tsx`: update the existing `menu={{...}}` fixture for the new required message keys; add cases for `newBadgeLabel` rendering the accent `Chip` near the amount, and for the "mark reviewed" menu item appearing only when both `newBadgeLabel` and `markReviewed` are present, calling the (mocked) `markExpenseReviewed` and then `router.refresh()`. Mock `next/navigation`'s `useRouter` the same way any existing client-component test in this suite does.
- [x] 8.5 `ui/app/lists/listsClient.test.ts`: `markExpenseReviewed` happy path + 401/403/generic error mapping; extend the tolerant-parse test for `import_reviewed_at` (string passthrough, missing/invalid → `null`).
- [x] 8.6 `ui/app/lists/[listId]/page.newBadge.test.ts` (new sibling file, same pattern as `page.receiptRowFx.test.ts`): unit-test `newBadgeLabelFrom` — `provenance: "parser"` + `import_reviewed_at: null` → label; `provenance: "hand"` → `undefined` regardless of `import_reviewed_at`; `provenance: "parser"` + non-null `import_reviewed_at` → `undefined`.
- [x] 8.7 `page.receiptRowFx.test.ts`'s `crcExpense()` fixture (and any other full-literal `ExpenseItem` builder) needs `import_reviewed_at` added — it is a required field on the type now, not optional.
- [x] 8.8 Full gate before `review`: api pytest (host **and** in-container against Postgres 16 after `alembic upgrade head`, since this story **does** add a migration — unlike 4.13.1), ui typecheck + lint + vitest. Worktree stack via `scripts/worktree/worktree-bootstrap.sh`.

### Task 9 — Story close

- [x] 9.1 How/why overview (`story-close-overview-checklist.md`) before `review`.
- [x] 9.2 Review Findings section (explicit zero-findings if none).
- [x] 9.3 Sync story header ↔ `sprint-status.yaml` (`4-15-new-badge-on-freshly-imported-rows: ready-for-dev` → `review` → `done`).

## Dev Notes

### What already exists — do not rebuild

| Piece | Where |
|---|---|
| `ledger_entries.provenance` (`Literal["hand","parser"]`, already wire-exposed) | `models.py:290`, `ExpenseItemResponse.provenance` |
| Single funnel for every expense API response | `_expense_item(row: ListedExpense)` in `api/api/routes/lists.py:132` — GET list, origin PATCH, and this story's new PATCH all return through it |
| Payer-gated origin edit (the "any edit clears it" trigger for AC #3) | `UpdateExpenseOriginService` / `update_ledger_entry_origin` (`repositories.py:539`) |
| ACL action vocabulary — `write_expense` → `write_ledger`, a member-not-owner-only mutation | `api/domain/list_access.py` |
| `useFormSubmission` + `router.refresh()` client-mutation pattern | `ui/app/lists/OriginChipPicker.tsx` — copy this shape into `ReceiptRowMenu`, don't invent a new one |
| `IconButtonPopup`'s `stayOpen`/`data-stay-open` escape hatch for async menu items | `ui/components/IconButtonPopup/IconButtonPopup.tsx` — items close the popup on click by default; you need this to show an inline error |
| Pure-fn-extracted-and-sibling-tested page logic | `originChipFrom`, `receiptRowFxPropsFrom`, `directionLabelFrom` in `page.tsx` + `page.receiptRowFx.test.ts` — `newBadgeLabelFrom` follows the same shape |
| `Chip` / `ChipTone` (`"accent" \| "muted" \| "warning"`), display-only | `ui/components/Chip/Chip.tsx` — badge uses `tone="accent"` (moss/primary tone, distinct from `"warning"` which already means "missing origin") |

### Files being modified — current state / must survive

**`ReceiptRow.tsx`** — pure presentational grid (`icon | title+amount | direction | menu` / `meta | net`), Tailwind utilities only, no CSS module. Adding the badge must not disturb the existing `originAction`/`originPanel` slots `OriginChipPicker` depends on, or the `showFx` `<details>` row.

**`ReceiptRowMenu.tsx`** — Edit/Delete remain inert placeholders. The first-pass "mark reviewed" menu item was removed when badge lifetime moved to the Costa Rica calendar day of `created_at`.

**`page.tsx`** — server component, `force-dynamic`. Badge wiring is `newBadgeLabelFrom(e, t, todayCr)` using `created_at`, not `posted_date`.

### Design decisions made in this story (not literally spelled out in epics.md — read before implementing)

**Amended 2026-08-24 (current):** Badge visibility is `provenance === "parser"` and `created_at`'s calendar date in `America/Costa_Rica` equals today. No explicit dismissal. Origin edits do not hide the badge. `Chip` stays display-only.

Earlier pass (superseded for the product rule): dismissal via `import_reviewed_at` + `ReceiptRowMenu` "Mark reviewed" + origin PATCH. That work may still exist on the API/schema; it does not gate the badge.

### Project structure

- Hex: no new domain module needed (no business rule to protect — this is pure state + ACL, both handled at the application/persistence layers). `MarkLedgerEntryReviewedCommand`/`Service` live in `api/application/expenses.py` beside `UpdateExpenseOriginService`, not a new file.
- Migration: `api/adapters/persistence/migrations/versions/0025_import_reviewed_at.py`.
- UI: no new page/route folder — this is additive props on two existing `ui/components/soft-ledger/` files plus a new BFF leaf under the existing `ui/app/api/lists/[listId]/expenses/[entryId]/` tree.
- Amounts/dates: unaffected by this story (no money math). `import_reviewed_at` travels as an ISO datetime string over the wire, same as `created_at`/`fx_rate_date`.

### Testing standards

- Application: TDD for `MarkLedgerEntryReviewedService` + the ACL difference from origin edit (AD-15).
- Persistence/HTTP: the new route is Postgres-backed like every other list route in this suite (`test_manual_expense_api.py` already spins up the real DB) — no SQLite stand-in.
- Migration: run `alembic upgrade head` against the worktree's Postgres 16 before the in-container pytest gate (unlike 4.13.1, this story genuinely adds a column).
- UI: test-after on the two touched components + the new pure fn + the new client fetch fn, matching existing file-per-concern layout (`soft-ledger.test.tsx`, `listsClient.test.ts`, new `page.newBadge.test.ts`).
- CI: no real bank PDFs or PII involved in this story at all — it never touches the import pipeline, only the settled ledger view.

## Previous story intelligence (4.13.1)

- Confirms the ownership table this story is built against: *"'New' badge → **4.15**"* (`4-13-1-import-review-sheet.md`, "4.13 / 4.14 boundaries"). Nothing in 4.13.1 touches `ReceiptRow`/`ledger_entries.import_reviewed_at` — this story is unblocked by it, not sequenced after it.
- Reinforces two conventions to follow here too: (a) Core `UPDATE`s need `flush()` (not just `add()`) or a subsequent `GET` echoes stale data — same rule applies to `mark_ledger_entry_reviewed`; (b) Protocol methods must be declared **and** implemented on the test fake, or application-layer tests give false confidence.
- 4.13.1 also independently confirms `ReceiptRowMenu`'s Edit item is still non-persisting as of the latest shipped work — nothing has changed that since; AC #4's scope boundary is still accurate.

## Git intelligence

Recent `main` history (`a737a06`, `0e741ff`, `24d1f73`) is Story 4.13.1 — `ImportReviewSheet`, `unassign`, `Sheet.tsx` chrome props. None of it touches `ledger_entries`, `ReceiptRow.tsx`, `ReceiptRowMenu.tsx`, or `page.tsx`'s expense-row rendering — no merge-conflict risk expected, and no in-flight work in this area to reconcile against.

## Latest tech notes

- FastAPI: new route follows the exact `JSONResponse` + `code` field error idiom every other route in `lists.py` uses (`_access_denied()`, `_subject_not_found()`) — do not introduce `HTTPException`.
- Next.js App Router: BFF `context.params` is a `Promise` (already true everywhere in this repo, e.g. `origin/route.ts`).
- Alembic: `alembic_version.version_num` is `VARCHAR(32)` — keep the new `revision` id short (`"0025_import_reviewed_at"` is 24 chars, fine).

## Project context reference

Follow `_bmad-output/project-context.md`: AD-15 (TDD for application-layer logic), AD-19 (membership ACL only — no owner-only gate for this action), money/date rules unaffected (no money math in this story), EN+ES keys as per-domain TS objects (`ui/lib/i18n/lists.ts`), schema changes via Alembic only, Tailwind utilities only (no new CSS module — `Chip` already handles its own styling).

## Dev Agent Record

### Agent Model Used

Cursor Grok 4.6 (bmad-dev-story)

### Debug Log References

- Alembic `0025_import_reviewed_at` applied on worktree Postgres (`fh-feat-4-4-15-new-badge-on-freshly-imported-rows`); verified `downgrade -1` then `upgrade head`.
- Host `uv run pytest -q`: 507 passed, 194 skipped (no host `DATABASE_URL`).
- In-container pytest (dev + worktree + test overlays, `--no-deps --build`): 701 passed.
- UI: `tsc --noEmit` clean; eslint 0 errors (3 pre-existing warnings); vitest 440 passed.

### Completion Notes List

- Badge: parser rows whose `created_at` calendar date in `America/Costa_Rica` is today; `posted_date` ignored; hand rows never badged.
- No "Mark reviewed" menu item; origin edit does not clear the badge.
- Accent `Chip` after the amount via `newBadgeLabel`. Edit/Delete stay inert.

## Story-close overview — 4.15 / 4-15-new-badge-on-freshly-imported-rows

**Request path:**
List detail GET expenses → `newBadgeLabelFrom` compares `created_at` to today in `America/Costa_Rica` → `ReceiptRow` `newBadgeLabel` Chip.

**Key components:**
`newBadgeLabelFrom` / `calendarDateInCostaRica` in `page.tsx`; `ReceiptRow` `newBadgeLabel`; `Chip tone="accent"`.

**Why this shape:**
Freshly imported means "landed in the list today," not "transaction dated today" and not "unacknowledged until someone taps mark reviewed."

**What not to break:**
Do not show the badge on `provenance != 'parser'`. Do not use `posted_date` for the badge. Do not persist Edit/Delete from `ReceiptRowMenu`. Do not wire split editing here.

### File List

- api/adapters/persistence/migrations/versions/0025_import_reviewed_at.py
- api/adapters/persistence/models.py
- api/adapters/persistence/repositories.py
- api/application/expenses.py
- api/api/schemas/lists.py
- api/api/routes/lists.py
- api/tests/test_expenses_application.py
- api/tests/test_manual_expense_api.py
- api/tests/test_import_sessions_integration.py
- ui/app/lists/listsClient.ts
- ui/app/lists/listsClient.test.ts
- ui/app/lists/[listId]/page.tsx
- ui/app/lists/[listId]/page.newBadge.test.ts
- ui/app/lists/[listId]/page.receiptRowFx.test.ts
- ui/components/soft-ledger/ReceiptRow.tsx
- ui/components/soft-ledger/ReceiptRowMenu.tsx
- ui/components/soft-ledger/soft-ledger.test.tsx
- ui/lib/i18n/lists.ts
- _bmad-output/implementation-artifacts/4-15-new-badge-on-freshly-imported-rows.md
- _bmad-output/implementation-artifacts/sprint-status.yaml

## Change Log

- 2026-08-24: Added list-view "New" badge for parser rows imported today (`created_at` in `America/Costa_Rica`), Chip near the amount.
- 2026-08-24 (amendment): Badge lifetime is the Costa Rica calendar day of `created_at`, not `import_reviewed_at` / mark-reviewed / origin-edit dismissal. User-story ACs in `epics.md` updated to match.

## Review Findings

No findings from this implementation pass (explicit zero-findings). Ready for independent `code-review`.

