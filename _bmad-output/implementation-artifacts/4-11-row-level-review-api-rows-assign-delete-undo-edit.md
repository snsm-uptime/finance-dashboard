---
baseline_commit: 8390624
---

# Story 4.11: Row-level review API — rows, assign, delete, undo, edit

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

> **This is an API/BFF story. No review UI here.** Story 4.13 owns the
> `IndividualReviewPanel` rewrite (card, four directions, inline title edit).
> 4.11 ships the HTTP surface + typed client so 4.13 is purely presentational.
> Do **not** redesign `IndividualReviewPanel.tsx` or `UploadPanel.tsx` in this story.

## Story

As a client rendering per-transaction review,
I want the session payload to carry individual rows and endpoints to resolve them one at a time,
so that the review UI can act on a transaction instead of a file.

## Acceptance Criteria

1. **Given** `GET /import/sessions/{sessionId}`, **when** a staged session is fetched, **then** each statement carries a `rows` array (`id`, `sequence`, `description`, `amount`, `currency`, `posted_date`, `status`) plus `zero_amount_excluded_count`, and the session carries the current undo pointer or `null`. **And** only `pending` rows are included in the queue payload.
2. **Given** left and right card actions, **when** either fires, **then** both call `POST /import/sessions/{sessionId}/rows/{rowId}/assign` with a `list_id` body — one endpoint, the client supplying the default list or the picked list (mirroring how the retired `commitIndividualStatement` served both accept paths).
3. **Given** the up action, **when** it fires, **then** `POST /import/sessions/{sessionId}/rows/{rowId}/delete` soft-marks the row `deleted` so undo can restore it.
4. **Given** undo must target the last action rather than a row, **when** `POST /import/sessions/{sessionId}/undo` is called, **then** it reads the session's undo pointer; an **assign** is reversed by deleting the created ledger entry and returning the row to `pending`; a **delete** is reversed by returning the row to `pending`. **And** the restored row re-enters the queue at its original `sequence` position, not at the front. **And** undo is single-level — a second consecutive call returns `import_nothing_to_undo`.
5. **Given** the undo pointer must survive a reload, **when** a row resolves, **then** `last_resolved_row_id`, `last_resolved_action`, and `last_resolved_prior_status` are persisted on `import_sessions` and cleared once used or superseded.
6. **Given** a pending row's description needs correcting, **when** `PATCH /import/sessions/{sessionId}/rows/{rowId}` is called with a `description`, **then** it succeeds only while the row is `pending`, enforced server-side by the same guarded-UPDATE idiom.
7. **Given** row-level failure modes, **when** an operation cannot proceed, **then** `import_row_not_found`, `import_row_not_available`, and `import_nothing_to_undo` are returned following the existing code convention consumed by `mapIndividualReviewError`.
8. **Given** Story 4.10 AC #10 retired statement-level individual review but deleted the services while leaving their routes in place — forcing commit `021ce2c` to restore the symbols to clear `ruff` `F821` — **when** this story lands, **then** the **routes and the symbols are deleted together**: `commit_individual_statement`, `skip_individual_statement`, `AssignIndividualImportService`, `SkipStatementService`, `repo.skip_statement`, `validate_individual_accept_eligible`, and `validate_individual_skip_eligible`. **And** no parallel statement-grain commit path survives alongside the row endpoints. **And** origin stamping is untouched — it lives in `AssignBulkImportService`, `AssignCandidateRowService`, and `identify_card_for_statement`, none of which are in this list.

## Tasks / Subtasks

### Task 1 — Domain: undo vocabulary + description edit rule (AC: 4, 5, 6, 7)

- [ ] 1.1 In `api/domain/errors.py`, add `ImportNothingToUndoError(DomainError)` with `CODE = "import_nothing_to_undo"`, following the exact shape of the neighbouring `ImportRowNotAvailableError` / `ImportRowNotFoundError` (message in `__init__`, `CODE` classvar).
- [ ] 1.2 In `api/domain/import_session.py`, add `UNDO_ACTION_ASSIGN = "assign"`, `UNDO_ACTION_DELETE = "delete"`, and `UNDO_ACTIONS = frozenset({...})` beside the existing `ROW_STATUS_*` block.
- [ ] 1.3 Add `normalize_row_description(description: str) -> str`: strips, raises `InvalidCanonicalLineError` on empty-after-strip or `len > DESCRIPTION_MAX_LENGTH`, returns the trimmed value. Reuse `DESCRIPTION_MAX_LENGTH`, already imported from `domain.expenses` in this module — do **not** call `validate_bulk_candidate_row`, which also bounds `amount` and is not applicable to a description-only edit.
- [ ] 1.4 Add `statement_has_pending_rows(row_statuses: Sequence[str]) -> bool` — the mirror of the existing `statement_is_fully_resolved`, used by undo to re-open a statement that was flipped to `committed`.
- [ ] 1.5 **Delete** `validate_individual_accept_eligible` and `validate_individual_skip_eligible` (AC #8), and their tests in `api/tests/test_import_session_domain.py`.
- [ ] 1.6 Unit-test the new helpers in `api/tests/test_import_session_domain.py` (pure, no DB).

### Task 2 — Migration `0023_import_session_undo_pointer` (AC: 5)

- [ ] 2.1 New revision `api/adapters/persistence/migrations/versions/0023_import_session_undo_pointer.py`, `revision = "0023_import_session_undo_pointer"`, `down_revision = "0022_original_filename"` (verified current head).
- [ ] 2.2 `upgrade()` adds to `import_sessions`: `last_resolved_row_id` (`postgresql.UUID(as_uuid=True)`, nullable, FK → `import_candidate_rows.id`, `ondelete="SET NULL"`), `last_resolved_action` (`sa.String(16)`, nullable), `last_resolved_prior_status` (`sa.String(20)`, nullable — `excluded_zero_amount` is 20 chars, which is why 4.10 chose that width for the row `status` column).
- [ ] 2.3 `downgrade()` drops the FK then the three columns. No data repair — matches 0020's posture.
- [ ] 2.4 No backfill: an existing session with a null pointer is correctly "nothing to undo".
- [ ] 2.5 Mirror the columns on `ImportSessionModel` in `api/adapters/persistence/models.py`. **Do not** add a `relationship()` — a plain FK column avoids a cycle with `ImportCandidateRowModel`.

### Task 3 — Persistence: pointer writes, undo, description edit (AC: 3, 4, 5, 6)

New repo methods live on `SqlAlchemyImportSessionRepository` in `api/adapters/persistence/import_sessions.py` **and** must be declared on the `ImportSessionRepository` Protocol in `api/application/import_session.py` — otherwise the fake repos in `test_import_session_application.py` silently drift from the real one.

- [ ] 3.1 `set_undo_pointer(*, session_id, user_id, row_id, action, prior_status) -> None` and `clear_undo_pointer(*, session_id, user_id) -> None`.
- [ ] 3.2 Call `set_undo_pointer` at the end of `commit_statement_batch` **only for a row-level assign**. Do not infer it from `len(rows) == 1` — a single-row statement under Bulk would falsely qualify. Add a keyword-only `undo_row_id: UUID | None = None` parameter; `AssignCandidateRowService` passes the row id, `AssignBulkImportService` passes nothing.
- [ ] 3.3 In `mark_candidate_row_deleted`, set the pointer to `(row_id, "delete", "pending")` after the guarded UPDATE succeeds.
- [ ] 3.4 **Bulk supersedes undo:** `AssignBulkImportService` calls `clear_undo_pointer` after its commit loop — a row-grain pointer is meaningless once a whole statement was bulk-committed (AC #5, "cleared once used or **superseded**").
- [ ] 3.5 `undo_last_resolution(*, session_id, user_id) -> ImportSessionRecord`:
  - Load the session with `selectinload(statements).selectinload(candidate_rows)` (same options as `get_session`). `None` → `ImportSessionNotFoundError`.
  - Pointer null → `ImportNothingToUndoError`.
  - Locate the pointed row; not found (FK `SET NULL`-ed, or stale pointer) → clear the pointer and raise `ImportNothingToUndoError`.
  - **action == `assign`:** guarded `UPDATE import_candidate_rows SET status='pending', resolved_list_id=NULL, resolved_at=NULL WHERE id=:row AND status='committed'`; `rowcount == 0` → `ImportRowNotAvailableError`. Then `SELECT` the `LedgerEntryModel` with `import_candidate_row_id == row_id`, capture its `import_batch_id`, and `self._session.delete(entry)` — a **hard delete**, matching `repositories.py:284,672`. There is no soft-delete column on `ledger_entries`, which is precisely why undo-then-reassign can reuse the `UNIQUE` value (Sprint Change Proposal 2026-08-20, line 40). Then delete the owning `ImportBatchModel` if it now holds zero ledger entries.
  - **action == `delete`:** guarded `UPDATE ... SET status='pending', resolved_at=NULL WHERE id=:row AND status='deleted'`; `rowcount == 0` → `ImportRowNotAvailableError`.
  - Re-open the statement: if `statement_row.status == STATEMENT_STATUS_COMMITTED` and `statement_has_pending_rows([...])` is now true, set it back to `STATEMENT_STATUS_STAGED`. Add this as `_reopen_statement_if_pending(statement_id)`, the mirror of the existing `_complete_statement_if_resolved`.
  - Clear the pointer, `flush()`, `refresh()` the touched statement, return `_session_record(row)`.
- [ ] 3.6 `update_candidate_row_description(*, session_id, statement_id, row_id, user_id, description) -> ImportSessionRecord`: guarded `UPDATE ... SET normalized_description=:d WHERE id=:row AND statement_id=:st AND status='pending'`; `rowcount == 0` → `ImportRowNotAvailableError`. Same session-ownership preamble as `mark_candidate_row_deleted`.
- [ ] 3.7 `CandidateRowRecord` already exposes `sequence`, `status`, `resolved_list_id`, and `line` — sufficient for the response layer. Do **not** duplicate `amount`/`description` onto the record.
- [ ] 3.8 **Delete** `skip_statement` from the repo and from the Protocol (AC #8) — 4.10 removed it, `021ce2c` restored it.

### Task 4 — Application services (AC: 2, 3, 4, 6, 8)

- [ ] 4.1 `AssignCandidateRowService` and `DeleteCandidateRowService` already exist and are correct — **reuse them, do not rewrite**. The only change is wiring `undo_row_id` through `AssignCandidateRowService` (Task 3.2).
- [ ] 4.2 New `UndoLastResolutionCommand(actor_user_id, session_id)` + `UndoLastResolutionService(session_repo)`: `get_session` → `None` → `ImportSessionNotFoundError`; `discarded_at is not None` → `ImportSessionDiscardedError`; then `session_repo.undo_last_resolution(...)`. Returns `ImportSessionRecord`.
  - **Do not** call `_release_source_pdf_if_idle` here — undo makes the session *less* idle, never more.
- [ ] 4.3 New `EditCandidateRowCommand(actor_user_id, session_id, row_id, description)` + `EditCandidateRowService`: `get_session`; `_find_candidate_row` (raises `ImportRowNotFoundError`); discarded → `ImportSessionDiscardedError`; `normalize_row_description(...)`; `session_repo.update_candidate_row_description(...)`. No FX, no ledger, no PDF release.
- [ ] 4.4 **Delete** `AssignIndividualImportService`, `AssignIndividualImportCommand`, `SkipStatementService`, `SkipStatementCommand` and their tests in `api/tests/test_import_session_application.py` (AC #8). **Run Task 5.10 first** — these symbols only survive today because orphaned routes still call them. **Keep `_find_statement`** — `identify_card_for_statement` still imports it. **Keep `AssignBulkImportService` and `AssignCandidateRowService` entirely** — they carry the card-origin stamp and are not part of this deletion.

### Task 5 — Schemas + routes (AC: 1, 2, 3, 4, 6, 7, 8)

- [ ] 5.1 `api/api/schemas/import_sessions.py`:
  - `CandidateRowResponse`: `id: UUID`, `sequence: int`, `description: str`, `amount: str`, `currency: str`, `posted_date: str`, `status: str`.
    **`amount` and `posted_date` are `str`, not `Decimal`/`date`** — project-context: "JSON/API boundary: serialize money as **string** — never JSON numbers for amounts"; `posted_date` is an ISO calendar-date string. `api/api/schemas/lists.py:52-58` is the precedent to copy.
  - `UndoPointerResponse`: `row_id: UUID`, `action: str`.
  - `StagedStatementResponse` gains `rows: list[CandidateRowResponse] = Field(default_factory=list)` and `zero_amount_excluded_count: int = 0`.
  - `ImportSessionResponse` gains `undo: UndoPointerResponse | None = None`.
  - `AssignRowBody`: `list_id: UUID`, `card_id: UUID | None = None`.
  - `EditRowBody`: `description: str`.
  - **Delete** `IndividualCommitBody` (AC #8).
- [ ] 5.2 In `_session_response` (`api/api/routes/import_sessions.py`): build `rows` from `statement.candidate_rows` filtered to `status == ROW_STATUS_PENDING`, **sorted by `sequence` ascending** — AC #4's "original sequence position" is only real if the payload is ordered, and `selectinload` guarantees no order. Map `description=row.line.normalized_description`, `amount=str(row.line.amount)`, `posted_date=row.line.posted_date` (already an ISO string on `CanonicalLine`). Compute `zero_amount_excluded_count` from **all** rows with `status == ROW_STATUS_EXCLUDED_ZERO_AMOUNT`.
  - **Leave `candidate_row_count` semantics unchanged** (total parsed rows). Story 4.7's Bulk UI reads it; narrowing it to pending would silently change that display. `len(rows)` is the pending count.
- [ ] 5.3 `POST /{session_id}/rows/{row_id}/assign` → `AssignCandidateRowService`, returns `ImportSessionResponse` built from a fresh `get_session` (mirrors the retired statement commit route's "return the session so the caller never needs a second round-trip").
- [ ] 5.4 `POST /{session_id}/rows/{row_id}/delete` → `DeleteCandidateRowService`, returns `ImportSessionResponse`.
- [ ] 5.5 `POST /{session_id}/undo` → `UndoLastResolutionService`, returns `ImportSessionResponse`.
- [ ] 5.6 `PATCH /{session_id}/rows/{row_id}` → `EditCandidateRowService`, returns `ImportSessionResponse`.
- [ ] 5.7 Error mapping on every new route as `JSONResponse(status_code=..., content={"detail": str(exc), "code": ...})` — the established idiom in this file, **not** `HTTPException`:

  | Exception | Status | `code` |
  |---|---|---|
  | `ImportSessionNotFoundError` | 404 | `import_session_not_found` |
  | `ImportRowNotFoundError` | 404 | `import_row_not_found` |
  | `NotListMemberError` | 403 | `not_list_member` |
  | `ImportSessionDiscardedError` | 409 | `import_session_discarded` |
  | `ImportRowNotAvailableError` | 409 | `import_row_not_available` |
  | `ImportNothingToUndoError` | 409 | `import_nothing_to_undo` |
  | `InvalidCanonicalLineError` | 422 | `invalid_canonical_line` |
  | `FxAuthenticationError` | 500 | `exc.CODE` |
  | `FxServiceUnavailableError` | 503 | `exc.CODE` |
  | `FxFutureDateError` / `FxCurrencyNotSupportedError` / `FxRateNotAvailableError` | 422 | `exc.CODE` |

  FX errors apply to `/assign` only — `/delete`, `/undo`, and the row `PATCH` touch no FX.
- [ ] 5.8 All new routes gate on `Depends(require_authenticated_user)` only, same rationale the module docstring already records for upload.
- [ ] 5.9 One `logger.info` per successful mutation with `session_id` / `row_id` / `user_id` (+ `list_id` for assign), matching the existing `import_bulk_committed` style. **No `normalized_description` in logs** — statement PII never reaches `info`.
- [ ] 5.10 **Delete** the `commit_individual_statement` and `skip_individual_statement` routes and their now-unused imports (AC #8). **Do this before Task 4.4 and Task 1.5 delete the services and validators** — deleting the services while these routes still reference them is exactly what produced the `F821` breakage that commit `021ce2c` had to repair. Routes first, then the code they call.

### Task 6 — UI BFF proxies + typed client (AC: 2, 3, 4, 6, 7)

Thin transport only. **No component redesign.**

- [ ] 6.1 New route handlers, each a copy of `ui/app/api/import/sessions/[sessionId]/bulk-commit/route.ts` (cookie forward → `getApiInternalUrl()` → pass through upstream status + body verbatim; 502 `bad_gateway` on fetch failure):
  - `ui/app/api/import/sessions/[sessionId]/rows/[rowId]/assign/route.ts` — `POST`
  - `ui/app/api/import/sessions/[sessionId]/rows/[rowId]/delete/route.ts` — `POST`
  - `ui/app/api/import/sessions/[sessionId]/rows/[rowId]/route.ts` — `PATCH`
  - `ui/app/api/import/sessions/[sessionId]/undo/route.ts` — `POST` (no body)
  - `RouteContext` params type is `Promise<{ sessionId: string; rowId: string }>` for the row routes — this Next version awaits `context.params`.
- [ ] 6.2 `ui/app/upload/uploadClient.ts`:
  - `export type RowStatus = "pending" | "committed" | "deleted" | "excluded_zero_amount";`
  - `export type CandidateRow = { id: string; sequence: number; description: string; amount: string; currency: string; posted_date: string; status: RowStatus };` — **`amount` stays a `string`.** Never `Number()` it; no money math in the browser.
  - `StagedStatement` gains `rows: CandidateRow[]` and `zero_amount_excluded_count: number`.
  - `ImportSession` gains `undo: { row_id: string; action: "assign" | "delete" } | null`.
  - `asStagedStatement` must stay **tolerant**: default `rows` to `[]` and `zero_amount_excluded_count` to `0` when absent, and drop malformed row entries the way `asImportSession` already drops malformed statements. Making them required would reject otherwise-valid payloads.
  - New functions returning `OkSession | ErrorResult`: `assignRow(sessionId, rowId, listId, messages)`, `deleteRow(sessionId, rowId, messages)`, `undoLastResolution(sessionId, messages)`, `editRowDescription(sessionId, rowId, description, messages)` — all mapping errors through `mapIndividualReviewError`.
  - Extend `mapIndividualReviewError` with `import_row_not_found` → `errorRowNotFound`, `import_row_not_available` → `errorRowNotAvailable`, `import_nothing_to_undo` → `errorNothingToUndo`, and add those three to `IndividualReviewMessages`.
  - **Delete** `commitIndividualStatement` and `skipStatement` — their BFF routes were already deleted by 4.10, so they are dead code that cannot succeed.
- [ ] 6.3 `ui/lib/i18n/upload.ts` — add `individualReviewErrorRowNotFound`, `individualReviewErrorRowNotAvailable`, `individualReviewErrorNothingToUndo` **on both `en` and `es`**. Per-domain TS message objects; never JSON files.
- [ ] 6.4 `IndividualReviewPanel.tsx` imports `commitIndividualStatement` / `skipStatement`; deleting them breaks its typecheck. **Satisfy `tsc` with the smallest possible edit** — repoint the two call sites at `assignRow` / `deleteRow` for the statement's first pending row. Do **not** restructure the panel, change its gestures, or start 4.13's card layout. Record what you did in Completion Notes so 4.13 knows the starting state.

### Task 7 — Tests (AC: all)

- [ ] 7.1 `api/tests/test_import_session_domain.py` — pure unit tests for `normalize_row_description` (trim, empty → raise, over-length → raise) and `statement_has_pending_rows`. Delete tests for the two removed validators.
- [ ] 7.2 `api/tests/test_import_session_application.py` — fake-repo tests: `UndoLastResolutionService` raises `ImportSessionNotFoundError` / `ImportSessionDiscardedError` before touching the repo; `EditCandidateRowService` raises `ImportRowNotFoundError` for an unknown row and `InvalidCanonicalLineError` for a blank description; `AssignCandidateRowService` passes `undo_row_id`; `AssignBulkImportService` calls `clear_undo_pointer`. Delete the statement-level individual service tests.
- [ ] 7.3 `api/tests/test_import_sessions_integration.py` — **Postgres 16 only, never a SQLite stand-in** (these already skip without `DATABASE_URL`):
  - assign → row `committed`, ledger entry carries `import_candidate_row_id`, session `undo` pointer = `(row, "assign")`.
  - assign → **undo** → row back to `pending`, ledger entry **gone**, emptied batch gone, pointer `null`, statement back to `staged` if it had flipped to `committed`.
  - **undo → re-assign the same row succeeds.** This is the single most important test in the story: it proves the hard delete actually freed the `UNIQUE import_candidate_row_id` value.
  - delete → undo → row `pending`.
  - undo twice → the second returns `import_nothing_to_undo`.
  - undo after a bulk commit → `import_nothing_to_undo` (pointer superseded/cleared).
  - `PATCH` a pending row → description changes and `GET` echoes it; `PATCH` a committed row → `import_row_not_available`.
  - assign an already-`committed` row → `import_row_not_available`.
  - `GET` payload: rows are pending-only, ordered by `sequence`, `amount` is a **JSON string**, `zero_amount_excluded_count` counts the excluded rows.
  - Money assertions use `Decimal` — never `float`.
  - Keep the row-grain concurrent-commit race test 4.10 added; do not weaken it.
- [ ] 7.4 UI: extend `ui/app/api/cards-import.bff.test.ts` (the existing BFF test file — do not create a new one) for the four new proxies, and `ui/app/upload/uploadClient.test.ts` for the new client functions plus tolerant `asStagedStatement` parsing.
- [ ] 7.5 Full gate before flipping to `review`: `api` pytest (host **and** inside the Compose api container after `alembic upgrade head`), `ui` typecheck + lint + vitest.

### Task 8 — Story close

- [ ] 8.1 Write the how/why overview per `_bmad-output/implementation-artifacts/story-close-overview-checklist.md` before flipping to `review`.

## Dev Notes

### What already exists — do not rebuild it

Story 4.10 (merged, commit `ff49a57`) already landed the entire data model **and both
per-row application services**. 4.11 is mostly plumbing HTTP onto work that is done.

| Already on `main` | Where |
|---|---|
| `status` / `sequence` / `resolved_list_id` / `resolved_at` on `import_candidate_rows` | `0020_row_level_review.py` |
| `ledger_entries.import_candidate_row_id` UUID, nullable, **UNIQUE**, FK | `0020` + `LedgerEntryModel.__table_args__` |
| `ROW_STATUS_*`, `row_is_zero_amount`, `statement_is_fully_resolved` | `api/domain/import_session.py` |
| `ImportRowNotFoundError`, `ImportRowNotAvailableError` | `api/domain/errors.py` |
| `CandidateRowRecord`, `CommitRow` | `api/application/import_session.py:190-212` |
| **`AssignCandidateRowService`** (per-row assign, full FX + origin stamp) | `api/application/import_session.py:714` |
| **`DeleteCandidateRowService`** (guarded pending→deleted) | `api/application/import_session.py:798` |
| `commit_statement_batch` (guarded UPDATE → batch → ledger under SAVEPOINT) | `api/adapters/persistence/import_sessions.py:212` |
| `mark_candidate_row_deleted`, `_complete_statement_if_resolved` | same file, `:301` / `:380` |
| Zero-amount rows excluded at `create_session`; `sequence` from parse order | same file, `:127-155` |

4.10's own close note says it plainly: *"Per-row assign/delete services exist without HTTP
(4.11)"* and *"no `rows[]` on GET session until 4.11."* Those two sentences are this story's
scope.

### Files being modified — current state and what must survive

**`api/api/routes/import_sessions.py`** — today: upload, GET session, DELETE session,
bulk-commit, `commit_individual_statement`, `skip_individual_statement`, `identify-card`.
`_session_response()` at the top is the single mapper every route returns through, so adding
`rows` there satisfies AC #1 for *all* endpoints at once. **Must survive:**
`identify_card_for_statement` untouched (it is live — `UploadPanel` calls it), upload and
bulk-commit behavior unchanged, the `JSONResponse(content={"detail":..., "code":...})` idiom.

**`api/application/import_session.py`** — the `ImportSessionRepository` Protocol is the seam.
**Must survive:** the `_release_source_pdf_if_idle` call sites on assign/delete; the
`AssignBulkImportService` contract for an untouched all-pending session (one list, one batch
per statement, payer = actor); and the `origin_kind`/`origin_card_id` stamp from
`statement.card_id` that `spec-4-8-1-restore-identified-card-origin-on-commit.md` restored —
`AssignCandidateRowService` already does `card_id = command.card_id or statement.card_id`.

**`api/adapters/persistence/import_sessions.py`** — **must survive:** the guarded UPDATE
strictly *before* the ledger INSERT; the `begin_nested()` SAVEPOINT wrapping the insert so an
`IntegrityError` surfaces as `ImportRowNotAvailableError`; no `postgresql_nulls_not_distinct`;
no `resolved_ledger_entry_id` column, ever.

**`ui/app/upload/uploadClient.ts`** — the `as*` parse guards are the only validation between
the API and typed state; they must stay tolerant of missing optional fields.

### Undo — the parts most likely to be got wrong

1. **Hard-delete the ledger entry, not a soft delete.** `ledger_entries` has no
   `deleted_at` / `is_deleted` column. The Sprint Change Proposal verified this specifically
   (line 40) *because* it is what lets a re-assign reuse the `UNIQUE`
   `import_candidate_row_id`. A soft delete would leave the constraint occupied and every
   subsequent assign of that row would 409 forever.
2. **Delete the emptied batch too.** AD-4: a batch is *one commit action*. After undo, that
   action did not happen. Leaving an empty batch pollutes FR-30 rollback in Epic 5.
3. **Re-open the statement.** `_complete_statement_if_resolved` only ever flips *to*
   `committed`. Without the mirror, a fully-resolved statement stays `committed` after undo
   and its restored `pending` row is invisible to review forever.
4. **Order the payload by `sequence`.** "Re-enters the queue at its original position"
   (AC #4) is a *payload ordering* requirement, not a data one — `sequence` never changed.
5. **Single-level.** One pointer, cleared on use. There is no stack. A second call is
   `import_nothing_to_undo`, not an error about the row.
6. **PDF caveat — accept it, don't fix it:** if `_release_source_pdf_if_idle` already deleted
   the source PDF when the last row resolved, undo re-opens the statement with `pdf_path`
   NULL. That is fine — row-level review reads `import_candidate_rows`, not the PDF; only
   Epic 5's comparison UI needs the file. Undo must not crash on a null path, and must not
   try to restore the file.
7. **`prior_status` is always `"pending"`** by construction (both guarded UPDATEs require
   `pending`). Persist it anyway — AC #5 names it, and it keeps the pointer self-describing
   if a future action ever has a different origin status.

### The 4.10 loose end this story finishes (AC #8)

**Read this before deleting anything — the cause is not what the commit title suggests.**

Story 4.10 AC #10 deleted the statement-level individual review backend, but it deleted the
**services and validators while leaving their routes in place**. The orphaned routes still
referenced the now-missing names, so `ruff` reported `F821` (undefined name) across `api/`.
Commit `021ce2c` (*"fix: restore Story 4.8 skip/accept plumbing and clear CI lint errors"*)
restored the symbols to make the build green again. Its own message says so directly:

> *"The 4.10 row-grain merge dropped pieces of the individual-review flow that the routes
> still call, so ruff reported F821 across api/. Restored them in 4.10's shape."*

So this was **a build repair for an incomplete deletion**, not a decision to reinstate
statement-level review. Nobody chose to bring that path back.

**Why deleting is therefore safe.** `021ce2c` only had to restore the symbols *because the
routes were still calling them*. AC #8 removes both halves together, so there is nothing left
to be undefined. Delete the routes first, then the services — deleting in the other order
reproduces the exact `F821` breakage that caused this in the first place.

The UI BFF halves were never restored, and
`spec-4-8-1-restore-identified-card-origin-on-commit.md` forbids restoring them (*"Never: Do
not restore `ui/app/api/import/sessions/.../commit` or `/skip`"*). So the surface is
unreachable from the product today — a statement-grain commit path with no caller, which is
what AD-9's amendment ("the reviewed unit is **one parsed transaction**, not one statement")
retires.

**Origin stamping is NOT part of this deletion.** Card-origin on committed rows came from a
*different* commit in the same PR (`b5775c9`, *"stamp identified card as origin on list
commit"*). It lives entirely in:

- `AssignBulkImportService` — `card_id = statement.card_id`, then
  `origin_kind=ORIGIN_KIND_CARD if card_id else None` on every draft
  (`api/application/import_session.py:485`, `:510-511`)
- `AssignCandidateRowService` — same stamp, `command.card_id or statement.card_id`
- `identify_card_for_statement` + `_persist_identified_card` — writes `import_statements.card_id`

**All three are kept.** Bulk review, which is how origin reaches the ledger today, goes through
`bulk-commit` and is not in AC #8's list. If any origin behavior changes as a result of this
task, something has gone wrong — stop and re-check the delete list.

**Preserve these from `021ce2c`** — it carried unrelated frontend fixes that must not be
reverted along with the restore. Its full touch list is four `api/` files plus these five:

- `ui/hooks/useCardIdentification.ts` — the `react-hooks/set-state-in-effect` fix (derives an
  `identifiable` flag instead of resetting six state vars in an effect)
- `ui/app/upload/UploadPanel.test.tsx` — typed `useFormSubmission` mocks replacing `any`, which
  surfaced a real `setError(result.error)` type error
- `ui/app/upload/SessionReviewPanel.test.tsx`
- `ui/app/upload/review/[sessionId]/IndividualReviewPanel.test.tsx` — a failed-statement test was
  looking for an "Accept to {list}" button that no longer renders when a default list is set
- `ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx` — **note for Task 6.4:** this file
  was already touched by `021ce2c`, so its current state is not 4.10's. Diff it before editing.

**Scope guard:** AC #8 deletes only `api/` symbols and routes. If a change in this task lands in
any `ui/` file other than the typecheck-only edit Task 6.4 authorizes, it is out of scope.

`api/tests/test_import_session_application.py` and `test_import_session_domain.py` carry tests
for the deleted symbols; those go with the code.

### Architecture compliance (binding)

- **AD-1 hexagonal:** `api/domain` imports no FastAPI / SQLAlchemy / pdfplumber. New domain
  helpers are pure functions over primitives. ORM models stay under `adapters/persistence`.
- **AD-4 (amended 2026-08-20):** batch = one commit action; a candidate row yields **at most
  one** ledger entry, enforced by `ledger_entries.import_candidate_row_id UNIQUE`; the guarded
  `UPDATE ... WHERE status='pending'` is the fast path in front of it. **Both layers required.**
- **AD-5 money:** `Decimal` in Python, `NUMERIC` in Postgres, **string on the wire**. Never
  `float`, never a JSON number.
- **AD-7 FX:** materialized at commit by `MaterializeFxService` inside
  `AssignCandidateRowService`. Undo deletes the entry outright — do not "un-materialize" FX.
- **AD-8 auth:** httpOnly Secure cookie, same-origin BFF. No Bearer, no `localStorage`.
  `ui` → HTTP only, never DB or parsers.
- **AD-9 (amended 2026-08-20):** reviewed unit is one parsed transaction; `up → delete`;
  **undo is a button on every platform, never a gesture.** The gesture map is 4.13's job — but
  AC #2's "one endpoint for both left and right" is what makes that map cheap.
- **AD-16:** review status/sequence/resolution live on `CandidateRowRecord`, **never** on
  `CanonicalLine`, which is adapter output.
- **AD-19 ACL:** `/assign` goes through `AuthorizeListAccessService` (already inside
  `AssignCandidateRowService`). `/delete`, `/undo`, and `PATCH` are session-owner-scoped —
  every repo query already filters `ImportSessionModel.user_id == user_id`, so a non-owner gets
  `import_session_not_found` rather than a 403. That non-enumerating shape is deliberate;
  preserve it.
- **Alembic only.** Never auto-create tables on startup; never recreate the Postgres volume to
  "fix" a migration (AD-22).

### File structure — exact paths

**New**
```
api/adapters/persistence/migrations/versions/0023_import_session_undo_pointer.py
ui/app/api/import/sessions/[sessionId]/rows/[rowId]/assign/route.ts
ui/app/api/import/sessions/[sessionId]/rows/[rowId]/delete/route.ts
ui/app/api/import/sessions/[sessionId]/rows/[rowId]/route.ts          (PATCH)
ui/app/api/import/sessions/[sessionId]/undo/route.ts
```

**Updated**
```
api/domain/errors.py
api/domain/import_session.py
api/adapters/persistence/models.py
api/adapters/persistence/import_sessions.py
api/application/import_session.py
api/api/schemas/import_sessions.py
api/api/routes/import_sessions.py
api/tests/test_import_session_domain.py
api/tests/test_import_session_application.py
api/tests/test_import_sessions_integration.py
ui/app/upload/uploadClient.ts
ui/app/upload/uploadClient.test.ts
ui/app/api/cards-import.bff.test.ts
ui/lib/i18n/upload.ts
ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx   (typecheck-only, Task 6.4)
```

**Do not touch:** `ui/app/upload/UploadPanel.tsx`, `ui/app/upload/bulk/**`,
`api/adapters/bank/**`, `ARCHITECTURE-SPINE.md` (AD-4 and AD-9 are **already amended** —
implement them, do not re-write them), `_bmad-output/planning-artifacts/epics.md`, and Story
4.8's file (`done`, superseded — do not reopen).

### Testing standards

- **Discipline (AD-15):** domain → red-green TDD. API/UI → test-after.
- **Layers:** unit (pure domain) · application (fake repo) · integration (**Postgres 16**,
  never a SQLite stand-in) · UI vitest.
- **Merge gate:** lint · api pytest + synthetic goldens · ui typecheck/lint · critical ui tests.
- Integration tests skip without `DATABASE_URL`; run them inside the Compose `api` container
  after `alembic upgrade head`. Use `scripts/worktree/worktree-bootstrap.sh` for an isolated
  stack rather than an ad-hoc `docker run`.
- No PII in fixtures or goldens. Generic vocabulary only — no real IBANs, no personal names.

### Previous story intelligence (4.10)

- 4.10's numbers: **595** api tests green in-container; 445 on the host with 150 skipped
  (no `DATABASE_URL`). A large host-skip count is expected, not a failure.
- `excluded_zero_amount` is exactly 20 characters — hence `VARCHAR(20)` on the row `status`
  column and on the new `last_resolved_prior_status`.
- 4.10 hit this and it still holds: after every row resolves, a *second* bulk commit finds no
  `staged` statement and returns **422 `no_clean_statements_to_commit`**, while a mixed-row
  statement returns **409 `import_row_not_available`**. Two codes for two causes — preserve both.
- 4.10 was implemented by a different agent (Cursor Grok 4.6) and its close note is precise.
  Read `_bmad-output/implementation-artifacts/4-10-row-level-review-data-model-per-row-commit.md`
  §"What not to break" before the first edit.

### Git intelligence

- Baseline: `8390624` (merge of PR #70, Epic 3 retro). The import-pipeline code this story
  touches last changed at `48a3dc8` (PR #68); everything since is retros plus `44790ab`
  (`UploadButton`), which touches `ui/app/upload/UploadPanel.tsx` and its test but **no**
  import API surface — no conflict with this story's scope.
- `ff49a57` = Story 4.10 and is an ancestor of `main`. The `finance-dashboard-wt-4-10`
  worktree is **stale** — its branch holds no commits beyond `ff49a57`, so do not read it as
  current state. `main` is the truth.
- `021ce2c` = the `F821` build repair AC #8 finishes properly (routes + services together, not
  services alone). It also carries unrelated frontend fixes that must survive — see the AC #8
  section above.
- `b5775c9` = the card-origin stamp. **Independent of AC #8. Do not touch.**
- Recent commits show the working pattern: schema change → model → repo → service → route →
  BFF → client → tests, each as its own conventional commit.
- Branch convention `<type>/<epic>/<us-id>` → **`feat/4/4-11-row-level-review-api`**. One story
  per branch; PR-only merge to `main` after CI green; no force-push to `main`.

### Latest technical information

Versions are pinned by lockfiles (Story 1.1). **Do not bump anything in this story** — version
changes go through dedicated `chore/` PRs. Relevant pins and the API style they imply:

- **Pydantic 2.13.x** — `Field(default_factory=...)`, `model_config = ConfigDict(...)`. No
  `class Config`, no v1 validators.
- **SQLAlchemy 2.0.x** — `Mapped[...]` / `mapped_column`, `select()` / `update()` constructs.
  No legacy `Query` API.
- **FastAPI 0.141.x / Uvicorn 0.52.x**, **Alembic 1.18.x**, **psycopg 3.3.x**, **PostgreSQL 16**,
  **Python 3.12+** (`X | None` unions, `from __future__ import annotations` already in these files).
- **Next.js 16.2.x standalone / React 19.2.x** — route handlers receive `params` as a
  **`Promise`**; `await context.params`, exactly as `bulk-commit/route.ts` already does.
- **`@use-gesture/react` 10.3.x** is present but irrelevant here — gestures are 4.13.

### Project Structure Notes

Matches the established hexagonal layout with no variance: domain rules in `api/domain`,
orchestration in `api/application`, SQLAlchemy in `api/adapters/persistence`, HTTP in
`api/api/{routes,schemas}`, and Next BFF proxies mirroring the API path shape one-for-one under
`ui/app/api/`. The only new directory level is `rows/[rowId]/` under the existing `[sessionId]/`,
paralleling the existing `statements/[statementId]/`. No styling work, so AD-23's
Tailwind/no-new-CSS-modules rule is not exercised — but do not introduce a `.module.css` if that
changes.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.11] — verbatim ACs
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-08-20.md] — §"epics.md — new Story 4.11" (session-scoped undo rationale), line 40 (two-layer constraint reasoning + hard-delete verification), line 44 (technical impact), lines 384-399 (sequencing)
- [Source: .../architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md#AD-4] — amended 2026-08-20
- [Source: .../ARCHITECTURE-SPINE.md#AD-9] — amended 2026-08-20
- [Source: .../ARCHITECTURE-SPINE.md#AD-3] — PDF retain/delete
- [Source: _bmad-output/project-context.md] — money-as-string, i18n per-domain TS objects, test layers, branch naming, never/always lists
- [Source: _bmad-output/implementation-artifacts/4-10-row-level-review-data-model-per-row-commit.md] — Completion Notes + "What not to break"
- [Source: _bmad-output/implementation-artifacts/spec-4-8-1-restore-identified-card-origin-on-commit.md] — origin-stamp invariants; forbids restoring the statement-level BFF routes
- [Source: _bmad-output/implementation-artifacts/story-close-overview-checklist.md] — required before `review`

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

- 2026-08-21: Story context created via `bmad-create-story` for `4-11-row-level-review-api-rows-assign-delete-undo-edit`. Status → ready-for-dev.
