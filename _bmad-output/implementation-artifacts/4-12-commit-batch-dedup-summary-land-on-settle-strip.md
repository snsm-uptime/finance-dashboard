---
baseline_commit: b085467
---

# Story 4.12: Commit batch, dedup summary, land on settle strip

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

> **This is a commit-correctness story, mostly server-side.** It makes re-import
> idempotent, exposes the counts Story 4.14 will render, and moves PDF release from
> "last pending row resolved" to an explicit **finalize** step.
>
> **It is being built before 4.13 (review card) and 4.13.1 (ImportReviewSheet).**
> That is deliberate — see [Build-order carve-out](#build-order-carve-out-read-before-touching-the-ui).
> Do **not** rewrite `IndividualReviewPanel.tsx`; 4.13 owns that file. Do **not**
> build the sheet; 4.13.1 owns it. Do **not** build the completion-summary surface;
> 4.14 owns it.
>
> **This story amends AD-18** — `statement_period_id` comes out of the canonical identity
> tuple (Task 1.5). That is the one authorized spine edit; read
> [the rationale](#the-statement_period_id-removal) before touching
> `compute_canonical_identity`.

## Story

As a user finishing an import,
I want commits to dedupe silently, summarize imported/skipped counts, and land on the Soft-Ledger settle strip,
so that I see the number I came to update (J1 climax).

## Acceptance Criteria

1. **Given** I assign a cleanly parsed transaction to a list, **when** commit runs, **then** an Import Batch is journaled for **that commit action** and its ledger row is written with **domain-computed** canonical identity dedup (FR-20, FR-34, AD-4, AD-18). **And** payer defaults to me and remains editable (FR-19). **And** FX materialization from Epic 3 applies to non-CRC lines (AD-7). **And** a commit action in which *every* row is a duplicate journals **no** batch — an empty batch would pollute FR-30 rollback.

2. **Given** identity is computed, **when** the domain computes it, **then** a stable `external_ref` wins and otherwise the fallback tuple `(product_id, posted_date, currency, amount, normalized_description, line_type)` is used — computed by `api/domain`, never by an adapter (AD-18, amended by this story). **And** `statement_period_id` is **removed** from the tuple: the same transaction printed on two overlapping statements must produce the **same** identity, which is the whole point of FR-20's overlap clause. **And** the persisted form carries a version prefix so a later identity-rule change is detectable rather than silently breaking dedup on pre-existing rows.

3. **Given** overlapping re-import of parsed rows, **when** commit finishes, **then** duplicates are skipped **without mid-import interruption** — no error, no prompt, no blocked queue. **And** the duplicate candidate row still resolves (leaves `pending`) so review progresses. **And** no second ledger row exists for that canonical identity in that destination list. **And** duplicate detection also applies **within a single commit action** (two identical rows in one bulk statement → one ledger row).

4. **Given** a session has committed rows, **when** the session is fetched, **then** `imported_new_count` and `skipped_duplicate_count` are exposed on the session payload for the Story 4.14 completion summary to render (FR-20, UX-DR22). **And** both counts are **derived from row state**, not incremented counters — an undo that returns a row to `pending` must move the counts back with it.

5. **Given** the session completes (no Epic 5 conflicts yet), **when** the review queue is exhausted — pending rows are gone **and** the user has Saved on ImportReviewSheet (Story 4.13.1) — **then** the landing destination is shared-expenses for the **list that received the most rows this session**, exposed by this story as `landing_list_id` on the session payload. **And** the completion-summary surface itself is Story 4.14's, not this story's. **And** an empty pending queue **without** Save does not finalize, does not land, and does not delete the PDF. **And** Bulk review (Story 4.7) is unchanged: no sheet; bulk commit still finalizes as today. **And** the Soft-Ledger settle strip reflects the new committed purchases — the **same** strip as Epic 3, no parallel settle UI. **And** when Epic 5 same-price conflicts exist, Story 5.7 inserts conflict review after the summary and before the Soft-Ledger land — do not land on a confident strip then interrupt (UX-DR22).

6. **Given** `landing_list_id` must be deterministic, **when** one session fed several lists, **then** the winner is the list with the most **newly imported** ledger rows this session; ties break to the list whose most recent row resolved latest; a remaining tie breaks to the lowest list id. **And** a session that imported nothing new (all deleted, or all duplicates) exposes `landing_list_id: null` — the caller stays put rather than guessing.

7. **Given** a statement parsed correctly and committed with no unresolved quarantine, **when** the session is **finalized** — `POST /import/sessions/{sessionId}/finalize` (which ImportReviewSheet Save will call in 4.13.1) or bulk commit — **then** the statement PDF file is deleted from the operator volume and its Postgres path reference is cleared (AD-3), and `finalized_at` is stamped on the session. **And** the last pending assign/delete is **not** finalization: row-grain assign and delete no longer release the PDF. **And** clean PDF delete is skipped while any statement is `staged` or `failed` — incomplete/unresolved-quarantine retention is Epic 5's (5.2–5.3) and reuses today's `session_needs_source_pdf` rule unchanged.

8. **Given** finalize is called when the session is not eligible, **when** any row is still `pending`, **then** it fails with `import_session_has_pending_rows` (409) rather than dropping the PDF mid-review. **And** finalize is **idempotent**: a second call on an already-finalized session returns the session without re-deleting or erroring (Save is double-clickable). **And** a discarded session returns `import_session_discarded`.

9. **Given** this story's scope, **when** same-price conflicts or quarantine appear, **then** they are out of scope (Epic 5); Epic 5 retains the PDF while quarantine needs it and clears when resolved.

## Tasks / Subtasks

### Task 1 — Domain: identity tuple amendment, identity key, landing selection (AC: 1, 2, 6)

- [x] 1.1 In `api/domain/canonical_line.py`, **remove the `statement_period_id` keyword from `compute_canonical_identity`** so the fallback tuple becomes `("fallback", product_id, posted_date, currency, amount, normalized_description, line_type)`. Rewrite the docstring to record *why*: a real per-statement period id would give the same transaction two identities when it appears on two overlapping statements, defeating FR-20. See [The statement_period_id removal](#the-statement_period_id-removal). The function has no non-test callers, so this is a safe signature change — `grep` before and after to confirm.
- [x] 1.2 Add `canonical_identity_key(line: CanonicalLine) -> str`: call the **existing** `compute_canonical_identity(line)` (do not reimplement the tuple), then serialize deterministically:

  ```python
  parts = [f"{p:.4f}" if isinstance(p, Decimal) else str(p) for p in identity]
  return "v1:" + sha256(
      json.dumps(parts, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
  ).hexdigest()
  ```

  JSON, not a `|` join — a description containing the delimiter would otherwise collide. The `Decimal` branch is load-bearing: `str(Decimal("10.5"))` and `str(Decimal("10.50"))` differ, so without the fixed 4-dp form the *same* transaction re-parsed with a different trailing zero would produce two identities and dedup would silently miss it. 4 dp matches `Numeric(18, 4)`. Never route an amount through `float`. Pure stdlib only (`hashlib`, `json`, `decimal`) — AD-1 holds.
- [x] 1.3 Add `select_landing_list_id(resolved: Sequence[tuple[UUID, datetime]]) -> UUID | None` implementing AC #6's ordering (count desc, latest `resolved_at` desc, lowest id asc). Input is `(list_id, resolved_at)` pairs for **imported-new** rows only. Empty input → `None`.
- [x] 1.4 In `api/domain/errors.py`, add `ImportSessionHasPendingRowsError(DomainError)` with `CODE = "import_session_has_pending_rows"`, copying the shape of the neighbouring `ImportRowNotAvailableError`.
- [x] 1.5 **Amend AD-18** in `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md`: drop `statement_period_id` from the stated fallback tuple and add a dated amendment note in the **house style already used for AD-4 and AD-9** — a `> **Amended 2026-08-23** — Story 4.12 …` block that retains the superseded wording and records the overlap reasoning. This is the **only** spine edit this story is authorized to make. No PRD or epics edit is needed: FR-34 states the primary tuple only, and Story 4.4's AC says "fallback tuple" without enumerating it — both were checked and neither names the period.
- [x] 1.6 Red-green TDD these in `api/tests/test_canonical_line_domain.py` / `test_import_session_domain.py` (AD-15: domain is TDD, not test-after). Money assertions use `Decimal`, never `float`.

### Task 2 — Migration `0024_import_dedup_identity_and_finalize` (AC: 1, 3, 4, 7)

- [x] 2.1 New revision `api/adapters/persistence/migrations/versions/0024_import_dedup_identity_and_finalize.py`, `revision = "0024_import_dedup_identity_and_finalize"`, `down_revision = "0023_import_session_undo_pointer"` (verified current head).
- [x] 2.2 `upgrade()` adds `ledger_entries.import_identity` (`sa.String(80)`, nullable) plus a **non-unique** index `ix_ledger_entries_list_import_identity` on `(list_id, import_identity)`. Non-unique is deliberate — see [Why the identity index is not UNIQUE](#why-the-identity-index-is-not-unique).
- [x] 2.3 Adds `import_candidate_rows.dedup_skipped` (`sa.Boolean`, `nullable=False`, `server_default=sa.text("false")`).
- [x] 2.4 Adds `import_sessions.finalized_at` (`sa.DateTime(timezone=True)`, nullable).
- [x] 2.5 `downgrade()` drops the index then the three columns. No data repair — matches 0020/0023 posture.
- [x] 2.6 **No backfill — decided 2026-08-23.** Existing ledger rows keep `import_identity = NULL` and are invisible to dedup; existing sessions keep `finalized_at = NULL`. A pre-4.12 import was never identity-keyed, so claiming it as a duplicate would be a guess. The migration writes no data.
- [x] 2.7 **Pre-dev clean-history check — done 2026-08-23, no action required.** The 4.12 worktree stack (`fh-feat-4-4-12-…`, ui `:3110` / api `:8110`) was inspected and its database is **completely empty**: 0 import sessions, statements, candidate rows, batches and ledger entries. There is no half-fingerprinted history to reason about, so nothing was deleted.
  - **Develop and hand-test on the worktree stack at `:3110`, not the main dev stack at `:3000`.** The main stack (`finance-helper-*`) was deliberately left intact and still holds 70 parser-sourced ledger rows across three lists, 11 import sessions (6 live, 108 pending rows) and 2 PDFs. Those rows predate `import_identity` and are therefore invisible to dedup — re-uploading one of those statements **there** will duplicate it once, which is expected, not a bug in this story.
  - If the worktree database is ever reset and needs clearing again: delete with SQL (`ledger_entries` where `import_batch_id is not null`, then `import_batches` / `import_candidate_rows` / `import_statements` / `import_sessions`). **Never recreate the Postgres volume** (AD-22).
- [x] 2.8 Mirror all three columns on `LedgerEntryModel`, `ImportCandidateRowModel`, `ImportSessionModel` in `api/adapters/persistence/models.py`. Do **not** add `postgresql_nulls_not_distinct` anywhere.

### Task 3 — Records + repository Protocol (AC: 1, 3, 4, 6, 7)

Every new repo method must be declared on the `ImportSessionRepository` Protocol in `api/application/import_session.py` as well as implemented on `SqlAlchemyImportSessionRepository` — otherwise the fake repos in `test_import_session_application.py` silently drift from the real one (4.11 learning).

- [x] 3.1 `CandidateRowRecord` gains `resolved_at: datetime | None = None` and `dedup_skipped: bool = False`. `_session_record` maps them.
- [x] 3.2 `ImportSessionRecord` gains `finalized_at: datetime | None = None`.
- [x] 3.3 `CommitRow` gains `identity: str`.
- [x] 3.4 New `CommitOutcome` dataclass: `batch: ImportBatchRecord | None`, `imported_new: int`, `skipped_duplicate: int`. `commit_statement_batch` returns this instead of a bare `ImportBatchRecord`. Update both call sites and the Protocol docstring.
- [x] 3.5 New Protocol + repo method `find_existing_identities(*, list_id: UUID, identities: Sequence[str]) -> set[str]`: `SELECT import_identity FROM ledger_entries WHERE list_id = :list AND import_identity IN :ids`. Empty `identities` → return `set()` without a query (an empty `IN ()` is a SQL footgun).
- [x] 3.6 New Protocol + repo method `mark_session_finalized(*, session_id: UUID, user_id: UUID) -> ImportSessionRecord`: stamp `finalized_at = now(UTC)` if null, return the reloaded record.

### Task 4 — Persistence: dedup-aware commit, undo reset, PDF release move (AC: 1, 3, 7)

- [x] 4.1 `commit_statement_batch` gains a keyword-only `duplicate_row_ids: Sequence[UUID] = ()`. Inside the **existing** `begin_nested()` SAVEPOINT, in this order:
  - Guarded `UPDATE ... SET status='committed', resolved_list_id=:list, resolved_at=:now, dedup_skipped=false WHERE id IN :commit_ids AND statement_id=:st AND status='pending'`; `rowcount != len(commit_ids)` → `ImportRowNotAvailableError`.
  - Second guarded `UPDATE` for `duplicate_row_ids` with `dedup_skipped=true`, same `WHERE status='pending'` guard and rowcount check.
  - Only if `rows` is non-empty: insert the `ImportBatchModel`, flush, then one `LedgerEntryModel` per row carrying `import_identity=commit_row.identity` alongside today's fields.
  - **The guarded UPDATE still precedes any ledger INSERT** (AD-4, non-negotiable), and the whole unit stays in the one SAVEPOINT so an `IntegrityError` cannot leave rows stamped `committed` with no ledger entries.
- [x] 4.2 Keep `_complete_statement_if_resolved(statement_id)` and the `undo_row_id` pointer write **outside** the SAVEPOINT exactly where they are today. The pointer must be written even when the commit action produced **no** batch (an all-duplicate assign is still undoable).
  - The second guarded UPDATE is a Core `update()`, which does **not** expire the identity map, so the returned record would echo pre-update `dedup_skipped` values. Reuse the existing `_reload_statement(statement_row)` expire/refresh (`import_sessions.py:511`) — this is the exact bug 4.11's review patch *"Reload candidate rows after guarded UPDATE"* fixed for delete/undo/edit.
- [x] 4.3 Return `CommitOutcome(batch=..., imported_new=len(rows), skipped_duplicate=len(duplicate_row_ids))`.
- [x] 4.4 In `_undo_assign`, add `dedup_skipped=False` to the pending-restore `.values(...)`. Without it, an undone duplicate row stays flagged and keeps skewing the counts. The existing `if entry is None: return` branch already covers "this assign created no ledger entry" — do not change it.
- [x] 4.5 Implement `find_existing_identities` and `mark_session_finalized`.
- [x] 4.6 `_session_record` computes `imported_new_count` / `skipped_duplicate_count` / `landing_list_id` **from the already-loaded rows** — no extra query. See [Counts are derived](#counts-are-derived-not-counted).

### Task 5 — Application: dedup filter, finalize service, PDF-release move (AC: 1, 3, 4, 5, 7, 8)

- [x] 5.1 In `AssignCandidateRowService.execute`, after the pending pre-check and **before** the FX call: compute `identity = canonical_identity_key(line)`, then `existing = session_repo.find_existing_identities(list_id=command.list_id, identities=[identity])`. If it is a duplicate → call `commit_statement_batch(rows=[], duplicate_row_ids=[candidate.id], undo_row_id=candidate.id, ...)` and skip FX entirely. **Dedup before FX** — a re-imported statement must not burn BCCR calls or 503 during an FX outage on rows that will not be written.
- [x] 5.2 In `AssignBulkImportService`, per statement: compute identities for all non-excluded rows, resolve `find_existing_identities` **once per statement** (one query, not one per row), then partition. Also dedupe **within** the statement: track identities already claimed by earlier rows in this same loop and treat repeats as duplicates (AC #3). Build FX + `CommitRow` only for the survivors; pass the rest as `duplicate_row_ids`.
- [x] 5.3 `AssignBulkImportResult` keeps its `batches` list but a fully-duplicate statement contributes no batch. Add `imported_new` / `skipped_duplicate` totals to the result so the bulk response can report them.
- [x] 5.4 **Remove** the `_release_source_pdf_if_idle(...)` call from `AssignCandidateRowService.execute` and from `DeleteCandidateRowService.execute` (AC #7). Both then need no `pdf_storage` — remove the constructor parameter and update the route wiring in `api/api/routes/import_sessions.py`. This closes the 4.11 deferred review finding *"Last-row assign/delete can delete the source PDF before undo"*.
- [x] 5.5 **Keep** `_release_source_pdf_if_idle` and its call sites in `AssignBulkImportService`, `UploadStatementPdfService`, and `DiscardImportSessionService` — Bulk is explicitly unchanged (AC #5) and discard/upload cleanup are untouched.
- [x] 5.6 `AssignBulkImportService` additionally calls `mark_session_finalized` after its commit loop — AD-4: a session is finalized on bulk commit.
- [x] 5.7 New `FinalizeImportSessionCommand(actor_user_id, session_id)` + `FinalizeImportSessionService(session_repo, pdf_storage)`:
  - `get_session` → `None` → `ImportSessionNotFoundError`
  - `discarded_at is not None` → `ImportSessionDiscardedError`
  - `finalized_at is not None` → return the session unchanged (idempotent, AC #8) — **do not** re-run the PDF delete
  - any row with `status == ROW_STATUS_PENDING` → `ImportSessionHasPendingRowsError`
  - otherwise `_release_source_pdf_if_idle(...)` then `mark_session_finalized(...)`, returning the updated record

### Task 6 — Schemas + routes (AC: 4, 5, 6, 7, 8)

- [x] 6.1 `api/api/schemas/import_sessions.py`: `ImportSessionResponse` gains `finalized_at: datetime | None = None`, `imported_new_count: int = 0`, `skipped_duplicate_count: int = 0`, `landing_list_id: UUID | None = None`. `BulkCommitResponse` gains `imported_new_count: int = 0` and `skipped_duplicate_count: int = 0`.
- [x] 6.2 Map the new fields in `_session_response` and `_bulk_commit_response`. **Leave `candidate_row_count` and the pending-only, sequence-ordered `rows` payload exactly as they are** — Bulk review reads the former and 4.11's AC #4 depends on the latter.
- [x] 6.3 `POST /{session_id}/finalize` → `FinalizeImportSessionService`, returns `ImportSessionResponse`. Gate on `Depends(require_authenticated_user)` only, same as its neighbours.
- [x] 6.4 Extend `_row_error_response` (or the finalize route's own map) with `ImportSessionHasPendingRowsError` → **409** `import_session_has_pending_rows`, and reuse the existing 404/409 mappings for not-found/discarded. Use the `JSONResponse(status_code=..., content={"detail": ..., "code": ...})` idiom in this file — **not** `HTTPException`.
- [x] 6.5 One `logger.info` on successful finalize with `session_id` / `user_id` / counts, matching the `import_bulk_committed` style. **No `normalized_description` and no `import_identity` in logs** — identity is derived from statement PII and never reaches `info`.

### Task 7 — UI: transport, types, landing target (AC: 4, 5, 6)

Thin transport plus one redirect-target change. **No component redesign.**

- [x] 7.1 New `ui/app/api/import/sessions/[sessionId]/finalize/route.ts` — `POST`, a copy of `bulk-commit/route.ts` (cookie forward → `getApiInternalUrl()` → pass upstream status + body verbatim; 502 `bad_gateway` on fetch failure). `RouteContext` params type is `Promise<{ sessionId: string }>`.
- [x] 7.2 `ui/app/upload/uploadClient.ts`: `ImportSession` gains `finalized_at: string | null`, `imported_new_count: number`, `skipped_duplicate_count: number`, `landing_list_id: string | null`. Keep `asImportSession` **tolerant** — default the counts to `0` and the nullables to `null` when absent, exactly as `asStagedStatement` already tolerates missing `rows`. Making them required would reject otherwise-valid payloads.
- [x] 7.3 Add `finalizeSession(sessionId, messages): Promise<OkSession | ErrorResult>` mapping errors through `mapIndividualReviewError`, extended with `import_session_has_pending_rows` → `errorSessionHasPendingRows`. Add that field to `IndividualReviewMessages`.
- [x] 7.4 `ui/lib/i18n/upload.ts` — add `individualReviewErrorSessionHasPendingRows` on **both** `en` and `es`. Per-domain TS message objects; never JSON files.
- [x] 7.5 `IndividualReviewPanel.tsx` — **one line only.** The existing completion effect redirects to `lastAcceptedListId`; repoint it at `session.landing_list_id` with the same `/lists` fallback. Do not touch the trigger, the gestures, the layout, or `SessionReviewPanel` / `UploadPanel`. See [Build-order carve-out](#build-order-carve-out-read-before-touching-the-ui).

### Task 8 — Tests (AC: all)

- [x] 8.1 `api/tests/test_canonical_line_domain.py` — five existing tests pass `statement_period_id=` and must be updated to the new signature (`:116`, `:122`, `:141`, `:149`, `:155`). One of them, **`test_compute_canonical_identity_fallback_differs_on_statement_period` (`:163`), is not deleted — it is inverted**: the same transaction reached via two different statements must now produce **one** identity. That inverted test is the permanent guard against anyone reintroducing a period id, so name it for what it protects (e.g. `test_identity_is_stable_across_overlapping_statements`) and comment it with the FR-20 reasoning.
  - New `canonical_identity_key` tests: stable-ref vs fallback produce different keys; `Decimal("10.5")` and `Decimal("10.50")` produce the **same** key; a description containing `|` does not collide with a differently-split neighbour; the `v1:` prefix is present.
- [x] 8.2 `api/tests/test_import_session_domain.py` — `select_landing_list_id` for the plain-winner, count-tie-then-recency, full-tie-then-lowest-id, and empty cases.
- [x] 8.3 `api/tests/test_import_session_application.py` (fake repo) — `AssignCandidateRowService` **does not call FX** when the identity already exists; `AssignBulkImportService` issues **one** `find_existing_identities` call per statement and dedupes repeats within the statement; `FinalizeImportSessionService` raises not-found / discarded / has-pending-rows and is idempotent when `finalized_at` is set; `AssignCandidateRowService` and `DeleteCandidateRowService` no longer touch `pdf_storage`.
- [x] 8.4 `api/tests/test_import_sessions_integration.py` — **Postgres 16 only, never a SQLite stand-in** (these already skip without `DATABASE_URL`):
  - assign a row → ledger entry carries a non-null `import_identity`.
  - re-import the same statement into the **same** list → second assign creates **no** ledger entry, the row still leaves `pending` with `dedup_skipped = true`, no batch is journaled, and the response is **200, not an error** (AC #3's "no mid-import interruption").
  - the same identity into a **different** list **does** commit — dedup is per destination list.
  - bulk-commit a statement holding two byte-identical rows → exactly one ledger entry, `skipped_duplicate_count == 1`.
  - **undo a duplicate-skipped assign** → row back to `pending`, `dedup_skipped` back to `false`, counts move back. This is the highest-value test in the story: it is the interaction between 4.11's undo and this story's new state.
  - assign the last pending row → **PDF still present and `pdf_path` still set**; `finalized_at` still null.
  - `POST /finalize` with pending rows → 409 `import_session_has_pending_rows`, PDF untouched.
  - `POST /finalize` on a fully resolved session → PDF deleted, paths cleared, `finalized_at` set; a second call returns 200 and does not error.
  - `POST /finalize` with a `failed` statement present → `finalized_at` set but the PDF is **retained** (`session_needs_source_pdf`).
  - bulk commit → still releases the PDF and now also stamps `finalized_at`.
  - `landing_list_id` across a session that fed two lists unevenly; `null` when everything was deleted or duplicated.
  - Keep the row-grain concurrent-commit race test 4.10 added — do not weaken it.
  - Money assertions use `Decimal` — never `float`.
- [x] 8.5 UI: extend `ui/app/api/cards-import.bff.test.ts` (the existing BFF test file — do not create a new one) for the finalize proxy, and `ui/app/upload/uploadClient.test.ts` for `finalizeSession` plus tolerant parsing of a payload missing the four new fields.
- [x] 8.6 Full gate before flipping to `review`: `api` pytest (host **and** inside the Compose `api` container after `alembic upgrade head`), `ui` typecheck + lint + vitest. Use `scripts/worktree/worktree-bootstrap.sh` for the isolated stack rather than an ad-hoc `docker run`.
- [x] 8.7 Epic 3.5 retro action item: **run a local/Docker build** before marking this story done if anything build-affecting changed.

### Task 9 — Story close

- [x] 9.1 Write the how/why overview per `_bmad-output/implementation-artifacts/story-close-overview-checklist.md` before flipping to `review`.
- [x] 9.2 Add a **Review Findings** section, including an explicit zero-findings note if there are none (Epic 3.5 retro action item — no story closes without one).
- [x] 9.3 Sync the story-file header status to `sprint-status.yaml` at close; `sprint-status.yaml` stays authoritative (Epic 3.5 retro action item).
- [x] 9.4 Add a `deferred-work.md` entry: **revisit dedup scope after Stories 5.5 and 5.6.** Per-destination-list was chosen because re-import is currently the only informal way to repair a misrouted statement — there is no reassign (5.5), no batch rollback (5.6), and `ReceiptRowMenu`'s Edit does not persist (recorded in 4.15). Once real repair routes exist, per-importing-user scope becomes viable and prevents cross-list double-counting.

## Dev Notes

### Build-order carve-out (read before touching the UI)

4.12 ships **before** 4.13 (review card) and 4.13.1 (ImportReviewSheet). Sprint Change
Proposal 2026-08-21 §5.3 is explicit: *"4.12 AC text can land now; 4.12 code that lands on
empty queue should wait for Save once 4.13.1 exists — if 4.12 is built first, do not treat
empty pending as complete."*

So this story splits AC #5 in two:

| Half | Owner | This story |
|---|---|---|
| Landing **target** (which list) | 4.12 | ✅ `landing_list_id` computed server-side; the existing redirect is repointed at it |
| Landing **trigger** (Save, not last card) | 4.13.1 | ❌ untouched — the trigger stays "queue empty" until the sheet exists |
| PDF release timing | 4.12 | ✅ removed from row assign/delete; moved behind `POST /finalize` |
| Calling `/finalize` from Save | 4.13.1 | ❌ endpoint only |
| Completion-summary surface | 4.14 | ❌ counts only |

`IndividualReviewPanel.tsx` is a 4.8-era panel that 4.11 kept alive with a typecheck-only
edit; **4.13 rewrites it wholesale**. Investing in it here is wasted work. The single
authorized change is the redirect target in the completion effect
(`IndividualReviewPanel.tsx:189-196`).

### What already exists — do not rebuild it

| Already on `main` | Where |
|---|---|
| `CanonicalLine`, `compute_canonical_identity` (AD-18 tuple, **fully unit-tested**) | `api/domain/canonical_line.py:79` |
| `ROW_STATUS_*`, `statement_is_fully_resolved`, `session_needs_source_pdf` | `api/domain/import_session.py` |
| `commit_statement_batch` — guarded UPDATE → batch → ledger, one SAVEPOINT | `api/adapters/persistence/import_sessions.py:209` |
| `_undo_assign` — hard-deletes the ledger entry **and** an emptied batch | same file, `:471` |
| `_release_source_pdf_if_idle` (AD-3 rule) | `api/application/import_session.py:459` |
| `AssignCandidateRowService` / `DeleteCandidateRowService` / `AssignBulkImportService` | `api/application/import_session.py:637` / `:729` / `:496` |
| `MaterializeFxService` wired into both assign paths (AD-7) | same file |
| Payer defaults to actor via `ManualExpenseDraft(payer_id=command.actor_user_id)` (FR-19) | same file, `:564` / `:690` |
| `ledger_entries.import_candidate_row_id` UUID nullable **UNIQUE** (double-commit backstop) | `models.py:259-263` |
| Settle strip reading committed ledger rows, `force-dynamic` + `cache: "no-store"` | `ui/app/lists/[listId]/page.tsx:28,357` |

**AC #1 is already 80% satisfied.** Batch journaling per commit action, payer default, and
FX materialization all shipped in 4.10/4.11. The genuinely new work in AC #1 is the
**dedup** clause. Verify the existing behavior with tests; do not rewrite it.

**The critical finding:** `compute_canonical_identity` is defined, documented, and
unit-tested — and **called from nowhere in the commit path**. `grep` confirms its only
callers are its own tests. Story 4.4 built the identity rule; nothing ever wired it in.
That wiring is this story.

### Files being modified — current state and what must survive

**`api/adapters/persistence/import_sessions.py`** — today `commit_statement_batch` flips
every targeted row to `committed` in one guarded UPDATE, then inserts one batch and one
ledger entry per row, all inside a single `begin_nested()` SAVEPOINT.
**Must survive:** the guarded UPDATE strictly **before** any ledger INSERT; the SAVEPOINT
wrapping so an `IntegrityError` surfaces as `ImportRowNotAvailableError` and cannot leave
`committed` rows with no ledger entries; `_complete_statement_if_resolved` and the undo
pointer write staying outside the SAVEPOINT; no `postgresql_nulls_not_distinct`; no
`resolved_ledger_entry_id` column, ever.

**`api/application/import_session.py`** — the `ImportSessionRepository` Protocol is the
seam; the fake repos in the application tests implement it.
**Must survive:** the `origin_kind` / `origin_card_id` stamp from `statement.card_id`
(`card_id = command.card_id or statement.card_id`) that
`spec-4-8-1-restore-identified-card-origin-on-commit.md` restored — it is easy to drop while
restructuring the draft-building loop, and if origin behavior changes as a result of this
story, something has gone wrong; the `AssignBulkImportService` contract for an untouched
all-pending session (one list, one batch per statement, payer = actor); the cheap
`candidate.status != ROW_STATUS_PENDING` pre-check that keeps a stale-UI retry a clean 409
instead of an FX 503.

**`api/api/routes/import_sessions.py`** — `_session_response()` is the single mapper every
route returns through, so adding the four fields there satisfies AC #4 for *all* endpoints
at once. **Must survive:** `identify_card_for_statement` untouched (live — `UploadPanel`
calls it); upload and bulk-commit behavior unchanged apart from the two new response
fields; the `JSONResponse(content={"detail":..., "code":...})` idiom.

**`ui/app/upload/uploadClient.ts`** — the `as*` parse guards are the only validation between
the API and typed state; they must stay tolerant of missing optional fields.

**`api/domain/canonical_line.py`** — `compute_canonical_identity` is the AD-18 rule and is
already correct. **Wrap it, do not edit it.** Changing the tuple changes every future
identity and invalidates the ones this story starts persisting.

### Counts are derived, not counted

Two integer counters on `import_sessions` would be the obvious move and would be **wrong**:
undo returns a row to `pending` and the counters would drift, so the 4.14 summary would lie
after any undo. Derive instead, from state that undo already corrects:

- `imported_new_count` = rows with `status == committed` **and** `dedup_skipped == false`
- `skipped_duplicate_count` = rows with `status == committed` **and** `dedup_skipped == true`

Both are computed in `_session_record` from rows already loaded by
`selectinload(statements).selectinload(candidate_rows)` — no extra query, no drift.
`_undo_assign` resetting `dedup_skipped=False` (Task 4.4) is what keeps the second one
honest.

The same reasoning gives `landing_list_id`: computed from the imported-new rows'
`(resolved_list_id, resolved_at)` pairs via the pure domain function, so an undo moves the
landing target too.

### Dedup — the parts most likely to be got wrong

1. **Dedup is per destination list, not global — decided 2026-08-23.** A ledger entry belongs
   to a list and balances are per-list, so a duplicate in list A cannot corrupt list B's
   balance. The deciding argument is recovery: import a statement into the wrong list today
   and there is **no supported way out** — no reassign (5.5), no batch rollback (5.6), and
   `ReceiptRowMenu`'s Edit does not persist (4.15 records that gap). Per-list scope keeps
   re-import available as the informal repair route until Epic 5 provides real ones.
   Scope the lookup to `list_id`. The accepted cost is that a genuine misroute can leave the
   same purchase in two lists with no warning — Task 9.4 defers the revisit.
2. **A duplicate row still resolves.** It leaves `pending` and becomes `committed` with
   `dedup_skipped = true`. If it stayed `pending`, the queue would never empty and
   `statement_is_fully_resolved` would never fire — the review would hang on rows the user
   already handled. "Committed" here means "this row is done", not "a ledger entry exists".
3. **No batch for an all-duplicate commit action.** AD-4 says a batch is one commit action
   that *happened*; an empty batch pollutes FR-30 rollback in Epic 5, which is the same
   reason `_undo_assign` already deletes emptied batches.
4. **Dedup before FX.** Re-importing a whole statement would otherwise fire a BCCR call per
   duplicate row and can 503 the entire re-import during an FX outage — on rows that were
   never going to be written.
5. **Dedupe within the commit action too.** A bulk statement can legitimately carry two
   byte-identical rows; the DB lookup only catches rows already committed. Track claimed
   identities inside the loop.
6. **Undo of a duplicate-skipped assign already half-works.** `_undo_assign`'s
   `if entry is None: return` branch (added for a different reason) means undo does not
   crash when there is no ledger entry. What is missing is the `dedup_skipped=False` reset —
   without it the row returns to `pending` still flagged, and the counts stay wrong.
7. **Forward note for 4.13.1 — decided 2026-08-23, do not pre-build.** A duplicate-skipped
   row is `committed` with a `resolved_list_id` but **no ledger entry**. Two consequences the
   sheet has to handle, neither of which this story solves:
   - Its per-row Discard has nothing to reverse. Returning it to `pending` would send it
     back through review, where re-assigning skips it as a duplicate again — a loop with no
     exit. Showing it as *already in this list* with Discard suppressed is the likely answer,
     but that is 4.13.1's call.
   - `GET /import/sessions/{id}` returns **pending rows only** — 4.11's deliberate contract,
     which Task 6.2 keeps intact. So the sheet cannot currently see *any* resolved row,
     duplicate or otherwise. **4.13.1 widens that payload**, designed against the real sheet
     rather than guessed at here.

   Write both into Completion Notes so 4.13.1's create-story picks them up.
8. **Manual entries keep `import_identity = NULL`** and are invisible to dedup. Manual-vs-
   parsed collisions are FR-24 / Story 5.7's conflict flow, deliberately **not** silent
   dedup. Do not extend identity writing to `CreateManualExpenseService`.

### Why the identity index is not UNIQUE

AD-4 mandates two layers for **double-commit** protection, and that pair already exists and
is untouched here: the guarded `UPDATE ... WHERE status='pending'` in front of
`ledger_entries.import_candidate_row_id UNIQUE`. Dedup is a different problem, and a UNIQUE
index on `(list_id, import_identity)` would be actively harmful:

- Two genuinely distinct purchases can share a fallback identity (same merchant, same
  amount, same day, no stable `external_ref`). The specified behavior is skip-and-count, and
  a DB constraint turns that into a `500` on a legitimate statement instead.
- An `IntegrityError` raised by the identity index would be indistinguishable from the
  candidate-row one at the point where the current code maps it to
  `ImportRowNotAvailableError`, silently converting "duplicate skipped" into "row not
  available".

The residual race — two **concurrent** commit actions writing the same identity to the same
list — produces one extra ledger line, not corruption, is recoverable via Story 5.6
rollback, and requires the same user racing themselves. Take the plain index and the
in-transaction lookup.

### The `statement_period_id` removal

**Decided 2026-08-23. AD-18 is amended by this story (Task 1.5) — this section is the
rationale that amendment note points at.**

AD-18's fallback tuple ends in `statement_period_id`, and **the pipeline does not extract a
billing period today** — `import_statements` has `product_id`, `pdf_path`, `iban`, `card_id`,
`original_filename`, `status`, and nothing cycle-shaped. `compute_canonical_identity` takes
it as a required keyword, which is why the function has never been called outside tests.

The tempting fix is to derive it from `posted_date`. Don't. **Work out what a real period id
would do and it turns out to be actively wrong.**

Take the exact case FR-20's overlap clause exists for: a January statement and a February
statement that both print a purchase posted Jan 28. One transaction, printed twice. With the
issuing statement's cycle in the tuple, those two get *different* identities — and the
duplicate commits. A real `statement_period_id` **defeats overlapping-statement dedup**,
which is the primary thing this story ships.

Deriving it from `posted_date` avoids that only by being a no-op: `posted_date` is already in
the tuple, so a `YYYY-MM` slice of it adds nothing. That leaves a wrong rule sitting in the
spine, plus a live footgun — a Story 5.10 author would read `statement_period_id_for(...)` as
an obvious stub, wire in the real cycle id, and silently break overlap dedup with no test to
catch it.

So the field comes out of the tuple and AD-18 is corrected to say why. The **inverted
regression test** (Task 8.1: two statements, same transaction, one identity) is the permanent
guard against anyone putting it back.

**The `v1:` prefix stays regardless.** It is not about the period specifically — it makes
*any* future identity-rule change detectable rather than a silent dedup outage on rows
fingerprinted under the old rule. Do not drop it, and do not store the raw tuple as the
column value.

### Architecture compliance (binding)

- **AD-1 hexagonal:** `api/domain` imports no FastAPI / SQLAlchemy / pdfplumber. The new
  identity/landing helpers are pure functions over primitives + stdlib (`hashlib`, `json`).
  ORM models stay under `adapters/persistence`.
- **AD-3:** the PDF is deleted and its path cleared only at **finalize** (Save / bulk
  commit) — *"review includes ImportReviewSheet until Save; last pending assign/delete is
  not 'review no longer needs the PDF'."* Retain while any statement is `staged` or
  `failed`.
- **AD-4 (amended 2026-08-20 / 2026-08-21):** batch = one commit action; partial commit is
  normal; a candidate row yields **at most one** ledger entry; the session is **not
  finalized** until Save, bulk commit, or upload discard, and finalized is what unlocks the
  AD-3 delete and the 4.14 summary.
- **AD-5 money:** `Decimal` in Python, `NUMERIC` in Postgres, **string on the wire**. Never
  `float`, never a JSON number. The identity serializer must not round-trip amounts through
  `float`.
- **AD-7 FX:** materialized at commit by `MaterializeFxService`; settle reads materialized
  CRC. No FX override, no browser-side FX or share math.
- **AD-8 auth:** httpOnly Secure cookie, same-origin BFF. No Bearer, no `localStorage`.
  `ui` → HTTP only, never DB or parsers.
- **AD-18:** **domain alone** computes canonical identity at commit; adapters emit only the
  `ref_quality` hint. Nothing in `api/adapters/bank/**` changes in this story.
- **AD-19 ACL:** `/assign` already goes through `AuthorizeListAccessService`. `/finalize` is
  session-owner-scoped — every repo query filters `ImportSessionModel.user_id == user_id`,
  so a non-owner gets `import_session_not_found` rather than a 403. That non-enumerating
  shape is deliberate; preserve it.
- **AD-21:** settle-up stays computed shares only — this story writes no payment ledger.
- **AD-23 / Epic 3.5:** no new `*.module.css`. No styling work is expected; if any appears,
  Tailwind utilities co-located, `*.module.scss` for custom only.
- **Alembic only.** Never auto-create tables on startup; never recreate the Postgres volume
  to "fix" a migration (AD-22).

### File structure — exact paths

**New**
```
api/adapters/persistence/migrations/versions/0024_import_dedup_identity_and_finalize.py
ui/app/api/import/sessions/[sessionId]/finalize/route.ts
```

**Updated**
```
api/domain/canonical_line.py
api/domain/import_session.py
api/domain/errors.py
api/adapters/persistence/models.py
api/adapters/persistence/import_sessions.py
api/application/import_session.py
api/api/schemas/import_sessions.py
api/api/routes/import_sessions.py
api/tests/test_canonical_line_domain.py
api/tests/test_import_session_domain.py
api/tests/test_import_session_application.py
api/tests/test_import_sessions_integration.py
ui/app/upload/uploadClient.ts
ui/app/upload/uploadClient.test.ts
ui/app/api/cards-import.bff.test.ts
ui/lib/i18n/upload.ts
ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx   (redirect target only, Task 7.5)
_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md   (AD-18 amendment only, Task 1.5)
_bmad-output/implementation-artifacts/deferred-work.md       (dedup-scope revisit, Task 9.4)
```

**Do not touch:** `ui/app/upload/UploadPanel.tsx`, `ui/app/upload/SessionReviewPanel.tsx`,
`ui/app/upload/bulk/**`, `ui/app/lists/**` (the settle strip already reflects committed rows
— AC #5 is a verification, not a change), `api/adapters/bank/**`,
`_bmad-output/planning-artifacts/epics.md`, `prd.md`, and Story 4.8's file (`done`,
superseded).

**`ARCHITECTURE-SPINE.md` — AD-18 only.** Task 1.5 amends AD-18 and nothing else. AD-3 and
AD-4 are **already amended** for this flow — implement them, do not re-write them.

### Testing standards

- **Discipline (AD-15):** domain → red-green TDD. API/UI → test-after.
- **Layers:** unit (pure domain) · application (fake repo) · integration (**Postgres 16**,
  never a SQLite stand-in) · UI vitest.
- **Merge gate:** lint · api pytest + synthetic goldens · ui typecheck/lint · critical ui
  tests. Not full Playwright every PR.
- Integration tests skip without `DATABASE_URL`; run them inside the Compose `api` container
  after `alembic upgrade head`.
- No PII in fixtures or goldens. Generic vocabulary only — no real IBANs, no personal names,
  no owner nicknames.
- Tests must assert on **real behavior**, never on source text (Epic 3.5 retro action item).

### Previous story intelligence (4.11, `done`)

- **The deferred finding this story closes:** *"[Review][Defer] Last-row assign/delete can
  delete the source PDF before undo — `api/application/import_session.py:459`; deferred:
  replace last-row PDF drop with a post-assign ImportReviewSheet."* Task 5.4 is the server
  half of that fix; 4.13.1 is the UI half.
- **The undo contract this story must not break:** hard-delete the ledger entry (no
  `deleted_at` exists, and the `UNIQUE import_candidate_row_id` must actually be freed);
  delete the emptied batch; re-open a `committed` statement to `staged`; single-level
  pointer cleared on use or supersession; `_release_source_pdf_if_idle` is **never** called
  from undo.
- **Repo Protocol drift:** new repo methods declared only on the concrete class let the fake
  repos silently diverge. Declare on the Protocol too (4.11 Task 3 preamble).
- **`_reload_statement` exists for a reason:** Core `UPDATE()` does not expire identity-map
  collections, so a later `_session_record` echoes pre-update statuses. Any new guarded
  UPDATE that must be visible in the returned record needs the same expire/refresh.
- **Two codes for two causes — preserve both:** a second bulk commit with no `staged`
  statement returns **422 `no_clean_statements_to_commit`**; a mixed-row statement returns
  **409 `import_row_not_available`**.
- **Numbers to expect:** ~595+ api tests green in-container; a large host-skip count
  (~150 without `DATABASE_URL`) is expected, not a failure. Host `.venv` is required for
  pytest — `uv run pytest` on PATH does not see the project venv.
- Read 4.11's *"Files being modified"* and 4.10's *"What not to break"* before the first
  edit.

### Git intelligence

- Baseline: `b085467` on branch `feat/4/4-12-commit-batch-dedup-summary-land-on-settle-strip`
  (worktree `finance-dashboard-wt-4-12`, already created and at parity with `main`).
- Since 4.11 merged (`10c6d32`, PR #73) the only commits are UI polish on the upload button
  glyph (`3efb6cc`, `a153cbc`, `a25c2a8`, `b085467`) — they touch the upload **icon**, not
  the import API surface. No conflict with this story's scope.
- Working pattern from recent commits: schema change → model → repo → service → route → BFF
  → client → tests, each as its own conventional commit.
- Branch convention `<type>/<epic>/<us-id>`; one story per branch; PR-only merge to `main`
  after CI green; no force-push to `main`; don't normalize `--no-verify`.

### Latest technical information

Versions are pinned by lockfiles (Story 1.1). **Do not bump anything in this story** —
version changes go through dedicated `chore/` PRs.

- **PostgreSQL 16** / **psycopg 3.3.x** — a plain composite index on
  `(list_id, import_identity)` serves the `IN (...)` lookup; no partial index needed since
  `NULL` identities simply never match an `IN` list.
- **SQLAlchemy 2.0.x** — `Mapped[...]` / `mapped_column`, `select()` / `update()` constructs.
  No legacy `Query` API. `Index(...)` in `__table_args__` alongside the existing
  `UniqueConstraint` on `LedgerEntryModel` — append, do not replace.
- **Alembic 1.18.x** — `op.add_column` / `op.create_index`; `down_revision` chains from
  `0023_import_session_undo_pointer`.
- **Pydantic 2.13.x** — `Field(default_factory=...)`, `model_config = ConfigDict(...)`. No
  `class Config`, no v1 validators. New response fields get defaults so an older client
  parsing the payload is unaffected.
- **FastAPI 0.141.x / Uvicorn 0.52.x**, **Python 3.12+** (`X | None` unions,
  `from __future__ import annotations` already in these files).
- **Next.js 16.2.x standalone / React 19.2.x** — route handlers receive `params` as a
  **`Promise`**; `await context.params`, exactly as `bulk-commit/route.ts` already does.
- `hashlib.sha256` is stdlib and non-cryptographic in use here (a content key, not a
  security boundary) — no new dependency, and none should be added.

### Project Structure Notes

Matches the established hexagonal layout with no variance: pure rules in `api/domain`,
orchestration in `api/application`, SQLAlchemy in `api/adapters/persistence`, HTTP in
`api/api/{routes,schemas}`, and the Next BFF proxy mirroring the API path shape one-for-one
under `ui/app/api/`. The only new directory level is `finalize/` under the existing
`[sessionId]/`, paralleling `bulk-commit/` and `undo/`.

One deliberate variance to note in Completion Notes: `ledger_entries.import_identity` is a
derived key stored beside the source fields it derives from. That is intentional —
`ledger_entries.product_id` is a UUID stub that never receives the adapter's string
`product_id`, so the AD-18 fallback tuple **cannot** be reconstructed from ledger columns at
query time. Persisting the key is the only way to compare identities across sessions.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.12] — ACs (amended 2026-08-20 and 2026-08-21)
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-08-20.md] — §"epics.md — amend Story 4.12 acceptance criteria"; §"Story ownership boundary (4.12 vs 4.14)"; sequencing table
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-08-21.md] — §4.3 (Save is exhausted + PDF); §5 handoff item 3 (build-order carve-out)
- [Source: .../architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md#AD-18] — dedup identity authority; **amended by this story** (Task 1.5) to drop `statement_period_id`
- [Source: .../ARCHITECTURE-SPINE.md#AD-3] — PDF retain/delete, review includes the sheet until Save
- [Source: .../ARCHITECTURE-SPINE.md#AD-4] — batch = one commit action; session finalized on Save / bulk commit / discard
- [Source: .../prds/prd-finance-helper-2026-08-02/prd.md#FR-20] — post-import dedup summary; #FR-34 canonical identity; #FR-19 explicit payer; #FR-18 individual review outcomes
- [Source: .../ux-designs/ux-finance-helper-2026-08-03/EXPERIENCE.md#J1] — steps 7-10: sheet → summary → land → settle-strip climax
- [Source: .../ux-designs/row-level-individual-review-2026-08-20.md#5] — zero-amount filtering + end-of-session summary contents
- [Source: _bmad-output/project-context.md] — money-as-string, i18n per-domain TS objects, test layers, branch naming, never/always lists
- [Source: _bmad-output/implementation-artifacts/4-11-row-level-review-api-rows-assign-delete-undo-edit.md] — Review Findings (deferred PDF drop), undo contract, Protocol-drift warning
- [Source: _bmad-output/implementation-artifacts/4-10-row-level-review-data-model-per-row-commit.md] — "What not to break"
- [Source: _bmad-output/implementation-artifacts/spec-4-8-1-restore-identified-card-origin-on-commit.md] — origin-stamp invariants
- [Source: _bmad-output/implementation-artifacts/epic-3-5-retro-2026-08-21.md] — open action items applied in Tasks 8.7 / 9.2 / 9.3
- [Source: _bmad-output/implementation-artifacts/story-close-overview-checklist.md] — required before `review`

## Decisions (resolved with Sebas, 2026-08-23)

All six open questions from story creation were closed before dev. No open questions remain.

1. **Finalize ownership → 4.12 builds it.** `finalized_at`, `FinalizeImportSessionService`
   and `POST /finalize` land in this story; 4.13.1's Save just calls the endpoint. Without
   it, AC #7 has no testable implementation and the 4.11 deferred PDF defect stays live for
   two more stories — and every individual-review session would hold its PDF until discard.
2. **No backfill, clean history instead.** The migration writes no data (Task 2.6). The 4.12
   worktree database was verified empty on 2026-08-23, so nothing needed clearing and nothing
   was deleted. The main dev stack keeps its data and is **not** the test target — see
   Task 2.7.
3. **`statement_period_id` dropped from the identity tuple; AD-18 amended here** (Task 1.5).
   A real period id would give one transaction two identities across overlapping statements,
   defeating the very clause this story implements. Guarded permanently by the inverted test
   in Task 8.1. See [The statement_period_id removal](#the-statement_period_id-removal).
4. **Landing target repointed now** (Task 7.5) — one line, in a panel 4.13 rewrites anyway.
   The landing *trigger* still moves to Save in 4.13.1.
5. **Dedup scope = destination list**, not per user. Chosen because re-import is currently
   the only way to repair a misrouted statement; revisit after 5.5 / 5.6 (Task 9.4).
6. **4.13.1 widens the session payload** for the sheet. 4.12 keeps 4.11's pending-only
   contract and hands forward the duplicate-row edge cases in Completion Notes.

## Dev Agent Record

### Agent Model Used

claude-opus-5 (Claude Code `bmad-dev-story`)

### Debug Log References

- `alembic upgrade head` on the 4.12 worktree stack (`fh-feat-4-4-12-…`, api `:8110`): `0023_import_session_undo_pointer -> 0024_import_dedup_identity`.
- API: `ruff check` + `ruff format` clean; host pytest green (integration skipped without `DATABASE_URL`), in-container pytest green against Postgres 16 via `docker compose -f docker-compose.yml -f docker-compose.test.yml run --rm --build api`.
- UI: `tsc --noEmit` clean, `npm run lint` 0 errors (4 pre-existing warnings, none in touched files), `vitest run` green.

### Completion Notes List

## Story-close overview — 4.12 commit batch, dedup summary, land on settle strip

**Request path (individual assign, the dedup path):**
`IndividualReviewPanel` → `assignRow()` → `POST /api/import/sessions/{id}/rows/{rowId}/assign` (BFF, cookie forward) → `POST /import/sessions/{id}/rows/{rowId}/assign` → `AssignCandidateRowService.execute` → `canonical_identity_key(line)` → `find_existing_identities(list_id=…)` → **duplicate?** `commit_statement_batch(rows=[], duplicate_row_ids=[row])` (no FX, no batch, no ledger) : **new?** `MaterializeFxService` → `commit_statement_batch(rows=[CommitRow(…, identity)])` → `_session_response` (derives counts + `landing_list_id`).

**Request path (finalize, the PDF path):**
`finalizeSession()` → `POST /api/import/sessions/{id}/finalize` (BFF) → `FinalizeImportSessionService` → pending-row gate → `_release_source_pdf_if_idle` → `mark_session_finalized`.

**Key components:**
`api/domain/canonical_line.py` (`compute_canonical_identity` amended, `canonical_identity_key` added) · `api/domain/import_session.py` (`select_landing_list_id`) · `api/domain/errors.py` (`ImportSessionHasPendingRowsError`) · migration `0024` · `models.py` (`import_identity`, `dedup_skipped`, `finalized_at`) · `import_sessions.py` repo (dedup-aware commit, `find_existing_identities`, `mark_session_finalized`, derived counts in `_session_record`) · `application/import_session.py` (dedup filter in both assign paths, `FinalizeImportSessionService`, `pdf_storage` removed from assign/delete) · `routes/import_sessions.py` (`POST /finalize`, four new response fields) · `ui/app/api/import/sessions/[sessionId]/finalize/route.ts` · `uploadClient.ts` · `IndividualReviewPanel.tsx` (redirect target only).

**Why this shape:**
`compute_canonical_identity` had shipped in Story 4.4 and was **called from nowhere** — this story is the wiring. `statement_period_id` came out of the tuple (AD-18 amended) because a real period id gives one transaction two identities across overlapping statements, defeating the exact FR-20 clause this story implements. Counts are **derived from row state** rather than incremented, so undo moves them back instead of leaving the 4.14 summary lying. PDF release moved from "last pending row resolved" to an explicit `POST /finalize` (AD-3/AD-4), closing 4.11's deferred defect; 4.13.1's Save calls it.

**What not to break:**
- The guarded `UPDATE ... WHERE status='pending'` still precedes **any** ledger INSERT, and both it and the duplicate UPDATE stay inside the one SAVEPOINT. `_complete_statement_if_resolved` and the undo-pointer write stay **outside** it — the all-duplicate path falls through rather than returning early, precisely so this holds.
- `ix_ledger_entries_list_import_identity` is **non-unique** on purpose. Two distinct purchases can share a fallback identity; the specified behavior is skip-and-count, and a constraint would turn a legitimate statement into a 500 whose `IntegrityError` is indistinguishable from the candidate-row one.
- `_undo_assign` must keep resetting `dedup_skipped=False`, or an undone duplicate returns to pending still flagged and skews the counts forever.
- Dedup runs **before** FX. Re-importing a statement must not burn a BCCR call per duplicate row or 503 during an FX outage on rows that were never going to be written.
- A duplicate row resolves (`committed` + `dedup_skipped`) rather than staying pending — otherwise the queue never empties and `statement_is_fully_resolved` never fires.
- An all-duplicate commit action journals **no** batch (AD-4; an empty batch pollutes FR-30 rollback).
- `GET /import/sessions/{id}` still returns **pending rows only**, sequence-ordered (4.11 AC #4), and `candidate_row_count` is still the total.
- `origin_kind` / `origin_card_id` still stamp from `command.card_id or statement.card_id` (spec-4.8.1).
- Bulk is unchanged on PDF release and now also stamps `finalized_at`.

### Forward notes for Story 4.13.1 (duplicate-row edge cases)

A duplicate-skipped row is `committed` with a `resolved_list_id` but **no ledger entry**. Two consequences this story deliberately does not solve:

1. **Per-row Discard has nothing to reverse.** Returning it to `pending` sends it back through review, where re-assigning skips it as a duplicate again — a loop with no exit. Showing it as *already in this list* with Discard suppressed is the likely answer, but that is 4.13.1's call.
2. **The sheet cannot see it at all.** `GET /import/sessions/{id}` returns pending rows only — 4.11's deliberate contract, kept intact here (Task 6.2). 4.13.1 widens that payload, designed against the real sheet rather than guessed at here.

### Deviations from the story text

- **Alembic revision id shortened.** Task 2.1 specifies `revision = "0024_import_dedup_identity_and_finalize"` — 39 characters, and `alembic_version.version_num` is `VARCHAR(32)` (0023's id is exactly 32, and its docstring flags the limit). Used `0024_import_dedup_identity` (26). The **filename** is unchanged.
- **`_release_source_pdf_if_idle` is now called from `FinalizeImportSessionService` too** — Task 5.5 lists the three call sites to keep, and finalize is a fourth, new one. Same helper, same AD-3 rule.
- **`ImportSessionHasPendingRowsError` was added to the shared `_ROW_ERROR_MAP`** rather than a finalize-only map (Task 6.4 allowed either). One map keeps the 404/409 mappings the route already needs.
- **Two pre-existing tests were inverted, not deleted**, because they asserted the behavior AC #7 removes: `test_delete_candidate_row_then_all_deleted_statement_commits` (application) now asserts the PDF survives, and `test_compute_canonical_identity_fallback_differs_on_statement_period` became `test_identity_is_stable_across_overlapping_statements`.
- **`set_row_status` in the application fake repo now completes the statement** the way the real `_complete_statement_if_resolved` does — without it the fake's statement stayed `staged`, so the AD-3 retain rule never let a finalize test reach the delete.

### Variance worth recording

`ledger_entries.import_identity` is a derived key stored beside the source fields it derives from. Intentional: `ledger_entries.product_id` is a UUID stub that never receives the adapter's *string* `product_id`, so the AD-18 fallback tuple **cannot** be reconstructed from ledger columns at query time. Persisting the key is the only way to compare identities across sessions.

### File List

**New**
```
api/adapters/persistence/migrations/versions/0024_import_dedup_identity_and_finalize.py
ui/app/api/import/sessions/[sessionId]/finalize/route.ts
```

**Modified**
```
api/domain/canonical_line.py
api/domain/import_session.py
api/domain/errors.py
api/adapters/persistence/models.py
api/adapters/persistence/import_sessions.py
api/application/import_session.py
api/api/schemas/import_sessions.py
api/api/routes/import_sessions.py
api/tests/test_canonical_line_domain.py
api/tests/test_import_session_domain.py
api/tests/test_import_session_application.py
api/tests/test_import_sessions_integration.py
ui/app/upload/uploadClient.ts
ui/app/upload/uploadClient.test.ts
ui/app/upload/SessionReviewPanel.tsx
ui/app/upload/SessionReviewPanel.test.tsx
ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx
ui/app/api/cards-import.bff.test.ts
ui/lib/i18n/upload.ts
_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md
_bmad-output/implementation-artifacts/deferred-work.md
_bmad-output/implementation-artifacts/sprint-status.yaml
_bmad-output/implementation-artifacts/4-12-commit-batch-dedup-summary-land-on-settle-strip.md
```

`ui/app/upload/SessionReviewPanel.tsx` and its test are not in the story's file list: both needed the new
`errorSessionHasPendingRows` key to satisfy the widened `IndividualReviewMessages` type. Type-only, one line each —
no behavior change, and no encroachment on 4.13's ownership of the review surfaces.

## Change Log

- 2026-08-22: Story context created via `bmad-create-story` for `4-12-commit-batch-dedup-summary-land-on-settle-strip`. Status → ready-for-dev. Ultimate context engine analysis completed — comprehensive developer guide created.
- 2026-08-23: Story implemented via `bmad-dev-story`. Domain identity wiring (TDD), migration `0024`, dedup-aware commit, derived session counts, `POST /finalize`, PDF release moved off row-grain assign/delete, BFF + client transport, landing target repointed. API 667 passing in-container against Postgres 16 (491 + 176 skipped on host); UI 341 vitest, typecheck and lint clean; `docker compose build api ui` green; migration `upgrade`/`downgrade` round-trip verified. Status → review.
- 2026-08-23: Six open questions resolved with Sebas and folded into the ACs and tasks (see [Decisions](#decisions-resolved-with-sebas-2026-08-23)). Materially: `statement_period_id` is **dropped** from the AD-18 fallback tuple and the spine is amended in this story (Task 1.5), because a real period id defeats overlapping-statement dedup; the migration performs **no backfill** and the operator clears import history first (Tasks 2.6–2.7).

### Review Findings

Self-review findings raised and resolved **during** implementation, recorded so a reviewer
does not have to rediscover them:

1. **[Self][High] The all-duplicate commit path initially returned from inside the SAVEPOINT.**
   The first draft `return`ed `_finish_commit_action(...)` inside `with begin_nested():` when
   `rows` was empty, which would have pulled `_complete_statement_if_resolved` and the
   undo-pointer write *into* the SAVEPOINT — the exact placement Task 4.2 forbids. Restructured
   to fall through (`if rows:` guards only the batch/ledger insert), so both stay outside for
   the duplicate path exactly as for a normal commit action. Guarded by
   `test_reimport_into_same_list_skips_silently_with_200_and_no_second_ledger_row`.

2. **[Self][High] The story's Alembic revision id does not fit the column.**
   `0024_import_dedup_identity_and_finalize` is 39 characters and `alembic_version.version_num`
   is `VARCHAR(32)` — 0023's docstring flags the limit and its own id is exactly 32. Shortened to
   `0024_import_dedup_identity`; filename unchanged. Verified by a real `upgrade head` →
   `downgrade -1` → `upgrade head` round-trip on Postgres 16.

3. **[Self][Med] Guarded UPDATEs left the returned record echoing pre-update state.**
   Both commit UPDATEs are Core `update()`s, which do not expire the identity map, so a later
   `_session_record` would have reported stale `status` / `dedup_skipped` — the same defect
   4.11's review patch fixed for delete/undo/edit. `_finish_commit_action` now calls the existing
   `_reload_statement`.

4. **[Self][Med] The application fake repo silently diverged from the real one.**
   `set_row_status` did not recompute statement status, so a fake session's statement stayed
   `staged` and the AD-3 retain rule never let a finalize test reach the PDF delete — the test
   passed for the wrong reason. Made the fake mirror `_complete_statement_if_resolved`. This is
   the 4.11 Protocol-drift warning showing up in the fake's *behavior* rather than its signature.

5. **[Self][Low] A tautological assertion.**
   An early draft of `test_assign_duplicate_row_still_resolves_and_stays_undoable` asserted
   `count == 0 or count >= 0`, which can never fail. Removed; the derived counts are asserted
   where they are actually computed (integration tier), since the fake repo stores records
   verbatim rather than deriving.

**Observed, not fixed (out of scope):** the worktree Compose `db` healthcheck interval is
`3600s`, so a freshly recreated `db` container sits at `health: starting` for up to an hour and
`docker compose run` blocks on `depends_on: service_healthy`. Postgres itself is ready in
seconds. Worked around with `--no-deps`; not touched, as it is unrelated to this story.

#### Formal code review (bmad-code-review, 2026-08-23)

Three parallel layers (Blind Hunter, Edge Case Hunter, Acceptance Auditor) against the diff
since `baseline_commit: b085467`. 24 raw findings triaged to 5 patch, 4 defer, 10 dismissed
(disclosed elsewhere, already-mitigated, or unreachable).

**Patch — fixable, unambiguous:**

- [x] [Review][Patch] Landing-list redirect falls back to `lastAcceptedListId` before `/lists`, reintroducing the guessing AC #6 and Task 7.5 explicitly forbid — a fully-duplicate re-import (AC #6's own example) silently lands on a stale list instead of staying put [ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx:201-202]. **Fixed**: removed the `lastAcceptedListId` fallback and its now-dead state; redirect uses `session.landing_list_id` with the `/lists` fallback only, per Task 7.5. Added a regression test for the null-landing-list case.
- [x] [Review][Patch] `errorSessionHasPendingRows` was added as a *required* field on the shared `IndividualReviewMessages` type, forcing a touch to `SessionReviewPanel.tsx` — on the story's own "do not touch" list — when making the field optional would have avoided it [ui/app/upload/uploadClient.ts:75]. **Fixed**: field is now optional with a `?? errorGeneric` fallback in `mapIndividualReviewError`; reverted the line added to `SessionReviewPanel.tsx`.
- [x] [Review][Patch] Bulk-commit computes identity and checks for a duplicate *before* calling `validate_bulk_candidate_row`, while single-row assign validates first — a row that is both invalid and identity-duplicate is silently counted as a skipped duplicate in bulk instead of raising `InvalidCanonicalLineError` [api/application/import_session.py:632-643 vs 779-791]. **Fixed**: bulk loop now validates each candidate before checking its identity against `already_in_list`/`claimed_in_this_action`, matching `AssignCandidateRowService`'s order.
- [x] [Review][Patch] `canonical_identity_key`'s fixed 4-decimal-place rounding assumes amounts are already at persisted `Numeric(18,4)` scale, but nothing enforces that before identity is computed in the bulk path (identities are precomputed for all rows up front, ahead of any validation) — two amounts differing only past 4dp would collide into one identity [api/domain/canonical_line.py:136-139; api/application/import_session.py:620-623]. **Fixed**: `canonical_identity_key` now raises `InvalidCanonicalLineError` if an amount's scale exceeds the 4dp identity quantum, instead of silently rounding.
- [x] [Review][Patch] `deferred-work.md`'s new concurrent-dedup-race note claims the race "requires the same user racing themselves," but `ListMembershipModel` already supports multi-member lists (AD-19) — two different members of a shared list can hit the same race [_bmad-output/implementation-artifacts/deferred-work.md:242]. **Fixed**: corrected the note to state the race applies across any two members of a shared list, not just a user racing themselves.

All 5 patches verified: 667 API pytest (49 integration against Postgres 16) + 342 UI vitest + `tsc --noEmit` all pass after the fixes.

**Defer — real, pre-existing or low-severity, not blocking:**

- [x] [Review][Defer] A `staged` statement with zero candidate rows can never resolve in the individual-review UI (Skip/Accept both no-op on an empty row list) and vacuously satisfies `FinalizeImportSessionService`'s pending-row check — a session can end up `finalized` while `session_needs_source_pdf` still retains its PDF forever. Pre-existing statement-lifecycle edge case, newly interacts with finalize; also untested at the empty-session level [api/application/import_session.py:939-953] — deferred, pre-existing
- [x] [Review][Defer] `ref_quality` is an adapter-emitted hint, not an authoritative signal (documented) — the same transaction reparsed with a different quality classification across two imports produces two different identities and evades dedup. Inherent to the hint-based `external_ref` design this story did not introduce [api/domain/canonical_line.py:105-106] — deferred, pre-existing
- [x] [Review][Defer] `_release_source_pdf_if_idle` deletes the PDF file before the DB flush that clears `pdf_path` / sets `finalized_at` commits — a mid-request failure after the delete leaves a dangling path reference. The helper and its non-atomicity predate this story; this story adds a new, directly user-triggerable `POST /finalize` call site that widens exposure [api/application/import_session.py:949-956] — deferred, pre-existing
- [x] [Review][Defer] `imported_new_count` / `skipped_duplicate_count` share field names across `ImportSessionResponse` (session-lifetime, derived fresh) and `BulkCommitResponse` (scoped to one commit call only) with different scope semantics — worth a naming or doc pass before Story 4.14 wires a summary screen to both [api/api/schemas/import_sessions.py:57-58,90-91] — deferred, pre-existing

**Dismissed as noise (10):** finalize having no UI caller yet / PDF held until 4.13.1 ships (already decided and owned by 4.13.1 per the 4.11 review's deferred-work entry, not new); duplicate-skipped rows invisible to `GET` (already disclosed, owned by 4.13.1); no `import_identity` backfill (deliberate Task 2.6 decision, disclosed); landing-list full-tie UUID tiebreak (deterministic by design, documented, negligible); `mark_session_finalized` stamped on every bulk-commit including no-ops (documented design — "bulk commit *is* the end of review"); the AD-18 amendment being "self-graded" (process note; this review is that independent check); the story title promising a "dedup summary" not rendered here (explicitly scoped to Story 4.14); concurrent double-finalize risk (harmless — `Path.unlink(missing_ok=True)` plus the existing `finalized_at is not None` idempotency guard); `NaN`/`Infinity` count guards on the UI client (unreachable — `JSON.parse` cannot produce non-finite numbers); the finalize BFF route's unguarded `upstream.text()` (identical to every other BFF route in this codebase, not specific to this diff).
