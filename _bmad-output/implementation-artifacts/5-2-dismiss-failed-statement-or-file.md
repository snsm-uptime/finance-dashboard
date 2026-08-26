---
baseline_commit: 71cc0a4
---

# Story 5.2: Dismiss failed statement or file

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

> **Quarantine is retired** (Sprint Change Proposal 2026-08-25). EXPERIENCE.md J3 / DESIGN.md / older PRD text still mention “accept with quarantine.” **Ignore those climaxes.** This story is dismiss-only. Do not invent quarantine, hand-edit-unresolved-rows (FR-27 removed), incomplete-strip wiring (Story 5.7), or a new statement status if `skipped` already means “no ledger, PDF may go.”

## Story

As a user facing a failed parse,
I want to dismiss the failed statement or the whole file,
so that nothing partial enters the ledger and I'm not blocked from reviewing statements that did parse.

## Acceptance Criteria

1. **Given** the comparison surface from Story 5.1 **When** I dismiss the statement **Then** that statement is not committed to the ledger and produces no rows in the row-level review queue (FR-26) **And** siblings in the Import Session remain available to review (FR-15).

2. **Given** the comparison surface **When** I dismiss the entire file **Then** remaining uncommitted statements from the upload are abandoned **And** no further ledger writes occur for those statements.

3. **Given** a statement is dismissed **When** the dismissal completes **Then** that statement’s PDF is released immediately in the AD-3 sense: clear its `pdf_path`; delete volume bytes **only when no remaining statement still needs the file** (shared path across chunks in one upload — do not delete bytes while a sibling is still `staged` or `failed`). A discarded **session** (dismiss file) always releases remaining paths for that session.

4. **Given** EN/ES locale **When** dismiss copy is shown **Then** chrome and outcome labels are localized (UX-DR18) in `ui/lib/i18n/upload.ts` (`uploadMessages.en` / `.es`).

5. **Given** this story alone **When** a statement fails to parse **Then** hand-editing unresolved rows is out of scope — no unresolved-row bucket; capture via re-upload or manual expense (FR-21).

## Scope — do not build

- Quarantine / accept-with-quarantine / FR-27 hand-fix UI.
- Stories 5.3–5.4 reassign / rollback; 5.5–5.6 same-price / alias; 5.7 `IncompleteDisclosure` live data.
- New Alembic revision unless you prove a column is required (prefer existing `skipped` status).
- New Compose service, Redis, workers (AD-2).
- Serving `pdf_path` on JSON; extra `pdfjs-dist` pin; `@react-pdf/renderer`.
- Changing Continue from 5.1: it stays visit-local acknowledge. Dismiss is the **durable** exit. Do not remove Continue unless product copy is folded into dismiss-only (keep Continue so the user can still defer dismiss and review siblings).
- Using comparison dismiss to skip **staged** statements (row review / session discard already cover those).
- Lighting incomplete disclosure because a statement was dismissed (FR-43: dismissed ≠ incomplete).

## Tasks / Subtasks

- [x] Task 0: Branch + reads
  - [x] 0.1 Branch: `feat/5/5-2-dismiss-failed-statement-or-file` from current `main`.
  - [x] 0.2 Read this file, `_bmad-output/project-context.md`, AD-3/AD-4 in `ARCHITECTURE-SPINE.md`, `DiscardImportSessionService` + `_release_source_pdf_if_idle`, `session_needs_source_pdf`, `ParseComparisonPanel.tsx`, `reviewSequence.ts`, `discardSession` in `uploadClient.ts`, `DiscardConfirmDialog.tsx`.

- [x] Task 1: Domain + application — dismiss statement (AC: #1, #3)
  - [x] 1.1 Reuse `STATEMENT_STATUS_SKIPPED`. Do **not** add `dismissed`. Failed parse never had candidate rows; skip keeps `rows: []` / `candidate_row_count === 0`.
  - [x] 1.2 `DismissFailedStatementService` (name flexible): owner session, statement `status == failed` → set `skipped`, clear **that** statement’s `pdf_path`. 404 foreign/missing (same non-enumerating pattern as GET PDF). 409 if discarded session (`import_session_discarded`). 409 if status is not `failed` (`import_statement_not_failed` or reuse an existing conflict code — document it). Idempotent: already `skipped` after a failed dismiss → 200 with current session.
  - [x] 1.3 After skip, call PDF release with **refcount**: collect remaining `pdf_path` values on statements that are still `staged` or `failed`; delete a path from storage iff no remaining retain-status statement still points at it; then `_release_source_pdf_if_idle` for the leftover “session fully idle” case. **Do not** delete the shared upload file while a sibling is `staged`.
  - [x] 1.4 Repository: `set_statement_status` / `clear_statement_pdf_path` for one statement (do not reuse `clear_statement_pdf_paths` which clears **all**).
  - [x] 1.5 Domain tests: skip failed → `session_needs_source_pdf` false when only skipped/committed remain. Mixed `failed`+`staged` sharing one path: after dismiss failed, file still present; staged `pdf_path` unchanged.
  - [x] 1.6 Application tests with `_FakePdfStorage`: failed-only session → `delete` called; mixed shared path → `delete` **not** called; already-committed sibling ledger untouched (no `commit_statement_batch`).

- [x] Task 2: Discard file always releases PDF (AC: #2, #3)
  - [x] 2.1 Today `DiscardImportSessionService` + `_release_source_pdf_if_idle` **keeps** the file while statements remain `staged`/`failed` (`test_discard_own_session_sets_discarded_at_and_keeps_pdf_while_staged`). That contradicts dismiss-file + AD-3 once the session is abandoned. **Change:** after `discard_session`, always delete remaining paths for that session and clear path refs (even if statuses are still staged/failed). Committed ledger rows stay (existing AD-4). PDF GET already 404s discarded sessions — bytes must not linger.
  - [x] 2.2 Flip the application test in 2.1 to expect `storage.deleted` non-empty (or paths cleared). Keep “foreign user 404” and “committed ledger survives discard after partial assign” (`test_dismiss_after_partial_row_commit_leaves_committed_ledger_untouched`).
  - [x] 2.3 No new HTTP verb required for file dismiss if UI calls existing `DELETE /import/sessions/{id}`. Confirm BFF already forwards it.

- [x] Task 3: HTTP + BFF + client (AC: #1)
  - [x] 3.1 FastAPI: `POST /import/sessions/{session_id}/statements/{statement_id}/dismiss` → `ImportSessionResponse` (same mapper as GET session). Cookie auth. `response_model` consistent with other mutation routes.
  - [x] 3.2 BFF: `ui/app/api/import/sessions/[sessionId]/statements/[statementId]/dismiss/route.ts` — cookie-forward, JSON, 502 on upstream down (copy GET session / PDF route style).
  - [x] 3.3 `dismissFailedStatement(sessionId, statementId, messages)` in `uploadClient.ts` + tests for 200 / 409 discarded / 409 not-failed / 401.

- [x] Task 4: Comparison UI (AC: #1, #2, #4)
  - [x] 4.1 `ParseComparisonPanel`: add **Dismiss statement** and **Dismiss file** (not pill CTAs; secondary/outline for statement, destructive-or-confirm for file). Keep **Continue**. Do not put `@use-gesture` on this surface. Keyboard/click only (UX-DR19).
  - [x] 4.2 Dismiss file: reuse `DiscardConfirmDialog` + existing discard confirm copy (`discardConfirmTitle` / `Body` / `Action`) — same semantics as session discard (assigned rows stay). After success, parent navigates off review (same as `SessionReviewPanel` `onDiscarded` → upload home).
  - [x] 4.3 Dismiss statement: POST dismiss, then **refetch** session (or use returned DTO) so `nextReviewStep` / `nextUnacknowledgedFailedStatement` see `skipped` — do not only add the id to `acknowledgedFailedIds` (reload would show comparison again).
  - [x] 4.4 After last failed is dismissed and pending rows remain: Individual → next row; Bulk → list picker. After last failed and **no** pending rows: existing sheet/finalize path (`classifyActiveImportSession` already treats `pendingSum === 0` as `sheet-waiting`). Do not remount comparison.
  - [x] 4.5 Wire `onDismissStatement` / `onDismissFile` from `IndividualReviewPanel` and `BulkReviewPanel` (both already mount `ParseComparisonPanel`).
  - [x] 4.6 i18n keys on both `en` and `es` (e.g. `parseFailureDismissStatement`, `parseFailureDismissFile`, error for not-failed). If `upload.ts` has a key-list test, extend it.
  - [x] 4.7 Tests (jsdom, test-after): dismiss statement calls POST not DELETE session; dismiss file uses discard + confirm; Continue still does not call APIs; after statement dismiss parent refetch mock shows skipped and next step is row/sheet; EN/ES keys present.

- [x] Task 5: Integration (Postgres 16)
  - [x] 5.1 Upload mixed parse-failure fixture from 5.1 (`promerica_stub_parse_failure_mixed.pdf` or equivalent): dismiss failed statement → GET session `status=skipped`, sibling still `staged`, ledger empty for dismissed; PDF GET 404 for dismissed statement; sibling PDF GET still 200 if still staged.
  - [x] 5.2 Failed-only (or last failed) dismiss → PDF GET 404; volume delete observed via storage fake or path null on all statements when idle.
  - [x] 5.3 Dismiss file with mixed session → `discarded_at` set, PDF GET 404, pending rows gone from review (session discarded), previously committed rows if any remain.

- [x] Task 6: Story-close overview
  - [x] 6.1 Fill Completion Notes using `_bmad-output/implementation-artifacts/story-close-overview-checklist.md`.
  - [x] 6.2 Sync story Status with `sprint-status.yaml` at close (Epic 3.5 retro action). Include Review Findings (or explicit zero-findings) when review runs.

### Review Findings

_(filled at code-review)_

## Dev Notes

### Current system (must preserve)

- **Comparison:** `ParseComparisonPanel` is evidence + Continue only. Continue is visit-local (`acknowledgedFailedIds`). Reload remounts comparison. [Source: `ui/app/upload/ParseComparisonPanel.tsx`, `reviewSequence.ts`]
- **Sequence:** `nextReviewStep` walks statements in order: unacknowledged `failed` → comparison; `staged` pending rows → card; else `sheet`. `nextReviewableRow` still skips empty failed rows. [Source: `ui/app/upload/reviewSequence.ts`]
- **Statuses:** `staged` | `failed` | `committed` | `skipped`. `session_needs_source_pdf` is true iff any status is `staged` or `failed`. [Source: `api/domain/import_session.py`]
- **Shared PDF:** one upload file path is copied onto every statement index at `create_session`. Deleting bytes on first dismiss would break sibling review. [Source: `UploadImportSessionService` / `pdf_paths = {index: whole_pdf_path ...}`]
- **Discard session:** `DELETE /import/sessions/{id}` via `DiscardImportSessionService` — drops uncommitted review; **does not** currently delete PDF while staged/failed. GET PDF 404s discarded sessions. [Source: `api/application/import_session.py` `GetStatementPdfService`, `test_discard_own_session_sets_discarded_at_and_keeps_pdf_while_staged`]
- **Bulk vs Individual:** both intercept failed statements before picker/sheet. [Source: `BulkReviewPanel.tsx`, `IndividualReviewPanel.tsx`]
- **Alembic HEAD:** `0028_stmt_parse_evidence`.
- **PdfStorage.delete** is still unconfined (5.1 defer). Do not expand delete to user-controlled paths; keep using stored `pdf_path` only.

### What this story changes

- Durable skip of a `failed` statement + per-statement path clear + refcounted byte delete.
- Session discard always releases PDFs for that session.
- Comparison UI gains dismiss statement / dismiss file; Continue unchanged.
- Failed statements never become `pending` rows (already true) — dismiss must not create candidate rows.

### Architecture compliance

| Rule | Apply |
|------|--------|
| AD-1 | Domain status rules stay in `domain/`. UI never reads the operator volume. |
| AD-3 | Dismiss statement: drop that statement’s need for the source doc; bytes go when unused. Dismiss file: session abandoned → delete remaining files. |
| AD-4 | Dismiss is not an Import Batch. Partial commit of siblings stays. Discard does not unwind committed batches. |
| AD-8 | Session cookie via BFF. |
| AD-11 | Reuse 5.1 synthetic fixtures; no real statements in repo. |
| AD-12 / AD-23 | Tailwind on existing panel; Warm Balance tokens (`--muted`, `--surface`, `--border`, `--accent`, `--owe`); no new `*.module.css`; no pill primary. |
| AD-15 | Domain/application TDD for skip + PDF refcount; UI test-after. |
| AD-19 | Owner-only; foreign → not found, not a distinct “exists but forbidden” leak if GET session already 404s. |

### UX

- **Wins:** FR-26 + UX-DR12 actions (dismiss statement / file) on the 5.1 layout (items above, PDF lower half on phone). DESIGN.md / EXPERIENCE.md quarantine copy **loses**.
- **Voice:** calm; do not imply data was imported. Alert copy from 5.1 stays.
- **Confirm:** file dismiss is high-intent abandon of remaining uncommitted — reuse existing discard dialog, do not invent a second confirm pattern.
- **Reduce motion:** buttons only.

### Files to touch (expected)

**UPDATE:** `api/domain/import_session.py` (optional helper), `api/application/import_session.py` (new service, discard PDF always, maybe `_release_source_pdf_if_idle` split into “idle statuses” vs “session discarded”), `api/application/ports.py` / `ImportSessionRepository`, `api/adapters/persistence/import_sessions.py`, `api/api/routes/import_sessions.py`, `api/api/schemas` if new error codes, `api/tests/test_import_session_domain.py`, `api/tests/test_import_session_application.py`, `api/tests/test_import_sessions_integration.py`, `ui/app/upload/ParseComparisonPanel.tsx` + `.test.tsx`, `IndividualReviewPanel.tsx` + tests, `BulkReviewPanel.tsx` + tests, `uploadClient.ts` + tests, `ui/lib/i18n/upload.ts`, `_FakeImportSessionRepo` in application tests.

**NEW:** BFF `dismiss/route.ts`; possibly `api/domain/errors.py` conflict type.

### Anti-patterns (do not)

- Treat Continue as dismiss (5.1 AC #5).
- Put evidence items onto assign/commit.
- Delete the shared PDF when a sibling still needs comparison or ImportReviewSheet.
- New `dismissed` status + migration without need.
- Accept-with-quarantine buttons or incomplete strip.
- Swipe-down as the only dismiss path.
- Calling `clear_statement_pdf_paths` (all statements) when dismissing one failed sibling.

### Testing requirements

- Postgres 16 for upload → dismiss → GET/PDF (not SQLite).
- Money: still no ledger for dismissed failed; if any amount appears in tests it is evidence strings only.
- UI: mock fetch; do not require Playwright.
- Existing 5.1 tests: Continue still API-free; comparison still not on clean parse.

### Previous story intelligence (5.1)

- Evidence is JSONB on the statement, not candidate rows. Dismiss must not persist those as `pending`.
- PDF GET: discarded session 404; empty bytes 404; volume confinement on **read**.
- `nextUnacknowledgedFailedStatement` ignores `finalized_at` sessions. After dismiss, status change is what removes comparison — not acknowledge-only.
- Review patches: bulk must not skip comparison; do not reintroduce picker-while-failed.
- Deferred: `FilesystemPdfStorage.delete` confinement — out of scope unless you touch delete and can add `is_relative_to` cheaply (nice-to-have, not required).

### Git intelligence

- Recent: `bfe622a` merge Story 5.1; `d316b0e` comparison intercept + PDF GET fixes. Follow BFF cookie-forward and JSON `code` fields.
- `react-pdf@10.4.x` already in `ui/package-lock.json`. Do not bump unless broken. Worker stays in the same module as `Document`/`Page`; `next/dynamic` `ssr: false` already used by parents.

### Latest tech

- react-pdf 10.x: `workerSrc` via `import.meta.url` → `pdfjs-dist/build/pdf.worker.min.mjs` in the **same** client module. No CDN worker in production. Do not add a second `pdfjs-dist` dependency. [Source: react-pdf 10.x README, 2026-08-26]

### Project context reference

Follow `_bmad-output/project-context.md`: Decimal/string money, i18n objects not JSON files, Tailwind, no `NEXT_PUBLIC_` secrets, synthetic goldens, Import Session vs Batch, dismiss file = abandon remaining uncommitted.

## Dev Agent Record

### Agent Model Used

Cursor Grok 4.6

### Debug Log References

- Host `uv run pytest` (no `DATABASE_URL`): 536 passed, 197 skipped — Postgres integration tests including Task 5 are skipped until Compose/`DATABASE_URL`.
- Docker socket was not available in this agent environment; run `docker compose -f docker-compose.yml -f docker-compose.test.yml -f docker-compose.worktree.yml run --rm api pytest tests/test_import_sessions_integration.py -k dismiss` locally.
- UI: `npm test` 496 passed; `tsc --noEmit` clean; eslint 0 errors.

### Completion Notes List

## Story-close overview — 5.2 dismiss-failed-statement-or-file

**Request path:**
Dismiss statement: comparison UI → `dismissFailedStatement` → BFF `POST /api/import/sessions/{id}/statements/{id}/dismiss` → FastAPI same path → `DismissFailedStatementService` → skip status + refcounted `PdfStorage.delete`. Dismiss file: confirm dialog → existing `DELETE /import/sessions/{id}` → `DiscardImportSessionService` now always `_release_all_session_pdfs`. Cookie auth only.

**Key components:**
`DismissFailedStatementService`, `next_status_after_dismiss_failed` / `retained_source_pdf_paths`, repo `set_statement_status` + `clear_statement_pdf_path`, `ParseComparisonPanel` dismiss actions + `DiscardConfirmDialog`, EN/ES keys on `uploadMessages`.

**Why this shape:**
AD-3: one shared upload path for split chunks — bytes stay while any sibling is `staged`/`failed`. Abandoned session (dismiss file) must not leave PDFs. Existing `skipped` status avoids a migration. Continue stays visit-local; skip is the durable exit.

**What not to break:**
Do not delete a shared PDF while a sibling is still `staged` or `failed`. Do not unwind committed batches on session discard. Failed dismiss must not create candidate rows. Continue must not call APIs. Foreign session/statement stays 404, not 403.

Conflict code for non-failed dismiss: `import_statement_not_failed` (409).

### File List

- api/domain/errors.py
- api/domain/import_session.py
- api/application/import_session.py
- api/adapters/persistence/import_sessions.py
- api/api/routes/import_sessions.py
- api/tests/test_import_session_domain.py
- api/tests/test_import_session_application.py
- api/tests/test_import_sessions_integration.py
- ui/app/api/import/sessions/[sessionId]/statements/[statementId]/dismiss/route.ts
- ui/app/api/cards-import.bff.test.ts
- ui/app/upload/uploadClient.ts
- ui/app/upload/uploadClient.test.ts
- ui/app/upload/ParseComparisonPanel.tsx
- ui/app/upload/ParseComparisonPanel.test.tsx
- ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx
- ui/app/upload/review/[sessionId]/IndividualReviewPanel.test.tsx
- ui/app/upload/bulk/[sessionId]/BulkReviewPanel.tsx
- ui/app/upload/bulk/[sessionId]/BulkReviewPanel.test.tsx
- ui/lib/i18n/upload.ts
- _bmad-output/implementation-artifacts/5-2-dismiss-failed-statement-or-file.md
- _bmad-output/implementation-artifacts/sprint-status.yaml

### Change Log

- 2026-08-26: Implemented dismiss failed statement (`skipped` + PDF refcount) and session discard always releases PDFs; comparison UI dismiss statement/file; status → review.
