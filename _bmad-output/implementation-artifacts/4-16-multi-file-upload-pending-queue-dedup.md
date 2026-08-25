---
baseline_commit: 8b30ed608c6074c6b32b6d0617ce1be58e59999a
---

# Story 4.16: Multi-file upload — pending queue, per-item removal, duplicate detection

Status: done

> **Renumbered 2026-08-20: was Story 4.10.** Epic 4 was reordered so numeric order matches build
> order (Sprint Change Proposal 2026-08-20). Independent of review granularity; can ship in
> parallel with 4.13.1 / 4.14 / 4.15. Historical proposals may still say `4-10-multi-file-…`.

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Origin note — read before starting

This story was added out-of-band (2026-08-19) after Story 4.6: select several PDFs, remove a queued item before upload, reject duplicates. There is **no PRD FR** and **no EXPERIENCE.md / DESIGN.md flow** for a multi-file picker or pending queue. J1 only narrates picking **one** PDF (multi-statement **inside** that file is FR-15 / Story 4.6, not this story). Keep UI minimal and consistent with Warm Balance / existing upload Tailwind — do not invent a new visual language.

**"Later run in separate threads" is out of scope.** Ingest is in-process synchronous on `api`; no Redis, workers, or extra Compose service (AD-2). This story only makes a future concurrency move *additive* (one `POST /import/sessions` per file, independent per-file status). Do not add a job queue or `Promise.all` uploads.

## Story

As a user uploading statements,
I want to select multiple PDFs at once, remove one from the batch before it's processed, and be warned if I pick a file I've already queued or staged,
so that I can queue several statements in one pass instead of uploading them one at a time.

## Acceptance Criteria

1. **Given** the Upload page, **when** I open the file picker, **then** I can select more than one PDF at once, and each selected file appears as its own pending queue entry **before** any upload request is sent for it.
2. **Given** a pending (not-yet-processed) entry, **when** I remove it, **then** it is dropped from the queue with **no** API call for that file.
3. **Given** a staged Import Session row in the queue, **when** I discard it, **then** existing per-session discard applies (`DELETE /import/sessions/{id}`, soft-delete + PDF cleanup) — same contract as today's Discard, per row.
4. **Given** a file whose bytes are identical to (a) a file already `pending` / `uploading` / `staged` in **this tab's queue**, or (b) an **active** Import Session for this user (`discarded_at IS NULL` and `finalized_at IS NULL`) that has a stored `content_hash`, **when** I try to queue or upload it, **then** it is rejected with a clear "already added" error and is not queued as a new upload (client pre-filter for (a); server 409 for (b)).
5. **Given** a queued batch with no in-queue duplicates, **when** processing runs, **then** each file is uploaded via its own `POST /import/sessions` — **sequential**, one at a time, in-process — and one file's 422/409/5xx does not discard or cancel the remaining queue.
6. **Given** the batch finishes, **when** I view the result, **then** I see one row per file with its own outcome (`pending` / `uploading` / `staged` / `failed` / `duplicate`) and each staged row exposes Discard (AC #3) plus the existing resume-review path for that session.

**Deliberate AC broadening vs `epics.md`:** epics wording scopes staged-file dupes to "this browser session." The API can only enforce `(user_id, content_hash)` among **active** sessions. Client SHA-256 covers same-picker / same-tab queue. Do not implement a weaker filename-only server check.

## Scope — do not build

- No job queue, worker, Redis, threading, or concurrent `uploadStatement` calls.
- No batch-upload API. Do not confuse with Story 4.7 bulk **review** (assign an already-staged session to one list).
- No ledger / `compute_canonical_identity` / FR-20 skip counts — that is Story 4.12 at **commit**.
- No `GET` list-all-sessions endpoint. `GET /import/sessions/active` stays "most recent one" (Story 4.14). See coexistence note below.
- No unique DB constraint on `content_hash` (discarded/finalized hashes must not permanently block re-upload).
- Soft client cap of **10** files per picker batch (not a PRD/NFR number). Do not silently truncate; show an inline message.

## Tasks / Subtasks

- [x] Task 1: Domain — content-hash + error (AC: #4)
  - [x] 1.1 `api/domain/errors.py`: `DuplicateStatementUploadError(DomainError)` with `CODE = "duplicate_statement_upload"` and a MESSAGE like `"This statement has already been uploaded."` — same shape as `UnsupportedFileTypeError`.
  - [x] 1.2 `api/domain/import_session.py`: `compute_pdf_content_hash(content: bytes) -> str` = `hashlib.sha256(content).hexdigest()` (64 lowercase hex). Stdlib only (AD-1). Exact bytes only — not filename, period, or product.

- [x] Task 2: Persistence (AC: #4)
  - [x] 2.1 `ImportSessionModel`: `content_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)`. **No backfill** — pre-4.16 sessions never participate in hash dedup (PDF may already be deleted).
  - [x] 2.2 Alembic **`0026_import_session_content_hash.py`**, `revision = "0026_import_session_content_hash"` (keep id ≤ 32 chars), **`down_revision = "0025_import_reviewed_at"`**. `ADD COLUMN content_hash VARCHAR(64) NULL`. Non-unique index on `(user_id, content_hash)` with `postgresql_where=text("discarded_at IS NULL AND finalized_at IS NULL")` if used as defense-in-depth — **application check is the contract**. Reconfirm HEAD is still `0025_import_reviewed_at` before writing.
  - [x] 2.3 `SqlAlchemyImportSessionRepository.create_session`: persist `content_hash` (`str | None = None` so existing test factories that mint sessions without an upload stay valid). Production upload **must** pass the hash.
  - [x] 2.4 Add `find_active_session_by_content_hash(user_id: UUID, content_hash: str) -> bool`: `SELECT 1 … WHERE user_id AND content_hash AND discarded_at IS NULL AND finalized_at IS NULL LIMIT 1`.
  - [x] 2.5 Protocol `ImportSessionRepository` in `api/application/import_session.py`: same method + `create_session(..., content_hash: str | None = None)`.

- [x] Task 3: Application — check **before** disk (AC: #4, #5)
  - [x] 3.1 In `UploadStatementPdfService.execute()`: after `validate_pdf_upload`, **before** `pdf_storage.save`: compute hash; if `find_active_session_by_content_hash` → raise `DuplicateStatementUploadError` (no save, no pipeline). Then save → existing `try` / `except Exception` PDF delete (Story 4.6 review patch) unchanged.
  - [x] 3.2 Pass `content_hash=` into `create_session`.
  - [x] 3.3 Unit tests in `api/tests/test_import_session_application.py` — extend `_FakeImportSessionRepo` (do not invent a second fake): same bytes + first session still active → second raises, `storage.saved` unchanged; first discarded **or** finalized → re-upload succeeds; same bytes, different `user_id` → both succeed.

- [x] Task 4: HTTP mapping (AC: #4, #5)
  - [x] 4.1 `upload_statement_pdf` in `api/api/routes/import_sessions.py`: `except DuplicateStatementUploadError` → **409** `{"detail": str(exc), "code": "duplicate_statement_upload"}` (conflict with existing state, not 422 malformed). Explicit `JSONResponse` like the other upload catches — do not stuff this into row `_ERROR_MAP` tuples.
  - [x] 4.2 Integration (`api/tests/test_import_sessions_integration.py`): same fixture PDF twice while first is active → 409, no second session row, no second file under `PDF_STORAGE_PATH`; discard first → 201. Optionally: finalize first (if a helper exists) → re-upload 201.

- [x] Task 5: UI queue (AC: #1–#6)
  - [x] 5.1 `UploadPanel.tsx`: replace exclusive `session | null` + hidden picker (`session ? SessionReviewPanel : picker`) with a **queue** plus a picker that **stays available**. Suggested:

    `type QueueEntry = { id: string; file?: File; contentHash?: string; state: "pending" | "uploading" | "staged" | "failed" | "duplicate"; session?: ImportSession; error?: string; displayName: string }`

    Seed one `staged` row from `initialSession` when present (Story 4.14 SSR). Do **not** keep `if (!file || session) return`.
  - [x] 5.2 `<input multiple accept="application/pdf">`. On change, iterate **all** `FileList` entries. Client SHA-256 via `crypto.subtle.digest("SHA-256", await file.arrayBuffer())` → 64-char hex (same as Python `hexdigest()`). Match against queue entries in `pending` | `uploading` | `staged` that already have a hash; duplicates become `duplicate` rows with inline copy — **not** uploaded. Fallback if SubtleCrypto unavailable: `name`+`size`+`lastModified` and document in Completion Notes. Server remains authority for other-tab / prior-visit actives.
  - [x] 5.3 Soft cap 10: if a selection would push pending+uploading+staged above 10, show cap copy and do not enqueue the overflow. No silent truncate.
  - [x] 5.4 Drain **sequentially** (`for` + `await`, single in-flight upload). If the user adds more files while a drain is running, append `pending` and let the same drain (or a re-entrant-safe continuation) pick them up — **never** start a second parallel drain. Do **not** use `useFormSubmission` as the batch engine (it is one-shot global pending); per-row `state` is the source of truth. `UploadButton` may show busy while **any** row is `uploading`, but the file input must remain usable to append.
  - [x] 5.5 Row UI (Tailwind only, no new `.module.css`): pending → Remove (no API); uploading → busy; staged → reuse discard via `discardSession(session.id)` **and** keep resume (`SessionReviewPanel` **or** compact row + link to `/upload/review/{id}` — do not mount N full review panels). failed → mapped error; duplicate → client or server copy. After discard of the hydrated 4.14 session, `forgetOpenImportSession` as today.
  - [x] 5.6 `uploadClient.ts` `mapError` + `UploadMessages`: map `duplicate_statement_upload` → new `errorDuplicateStatement`. Do not reuse unknown/ambiguous/unreadable keys. `uploadStatement` / `discardSession` signatures stay per-file / per-id.
  - [x] 5.7 `ui/lib/i18n/upload.ts` EN+ES: remove-pending label, in-queue already-added, `errorDuplicateStatement`, 10-file cap. Same `uploadMessages` object — no new i18n file.
  - [x] 5.8 `rememberOpenImportSession`: still **one** id — last successfully staged session in this tab (including `initialSession` effect). Do not invent multi-id storage in this story.

- [x] Task 6: UI tests (AC: #1, #2, #4, #5, #6)
  - [x] 6.1 `UploadPanel.test.tsx`: replace **"unmounts the file picker while a session is active"** — picker must remain. Cover: N pending rows from `multiple`; pending Remove never calls `uploadStatement` for that file; two identical files in one selection → one upload; sequential order (mock resolve order); mid-batch reject leaves other rows; staged discard calls `discardSession` with that id; `initialSession` seeds a staged row **without** hiding the input.
  - [x] 6.2 `uploadClient.test.ts`: 409 + `duplicate_statement_upload` → new message.

- [x] Task 7: Story-close overview (four-section template in Completion Notes) before `done`.

### Review Findings

Group A (API hash/dedup) — 2026-08-25

- [x] [Review][Patch] Put the blocking session id on 409 so the client can discard/resume that session [api/api/routes/import_sessions.py:241]
- [x] [Review][Patch] Use `DuplicateStatementUploadError.CODE` in the 409 JSON body [api/api/routes/import_sessions.py:244]
- [x] [Review][Patch] Mirror the Alembic partial index on `ImportSessionModel.__table_args__` [api/adapters/persistence/models.py:411]
- [x] [Review][Patch] Assert `content_hash` is persisted (application `create_calls` + integration surviving row) [api/tests/test_import_session_application.py:1837] [api/tests/test_import_sessions_integration.py:251]

- [x] [Review][Defer] Concurrent same-hash uploads can both pass the application check [api/application/import_session.py:464] — deferred, later hardening story: UI drain is sequential; spec forbids a unique `content_hash` constraint
- [x] [Review][Defer] Upload 409 is an undeclared `JSONResponse` beside a 201 `response_model` [api/api/routes/import_sessions.py:200] — deferred, pre-existing

Group B (upload queue UI) — 2026-08-25

- [x] [Review][Decision] Duplicate rows use a hover/focus tooltip instead of inline copy — kept icon + tooltip (side-UI cue; spec treated as satisfied)

- [x] [Review][Patch] Show staged discard errors on the row [ui/app/upload/UploadPanel.tsx:304]
- [x] [Review][Patch] Don't leave in-flight rows stuck `uploading` after leaving the page [ui/app/upload/UploadPanel.tsx:157]
- [x] [Review][Patch] Catch `hashFile` failures and fall back to name+size+mtime [ui/app/upload/UploadPanel.tsx:45]
- [x] [Review][Patch] Keep the picker usable while a row is `uploading` (Task 5.4) [ui/app/upload/UploadPanel.tsx:268]
- [x] [Review][Patch] Serialize overlapping `onFileChange` so a second pick cannot overwrite the first batch [ui/app/upload/UploadPanel.tsx:197]
- [x] [Review][Patch] Let the user dismiss a `failed` row [ui/app/upload/UploadPanel.tsx:317]
- [x] [Review][Patch] Use 409 `duplicateSessionId` as the resume/discard target [ui/app/upload/UploadPanel.tsx:179]

- [x] [Review][Defer] Unrelated `uploadMessages` rewrites (completion copy, account-page default-list) [ui/lib/i18n/upload.ts] — deferred, Group C side-UI/docs
- [x] [Review][Defer] 10-file cap and SubtleCrypto fallback have no UI tests [ui/app/upload/UploadPanel.test.tsx] — deferred, Task 6.1 did not require them

Group C (side UI/behavior) — 2026-08-25

- [x] [Review][Defer] SoftLedgerSelect blurs the trigger after choose, including keyboard Enter/Space [ui/components/soft-ledger/Select.tsx] — shipped: listbox ArrowUp/Down + Enter/Space confirm, blur-after-choose so review keys work; ↑ opens the picker from the card

- [x] [Review][Patch] Manual expense submit still sends stale `payerId` / `assigneeId` when the select shows empty [ui/app/lists/ManualExpenseForm.tsx:250]
- [x] [Review][Patch] Default-list Accept is enabled when `default_import_list_id` is not in loaded memberships [ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx:415]
- [x] [Review][Patch] Chrome Back sets `leavingRef` before `router.push` and never clears it [ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx:346]
- [x] [Review][Patch] Card-identification spinner reuses session-loading `aria-label` [ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx:931]

- [x] [Review][Defer] Chrome back no longer discards; Continue removed; receipt/owe Discard/spinner/seed/blur undocumented [ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx:346] — **documented in Group D** (4.16 close + 4.14/4.13.1 notes)
- [x] [Review][Defer] Signup still creates Personal without `default_import_list_id` [api/application/signup.py] — deferred, seed-only (`seed_dev_user.py` **does** set Personal); production signup still empty default
- [x] [Review][Defer] Settle refund polarity extra cases (reversal line type, overrides) [api/domain/settle.py:108] — deferred, out of 4.16 ACs; abs+sign invert is the intended refund fix
- [x] [Review][Defer] Review/bulk/completion rewrites were out of 4.16 “leave alone” list [ui/app/upload/review] — deferred, shipped on this branch by design

Group D (docs vs shipped UI) — 2026-08-25

- [x] [Review][Patch] 4.16 story-close omits SubtleCrypto fallback, 409-vs-422, no hash backfill, review chrome/keyboard/Select/seed-vs-signup, and `Select.tsx` from the File List [_bmad-output/implementation-artifacts/4-16-multi-file-upload-pending-queue-dedup.md:248]
- [x] [Review][Patch] 4.14 still requires Continue and chrome-Back discard; Completion Notes empty; review bullets still describe `saveAction` `router.push` and summary Back “home” [_bmad-output/implementation-artifacts/4-14-resume-entry-point-session-completion-summary.md:37]
- [x] [Review][Patch] 4.13.1 AC #3 still says Save lands on `landing_list_id`; owe-colored sheet Discard is undocumented [_bmad-output/implementation-artifacts/4-13-1-import-review-sheet.md:37]
- [x] [Review][Patch] Group C findings still say seed does not set `default_import_list_id` and Select blur is unimplemented [_bmad-output/implementation-artifacts/4-16-multi-file-upload-pending-queue-dedup.md:118]

- [x] [Review][Defer] Signup still creates Personal without `default_import_list_id` [api/application/signup.py] — deferred, pre-existing; only `seed_dev_user.py` sets the preference
- [x] [Review][Defer] `hasRemainingUploadWork` is in-memory tab queue only [ui/app/upload/uploadQueueStore.ts:41] — deferred, 4.16 tab-lifetime by design; reload makes finalized Back land on the list
- [x] [Review][Defer] Sheet Discard still deletes at Save rather than unassign-to-pending [ui/app/upload/review/[sessionId]/ImportReviewSheet.tsx:266] — deferred, already recorded in 4.13.1 Deviations (Change List is unassign)

## Dev Notes

### Why this is smaller than it sounds

Backend **already allows** many non-discarded, non-finalized sessions per user (`uuid4()` per upload; integration test uploads three and `GET /active` returns the newest). No new session/batch aggregate. New backend = hash column + lookup + 409. UI = queue orchestration on existing BFF `POST /api/import/sessions` and `DELETE …/sessions/{id}`.

### Current code (read before editing)

**Upload service today** (`UploadStatementPdfService.execute`, ~453–522 in `api/application/import_session.py`):

1. `validate_pdf_upload` (PDF magic) — reject before storage.
2. `pdf_storage.save` **then** `run_import_pipeline` + card match + `create_session`.
3. Broad `except Exception`: delete just-saved PDF, re-raise (4.6 review — do not nest the duplicate check inside this `try`; duplicates must never `save`).
4. `_release_source_pdf_if_idle` after create if nothing staged/failed.

**Session model:** `content_hash` does **not** exist. PDF path is on `ImportStatementModel.pdf_path`, not the session. `create_session` kwargs today: `session_id`, `user_id`, `statements`, `pdf_paths` only. Production caller is `UploadStatementPdfService`; many integration tests call `repo.create_session` directly — keep `content_hash` optional on the repo.

**Protocol:** adding `find_active_session_by_content_hash` requires `_FakeImportSessionRepo` in `test_import_session_application.py` only (grep: that is the sole fake).

**Alembic HEAD:** `0025_import_reviewed_at` (Story 4.15). Next file is **0026**, not 0017 (0017 is already `import_batches`).

**Upload UI today:** `UploadPanel` hides the picker whenever `session` is set and `onFileChange` ignores picks if `session` is set. Tests lock that in. 4.16 **inverts** it: queue + picker coexist. `page.tsx` SSR `GET /import/sessions/active` and BFF routes stay as-is.

**`useFormSubmission`:** fine for single-file historically; a sequential queue with per-row errors will fight a single `pending`/`error`. Prefer local state + a drain lock (`useRef`).

### 4.14 coexistence (must not regress)

| Behavior | Keep |
|----------|------|
| `GET /import/sessions/active` | Newest active session only |
| `page.tsx` hydrates `initialSession` | Seed **one** staged queue row; **picker stays up** |
| `openImportSession` sessionStorage | Single id |
| Older active sessions | Remain in DB; **not listed** after refresh if they are not the newest. Do not auto-discard them. Full multi-session resume list is **out of scope** (follow-up if product wants it). |
| `SessionReviewPanel` classify/resume/discard | Still valid for a **staged** row's session; do not delete this component |

### Duplicate: 4.16 vs 4.12

| | 4.16 upload | 4.12 commit |
|--|-------------|-------------|
| Key | SHA-256 of PDF bytes | `compute_canonical_identity` / `import_identity` |
| When | Before parse / before `save` | Per destination list at commit |
| Same statement, different export bytes | Not a 4.16 hit | 4.12 skip |
| Same bytes, already **finalized** | Allowed to upload again (hash lookup excludes `finalized_at`) | 4.12 still skips ledger dupes |
| Same bytes, still reviewing | 409 | N/A |

### Hex / stack

- Hash + error in `domain/`; query in `adapters/persistence`; composition in `application/`; HTTP in `api/routes`. UI HTTP-only via existing BFF.
- Money/dates/FX untouched. i18n: per-domain TS objects. Styling: Tailwind co-located (AD-23); `UploadButton.module.scss` stays for the trigger only.
- Python 3.12 / FastAPI / Next 16 — no new deps. `hashlib` + `crypto.subtle` only.

### Files to modify

| Path | Change |
|------|--------|
| `api/domain/errors.py` | New error |
| `api/domain/import_session.py` | `compute_pdf_content_hash` |
| `api/application/import_session.py` | Protocol + check-before-save + `create_session` hash |
| `api/adapters/persistence/models.py` | `content_hash` |
| `api/adapters/persistence/import_sessions.py` | persist + lookup |
| `api/adapters/persistence/migrations/versions/0026_import_session_content_hash.py` | **NEW** |
| `api/api/routes/import_sessions.py` | 409 mapping |
| `api/tests/test_import_session_application.py` | Fake + unit tests |
| `api/tests/test_import_sessions_integration.py` | 409 path |
| `ui/app/upload/UploadPanel.tsx` | Queue model |
| `ui/app/upload/UploadPanel.test.tsx` | Invert picker-hidden test; queue cases |
| `ui/app/upload/uploadClient.ts` | `mapError` + `UploadMessages` |
| `ui/app/upload/uploadClient.test.ts` | 409 mapping |
| `ui/lib/i18n/upload.ts` | EN+ES keys |

### Files to leave alone unless a compile error forces a touch

- `ui/app/upload/page.tsx` (SSR active session)
- `ui/app/api/import/**` (BFF already forwards multipart)
- `compute_canonical_identity` / commit/finalize services

This branch **also shipped** review/bulk/completion/`Select.tsx`/`seed_dev_user.py` changes (author intent). Do not revert those to match older 4.14/4.13.1 story text; the story-close and 4.14/4.13.1 notes below are the live contract.

- Review/bulk routes / `SessionReviewPanel.tsx` — originally “compose only”; rewritten on this branch (see Completion Notes).

### Testing

- Domain: same bytes → same hash; different bytes → different hash.
- Application: fakes, no DB; assert `storage.saved == []` on duplicate.
- Integration: Postgres 16 + real `FilesystemPdfStorage` (existing file pattern).
- UI: existing jsdom `createRoot`/`act` + `vi.mock("./uploadClient")`. Extend `fakeFileList` to multiple files.

### Story-close overview

Paste the four sections from `_bmad-output/implementation-artifacts/story-close-overview-checklist.md` into Completion Notes before `done`.

### Project structure

- One story, one branch: `feat/4/4-16-multi-file-upload-pending-queue-dedup`.
- Generic fixture vocabulary only; never commit real bank PDFs.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` — Story 4.16] — ACs; ingest-architecture AC (sequential, no threads).
- [Source: `_bmad-output/planning-artifacts/sprint-change-proposal-2026-08-20.md`] — independent of row-level review reorder.
- [Source: `_bmad-output/planning-artifacts/sprint-change-proposal-2026-08-21.md`] — no AC change for 4.16.
- [Source: `ARCHITECTURE-SPINE.md` AD-2] — in-process ingest; no worker until measured NFR-12.
- [Source: `architecture-finance-helper-2026-08-03/.memlog.md`] — "no job queue in v1 [ADOPTED]".
- [Source: `_bmad-output/project-context.md`] — AD-1 hex, AD-3 PDF lifecycle, AD-18 commit-time identity, AD-23 Tailwind.
- [Source: `_bmad-output/implementation-artifacts/4-6-upload-pdf-detect-split-import-session.md`] — save-then-cleanup `except Exception`; split adapter error i18n.
- [Source: `_bmad-output/implementation-artifacts/4-12-commit-batch-dedup-summary-land-on-settle-strip.md`] — ledger dedup ≠ file hash.
- [Source: `_bmad-output/implementation-artifacts/4-14-resume-entry-point-session-completion-summary.md`] — `GET /active` most-recent; 4.16 listed as later/out of scope.
- [Source: `EXPERIENCE.md` J1] — single PDF pick; no queue UX.
- [Source: PRD FR-13 / FR-14 / FR-15 / FR-20] — no multi-file or upload-time hash FR; FR-15 is multi-statement **inside** one PDF; FR-20 is post-commit summary.

## Dev Agent Record

### Agent Model Used

Cursor Grok 4.6 (UI, Tasks 5-7) + Claude Sonnet 5 (backend, Tasks 1-4)

### Debug Log References

- Existing integration tests that re-upload the BAC fixture now append a trailing PDF comment so 4.16 byte-hash 409 does not collide with 4.12 identity tests (`_upload_bac_session`).
- SubtleCrypto fallback (name+size+lastModified) is used only when `crypto.subtle` is missing; server 409 remains authority for other tabs / prior visits.

### Completion Notes List

## Story-close overview — 4.16

**Request path:**
browser file picker → `UploadPanel` sequential `POST /api/import/sessions` (existing BFF) → `upload_statement_pdf` → `UploadStatementPdfService.execute` (SHA-256 **before** `pdf_storage.save`; 409 `duplicate_statement_upload` + blocking `session_id`, not 422) → `create_session(content_hash=)`. No backfill of `content_hash` on pre-4.16 rows. Staged discard stays `DELETE /import/sessions/{id}`. Client hash: SubtleCrypto SHA-256, else `name`+`size`+`lastModified` (server 409 still wins other tabs).

**Key components:**
`DuplicateStatementUploadError` + `compute_pdf_content_hash`; Alembic `0026_import_session_content_hash`; `find_active_session_by_content_hash`; `UploadPanel` queue; `uploadQueueStore` (tab-lifetime); `SoftLedgerSelect` listbox keyboard + blur-after-confirm; individual-review chrome (Back → `/upload` without discard; after finalize, chrome Back lands on `landing_list_id` / `/lists`, or `/upload` if `hasRemainingUploadWork`); zigzag `ImportCompletionSummary` (no Continue); keyboard legend ↑ list / ←↓→ / ⌫ delete; session/card/bulk loading spinners; `seed_dev_user.py` sets Personal `default_import_list_id` (signup does not).

**Why this shape:**
No worker/batch-upload API (AD-2). Dedup is exact PDF bytes among **active** sessions only. Sequential drain. Review/completion chrome on this branch is author-intent product, not a 4.16 AC — recorded here so 4.14/4.13.1 text is not the live contract.

**What not to break:**
`GET /import/sessions/active` still newest active only. `rememberOpenImportSession` is still one id. Do not unique-constrain `content_hash`. Do not start parallel `uploadStatement` calls. 4.12 commit identity is unchanged. Chrome Back on an in-progress review must not `discardSession`. Save must leave the user on the receipt until they use chrome Back.

### File List

- api/domain/errors.py
- api/domain/import_session.py
- api/application/import_session.py
- api/adapters/persistence/models.py
- api/adapters/persistence/import_sessions.py
- api/adapters/persistence/migrations/versions/0026_import_session_content_hash.py
- api/api/routes/import_sessions.py
- api/tests/test_import_session_domain.py
- api/tests/test_import_session_application.py
- api/tests/test_import_sessions_integration.py
- ui/app/upload/UploadPanel.tsx
- ui/app/upload/UploadPanel.test.tsx
- ui/app/upload/uploadClient.ts
- ui/app/upload/uploadClient.test.ts
- ui/app/upload/uploadQueueStore.ts
- ui/lib/i18n/upload.ts
- ui/components/soft-ledger/Select.tsx
- ui/components/soft-ledger/soft-ledger.test.tsx
- ui/app/upload/SessionReviewPanel.tsx
- ui/app/lists/ManualExpenseForm.tsx
- ui/app/lists/ManualExpenseForm.test.tsx
- ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx
- ui/app/upload/review/[sessionId]/IndividualReviewPanel.test.tsx
- ui/app/upload/review/[sessionId]/ImportCompletionSummary.tsx
- ui/app/upload/review/[sessionId]/ImportCompletionSummary.test.tsx
- ui/app/upload/review/[sessionId]/ImportReviewSheet.tsx
- ui/app/upload/review/[sessionId]/ImportReviewSheet.test.tsx
- ui/app/upload/bulk/[sessionId]/BulkReviewPanel.tsx
- ui/app/icons/AlertIcon.tsx
- ui/app/icons/index.ts
- api/scripts/seed_dev_user.py
- _bmad-output/implementation-artifacts/sprint-status.yaml
- _bmad-output/implementation-artifacts/4-16-multi-file-upload-pending-queue-dedup.md

## Change Log

- 2026-08-19: Story created via `bmad-create-story` (then numbered 4.10). Threading deferred; status ready-for-dev.
- 2026-08-20: Renumbered to 4.16; sprint-status key `4-16-multi-file-upload-pending-queue-dedup`.
- 2026-08-24: Recreated via `bmad-create-story` against HEAD `8b30ed6`. Refreshed Alembic head (`0026` after `0025`), 4.14 picker coexistence, optional `create_session` hash for test factories, duplicate scope = active (`discarded_at` and `finalized_at` null). Status → ready-for-dev.
- 2026-08-24/25: UI queue (Tasks 5-7) implemented and committed on this branch by a concurrent Cursor/Grok 4.6 session (commits `8bdaf21`, `353a357`, `c73f05a`, `d9d0dfb`).
- 2026-08-25: Backend (Tasks 1-4) implemented by Claude Sonnet 5: domain error + `compute_pdf_content_hash`, `content_hash` column + Alembic `0026`, `find_active_session_by_content_hash`, pre-save duplicate check in `UploadStatementPdfService`, 409 HTTP mapping, unit + integration tests (adjusted pre-existing `_upload_bac_session` fixture to vary bytes per call so it doesn't collide with the new active-session dedup). Full backend + UI suites green. Status → review.
- 2026-08-25: Group A code review patches: 409 includes blocking `session_id` (`exc.CODE`); ORM mirrors non-unique partial index; tests assert stored hash. Concurrent same-hash race deferred.
- 2026-08-25: Group B review: keep duplicate icon+tooltip; drain persists after leave-review; picker stays clickable while busy; discard/failed/409 session-id row fixes.
- 2026-08-25: Group C review patches: submit uses membership-valid payer/assignee; default-list Accept requires the id in loaded lists; chrome Back releases `leavingRef` after a failed/no-op push; card-identification spinner has its own aria-label.
- 2026-08-25: Group D patches applied: 4.16/4.14/4.13.1 notes match shipped chrome. Status → done.
