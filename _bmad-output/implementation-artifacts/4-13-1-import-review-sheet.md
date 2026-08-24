---
baseline_commit: de8298e
---

# Story 4.13.1: ImportReviewSheet — grouped validation, discard, save

Status: ready-for-dev

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

2. **Given** the sheet is open, **when** it renders, **then** there is **exactly one Save** control, at the **bottom** of the sheet. **And** each **discardable** assigned row has its **own** discard control — no bulk/sheet-level discard. **And** Save is always present; an empty assigned-row set (everything deleted) still shows the sheet and Save.

3. **Given** I tap Save, **when** it succeeds, **then** the client calls existing `finalizeSession` → `POST /import/sessions/{sessionId}/finalize` (Story 4.12). **And** the session is finalized (`finalized_at` set; AD-3 PDF delete + path clear per 4.12 rules). **And** the UI then lands using `session.landing_list_id` (`/lists/{id}` or `/lists` if null) — **no** 4.14 summary screen in this story. **And** Save is idempotent (4.12 already made finalize double-clickable).

4. **Given** I discard a **single** discardable row, **when** that call succeeds, **then** the row returns to `pending`, its ledger row is hard-deleted (same `_undo_assign` path as undo-assign), `dedup_skipped` resets, and derived counts move with it. **And** if any pending rows remain, the sheet closes and Story 4.13 / today's card queue resumes in original `sequence`. **And** if the pending queue is empty again, the sheet stays/re-opens. **And** the loop continues until Save.

5. **Given** a **duplicate-skipped** row (`committed` + `dedup_skipped=true`, no ledger entry), **when** the sheet renders, **then** it appears in its destination-list group as already in that list. **And** Discard is **suppressed** for that row (UI + API). Returning it to `pending` would re-assign → skip forever.

6. **Given** I leave mid-sheet (close control, `/upload`, or reload), **when** I return to `/upload/review/{sessionId}` with zero pending and `finalized_at` still null, **then** the sheet opens again. **And** close/backdrop **must not** call `finalizeSession` or `discardSession`. **And** `GET /sessions/active` + homepage Resume routing is **out of scope** (4.14).

7. **Given** `GET /import/sessions/{sessionId}`, **when** a session is fetched, **then** `statements[].rows` stays **pending-only, sequence-ordered** (4.11 AC #1 — Bulk and the card queue). **And** a new sibling field `assigned_rows` lists committed assigned rows (including `dedup_skipped`) with `resolved_list_id` and `dedup_skipped`. **And** deleted / excluded_zero_amount rows are omitted from both arrays.

## Tasks / Subtasks

### Task 1 — Payload: `assigned_rows` (AC: 1, 5, 7)

- [ ] 1.1 Extend `CandidateRowResponse` with optional `resolved_list_id: UUID | None = None` and `dedup_skipped: bool = False`. Pending `rows` may omit them (defaults). `assigned_rows` **must** send both.
- [ ] 1.2 Add `assigned_rows: list[CandidateRowResponse] = Field(default_factory=list)` on `StagedStatementResponse`.
- [ ] 1.3 In `_statement_response` (`api/api/routes/import_sessions.py`): keep pending `rows` filter **unchanged**. Build `assigned_rows` from `status == ROW_STATUS_COMMITTED`, sorted by `sequence`. Map `resolved_list_id=row.resolved_list_id`, `dedup_skipped=row.dedup_skipped`. **Do not** put deleted or excluded rows here.
- [ ] 1.4 **Leave** `candidate_row_count` as total parsed rows (4.7 Bulk). **Do not** change `GET` pending-only contract for `rows`.
- [ ] 1.5 Mirror types in `ui/app/upload/uploadClient.ts`: `CandidateRow` gains optional `resolved_list_id` / `dedup_skipped`; `StagedStatement` gains `assigned_rows`. `asStagedStatement` stays **tolerant** (default `assigned_rows` to `[]`).

### Task 2 — Discard assigned row API (AC: 4, 5)

Do **not** call `POST /undo` from the sheet. Undo is single-level and last-action-only; the sheet discards an **arbitrary** assigned row.

- [ ] 2.1 New Protocol + repo method `unassign_candidate_row(*, session_id, user_id, row_id) -> ImportSessionRecord`. Implementation: load session; find the row; if `status != committed` → `ImportRowNotAvailableError`; if `dedup_skipped` → new `ImportRowNotDiscardableError` (`CODE = "import_row_not_discardable"`, 409); else call **existing** `_undo_assign(row_id)` (do not copy the ledger/batch delete); `_reopen_statement_if_pending`; **clear the undo pointer** (sheet discard is not card-undo; a stale last-assign pointer would lie); expire/refresh like other Core UPDATEs.
- [ ] 2.2 New `UnassignCandidateRowCommand` + `UnassignCandidateRowService`: not-found / discarded same as neighbours; then repo method. **No** FX, **no** PDF release.
- [ ] 2.3 `POST /import/sessions/{sessionId}/rows/{rowId}/unassign` → that service, returns `ImportSessionResponse` via `_session_response`. Gate `require_authenticated_user` only. Map `ImportRowNotDiscardableError` → 409 `import_row_not_discardable`. Same `JSONResponse` idiom — not `HTTPException`.
- [ ] 2.4 One `logger.info` with `session_id` / `row_id` / `user_id` — **no** description / identity / PII.
- [ ] 2.5 BFF: `ui/app/api/import/sessions/[sessionId]/rows/[rowId]/unassign/route.ts` — copy assign route (cookie forward, verbatim status/body, 502 `bad_gateway`). `params` is `Promise<{ sessionId: string; rowId: string }>`.
- [ ] 2.6 `unassignRow(...)` in `uploadClient.ts` + `mapIndividualReviewError` for `import_row_not_discardable`. i18n **en+es** in `ui/lib/i18n/upload.ts` (per-domain TS objects, not JSON).

### Task 3 — UI: ImportReviewSheet (AC: 1–6)

- [ ] 3.1 New client component `ui/app/upload/review/[sessionId]/ImportReviewSheet.tsx`. **Reuse** `ui/app/lists/Sheet.tsx` (`title`, `body`, `closeLabel`, `onClose`, `maxHeight` if the list is long). Do **not** add shadcn/Radix. Do **not** duplicate portal/focus-trap. Styling: Tailwind utilities + Warm Balance tokens in `globals.css`; `*.module.scss` only if custom motion/layout cannot be utilities (AD-23). No new `*.module.css`.
- [ ] 3.2 Group `assigned_rows` across statements by `resolved_list_id`. List **names** from existing `fetchLists` (already loaded in the panel) — do not invent a new lists endpoint. Sort groups by list name (locale), rows inside a group by `sequence`. Amounts stay **strings**; display only — no `Number()` money math.
- [ ] 3.3 Duplicate-skipped rows: show in the group; **no** discard button; copy that the purchase is already in this list (en+es). Discardable rows: one discard control each → `unassignRow`.
- [ ] 3.4 **One** Save at the **bottom** of `body` (not header `cornerAction`). Use `PrimaryButton` (`@/components/soft-ledger/PrimaryButton`). Save → `finalizeSession`; on success, `router.push` `landing_list_id` path as 4.12 Task 7.5. Disable Save while pending in-flight; rely on server idempotency for double-submit.
- [ ] 3.5 Empty assigned set: still render sheet + Save; short empty copy (all routed items were deleted).
- [ ] 3.6 `onClose`: do **not** finalize or discard the session. Navigate to `/upload` **or** keep the sheet closed on the same URL with `open` false — either is fine if reload of `/upload/review/{id}` re-opens the sheet (AC #6). Prefer `router.push("/upload")` so the user can leave; 4.14 will later offer Resume.
- [ ] 3.7 Replace the `IndividualReviewPanel` completion `useEffect` that `router.push`es when `!current`. **New rule:** if `session && !session.finalized_at && no pending rows in any statement.rows` → render/open `ImportReviewSheet` instead of landing. Keep `nextReviewable` for **card** UI (staged/failed statements). After discard returns pending rows, sheet closes and the existing card path shows those rows. **Preserve** `canAcceptChosen` / `canAcceptDefault` / card-identification blocking — do not start 4.13's four-direction card rewrite here.
- [ ] 3.8 Failed-statement Skip remains deferred to 4.13 (`deferred-work.md`). Do not "fix" failed-statement UX in this story.

### Task 4 — Tests (AC: all)

- [ ] 4.1 Application tests (`test_import_session_application.py`): unassign not-found / discarded; unassign `dedup_skipped` raises `ImportRowNotDiscardableError` and does **not** call `_undo_assign`; unassign committed-with-ledger reuses undo-assign outcomes (row pending, ledger gone). Fake repo must grow the new Protocol method (4.11 learning: Protocol + fake + SQLAlchemy together).
- [ ] 4.2 Integration (`test_import_sessions_integration.py`, **Postgres 16**, skip without `DATABASE_URL`):
  - GET after mixed assign/delete: `rows` pending-only; `assigned_rows` committed only; deleted absent.
  - last pending assign → PDF still on disk, `finalized_at` null (already true in 4.12 — keep it).
  - `POST .../unassign` on an assigned row → pending, ledger hard-deleted, UNIQUE free, re-assign succeeds.
  - `POST .../unassign` on `dedup_skipped` → 409 `import_row_not_discardable`, row stays committed.
  - unassign last remaining assigned row → GET `rows` has that pending row; `assigned_rows` empty.
  - `POST /finalize` still 409 while any pending; after Save-equivalent finalize, PDF rules unchanged.
  - Money asserts: `Decimal` only.
- [ ] 4.3 UI: `uploadClient.test.ts` for `unassignRow` + tolerant `assigned_rows`. Extend `IndividualReviewPanel.test.tsx`: empty pending + not finalized **does not** `push` `/lists/...`; sheet Save calls finalize then lands; discard brings a row back (mock `unassignRow`). `cards-import.bff.test.ts` for unassign proxy.
- [ ] 4.4 Full gate before `review`: api pytest (host **and** Compose `api` after `alembic upgrade head` if a migration was added — **this story should not need a migration** if `resolved_list_id` / `dedup_skipped` already exist), ui typecheck + lint + vitest. Worktree stack via `scripts/worktree/worktree-bootstrap.sh`. Local/Docker build if CSS/Tailwind changed (Epic 3.5 retro).

### Task 5 — Story close

- [ ] 5.1 How/why overview (`story-close-overview-checklist.md`) before `review`.
- [ ] 5.2 Review Findings section (explicit zero-findings if none).
- [ ] 5.3 Sync story header ↔ `sprint-status.yaml`.
- [ ] 5.4 In `deferred-work.md`, mark the 4.12 duplicate-skipped sheet bullet **done/owned** once payload + suppress-discard land.

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

## Story completion status

Status: **ready-for-dev**

Ultimate context engine analysis completed — comprehensive developer guide created.
