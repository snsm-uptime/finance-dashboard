---
baseline_commit: c04e29c95b54728af1ce6898356b59f5ad44f5df
---

# Story 4.10: Multi-file upload — pending queue, per-item removal, duplicate detection

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Origin note (2026-08-19) — read before starting

This story did not exist in the original `epics.md` sequence. It was added out-of-band at explicit user request during Story 4.6's post-review follow-up, after the user asked to select multiple PDFs at once, remove a queued item before it's processed, and reject duplicate uploads. There is **no PRD FR** and **no EXPERIENCE.md/DESIGN.md flow** for a multi-file picker or a pending-queue UI — J1 (`EXPERIENCE.md` line 167) only narrates picking one PDF. This story's UI shape is therefore new ground, not a spec transcription; keep it minimal and consistent with `UploadPanel.tsx`'s existing list/row style rather than inventing new visual language.

**The user also asked for uploads to "later run in separate threads."** This directly conflicts with an already-**ADOPTED** architecture decision:

> `architecture-finance-helper-2026-08-03/.memlog.md`: "Ingest runtime v1 = in-process synchronous in the API service: upload path detects/splits/parses before review; no job queue in v1 [ADOPTED]"

> `project-context.md` (Compose section, AD-2): "Do not add Redis, workers, or a fourth app service in v1 unless a measured NFR-12 failure forces it" — and under "Never": "add Redis/worker 'just in case'"

**This story does not add a job queue, worker pool, or threading.** It only shapes the client/API boundary (one upload call per file, independent per-file status) so that a *future* move to concurrent/background processing is additive rather than a redesign. Actual concurrent processing requires its own architecture decision via `bmad-correct-course` before it is ever implemented — do not build it here, and do not let "so it can be threaded later" justify adding concurrency now.

## Story

As a user uploading statements,
I want to select multiple PDFs at once, remove one from the batch before it's processed, and be warned if I pick a file I've already queued or staged,
So that I can queue several statements in one pass instead of uploading them one at a time.

## Acceptance Criteria

1. **Given** the Upload page, **when** I open the file picker, **then** I can select more than one PDF at once, and each selected file appears as its own pending entry in a queue before any upload request is sent for it.
2. **Given** a pending (not-yet-processed) entry in the queue, **when** I remove it, **then** it is dropped from the queue with no API call ever made for that file.
3. **Given** an already-processed entry (a staged Import Session shown in the queue), **when** I discard it, **then** the existing per-session discard behavior applies (soft-delete, PDF cleanup) — same contract as today's single-session Discard button, now available per row.
4. **Given** a file whose content is byte-identical to a file already pending in this queue, or to an already-staged (not discarded) Import Session for the current user, **when** I try to queue it, **then** it is rejected inline with a clear "already added" error and is not queued or uploaded. (This is a deliberate broadening of `epics.md`'s draft wording, which scoped the check to "this browser session" — the server-side check is keyed by `user_id`, not by browser/session, since that's the only scope the API can actually enforce; see Task 2.3.)
5. **Given** a queued batch with no duplicates, **when** processing runs, **then** each file is uploaded via its own `POST /import/sessions` call — sequential, one at a time, in-process (no concurrency introduced by this story; see Origin note) — and a single file's rejection (any existing 422/409 error) does not block or discard the others still in the queue.
6. **Given** the batch finishes, **when** I view the result, **then** I see one row per file with its own outcome (queued / uploading / staged with statements / failed / duplicate‑rejected), and each staged row exposes its own Discard action per AC #3.

## Scope Note — what this story does NOT build

- **No concurrent/background processing.** See Origin note. The existing single-file `POST /import/sessions` endpoint (Story 4.6) is reused unchanged, called once per queued file, sequentially.
- **No batch-level API endpoint.** This is a client-side orchestration story, not a new bulk-upload route. (Do not confuse this with Story 4.7 "Bulk review" — 4.7 is about assigning an *already-staged* session's statements to one list; this story is about queuing multiple *uploads* before staging. They are unrelated and do not conflict: 4.7 already operates per `session_id` and has no assumption that only one session exists at a time.)
- **No cap/limit UI beyond a simple default.** This story assumes a soft client-side cap of 10 files per batch (no PRD/NFR number exists for this — see Dev Notes) to keep a naive "select 200 files" case from hammering the single synchronous API worker. Treat this as a starting default, not a hard product requirement — flag if the user wants a different number.
- **No dedup of parsed *ledger rows*.** That's Story 4.9's domain-identity dedup at commit time (AD-18) and is untouched by this story. This story's duplicate check is purely "is this the same PDF file, before it's even parsed" — a different, earlier gate.

## Tasks / Subtasks

- [ ] Task 1: Domain — content-hash duplicate detection (AC: #4)
  - [ ] 1.1 `api/domain/errors.py`: add `DuplicateStatementUploadError(DomainError)` (`CODE = "duplicate_statement_upload"`, message along the lines of "This statement has already been uploaded.", shape like the existing `UnsupportedFileTypeError`/`ImportSessionNotFoundError` added in Story 4.6).
  - [ ] 1.2 `api/domain/import_session.py`: add `compute_pdf_content_hash(content: bytes) -> str` — `hashlib.sha256(content).hexdigest()`. Pure, stdlib-only (AD-1 — no new dependency). This is the *only* duplicate-identity mechanism for this story: exact byte-for-byte match, not filename, not statement period/product — deliberately simple and unambiguous. (A future story could add "same statement period + product already staged" as a softer heuristic; do not build that here, it is a different, fuzzier rule than what AC #4 asks for.)

- [ ] Task 2: Persistence — store and query content hash (AC: #4)
  - [ ] 2.1 `api/adapters/persistence/models.py`: add `content_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)` to `ImportSessionModel` (one hash per uploaded file — matches the existing one-`whole_pdf_path`-per-session shape from Story 4.6, not per-statement). **Nullable, not backfilled**: sessions created before this migration have no hash and simply never participate in dedup — do not write a backfill migration, there is no way to recompute a hash for files that may already be deleted (Story 4.6's cleanup-on-reject / discard-delete paths). Document this tradeoff in Completion Notes.
  - [ ] 2.2 New Alembic migration `api/adapters/persistence/migrations/versions/0017_import_session_content_hash.py` (next revision after `0016_import_sessions.py`, head as of this story): `ALTER TABLE import_sessions ADD COLUMN content_hash VARCHAR(64) NULL`. Add a plain (non-unique) index on `(user_id, content_hash)` — **not** a unique constraint (a discarded session's hash must not block a legitimate re-upload; uniqueness has to be enforced at the *active-sessions-only* application layer, not the schema, since Postgres can't express a partial-unique-among-live-rows constraint as a plain column constraint without a filtered/partial index — use `postgresql_where=text("discarded_at IS NULL")` on the index if you want DB-level defense-in-depth, but the domain error from Task 1.1/3.x is the actual enforcement path either way).
  - [ ] 2.3 `api/adapters/persistence/import_sessions.py` (`SqlAlchemyImportSessionRepository`): add `find_active_session_by_content_hash(user_id: UUID, content_hash: str) -> bool` — `SELECT 1 FROM import_sessions WHERE user_id = :user_id AND content_hash = :content_hash AND discarded_at IS NULL LIMIT 1`, plus store `content_hash` on `create_session()` (new required kwarg).
  - [ ] 2.4 Add `find_active_session_by_content_hash` to the `ImportSessionRepository` Protocol in `api/application/import_session.py`, and `content_hash: str` to `create_session()`'s signature there too.

- [ ] Task 3: Application — duplicate check before storage (AC: #4, #5)
  - [ ] 3.1 `UploadStatementPdfService.execute()` (`api/application/import_session.py`): compute `content_hash = compute_pdf_content_hash(command.content)` **immediately after `validate_pdf_upload`, before `self._pdf_storage.save(...)`**. Call `self._session_repo.find_active_session_by_content_hash(command.actor_user_id, content_hash)`; if `True`, raise `DuplicateStatementUploadError()` **without ever calling `pdf_storage.save()`** — this is the one place in the whole upload path where the file is rejected *before* touching disk, unlike the existing `UnknownBankAdapterError`/etc. paths (Story 4.6) which save first and clean up after. Get this ordering right — checking after save would mean writing-then-deleting a duplicate's bytes for no reason, and would need the same cleanup-on-reject wrapping Story 4.6 already built for the other error types (don't duplicate that wrapping here, avoid it by checking first).
  - [ ] 3.2 Pass `content_hash=content_hash` through to `create_session(...)`.
  - [ ] 3.3 Unit tests (fakes, no DB — `api/tests/test_import_session_application.py` pattern already established): same content twice for the same user with the first session still active → second raises `DuplicateStatementUploadError`, storage never called; first session discarded → re-upload of the same content now succeeds; same content, different `user_id` → both succeed (no cross-user dedup — hash+user_id is the key, not hash alone).

- [ ] Task 4: API — error mapping (AC: #4, #5)
  - [ ] 4.1 `api/api/routes/import_sessions.py`: add an `except DuplicateStatementUploadError` branch to `upload_statement_pdf`, mapping to `409 Conflict` with `{"detail": str(exc), "code": "duplicate_statement_upload"}` — 409 (not 422) because this is a conflict with existing server state, not a malformed request; mirrors the "409 or 422, developer's call, document which" note Story 4.7 already left for its own conflict case. Document the 409 choice in this story's Completion Notes so 4.7 doesn't have to re-decide it.
  - [ ] 4.2 Integration test (`api/tests/test_import_sessions_integration.py` pattern): upload same fixture PDF twice while the first session is still active → second returns 409 `duplicate_statement_upload`, no second session row created, no second file written to `PDF_STORAGE_PATH`; discard the first, re-upload the same bytes → 201.

- [ ] Task 5: UI — pending queue + multi-select (AC: #1, #2, #4, #5, #6)
  - [ ] 5.1 `ui/app/upload/UploadPanel.tsx`: replace the single `session: ImportSession | null` state (Story 4.6, plus today's "block second upload while a session is active" gate — **this story removes that gate and replaces it with the queue**, do not layer multi-file on top of it) with a queue of entries, e.g. `type QueueEntry = { id: string; file: File; state: "pending" | "uploading" | "staged" | "failed" | "duplicate"; session?: ImportSession; error?: string }`, held in `useState<QueueEntry[]>([])`.
  - [ ] 5.2 File `<input>` gets the `multiple` attribute; `onFileChange` iterates `event.target.files`, for each file: compute a quick client-side dedup key (recommended: hash via `crypto.subtle.digest("SHA-256", await file.arrayBuffer())` — same algorithm as the server's `compute_pdf_content_hash`, giving instant "already in this queue" feedback without a round trip; acceptable fallback if `crypto.subtle` support is a concern: compare `name`+`size`+`lastModified` — weaker, document the tradeoff if chosen) against files already `pending`/`uploading`/`staged` in the queue; if it matches, add a `"duplicate"` entry with an inline error instead of queuing it for upload. This is a **client-side pre-filter only** — the server's `content_hash` check (Task 3) remains the actual enforcement authority for cross-session duplicates (a file staged in an earlier visit, not in this queue).
  - [ ] 5.3 Enforce the soft 10-file batch cap (Scope Note) client-side with a clear inline message if exceeded — do not silently truncate the selection.
  - [ ] 5.4 Process the queue **sequentially** (`for` loop with `await`, not `Promise.all`/`allSettled`) — one `uploadStatement()` call in flight at a time. This matters: the api process handles requests synchronously per Story 4.6/architecture (no job queue), so firing N concurrent requests from the browser would queue up blocking `pdfplumber` work on the same worker rather than actually parallelizing anything, and makes partial-failure bookkeeping harder for no benefit.
  - [ ] 5.5 Each queue row renders per its `state` (reuse the existing `statusStagedClass`/`statusFailedClass` pattern from 4.6, extend with a duplicate/rejected style) and gets its own action: pending → remove button (client-only, Task 5's own new i18n string, no API call); staged → the existing `discardSession()` wired per-row instead of the single global button Story 4.6 built.
  - [ ] 5.6 `ui/app/upload/uploadClient.ts`: no new functions needed — `uploadStatement`/`discardSession` are reused as-is per queue item. Add the `409 duplicate_statement_upload` code to `mapError()` with a new message key (do not reuse `errorUnreadableStatement`/`errorUnknownStatement` — this is a different failure class the user should be able to tell apart, same reasoning Story 4.6's review applied to splitting `unknown_bank_adapter`/`ambiguous_bank_adapter`).
  - [ ] 5.7 `ui/lib/i18n/upload.ts`: add EN+ES keys for: remove-pending-item action label, "already added to this batch" (client-side dup), `errorDuplicateStatement` (server 409), and the 10-file-cap message. Follow the existing per-domain TS object convention — do not create a new i18n file for this.
  - [ ] 5.8 Styling: Tailwind utilities co-located (Epic 3.5 / AD-23), no new `.module.css` — extend the existing inline utility classes already in `UploadPanel.tsx` rather than introducing a new styling approach for the queue rows.

- [ ] Task 6: UI tests (AC: #1, #2, #4, #5, #6)
  - [ ] 6.1 `ui/app/upload/UploadPanel.test.tsx`: multi-select renders N pending rows; remove on a pending row drops it with `uploadStatement` never called for that file; two identical files selected together → second is flagged duplicate client-side, only one `uploadStatement` call fires; sequential processing — assert call order/timing via mock resolution order, not `Promise.all` races; a mid-batch failure (mock one call rejecting) leaves other rows unaffected; per-row discard on a staged entry calls `discardSession` with that row's session id only.
  - [ ] 6.2 `ui/app/upload/uploadClient.test.ts`: `mapError` maps `409`/`duplicate_statement_upload` to the new message key.

- [ ] Task 7: Story-close overview (required before `done` — see Dev Notes)

## Dev Notes

### Why this is smaller than it sounds

The backend already supports multiple concurrent Import Sessions per user — `UploadStatementPdfService.execute()` (Story 4.6) mints a fresh `session_id` on every call with no uniqueness constraint preventing two active sessions for the same user. **Nothing about "multiple sessions at once" requires new backend architecture.** The only genuinely new backend piece is the content-hash duplicate gate (Tasks 1–4); everything else is: (a) reuse the existing single-file upload/discard endpoints per queue item, (b) a client-side orchestration loop. Do not build a new "batch" domain concept, table, or endpoint.

### The one architecture line this story must not cross

Quoting `project-context.md` verbatim because it is easy to over-read "multiple files" as "let's parallelize them":

> "**Do not** add Redis, workers, or a fourth app service in v1 unless a measured NFR-12 failure forces it (AD-2)" / Never: "add Redis/worker 'just in case'"

Sequential client-side processing (Task 5.4) is a deliberate choice, not a placeholder for "do it properly later inside this story." If a future story wants real concurrency, it goes through `bmad-correct-course` first (this reverses an ADOPTED decision, not just extends one) — this story's job is only to make that reversal *additive* (stable per-file request shape, independent per-file status) rather than a redesign.

### What "duplicate" means here vs. Story 4.9

- **This story (upload-time):** byte-identical PDF content, checked before parsing even starts, scoped to `(user_id, content_hash)` among the user's *active* (non-discarded) sessions. Purely mechanical — no statement parsing involved.
- **Story 4.9 (commit-time):** `compute_canonical_identity` (`domain/canonical_line.py`, Story 4.4) dedups *parsed ledger rows* by domain identity (external_ref or a fallback tuple), independent of which file they came from. A user could legitimately re-upload a statement covering an overlapping date range from a different export — same ledger rows, different file bytes — and 4.9's dedup (not this story's) is what catches that. Do not conflate the two; this story's check is strictly narrower and earlier in the pipeline.

### Hexagonal placement (AD-1)

Same boundaries as Story 4.6: `compute_pdf_content_hash` and `DuplicateStatementUploadError` are pure domain (no FastAPI/SQLAlchemy/pdfplumber imports); the duplicate query lives in `adapters/persistence`; `application/import_session.py` composes the check into the existing service; `api/routes/import_sessions.py` stays a thin HTTP translation layer; `ui` talks to `api` only via the existing same-origin BFF routes under `ui/app/api/import/` (Story 4.6) — no changes needed there, they already forward whatever the browser sends.

### Files you will modify (read fully before editing)

- `api/domain/errors.py`, `api/domain/import_session.py` — Story 4.6's files, read `validate_pdf_upload` before adding `compute_pdf_content_hash` alongside it.
- `api/application/import_session.py` — read `UploadStatementPdfService.execute()` in full; note it currently wraps `run_import_pipeline`+`create_session` in one `try/except Exception` that deletes the saved PDF on *any* failure (added in Story 4.6's code-review pass) — the new duplicate check must run **before** this block, not inside it, since a duplicate should never reach `pdf_storage.save()` at all.
- `api/adapters/persistence/import_sessions.py`, `api/adapters/persistence/models.py` — read the existing `ImportSessionModel`/`create_session()`/`_session_record()` shapes before extending them.
- `ui/app/upload/UploadPanel.tsx` — read in full; this story replaces its single-`session` state model, not appends to it. The most recent change on this file (uncommitted as of this story's creation) added a "block second upload while a session is active" input-disable gate specifically because there was no queue yet — that gate's *purpose* (don't silently drop/replace an active session) is subsumed by the queue, but its *mechanism* (disable the whole input) must be removed, not kept alongside the new multi-select behavior.
- `ui/app/upload/uploadClient.ts`, `ui/lib/i18n/upload.ts` — extend `mapError`/`UploadMessages`/`uploadMessages` following the exact pattern already used for `errorAmbiguousStatement` (added in the same recent pass).

### Testing Requirements (project-context "Discipline" + "Layers")

- Domain: pure unit test for `compute_pdf_content_hash` (same bytes → same hash; different bytes → different hash) — trivial but keep it, matches the "Unit: domain Decimal + fake FX" layer discipline pattern for any new pure function.
- Application: unit tests with fakes, no DB (`_FakeImportSessionRepo`/`_FakePdfStorage` already exist in `test_import_session_application.py` — extend them with `find_active_session_by_content_hash`, don't build new fakes).
- Integration: Postgres-gated `TestClient` (`test_import_sessions_integration.py`) for the 409 path.
- UI: extend `UploadPanel.test.tsx`'s existing `vi.mock("./uploadClient", ...)` pattern; no new test infrastructure needed.
- Money/date rules (AD-5, dates) are untouched by this story — no new assertions needed there.

### Story-close overview (required before `done`)

Per `_bmad-output/implementation-artifacts/story-close-overview-checklist.md`, paste the four-section template (Request path / Key components / Why this shape / What not to break) into Completion Notes before marking this story `done` — see `4-6-upload-pdf-detect-split-import-session.md`'s Completion Notes for the expected format once that section exists there.

### Project Structure Notes

- Next Alembic revision: `0017` (head is `0016_import_sessions.py` as of this story's creation — reconfirm before writing the migration in case another story lands first).
- No new files under `api/domain`, `api/application`, or `api/adapters/persistence` beyond what's listed in Tasks 1–2 — this story extends Story 4.6's modules, it does not create parallel ones.
- No new UI route/page — `ui/app/upload/page.tsx` and the BFF routes under `ui/app/api/import/` (Story 4.6) are untouched; all changes are inside `UploadPanel.tsx` + its client/i18n co-files.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.10: Multi-file upload — pending queue, per-item removal, duplicate detection] — ACs, story statement (added alongside this story file).
- [Source: _bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/.memlog.md] — "Ingest runtime v1 = in-process synchronous... no job queue in v1 [ADOPTED]" — the binding constraint on Task 5.4 and the Origin note.
- [Source: _bmad-output/project-context.md#Compose / AD-2] — "Do not add Redis, workers, or a fourth app service in v1 unless a measured NFR-12 failure forces it"; "Never... add Redis/worker 'just in case'".
- [Source: _bmad-output/implementation-artifacts/4-6-upload-pdf-detect-split-import-session.md] — the service/repository/route/UI shapes this story extends; its own code-review pass (2026-08-19) is the direct predecessor of every file this story touches.
- [Source: _bmad-output/implementation-artifacts/4-7-bulk-review-assign-commit-path.md] — per 4.7's still-unimplemented draft (status: `ready-for-dev`, not `done` — written before Story 4.6 existed, full of `[VERIFY AGAINST 4.6 SCHEMA]` placeholders), its design is `session_id`-scoped with no single-active-session assumption, so no conflict with this story is expected — re-verify once 4.7 actually lands and those placeholders are resolved against real code.
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/EXPERIENCE.md] line 167 — J1 only narrates a single-PDF pick; no multi-file/queue UX is specified anywhere in DESIGN.md/EXPERIENCE.md, confirmed by grep — this story's UI shape is new, keep it minimal.
- [Source: _bmad-output/planning-artifacts/prds/prd-finance-helper-2026-08-02/prd.md#FR-13, FR-14, FR-15] — no FR covers multi-file selection or upload-time duplicate detection; closest is FR-20's post-*commit* dedup summary, which is a different mechanism (see Dev Notes "What 'duplicate' means here vs. Story 4.9").

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

- 2026-08-19: Story created via `bmad-create-story`, out of epic sequence at explicit user request during Story 4.6's post-review follow-up. No PRD FR or EXPERIENCE.md flow exists for this scope — see Origin note. Threading/concurrency explicitly deferred (conflicts with an ADOPTED architecture decision); status → ready-for-dev.
