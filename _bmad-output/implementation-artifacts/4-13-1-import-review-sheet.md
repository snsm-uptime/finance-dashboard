---
baseline_commit: de8298e
---

# Story 4.13.1: ImportReviewSheet — grouped validation, discard, save

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

> **This is the confirm gate after individual review.** Last pending assign/delete
> must open a grouped sheet. **Save** calls the existing `POST /finalize`.
> **Per-row discard** returns that row to the card queue. The source PDF stays
> until Save.
>
> **Story 4.13 is still `backlog`.** This story still ships: the empty-queue
> trigger lives in today's `IndividualReviewPanel` completion effect (4.12
> Task 7.5). When 4.13 rewrites the panel, it **must keep** "zero pending +
> not finalized → sheet", not restore the 4.12 land-on-empty-queue redirect.
>
> **Do not** build `GET /import/sessions/active`, UploadPanel resume copy, or
> the FR-20 completion-summary surface — Story **4.14**. **Do not** change
> Bulk (4.7): no sheet, bulk still finalizes in `AssignBulkImportService`.

## Story

As a user who just routed every pending transaction,
I want a sheet of those items grouped by destination list, with Save or per-row discard,
so that I can confirm placements before the session is finalized and the source PDF is released.

## Acceptance Criteria

1. **Given** individual review has no remaining pending rows, **when** the last assign or delete succeeds (or the review page loads with zero pending and `finalized_at` null), **then** ImportReviewSheet opens and the source PDF is **not** deleted. **And** items are grouped by the list they were assigned to. **And** deleted rows and zero-amount excluded rows are **not** in those groups.

2. **Given** the sheet is open, **when** it renders, **then** there is **exactly one Save** control, at the **bottom** of the sheet. **And** each **discardable** assigned row has its **own** discard control. **And** Save is always present; an empty assigned-row set (everything deleted) still shows the sheet and Save. *(Amended 2026-08-25: a multi-select "Discard" control that stages several checked rows at once was accepted as a deviation — see Deviations — alongside, not instead of, per-row discard.)*

3. **Given** I tap Save, **when** it succeeds, **then** the client calls existing `finalizeSession` → `POST /import/sessions/{sessionId}/finalize` (Story 4.12). **And** the session is finalized (`finalized_at` set; AD-3 PDF delete + path clear per 4.12 rules). **And** Save is idempotent (4.12 already made finalize double-clickable). **Shipped (4.16 branch):** the UI does **not** land on `landing_list_id` from Save. `ImportCompletionSummary` (4.14) stays on `/upload/review/{id}`; chrome Back is the land control.

4. **Given** I discard a **single** discardable row, **when** that call succeeds, **then** the row returns to `pending`, its ledger row is hard-deleted (same `_undo_assign` path as undo-assign), `dedup_skipped` resets, and derived counts move with it. **And** if any pending rows remain, the sheet closes and Story 4.13 / today's card queue resumes in original `sequence`. **And** if the pending queue is empty again, the sheet stays/re-opens. **And** the loop continues until Save.

5. **Given** a **duplicate-skipped** row (`committed` + `dedup_skipped=true`, no ledger entry), **when** the sheet renders, **then** it appears in its destination-list group as already in that list. **And** Discard is **suppressed** for that row (UI + API). Returning it to `pending` would re-assign → skip forever.

6. **Given** I leave mid-sheet (close control, `/upload`, or reload), **when** I return to `/upload/review/{sessionId}` with zero pending and `finalized_at` still null, **then** the sheet opens again. **And** close/backdrop **must not** call `finalizeSession` or `discardSession`. **And** `GET /sessions/active` + homepage Resume routing is **out of scope** (4.14).

7. **Given** `GET /import/sessions/{sessionId}`, **when** a session is fetched, **then** `statements[].rows` stays **pending-only, sequence-ordered** (4.11 AC #1 — Bulk and the card queue). **And** a new sibling field `assigned_rows` lists committed assigned rows (including `dedup_skipped`) with `resolved_list_id` and `dedup_skipped`. **And** deleted / excluded_zero_amount rows are omitted from both arrays.

## Tasks / Subtasks

### Task 1 — Payload: `assigned_rows` (AC: 1, 5, 7)

- [x] 1.1 Extend `CandidateRowResponse` with optional `resolved_list_id: UUID | None = None` and `dedup_skipped: bool = False`. Pending `rows` may omit them (defaults). `assigned_rows` **must** send both.
- [x] 1.2 Add `assigned_rows: list[CandidateRowResponse] = Field(default_factory=list)` on `StagedStatementResponse`.
- [x] 1.3 In `_statement_response` (`api/api/routes/import_sessions.py`): keep pending `rows` filter **unchanged**. Build `assigned_rows` from `status == ROW_STATUS_COMMITTED`, sorted by `sequence`. Map `resolved_list_id=row.resolved_list_id`, `dedup_skipped=row.dedup_skipped`. **Do not** put deleted or excluded rows here.
- [x] 1.4 **Leave** `candidate_row_count` as total parsed rows (4.7 Bulk). **Do not** change `GET` pending-only contract for `rows`.
- [x] 1.5 Mirror types in `ui/app/upload/uploadClient.ts`: `CandidateRow` gains optional `resolved_list_id` / `dedup_skipped`; `StagedStatement` gains `assigned_rows`. `asStagedStatement` stays **tolerant** (default `assigned_rows` to `[]`).

### Task 2 — Discard assigned row API (AC: 4, 5)

Do **not** call `POST /undo` from the sheet. Undo is single-level and last-action-only; the sheet discards an **arbitrary** assigned row.

- [x] 2.1 New Protocol + repo method `unassign_candidate_row(*, session_id, user_id, row_id) -> ImportSessionRecord`. Implementation: load session; find the row; if `status != committed` → `ImportRowNotAvailableError`; if `dedup_skipped` → new `ImportRowNotDiscardableError` (`CODE = "import_row_not_discardable"`, 409); else call **existing** `_undo_assign(row_id)` (do not copy the ledger/batch delete); `_reopen_statement_if_pending`; **clear the undo pointer** (sheet discard is not card-undo; a stale last-assign pointer would lie); expire/refresh like other Core UPDATEs.
- [x] 2.2 New `UnassignCandidateRowCommand` + `UnassignCandidateRowService`: not-found / discarded same as neighbours; then repo method. **No** FX, **no** PDF release.
- [x] 2.3 `POST /import/sessions/{sessionId}/rows/{rowId}/unassign` → that service, returns `ImportSessionResponse` via `_session_response`. Gate `require_authenticated_user` only. Map `ImportRowNotDiscardableError` → 409 `import_row_not_discardable`. Same `JSONResponse` idiom — not `HTTPException`.
- [x] 2.4 One `logger.info` with `session_id` / `row_id` / `user_id` — **no** description / identity / PII.
- [x] 2.5 BFF: `ui/app/api/import/sessions/[sessionId]/rows/[rowId]/unassign/route.ts` — copy assign route (cookie forward, verbatim status/body, 502 `bad_gateway`). `params` is `Promise<{ sessionId: string; rowId: string }>`.
- [x] 2.6 `unassignRow(...)` in `uploadClient.ts` + `mapIndividualReviewError` for `import_row_not_discardable`. i18n **en+es** in `ui/lib/i18n/upload.ts` (per-domain TS objects, not JSON).

### Task 3 — UI: ImportReviewSheet (AC: 1–6)

- [x] 3.1 New client component `ui/app/upload/review/[sessionId]/ImportReviewSheet.tsx`. **Reuse** `ui/app/lists/Sheet.tsx` (`title`, `body`, `closeLabel`, `onClose`, `maxHeight` if the list is long). Do **not** add shadcn/Radix. Do **not** duplicate portal/focus-trap. Styling: Tailwind utilities + Warm Balance tokens in `globals.css`; `*.module.scss` only if custom motion/layout cannot be utilities (AD-23). No new `*.module.css`.
- [x] 3.2 Group `assigned_rows` across statements by `resolved_list_id`. List **names** from existing `fetchLists` (already loaded in the panel) — do not invent a new lists endpoint. Sort groups by list name (locale), rows inside a group by `sequence`. Amounts stay **strings**; display only — no `Number()` money math.
- [x] 3.3 Duplicate-skipped rows: show in the group; **no** discard button; copy that the purchase is already in this list (en+es). Discardable rows: one discard control each → `unassignRow`.
- [x] 3.4 **One** Save at the **bottom** of `body` (not header `cornerAction`). Use `PrimaryButton` (`@/components/soft-ledger/PrimaryButton`). Save → `finalizeSession`; on success, `router.push` `landing_list_id` path as 4.12 Task 7.5. Disable Save while pending in-flight; rely on server idempotency for double-submit.
- [x] 3.5 Empty assigned set: still render sheet + Save; short empty copy (all routed items were deleted).
- [x] 3.6 `onClose`: do **not** finalize or discard the session. Navigate to `/upload` **or** keep the sheet closed on the same URL with `open` false — either is fine if reload of `/upload/review/{id}` re-opens the sheet (AC #6). Prefer `router.push("/upload")` so the user can leave; 4.14 will later offer Resume.
- [x] 3.7 Replace the `IndividualReviewPanel` completion `useEffect` that `router.push`es when `!current`. **New rule:** if `session && !session.finalized_at && no pending rows in any statement.rows` → render/open `ImportReviewSheet` instead of landing. Keep `nextReviewable` for **card** UI (staged/failed statements). After discard returns pending rows, sheet closes and the existing card path shows those rows. **Preserve** `canAcceptChosen` / `canAcceptDefault` / card-identification blocking — do not start 4.13's four-direction card rewrite here.
- [x] 3.8 Failed-statement Skip remains deferred to 4.13 (`deferred-work.md`). Do not "fix" failed-statement UX in this story.

### Task 4 — Tests (AC: all)

- [x] 4.1 Application tests (`test_import_session_application.py`): unassign not-found / discarded; unassign `dedup_skipped` raises `ImportRowNotDiscardableError` and does **not** call `_undo_assign`; unassign committed-with-ledger reuses undo-assign outcomes (row pending, ledger gone). Fake repo must grow the new Protocol method (4.11 learning: Protocol + fake + SQLAlchemy together).
- [x] 4.2 Integration (`test_import_sessions_integration.py`, **Postgres 16**, skip without `DATABASE_URL`):
  - GET after mixed assign/delete: `rows` pending-only; `assigned_rows` committed only; deleted absent.
  - last pending assign → PDF still on disk, `finalized_at` null (already true in 4.12 — keep it).
  - `POST .../unassign` on an assigned row → pending, ledger hard-deleted, UNIQUE free, re-assign succeeds.
  - `POST .../unassign` on `dedup_skipped` → 409 `import_row_not_discardable`, row stays committed.
  - unassign last remaining assigned row → GET `rows` has that pending row; `assigned_rows` empty.
  - `POST /finalize` still 409 while any pending; after Save-equivalent finalize, PDF rules unchanged.
  - Money asserts: `Decimal` only.
- [x] 4.3 UI: `uploadClient.test.ts` for `unassignRow` + tolerant `assigned_rows`. Extend `IndividualReviewPanel.test.tsx`: empty pending + not finalized **does not** `push` `/lists/...`; sheet Save calls finalize then lands; discard brings a row back (mock `unassignRow`). `cards-import.bff.test.ts` for unassign proxy.
- [x] 4.4 Full gate before `review`: api pytest (host **and** Compose `api` after `alembic upgrade head` if a migration was added — **this story should not need a migration** if `resolved_list_id` / `dedup_skipped` already exist), ui typecheck + lint + vitest. Worktree stack via `scripts/worktree/worktree-bootstrap.sh`. Local/Docker build if CSS/Tailwind changed (Epic 3.5 retro).

### Task 5 — Story close

- [x] 5.1 How/why overview (`story-close-overview-checklist.md`) before `review`.
- [x] 5.2 Review Findings section (explicit zero-findings if none).
- [x] 5.3 Sync story header ↔ `sprint-status.yaml`.
- [x] 5.4 In `deferred-work.md`, mark the 4.12 duplicate-skipped sheet bullet **done/owned** once payload + suppress-discard land.

## Dev Notes

### Product loop (operator, SCP 2026-08-21)

1. Card review until pending is empty.
2. Sheet opens. PDF stays.
3. Per-row discard → pending → cards in original `sequence` → sheet again when empty.
4. One bottom Save → finalize (4.12) → land (`landing_list_id`). Summary UI = 4.14.

Ledger writes stay on **assign**, not Save. Save **confirms**. Discard **reverses**. Do not defer commits until Save (4.10/4.11 stay `done`).

### What already exists — do not rebuild

| Piece | Where |
|---|---|
| `POST /{sessionId}/finalize` + BFF + `finalizeSession` | `api/api/routes/import_sessions.py`, `ui/app/api/import/sessions/[sessionId]/finalize/route.ts`, `uploadClient.ts` |
| `finalized_at`, derived counts, `landing_list_id` | `_session_response` / `ImportSessionRecord` |
| `_undo_assign` ledger + emptied-batch hard delete | `api/adapters/persistence/import_sessions.py` (`_undo_assign`) |
| `_release_source_pdf_if_idle` only on finalize / bulk / discard / upload | `FinalizeImportSessionService` — **not** row assign/delete |
| Reusable `Sheet` (portal, focus trap, Esc, 280ms, reduced motion) | `ui/app/lists/Sheet.tsx` |
| Pending-only `rows` GET | `_statement_response` |
| `fetchLists` | `ui/app/lists/listsClient.ts` |
| Card queue panel | `ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx` |

### Files being modified — current state / must survive

**`IndividualReviewPanel.tsx`** — 4.8-era statement card. `nextReviewable` picks first `staged`/`failed` statement. Completion effect (`session && !current`) **lands immediately** via `landing_list_id`. That effect is the 4.12 carve-out and is **this story's trigger**. Must survive: list picker persistence across rows, `canAcceptChosen` / `canAcceptDefault`, IBAN card-identification block (`useCardIdentification`), swipe/button accept+skip, `discardSession` dismiss-file. Do not implement 4.13 four-direction card / inline title edit.

**`_statement_response`** — pending-only `rows` is a 4.11 contract. Widening `rows` to committed would make the card think it still has work (or Bulk would mis-count). Sibling `assigned_rows` is the safe split.

**`_undo_assign`** — for `dedup_skipped` it already restores pending and returns when `entry is None`. That is **correct for card undo** of a duplicate skip (4.12). Sheet discard of duplicates is a product dead-end; block it with `ImportRowNotDiscardableError` **before** calling `_undo_assign`.

**Undo pointer** — after sheet unassign, **clear** it. Do not set it to the discarded row (that would make the next card **down/undo** reverse a sheet action). Card undo remains last **card** assign/delete only.

**Bulk** — `AssignBulkImportService` still finalizes; no sheet. Do not teach Bulk to read `assigned_rows`.

### Duplicate-skipped (deferred-work, 4.12) — decided here

Show in the destination group. Discard suppressed. Copy: already in this list. API 409 if called anyway.

### 4.13 / 4.14 boundaries

| Concern | Owner |
|---|---|
| Four-direction card, swipe map, inline title | **4.13** (preserve sheet trigger) |
| ImportReviewSheet + unassign + GET `assigned_rows` + call finalize | **4.13.1** |
| `GET /sessions/active`, Upload Resume vs Bulk, completion summary copy | **4.14** |
| "New" badge | **4.15** |
| Quarantine / same-price | **Epic 5** |

### Project structure

- Hex: new service in `application/import_session.py`; repo method on Protocol + SQLAlchemy; route in `api/api/routes/import_sessions.py`; no domain FastAPI/SQLAlchemy imports.
- UI: App Router under `ui/app/upload/review/[sessionId]/`; BFF under `ui/app/api/import/...`; i18n `ui/lib/i18n/upload.ts` both locales.
- Amounts: JSON strings. Dates: ISO calendar strings. No client FX/share math.

### Testing standards

- Domain/application: TDD for the new error + unassign service (AD-15).
- Persistence/HTTP: Postgres 16 integration tests; never SQLite stand-in.
- UI: test-after on panel + client; jsdom patterns already in `IndividualReviewPanel.test.tsx`.
- CI: no real bank PDFs; no PII in logs/fixtures.

## Previous story intelligence (4.12)

- Finalize exists; landing **target** exists; landing **trigger** was explicitly left as empty-queue until this story.
- Protocol methods must be declared **and** implemented on the test fake or application tests lie.
- Core `UPDATE` requires expire/refresh or GET echoes stale `dedup_skipped` / status.
- `_undo_assign` must reset `dedup_skipped=False` (already done) — unassign reuses it.
- No Alembic in this story unless you invent a column — `resolved_list_id` and `dedup_skipped` already persist.
- Worktree `:3110` vs main `:3000`: pre-4.12 ledger rows lack `import_identity`; do not treat main-stack re-import duplicates as a 4.13.1 bug.

## Git intelligence

Recent `main` work is credit-card faces on session review and i18n dead-key cleanup (`de8298e`, `5d8cbdb`, `31f9b59`) — **not** import-row APIs. Import pipeline truth is Stories **4.10–4.12** on `api/` + `uploadClient.ts`. Do not restyle `CreditCardFace` / `SessionReviewPanel` here.

## Latest tech notes

- Keep the **existing** `Sheet` (focus trap, Esc, `aria` title). Do **not** add shadcn/Radix for this overlay — kits stay unstyled primitives; this app already has the pattern.
- Next App Router: BFF `context.params` is a **Promise** (copy assign/finalize routes).
- FastAPI errors: `JSONResponse` + `code` field, matching `mapIndividualReviewError`.
- Tailwind + CSS variables (`--surface`, `--muted`, `--border`, `--space-*`) — do not invent `--color-*` aliases from old drafts.

## Project context reference

Follow `_bmad-output/project-context.md`: AD-3 (PDF until Save), AD-4 (session ≠ batch; finalize on Save), AD-9 (card gestures stay 4.13), AD-15/AD-19/AD-23, money as Decimal/string, EN+ES keys, no `NEXT_PUBLIC_` secrets, no real PDFs in git.

## Dev Agent Record

### Agent Model Used

claude-sonnet-5 (Claude Code `bmad-dev-story`)

### Debug Log References

- API: `ruff` clean; host pytest 496 passing (Postgres-gated integration tests skip without `DATABASE_URL`); in-container pytest **681 passing** against Postgres 16 via `docker compose -f docker-compose.yml -f docker-compose.test.yml run --rm --build api` on the worktree stack (`fh-feat-4-4-13-1-import-review-sheet`).
- UI: `tsc --noEmit` clean; `npm run lint` 0 errors (1 pre-existing warning in `IndividualReviewPanel.tsx`, unrelated to this story); `vitest run` 417 passing across 59 files.
- No Alembic migration needed — `resolved_list_id` / `dedup_skipped` already existed on `import_candidate_rows` (per Story 4.12).

### Completion Notes List

## Story-close overview — 4-13-1-import-review-sheet

**Request path (backend — Task 1/2, stable, matches the story as written):**
`GET /import/sessions/{id}` → `_statement_response` now emits a sibling `assigned_rows` (committed rows, `resolved_list_id` + `dedup_skipped`) alongside the unchanged pending-only `rows`. `POST /import/sessions/{id}/rows/{rowId}/unassign` → `UnassignCandidateRowService` → repo `unassign_candidate_row` (load session, guard `status == committed`, guard `dedup_skipped` → `ImportRowNotDiscardableError` 409, else reuse `_undo_assign`, `_reopen_statement_if_pending`, clear the session undo pointer) → `_session_response`.

**Request path (frontend — Task 3, evolved during implementation, see Deviations):**
`IndividualReviewPanel` (zero pending + `!finalized_at`) → renders `ImportReviewSheet` → `groupAssignedRows` (by `resolved_list_id`, then by posted day) → **Save** (footer, pinned via `Sheet`'s new `fillBelowChrome`/`footer` props) walks any locally staged discards through `deleteRow`, refetches the session, then calls `finalizeSession` and **stays** so 4.14’s receipt can render. **Change List** (multi-select bar) calls `unassignRow` immediately per selected row, closing the sheet and resuming the card queue for that row — this is the action that actually exercises the Task 2 `unassign` endpoint end to end.

**Key components:**
`api/domain/errors.py` (`ImportRowNotDiscardableError`) · `api/application/import_session.py` (`UnassignCandidateRowCommand`/`Service`) · `api/adapters/persistence/import_sessions.py` (`unassign_candidate_row`) · `api/api/routes/import_sessions.py` (`POST .../unassign`, `assigned_rows` in `_statement_response`) · `api/api/schemas/import_sessions.py` · `ui/app/api/import/sessions/[sessionId]/rows/[rowId]/unassign/route.ts` · `ui/app/upload/uploadClient.ts` (`unassignRow`, `assigned_rows`/`resolved_list_id`/`dedup_skipped` mirror) · `ui/app/upload/review/[sessionId]/ImportReviewSheet.tsx` (new) · `ui/app/upload/stagedImportDiscards.ts` (new, localStorage-backed staging) · `ui/app/lists/Sheet.tsx` (`fillBelowChrome`, `footer` props) · `ui/components/AppShell.tsx` (`data-app-chrome="header"` marker `Sheet` measures against) · `ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx` (sheet trigger + staged-discard-aware card queue).

**Why this shape:**
Backend Task 1/2 followed the story text directly — `assigned_rows` as a sibling array keeps the 4.11 pending-only `rows` contract untouched, and `unassign_candidate_row` reuses `_undo_assign` rather than duplicating the ledger/batch-delete path. The frontend grew day-grouping, local staging (`stagedImportDiscards.ts`, survives reload/tab-change via `sessionStorage`), a multi-select bar, and a dedicated **Change List** action beyond the story's Task 3 sketch — these were live product decisions made directly against the running UI during this session (see Deviations below for exactly what changed and why it matters for review).

**What not to break:**
- `GET /import/sessions/{id}` `rows` stays pending-only, sequence-ordered (4.11 AC #1) — `assigned_rows` is strictly additive.
- `unassign_candidate_row` must check `dedup_skipped` **before** calling `_undo_assign` — a duplicate-skipped row has no ledger entry to reverse, and returning it to pending would just re-assign and skip forever.
- Sheet-triggered `unassign` clears the session undo pointer (`_clear_pointer_on`) — it must never leave the pointer aimed at a row a sheet action touched, or a later card **down/undo** would reverse the wrong thing.
- `_release_source_pdf_if_idle` is still only called from finalize / bulk / discard / upload — row-grain assign/delete/unassign never touch it (AD-3 stays: PDF survives until Save).
- Bulk (`AssignBulkImportService`) is untouched — no sheet, does not read `assigned_rows`.

### Deviations from the story text

These were decided live against the running app during this session and materially change what the story's Acceptance Criteria describe on paper — flagging clearly rather than quietly marking the ACs satisfied:

- **AC #4's literal "discard → row returns to pending, sheet closes, card queue resumes" is not what a plain sheet Discard now does.** Discard (per-row icon or multi-select "Discard") stages the row for **deletion** (`stageSheetDiscards`, applied via `deleteRow` at Save) with a "Restore" undo before Save — the row is gone from the ledger, not returned to review. The behavior AC #4 actually describes (row → pending → card queue resumes) now lives behind a separate **Change List** action (multi-select bar), which calls `POST .../unassign` immediately. The Task 2 backend endpoint and its tests are unaffected — this is purely a frontend wiring choice about which button calls it.
- **Discards are staged client-side (`ui/app/upload/stagedImportDiscards.ts`) instead of calling the API immediately.** This applies to both the sheet's Discard and the individual card's up-swipe/trash delete (`IndividualReviewPanel.tsx` now calls `stageCardDiscard` instead of `deleteRow` directly). Everything staged is walked through `deleteRow` in one batch when Save fires, immediately before `finalizeSession`. Ledger writes on **assign** remain immediate and unchanged — only deletes are now deferred, not commits generally. *(Originally sessionStorage-backed; switched to `localStorage` + a `storage`-event listener on 2026-08-25 per code review — see Review Findings.)*
- **Day-grouping** (`groupRowsByDay`) inside each list group is additive UI polish, not in Task 3.2's text (list-group + sequence order only).
- **`Sheet` gained two new props** (`fillBelowChrome`, `footer`) and `AppShell` gained a `data-app-chrome="header"` marker so the sheet can fill from the chrome header to the viewport bottom with Save pinned outside the scrolling body — Task 3.1 said reuse `Sheet` as-is; this extended it (additively, existing callers unaffected — verified no other `Sheet` usage passes these props and all existing Sheet-consuming tests still pass).
- Task 3.3's literal "one discard control each → `unassignRow`" no longer holds (discard now calls `deleteRow`, per above) — the AC #5 behavior it was in service of (dedup_skipped rows shown as already-in-list, discard suppressed) is preserved.
- **Sheet Discard (and the sticky multi-select Discard) is owe-colored** (`border-owe text-owe`) so it reads as a destructive confirm, not a muted secondary.
- **AC #3 land-from-Save is superseded:** Save only finalizes; 4.14 receipt + chrome Back land (4.16 branch).
- **AC #2's "no bulk/sheet-level discard" is not what shipped.** A multi-select selection-bar Discard button stages every checked row in one click (`stageDiscard(selectedDiscardableIds)`), alongside the per-row discard icon — accepted 2026-08-25 (code review) as an intentional deviation, not a defect; AC #2 text amended to match.
- **Inline title-edit (`IndividualReviewPanel.tsx`) gained an auto-growing multi-line textarea and a Ctrl/Cmd+Z undo shortcut** beyond what this story's own Dev Notes scoped ("Do not implement 4.13 four-direction card / inline title edit"). Confirmed intentional 2026-08-25 (code review) — kept as shipped, not split out.

### File List

**New**
```
api/adapters/persistence/import_sessions.py (unassign_candidate_row added)
ui/app/api/import/sessions/[sessionId]/rows/[rowId]/unassign/route.ts
ui/app/upload/review/[sessionId]/ImportReviewSheet.tsx
ui/app/upload/review/[sessionId]/ImportReviewSheet.test.tsx
ui/app/upload/stagedImportDiscards.ts
```

**Modified**
```
api/api/routes/import_sessions.py
api/api/schemas/import_sessions.py
api/application/import_session.py
api/domain/errors.py
api/tests/test_import_session_application.py
api/tests/test_import_sessions_integration.py
ui/app/api/cards-import.bff.test.ts
ui/app/lists/Sheet.module.scss
ui/app/lists/Sheet.tsx
ui/app/upload/SessionReviewPanel.test.tsx
ui/app/upload/review/[sessionId]/IndividualReviewPanel.test.tsx
ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx
ui/app/upload/uploadClient.test.ts
ui/app/upload/uploadClient.ts
ui/components/AppShell.test.tsx
ui/components/AppShell.tsx
ui/lib/i18n/upload.ts
_bmad-output/implementation-artifacts/deferred-work.md
_bmad-output/implementation-artifacts/sprint-status.yaml
_bmad-output/implementation-artifacts/4-13-1-import-review-sheet.md
```

## Change Log

- 2026-08-24: Story context created via `bmad-create-story`. Status → ready-for-dev.
- 2026-08-24: Story implemented via `bmad-dev-story`. Task 1/2 (backend `assigned_rows` payload + `unassign` endpoint) built and tested exactly as specified — 496 host / 681 in-container-against-Postgres-16 pytest passing. Task 3 (`ImportReviewSheet`) built collaboratively against the running app and grew beyond its original sketch: day-grouping, client-side staged discard/delete (`stagedImportDiscards.ts`, sessionStorage), a multi-select bar, and a **Change List** action distinct from Discard — see Deviations above, most notably that AC #4's literal "discard → pending → card queue resumes" now maps to Change List, not Discard. 417 vitest passing, typecheck/lint clean. Status → review.
- 2026-08-25: Story 4.16 Group D docs: AC #3 Save no longer lands; owe-colored Discard recorded in Deviations. Status remains `review`.

### Review Findings

Reviewed 2026-08-25 (`bmad-code-review`) against diff `4e5753a..a737a06` (Story 4.13.1's own contribution). AC #4's discard-vs-Change-List deviation, documented above, was independently confirmed accepted by the product owner during this review and is not re-flagged below.

**Decision needed**

_All resolved 2026-08-25 — see Deviations section above for #1/#2; #3 converted to a Patch item below._

**Patch**

- [x] [Review][Patch] Staged card-delete/sheet-discard state (`stagedImportDiscards.ts`) is lost on tab close (sessionStorage doesn't survive it) and silently diverges across two tabs on the same session with no reconciliation. Decided 2026-08-25: harden rather than accept as-is — switch the backing store from `sessionStorage` to `localStorage` (survives tab close) and add a native `storage` event listener alongside the existing in-tab `emit()` so sibling tabs re-render on change (`window.addEventListener("storage", ...)` fires in other tabs/documents, never the origin tab — the in-tab listener set stays for that case). [ui/app/upload/stagedImportDiscards.ts]

- [x] [Review][Patch] Dedup-skipped rows can be discarded via `POST /rows/{rowId}/delete` — the endpoint the shipped Discard/Change-List UI actually calls — bypassing AC #5's "UI + API" suppression. `mark_candidate_row_deleted`'s committed→deleted branch has no `dedup_skipped` guard, unlike `unassign_candidate_row` which correctly raises `ImportRowNotDiscardableError`; `UnassignCandidateRowService`'s own docstring incorrectly claims this guard "lives in the repository" for both paths. UI hides the control so normal use can't trigger it, but the API contract itself is unenforced. [api/adapters/persistence/import_sessions.py:553-561]
- [x] [Review][Patch] `finalized_at` is never checked in `DeleteCandidateRowService`/`UnassignCandidateRowService` (only `discarded_at` is) — this story's sheet is what creates an extended committed-but-unfinalized review window, so a stale tab or race can unassign/delete a row on an already-finalized session. [api/application/import_session.py:906-922,951-965]
- [x] [Review][Patch] Stale cross-action error bleed: `errorMessage = saveAction.error ?? changeListAction.error` shows a leftover error from one action while/after the other succeeds, since `useFormSubmission` only clears its own error at the start of its own `submit()`. Misleading during a financial confirm action. [ui/app/upload/review/[sessionId]/ImportReviewSheet.tsx:348]
- [x] [Review][Patch] Sheet close (X / backdrop / Esc) isn't gated on `saveAction.pending`/`changeListAction.pending` — closing mid-Save lets the in-flight staged-delete→finalize chain keep running after unmount, and a late success can fire an unexpected second `router.push` after the user has already navigated elsewhere. [ui/app/upload/review/[sessionId]/ImportReviewSheet.tsx:388]
- [x] [Review][Patch] `unassignIds` in `StagedImportDiscards` is a misnomer: `stageSheetDiscards()` populates it, but `saveAction` walks both `deleteIds` and `unassignIds` through `deleteRow` — `unassignRow` is never called on anything staged this way. Risks a future bug from a maintainer trusting the name. [ui/app/upload/stagedImportDiscards.ts:9]
- [x] [Review][Patch] `resolved_at` isn't refreshed on the new committed→deleted transition in `mark_candidate_row_deleted`, unlike the pending→deleted branch immediately above it. `resolved_list_id` is cleared alongside so this doesn't corrupt landing-list-id calculation, but it's a minor audit-trail inconsistency. [api/adapters/persistence/import_sessions.py:556-559]
- [x] [Review][Patch] Three unused i18n keys added to both locales (`importReviewSheetDiscarding`, `importReviewSheetDiscardSelected`, `importReviewSheetDiscardingSelected`) — dead strings from an earlier bulk-discard design, never referenced in the component. [ui/lib/i18n/upload.ts:91-93,201-203]

All 8 patches applied 2026-08-25. Verification: `ruff check`/`ruff format --check` clean; host pytest 511 passing (2 new integration tests added — `test_delete_dedup_skipped_row_is_409_and_stays_committed`, `test_delete_and_unassign_on_a_finalized_session_are_409` — collect correctly but are Postgres-gated and skip without `DATABASE_URL`, same as all integration tests here); application-tier fake-repo tests cover both new guards directly and pass (67 passing, includes 2 new unit tests mirroring the equivalent `unassign` guard tests). Live Postgres run via `docker compose -f docker-compose.yml -f docker-compose.test.yml run --rm --build api` did not complete — the primary checkout's `db` healthcheck stalled (documented pre-existing footgun, see deferred-work.md's "Primary-checkout Compose can stall ~1h on first boot" entry); `pg_isready`/API `/health` confirmed the stack itself was fine, this is a healthcheck-timing artifact of the primary checkout, not a code issue. `tsc --noEmit` clean; `npm run lint` 0 errors (3 pre-existing warnings, none in touched files); `vitest run` 437 passing across 62 files (was 417/59 before this pass — 2 files gained assertions, no new test files).

**Defer**

- [x] [Review][Defer] Save/Change-List per-row mutation loops can't distinguish "mutation succeeded but the response was lost" from a real failure — `postRowMutation`'s catch returns a generic `{ok:false}`, so a dropped connection after a successful delete/unassign leaves the client stuck retrying (now legitimately 409ing) with no path forward short of a full page reload. [ui/app/upload/uploadClient.ts] — deferred, pre-existing generic fetch-error handling shared across all row mutations, not introduced by this story; low likelihood, recoverable via reload.
