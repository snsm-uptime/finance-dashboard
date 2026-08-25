---
baseline_commit: a737a06
---

# Story 4.15: "New" badge on freshly imported rows

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

> **Scope boundary (epics.md AC #5).** This story ships the badge and its dismissal
> hook only. It does **not** wire a real split-edit control into `ReceiptRow` —
> `ReceiptRowMenu`'s Edit item stays non-persisting, tracked separately
> (`deferred-work.md`). Do not attempt to build split editing here.
>
> **Independent of 4.13/4.14.** This story depends only on Story 4.11 (row-level
> commit already exists and is `done`). It does not touch `IndividualReviewPanel`,
> `ImportReviewSheet`, or anything under `ui/app/upload/`.

## Story

As a user who just imported transactions,
I want newly imported rows marked in the destination list,
so that I can find them to adjust splits without hunting through history.

## Acceptance Criteria

1. **Given** a row-level commit creates a ledger entry, **when** the entry is written, **then** `ledger_entries.import_reviewed_at` is null.
2. **Given** a ledger entry in a list view, **when** it has `provenance == 'parser'` and a null `import_reviewed_at`, **then** `ReceiptRow` renders a badge via a new optional prop, using the existing `Chip` / `ChipTone` component rather than a bespoke element.
3. **Given** I interact with a badged entry, **when** I edit it in any way, **then** `import_reviewed_at` is set and the badge clears — dismissal is not gated on split fields specifically, so it stays correct once a split-edit control exists.
4. **Given** no split-edit control is wired into `ReceiptRow` yet, **when** I want to clear a badge I have finished with, **then** an explicit dismissal affordance exists, so the badge cannot become permanently stuck.
5. **Given** this story's scope, **when** the badge points the user at adjusting a split, **then** wiring an actual split-edit control into `ReceiptRow` remains out of scope — `ReceiptRowMenu`'s Edit item is currently non-persisting, and that gap is tracked separately.

## Tasks / Subtasks

### Task 1 — Migration: `ledger_entries.import_reviewed_at` (AC: 1)

- [ ] 1.1 New Alembic revision `0025_import_reviewed_at.py`, `down_revision = "0024_import_dedup_identity"` — confirmed: that file's `revision` string (`api/adapters/persistence/migrations/versions/0024_import_dedup_identity_and_finalize.py:38`) is `"0024_import_dedup_identity"`, shorter than its filename. Keep the new `revision` under 32 chars (alembic_version is `VARCHAR(32)`) — use `"0025_import_reviewed_at"`.
- [ ] 1.2 `op.add_column("ledger_entries", sa.Column("import_reviewed_at", sa.DateTime(timezone=True), nullable=True))`. No index, no server default, no backfill — every existing row (hand or parser) simply gets `NULL`, which is correct: hand rows never show the badge (gated on `provenance == 'parser'` too) and pre-migration parser rows were never "freshly imported" in this feature's sense.
- [ ] 1.3 `downgrade()` drops the column.
- [ ] 1.4 `models.py`: add `import_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)` to `LedgerEntryModel` (near `provenance`/`created_at`).
- [ ] 1.5 **Do not** touch `api/adapters/persistence/import_sessions.py`'s `LedgerEntryModel(...)` construction sites (row-level commit at ~line 123, bulk at ~line 194). The column is nullable with no default — omitting it in those constructors already yields `NULL`, satisfying AC #1 for both Individual and Bulk commit paths with zero code change there.

### Task 2 — Application: expose the field, wire the two edit paths (AC: 1, 3, 4)

- [ ] 2.1 `api/application/expenses.py`: add `import_reviewed_at: datetime | None = None` to `LedgerEntryRecord` (after `origin_card_id`).
- [ ] 2.2 `ExpenseRepository` Protocol: add `def mark_ledger_entry_reviewed(self, *, list_id: UUID, entry_id: UUID, actor_user_id: UUID) -> LedgerEntryRecord: ...`.
- [ ] 2.3 New `MarkLedgerEntryReviewedCommand(actor_user_id: UUID, list_id: UUID, entry_id: UUID)` + `MarkLedgerEntryReviewedService(repo)`. `execute()`: `AuthorizeListAccessService(self._repo).execute(AuthorizeListAccessCommand(acting_user_id=..., list_id=..., action="write_expense"))` (list-membership check only — **no** payer restriction, unlike `UpdateExpenseOriginService`). Then `return self._repo.mark_ledger_entry_reviewed(list_id=..., entry_id=..., actor_user_id=...)`.
  - **Design decision:** any list member with write access can dismiss a badge, not just the payer. `write_expense` normalizes to `write_ledger`, a `_MEMBER_MUTATION_ACTIONS` capability (`api/domain/list_access.py`) — open to every member, matching origin edit's ACL tier but skipping the extra payer-only gate `UpdateExpenseOriginService` layers on top. Rationale: dismissing is an acknowledgment, not a financial edit; any member reviewing the list benefits from clearing it.
- [ ] 2.4 `UpdateExpenseOriginService.execute` needs no change — the timestamp write happens in the repo method (Task 3), so *every* successful origin PATCH clears the badge unconditionally (AC #3's "any edit" — origin update is currently the **only** real persisting edit path on a ledger entry; `ReceiptRowMenu`'s Edit/Delete remain non-persisting per AC #5).
- [ ] 2.5 Export `MarkLedgerEntryReviewedCommand`, `MarkLedgerEntryReviewedService` from `application/expenses.py`'s `__all__`.

### Task 3 — Persistence (AC: 1, 3, 4)

`api/adapters/persistence/repositories.py`, `SqlAlchemyListRepository`:

- [ ] 3.1 `create_ledger_entry`, `list_ledger_entries`: add `import_reviewed_at=row.import_reviewed_at` to each `LedgerEntryRecord(...)` construction (mechanical — the model column already exists after Task 1).
- [ ] 3.2 `update_ledger_entry_origin`: set `row.import_reviewed_at = datetime.now(UTC)` **unconditionally** right before `self._session.flush()` (mirrors the `created_at = datetime.now(UTC)` app-code convention already used in `create_ledger_entry` — do not rely on Postgres `now()`/a server-side trigger). Add the field to the returned `LedgerEntryRecord(...)`.
- [ ] 3.3 New `mark_ledger_entry_reviewed(self, *, list_id, entry_id, actor_user_id)`: load the row via `self._session.get(LedgerEntryModel, entry_id)`, apply the **same not-found guard** as `update_ledger_entry_origin` (`row is None or row.list_id != list_id or row.normalized_description is None or row.payer_id is None or row.provenance is None or row.line_type is None or row.posted_date is None` → raise `SubjectNotFoundError()`) — **omit** the `NotEntryPayerError` check (any member may call this). Set `row.import_reviewed_at = datetime.now(UTC)` unconditionally (idempotent — calling it twice just refreshes the timestamp, harmless), flush, return the mapped `LedgerEntryRecord`.

### Task 4 — API schema + route (AC: 1, 3, 4)

- [ ] 4.1 `api/api/schemas/lists.py`: add `import_reviewed_at: datetime | None = None` to `ExpenseItemResponse` and `CreateExpenseResponse` (the latter always `None` — hand entries are never `provenance == 'parser'`).
- [ ] 4.2 `api/api/routes/lists.py`, `_expense_item(row)`: add `import_reviewed_at=entry.import_reviewed_at,` to the `ExpenseItemResponse(...)` it returns.
- [ ] 4.3 `create_list_expense`: add `import_reviewed_at=created.import_reviewed_at,` to `CreateExpenseResponse(...)` for DTO-shape consistency (mechanical, always `None`).
- [ ] 4.4 New route `PATCH /{list_id}/expenses/{entry_id}/reviewed`, `response_model=ExpenseItemResponse`, **no request body param** (nothing to validate — the action is "mark this row reviewed", not a field update). Gate with `require_authenticated_user` only, same as the origin route. Body:
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

- [ ] 5.1 `ui/app/lists/listsClient.ts`: add `import_reviewed_at: string | null;` to `ExpenseItem`. In `asExpense()`, add `import_reviewed_at: typeof row.import_reviewed_at === "string" ? row.import_reviewed_at : null,` (same tolerant-parse style as `fx_rate_date`).
- [ ] 5.2 New minimal message type + client function in `listsClient.ts` (do **not** reuse the full `ListsClientMessages` — this endpoint only ever returns 401/403/404/generic, no `invalid_name`/`smtp`/`already_member` concepts apply):
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
- [ ] 5.3 `ui/app/lists/[listId]/page.tsx`: new pure function, alongside `originChipFrom`/`receiptRowFxPropsFrom`:
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
- [ ] 5.4 New BFF route `ui/app/api/lists/[listId]/expenses/[entryId]/reviewed/route.ts` — copy `.../origin/route.ts` verbatim (cookie forward, same-shape proxy), swap the upstream path segment from `/origin` to `/reviewed`. `context.params` is a `Promise<{ listId: string; entryId: string }>` (Next App Router convention already used everywhere in this repo).

### Task 6 — `ReceiptRow` badge + `ReceiptRowMenu` dismissal (AC: 2, 4)

`ui/components/soft-ledger/ReceiptRow.tsx`:

- [ ] 6.1 Add two new optional props to `ReceiptRowProps`: `newBadgeLabel?: string` (already-localized Chip text — same convention as `originChip: string`, not a boolean + separate i18n object) and `markReviewed?: { listId: string; entryId: string }` (identifiers only, forwarded to the menu; inert unless `newBadgeLabel` is also set).
- [ ] 6.2 In the `title` grid-area flex row (currently `{title span}{amount span}`), render `{newBadgeLabel ? <Chip tone="accent">{newBadgeLabel}</Chip> : null}` **after** the amount span — UX spec: "rendered as a Chip near the amount" (`row-level-individual-review-2026-08-20.md` §7).
- [ ] 6.3 Forward `menu` unchanged plus the new `markReviewed` prop into `<ReceiptRowMenu messages={menu} markReviewed={newBadgeLabel ? markReviewed : undefined} />` (gate on `newBadgeLabel` truthiness so the dismiss item never appears on an already-reviewed row even if a caller forgets to omit `markReviewed`).

`ui/components/soft-ledger/ReceiptRowMenu.tsx` (already `"use client"` — this is the only client boundary that needs to move; **do not** create a new wrapper component, and do not try to pass an `onDismissed` callback down from `page.tsx` — it is an async Server Component and cannot hand a closure to a Client Component):

- [ ] 6.4 Extend `ReceiptRowMenuMessages` with `markReviewedLabel?: string`, `errorGeneric: string`, `errorUnauthorized: string`, `errorForbidden: string` (all four required going forward — this widens the type, so **both** existing call sites must be updated: `ui/app/lists/[listId]/page.tsx`'s `rowShared.menu` object, and the `menu={{...}}` fixture in `ui/components/soft-ledger/soft-ledger.test.tsx`).
- [ ] 6.5 New prop `markReviewed?: { listId: string; entryId: string }`. Import `useRouter` from `next/navigation` and `useFormSubmission` from `@/hooks` (same pair `OriginChipPicker` already uses). When `markReviewed && messages.markReviewedLabel`, render a third `IconButtonPopupItem` (not `danger`) with `stayOpen` while `pending || Boolean(error)` (the `data-stay-open` escape hatch `IconButtonPopup` already supports — without it, the popup's own `onPanelClick` closes it on every item click before an error could ever be shown), `disabled={pending}`, `onClick={() => void submit(undefined)}`. `submit` calls `markExpenseReviewed(markReviewed.listId, markReviewed.entryId, messages)`; `onSuccess: () => router.refresh()` (same re-fetch-the-whole-page pattern `OriginChipPicker` uses — there is no local badge state to reconcile manually). On error, render `{error ? <p role="alert">{error}</p> : null}` inside the popup panel, mirroring `OriginChipPicker`'s inline error convention.
- [ ] 6.6 Edit/Delete items are untouched — still non-persisting placeholders (AC #5).

### Task 7 — Wire `page.tsx` + i18n (AC: 2, 3, 4)

- [ ] 7.1 `ui/lib/i18n/lists.ts`: add `receiptNewBadge` and `receiptMarkReviewed` keys to **both** `en` and `es` blocks, near the existing `receiptMenuAria`/`receiptEdit`/`receiptDelete` keys. Suggested copy: en `"New"` / `"Mark reviewed"`; es `"Nuevo"` / `"Marcar revisado"`.
- [ ] 7.2 In the expenses-map loop (`ui/app/lists/[listId]/page.tsx`, where `rowShared` is built), add:
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

- [ ] 8.1 `api/tests/test_expenses_application.py`: extend `_FakeExpenseRepo` with `mark_ledger_entry_reviewed` (Protocol + fake, per the 4.11/4.13.1 lesson that both must exist or application tests lie) — mirror `update_ledger_entry_origin`'s fake but without the payer check. New tests: mark-reviewed on a fresh entry sets `import_reviewed_at`; mark-reviewed by a non-payer member succeeds (proves the ACL difference from origin update); mark-reviewed on a nonexistent/other-list entry raises `SubjectNotFoundError`; mark-reviewed by a non-member raises `NotListMemberError`; `update_origin_*` existing tests get one added assertion that `import_reviewed_at` is set on the returned record.
- [ ] 8.2 `api/tests/test_manual_expense_api.py` (or wherever the origin PATCH route is exercised end-to-end): add a case that PATCHing origin on a `provenance='parser'` row clears `import_reviewed_at`; add the new `PATCH .../reviewed` route: happy path (200, `import_reviewed_at` set, non-payer member allowed), 404 on foreign/missing entry, 403 on non-member, 401 unauthenticated.
- [ ] 8.3 `api/tests/test_import_sessions_integration.py`: extend `test_bulk_commit_happy_path_lands_ledger_rows_payer_is_actor` (or add one line to it) to assert the freshly committed `LedgerEntryModel.import_reviewed_at is None` — Postgres 16, `DATABASE_URL`-gated, skip without it (do not add a SQLite path).
- [ ] 8.4 `ui/components/soft-ledger/soft-ledger.test.tsx`: update the existing `menu={{...}}` fixture for the new required message keys; add cases for `newBadgeLabel` rendering the accent `Chip` near the amount, and for the "mark reviewed" menu item appearing only when both `newBadgeLabel` and `markReviewed` are present, calling the (mocked) `markExpenseReviewed` and then `router.refresh()`. Mock `next/navigation`'s `useRouter` the same way any existing client-component test in this suite does.
- [ ] 8.5 `ui/app/lists/listsClient.test.ts`: `markExpenseReviewed` happy path + 401/403/generic error mapping; extend the tolerant-parse test for `import_reviewed_at` (string passthrough, missing/invalid → `null`).
- [ ] 8.6 `ui/app/lists/[listId]/page.newBadge.test.ts` (new sibling file, same pattern as `page.receiptRowFx.test.ts`): unit-test `newBadgeLabelFrom` — `provenance: "parser"` + `import_reviewed_at: null` → label; `provenance: "hand"` → `undefined` regardless of `import_reviewed_at`; `provenance: "parser"` + non-null `import_reviewed_at` → `undefined`.
- [ ] 8.7 `page.receiptRowFx.test.ts`'s `crcExpense()` fixture (and any other full-literal `ExpenseItem` builder) needs `import_reviewed_at` added — it is a required field on the type now, not optional.
- [ ] 8.8 Full gate before `review`: api pytest (host **and** in-container against Postgres 16 after `alembic upgrade head`, since this story **does** add a migration — unlike 4.13.1), ui typecheck + lint + vitest. Worktree stack via `scripts/worktree/worktree-bootstrap.sh`.

### Task 9 — Story close

- [ ] 9.1 How/why overview (`story-close-overview-checklist.md`) before `review`.
- [ ] 9.2 Review Findings section (explicit zero-findings if none).
- [ ] 9.3 Sync story header ↔ `sprint-status.yaml` (`4-15-new-badge-on-freshly-imported-rows: ready-for-dev` → `review` → `done`).

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

**`ReceiptRowMenu.tsx`** — today Edit/Delete are inert placeholders (`"Edit/Delete are present and do not persist"`, per its own docstring). This story makes it do its **first real network call**, but only for the new third item — Edit/Delete stay inert (AC #5). It is already `"use client"`; no new client-boundary component needed.

**`page.tsx`** — server component, `force-dynamic`, `asExpenses()` is a hand-rolled tolerant deserializer (not `zod`) that silently drops any expense row missing a required field — `import_reviewed_at` must be added there as tolerant-parsed, not required-strict, exactly like `fx_rate_date`.

**`update_ledger_entry_origin` (repositories.py)** — today only mutates `origin_kind`/`origin_card_id`. This story adds a third field write to the same method (`import_reviewed_at`), inside the same flush — do not open a second round-trip.

### Design decisions made in this story (not literally spelled out in epics.md — read before implementing)

1. **Dismissal ACL is broader than origin edit.** Origin edit is payer-only (`NotEntryPayerError`). Mark-reviewed is any list member with write access (`write_expense`/`write_ledger`, no extra payer check). The badge is a shared-visibility acknowledgment, not a financial field — anyone reviewing the list should be able to clear it.
2. **The dismissal control lives inside the existing `ReceiptRowMenu` overflow menu**, not a click on the badge `Chip` itself. `Chip` is documented as "Display-only... not a toggle" and is reused elsewhere (origin chips) as non-interactive; repurposing it into a button here would contradict that and duplicate `OriginChipPicker`'s already-established "wrap in a real control, keep `Chip` passive" pattern. The menu is the row's one established action surface.
3. **`ReceiptRowMenu` owns the fetch + `router.refresh()` directly** (it's already a client-component leaf) instead of a callback prop from `page.tsx` — Server Components cannot pass closures to Client Components, so there is no other option; don't try.
4. **A bespoke 3-field message type (`MarkReviewedMessages`)** rather than reusing the full `ListsClientMessages` contract for the client function — this endpoint has no `invalid_name`/`smtp`/`already_member` failure modes and forcing those fields onto every `menu={...}` call site for an unrelated reason would be noise. `ReceiptRowMenuMessages` itself does still gain the 3 error keys as required fields (Task 6.4) since the menu component needs them to build that shape locally — but the client function's own parameter type stays minimal.
5. **`import_reviewed_at` is set unconditionally on every call**, both in origin-update and mark-reviewed, rather than "only if currently null." Simpler, and idempotent — once true-set, later calls just refresh the timestamp with no observable behavior change (the badge is already gone).

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
- 4.13.1 also independently confirms `ReceiptRowMenu`'s Edit item is still non-persisting as of the latest shipped work — nothing has changed that since; AC #5's scope boundary is still accurate.

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

### Debug Log References

### Completion Notes List

### File List
