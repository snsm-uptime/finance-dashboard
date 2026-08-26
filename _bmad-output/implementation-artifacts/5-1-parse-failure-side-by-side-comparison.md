---
baseline_commit: 5f52515e7efcef517ad62b1e23d721a70d892432
---

# Story 5.1: Parse failure → side-by-side comparison

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

> **First story of Epic 5.** Quarantine is retired (Sprint Change Proposal 2026-08-25). EXPERIENCE.md J3 / DESIGN.md / some epics tables still mention “accept with quarantine” — **those climaxes are obsolete**. This story is **alert + evidence only**. Dismiss is Story 5.2. Incomplete strip wiring is Story 5.7. Do not invent quarantine, hand-fix-unresolved-rows, or FR-43 data.

## Story

As a user importing a statement,
I want a clear alert and a side-by-side PDF vs extracted-items view when automatic parse fails,
so that nothing enters the ledger silently and I can see the evidence (J3).

## Acceptance Criteria

1. **Given** a statement in an Import Session cannot be parsed correctly on the automatic path **When** review reaches that statement **Then** the system alerts and does not process that statement into the ledger on its own (FR-24, NFR-8) **And** required / must-parse data is never silently dropped (visible gap on the comparison surface, not a quiet empty failure).

2. **Given** parse failure on one statement in a multi-statement upload **When** that statement fails **Then** sibling statements in the same session are not automatically rejected or discarded (FR-24, FR-15). Keep `run_import_pipeline`’s per-chunk catch — do not let one failed `parse()` abort the upload.

3. **Given** parse failure **When** the comparison surface opens **Then** the original PDF is shown beside extracted items — on phone, PDF in the **lower** half, items **above** (FR-25, UX-DR12) **And** comparison appears **only** on failure (clean parse never mounts the PDF viewer) **And** the view is usable on phone and desktop (NFR-7) **And** comparison regions are labeled for assistive tech (UX-DR19).

4. **Given** Reduce Motion / no-swipe constraints **When** I use the comparison surface **Then** outcomes remain operable without required motion (UX-DR19). Comparison is **not** a swipe card — no `@use-gesture` on this surface.

5. **Given** this story alone **When** I am on the comparison surface **Then** a dismiss action is **not** required — Story 5.2 adds it. This story’s exit is: failure is visible with evidence, ledger untouched. A **Continue** (or equivalent) may advance to sibling review / ImportReviewSheet; it must **not** delete PDF, change statement status, or commit rows.

6. **Given** CI **When** parse-failure coverage runs **Then** at least one synthetic parse-failure fixture (anonymized; no real PII) opens the comparison surface — same fixture discipline as Story 4.5 (NFR-2, AD-11): extracted items **plus a visible gap**, not an empty PDF and not an empty evidence list.

## Scope — do not build

- **Story 5.2:** dismiss statement / dismiss file, PDF release on dismiss.
- **Story 5.3–5.4:** reassign, rollback.
- **Story 5.5–5.6:** same-price / alias conflicts.
- **Story 5.7:** `IncompleteDisclosure` live data (slot already exists from 3.6; leave it unwired).
- Quarantine, accept-with-quarantine, FR-27 hand-edit unresolved bucket.
- Serving `pdf_path` on JSON DTOs (AD-3: path is operator-volume internal).
- Pinning a second standalone `pdfjs-dist` besides what `react-pdf@10.4.x` bundles.
- Redis / workers / extra Compose service (AD-2).
- Changing bulk **commit** semantics: failed statements stay ineligible (`validate_bulk_commit_eligible` still requires `staged`).
- Blocking `POST /finalize` until 5.2: mixed sessions may still Save after good rows are resolved (4.14). Comparison must appear **before** the sheet when failed statements exist on that visit, then Continue may reveal the existing sheet.

## Tasks / Subtasks

- [x] Task 0: Branch + reads
  - [x] 0.1 Branch: `feat/5/5-1-parse-failure-side-by-side-comparison` from current `main` (one story per branch).
  - [x] 0.2 Read this file, `_bmad-output/project-context.md`, AD-3 / AD-4 / AD-16 in `ARCHITECTURE-SPINE.md`, `api/application/import_session.py` (`run_import_pipeline`), `api/adapters/storage/pdf_storage.py`, `IndividualReviewPanel.tsx` (`nextReviewableRow`), `ui/app/api/import/sessions/[sessionId]/route.ts`.

- [x] Task 1: Parse evidence without creating reviewable rows (AC: #1, #2, #6)
  - [x] 1.1 **Do not** persist failed-parse lines as `pending` `import_candidate_rows`. Those would enter `nextReviewableRow` / assign / bulk and violate FR-24. Evidence is display-only.
  - [x] 1.2 Extend `InvalidCanonicalLineError` (or a dedicated frozen dataclass carried on it) with optional `evidence: ParseEvidence` where `ParseEvidence` lives in `api/domain/` (no FastAPI/SQLAlchemy/pdfplumber). Shape: ordered `items: list[ParseEvidenceItem]` with `kind: "row" | "gap"`. `row` = fields that **did** validate as CanonicalLine (amount as string at the JSON boundary later). `gap` = the must-parse line/text that caused fail-loud (raw snippet, no PII in fixtures). Empty evidence is not enough for AC #6.
  - [x] 1.3 **BAC + Promerica stub `parse()`:** before `raise InvalidCanonicalLineError`, attach evidence = already-validated rows **plus** a `gap` for the failing line. Today both adapters raise and **drop** prior `rows` — that is the silent-drop hole FR-24 / AD-11 call out. Do not change fail-loud: still raise; still no `staged` candidate rows.
  - [x] 1.4 `run_import_pipeline`: on per-chunk `InvalidCanonicalLineError`, set `DetectedStatement(status=failed, candidate_rows=[], parse_evidence=exc.evidence or …)`. Sibling loop **unchanged**. Detection / whole-file `split()` failures still propagate uncaught (nothing to stage).
  - [x] 1.5 `create_session`: persist evidence on the **statement** (JSONB column). Alembic **`0028_…`**, `down_revision = "0027_import_session_content_hash"` (HEAD today). Revision id ≤ 32 chars. Nullable JSON; no backfill.
  - [x] 1.6 Wire evidence onto `StagedStatementRecord` / `StagedStatementResponse` / `asImportSession` (`parse_evidence` or `extracted_items` + `gaps` — snake_case on the wire). Failed statements keep `rows: []` and `candidate_row_count` consistent with **candidate** rows (0), not evidence length.
  - [x] 1.7 Tests: extend `test_run_import_pipeline_one_chunk_fails_parse_sibling_survives` — failed chunk has evidence, sibling still `staged`. Adapter tests: Promerica malformed-amount (existing) and BAC unmapped/malformed path now attach gap + any prior rows. Integration: upload mixed fixture → GET session shows `status=failed`, evidence non-empty, `rows=[]`, no ledger.

- [x] Task 2: Authenticated PDF bytes (AC: #3)
  - [x] 2.1 Add `PdfStorage.read(path: str) -> bytes` (or `open`) on the Protocol. `FilesystemPdfStorage`: resolve, **`Path(path).resolve().is_relative_to(self._base_dir.resolve())`**, else treat as not found. Do not follow user-controlled paths outside the volume.
  - [x] 2.2 Application service: owner session + statement id + `pdf_path is not None` → bytes. Foreign user → same as GET session (not found / forbidden pattern already used on this router). Missing file → 404, no path in body.
  - [x] 2.3 FastAPI: `GET /import/sessions/{session_id}/statements/{statement_id}/pdf` → `application/pdf`, `Cache-Control: private, no-store`. **Never** JSON-encode the operator path. Register this route so it does not collide with row routes.
  - [x] 2.4 BFF: `ui/app/api/import/sessions/[sessionId]/statements/[statementId]/pdf/route.ts` — cookie-forward like the session GET; **stream** the body (not `JSON.stringify`). 502 on upstream down.
  - [x] 2.5 Integration: owner 200 + `%PDF` magic; other user 404/403; discarded session not served (match GET session); `pdf_path` None → 404.

- [x] Task 3: Comparison UI (AC: #3, #4, #5)
  - [x] 3.1 Add `react-pdf@10.4.x` in `ui/` (`package-lock.json` is the pin). **Do not** add a second `pdfjs-dist` dependency. Worker: set `pdfjs.GlobalWorkerOptions.workerSrc` in the **same module** that renders `<Document>` / `<Page>` (react-pdf 10.x). Import that module with `next/dynamic(..., { ssr: false })`. Prefer bundling the worker via `import.meta.url` (`pdfjs-dist/build/pdf.worker.min.mjs`); do not use a CDN worker as the production path.
  - [x] 3.2 New client component under `ui/app/upload/` (e.g. `ParseComparisonPanel.tsx`) — Tailwind only, **no new `*.module.css`**. Layout: `flex-col` on small screens (items first, PDF `flex-1` / lower half); side-by-side from `md:` up. Tokens: `--muted`, `--surface`, `--border`, `--background`, `--space-*` from `globals.css` — do not invent `--color-*`.
  - [x] 3.3 Regions: `role="region"` + `aria-label` from i18n for (a) extracted items (b) original PDF. Alert: existing calm copy pattern, EN+ES in `ui/lib/i18n/upload.ts` (same `uploadMessages` object — no new i18n file). Gap rows visually distinct (muted) and not presented as committed amounts.
  - [x] 3.4 Load PDF via BFF with `credentials: "include"` → `Blob` → `<Document file={blob}>`. Never pass a cross-origin api URL without cookies.
  - [x] 3.5 **Insert into review sequence** (do not only list failures on the 4.14 summary). Export a pure helper next to `nextReviewableRow` (keep that function’s row semantics): walk `session.statements` in order; `failed` → comparison step; `staged` with pending `rows` → existing card. **Visit-local** “acknowledged” failed ids: Continue advances; reload shows comparison again. While unacknowledged failed statements exist, **do not** mount `ImportReviewSheet` first. After Continue through them, existing sheet/finalize behavior stays.
  - [x] 3.6 Bulk page: if the session has any `failed` statement, show the same comparison **before** the list picker; Continue then shows today’s bulk UI. Clean sessions: **zero** `react-pdf` import cost on the happy path (dynamic import only from comparison module).
  - [x] 3.7 Tests (jsdom, test-after): helper chooses comparison vs row vs sheet; comparison not used when all `staged`; regions have accessible names (query by role/label). Mock `react-pdf` in unit tests. Do not require Playwright for this story.

- [x] Task 4: Synthetic failure fixture (AC: #6)
  - [x] 4.1 New PDF under `api/tests/fixtures/pdf/` (do **not** overwrite `bac_credit_synthetic.pdf` or `bac_credit_acceptance_bar.pdf`). Author with existing `fpdf2` / `generate_bac_fixture.py` style (or Promerica stub multi-chunk: chunk 1 malformed amount, chunk 2 good — already sketched in `test_promerica_stub_adapter.py`). Generic vocabulary only.
  - [x] 4.2 CI test: pipeline or upload → failed statement evidence has ≥1 `row` **or** clearly listed extracted text **and** ≥1 `gap`. UI test can feed a fixture session object rather than hitting pdf.js.

- [x] Task 5: Story-close overview
  - [x] 5.1 Fill Completion Notes using `_bmad-output/implementation-artifacts/story-close-overview-checklist.md` (Request path / Key components / Why this shape / What not to break).

## Dev Notes

### Current system (must preserve)

- **Pipeline today:** `run_import_pipeline` catches `InvalidCanonicalLineError` **per chunk** only, stores `DetectedStatement(status="failed", candidate_rows=[])`, continues. Detection and `split()` failures abort the whole upload. [Source: `api/application/import_session.py` `run_import_pipeline`]
- **Persistence:** `create_session` writes candidate rows **only** if `status == staged`. Failed statements already keep `pdf_path` because `session_needs_source_pdf` includes `failed`. [Source: `api/domain/import_session.py` `session_needs_source_pdf`; `import_sessions.py` `create_session`]
- **GET DTO:** pending rows only in `statements[].rows`; failed statements appear in `failed_statements` and as `status: "failed"` with empty `rows`. [Source: `api/api/routes/import_sessions.py` `_statement_response`]
- **Individual review:** `nextReviewableRow` skips empty `rows`, so **users never see failed statements mid-review** — only on `ImportCompletionSummary`. This story must fix that hole without putting evidence into the assign queue.
- **PDF storage:** `FilesystemPdfStorage` has `save`/`delete` only — no read. Paths are `{base}/{user_id}/{uuid}.pdf`. [Source: `api/adapters/storage/pdf_storage.py`]
- **BFF:** cookie-forward, same-origin `/api/import/sessions/...` → `API_INTERNAL_URL`. [Source: `ui/app/api/import/sessions/[sessionId]/route.ts`]
- **Finalize + failed:** 4.14 tests keep PDF when a failed sibling remains (`session_needs_source_pdf`). Do not delete PDF on Continue.
- **Alembic HEAD:** `0027_import_session_content_hash`.

### What this story changes

- Fail-loud still raises; evidence is attached and stored **on the statement**.
- New authenticated PDF GET + BFF stream.
- Review/bulk entry shows comparison for `failed` statements.
- First `react-pdf` usage in the repo (`ui/package.json` has Next 16.2 / React 19.2, **no** react-pdf yet).

### Architecture compliance

| Rule | Apply |
|------|--------|
| AD-1 | Domain evidence types have no pdfplumber/FastAPI. `ui` never reads the operator volume. Bank adapters still only emit CanonicalLine on success. |
| AD-3 | Bytes stay on volume; Postgres stores path + JSON evidence. Do not `bytea`. Retain PDF while `failed` (until 5.2 dismiss). |
| AD-4 | Failed statement is **not** an Import Batch. No ledger / `batch_id`. |
| AD-5 / AD-16 | Evidence `row` amounts are strings on JSON. Do not treat evidence as `CANDIDATE_ROW`. |
| AD-8 | Session cookie via BFF; no Bearer in `localStorage`. |
| AD-11 / NFR-2 | Synthetic fixtures only. |
| AD-12 / AD-23 | DESIGN/EXPERIENCE layout (PDF lower half on phone); Tailwind; Warm Balance tokens. |
| AD-15 | Adapter/domain TDD for evidence + pipeline; UI test-after. |
| Stack | `react-pdf` **10.4.x** only; Next `output: 'standalone'` unchanged. |

### UX — which document wins

- **Layout:** PDF lower half on phone, extracted items above (UX-DR12, FR-25). Desktop: side-by-side, same two labeled regions.
- **J3 climax in EXPERIENCE.md (quarantine accept, incomplete strip):** **ignore**. 2026-08-25 + this story’s AC #5 replace it. Do not light `IncompleteDisclosure`.
- **Actions on this story:** alert + evidence + Continue. Dismiss copy/buttons wait for 5.2 (UX-DR12 actions list is the **epic** end state, not 5.1).

### Files to touch (expected)

**UPDATE:** `api/domain/errors.py`, `api/domain/import_session.py` (optional helpers), `api/application/import_session.py` (`DetectedStatement`, pipeline, PdfStorage protocol usage), `api/application/ports.py`, `api/adapters/storage/pdf_storage.py`, `api/adapters/bank/bac_credit/adapter.py`, `api/adapters/bank/promerica_stub.py`, `api/adapters/persistence/models.py`, `api/adapters/persistence/import_sessions.py`, `api/api/routes/import_sessions.py` (+ schema models), `api/tests/test_import_session_application.py`, `api/tests/test_promerica_stub_adapter.py`, `api/tests/test_bac_adapter.py` or new fixture test, `api/tests/test_import_sessions_integration.py`, `_FakePdfStorage` in tests (add `read`), `ui/package.json` + lockfile, `ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx`, `ui/app/upload/bulk/[sessionId]/` page/panel, `ui/app/upload/uploadClient.ts`, `ui/lib/i18n/upload.ts` (+ `.test.ts` key lists if present).

**NEW:** Alembic `0028_*`, `ParseComparisonPanel.tsx` (+ test), BFF pdf `route.ts`, synthetic PDF + goldens if needed.

### Anti-patterns (do not)

- Reuse `IndividualReviewPanel` swipe card for comparison.
- Put evidence items into `POST .../rows/.../assign`.
- `next/image` or `<iframe src={apiAbsoluteUrl}>` without cookies.
- `@react-pdf/renderer` (wrong package — that generates PDFs).
- Empty-failure fixture that “opens” a blank pane and calls AC #6 done.
- Changing `classifyActiveImportSession` so failed-only sessions look like `untouched` with reviewable rows (failed still have `candidate_row_count === 0`; 4.14 already documents this).

### Testing requirements

- Postgres 16 integration for PDF GET + upload evidence (not SQLite).
- Money in any evidence row asserts: `Decimal` / string, never float.
- No real statements in repo.
- `ui` typecheck + existing IndividualReviewPanel tests still pass (`nextReviewableRow` empty-failed behavior may gain a sibling helper; don’t break assign flow).

### Previous story intelligence

Epic 4 last story **4.16** (queue/dedup) is independent. **4.14** owns completion summary `failed_statements` and resume classification — keep those fields; comparison is an additional surface, not a replacement for the summary line after Save. **4.6** established sibling-survival; do not “fix” it by failing the whole file. **4.13.1** Save/`finalize`/sheet: intercept **before** sheet, do not rewrite sheet.

### Git intelligence

Recent: Epic 5 quarantine retirement (`0d593a0`); 4.16 multi-file upload. Follow existing BFF cookie-forward and `JSONResponse` error `code` fields. Lockfiles: npm in `ui/` (`package-lock.json`); do not introduce pnpm for one dependency.

### Latest tech (react-pdf 10.x)

- Docs: worker **must** be configured in the module that renders `Document`/`Page`; Next App Router: skip SSR (`next/dynamic` `ssr: false`).
- Worker filename in 10.x: `pdf.worker.min.mjs` via `import.meta.url`.
- `react-pdf` bundles `pdfjs-dist` — do not add a conflicting pin (ARCHITECTURE-SPINE stack table).

### Project context reference

Follow `_bmad-output/project-context.md` (money strings, i18n objects, Tailwind, no `NEXT_PUBLIC_` secrets, synthetic goldens).

## Dev Agent Record

### Agent Model Used

Cursor Grok 4.6

### Debug Log References

Host pytest: 522 passed, 194 skipped (Postgres-gated integration without DATABASE_URL). UI: typecheck clean, eslint no new errors, 469 vitest passed. FastAPI PDF route needed `response_model=None` so Union[Response, JSONResponse] would load.

### Completion Notes List

Evidence is display-only JSON on the statement; adapters still fail-loud and never persist failed lines as pending rows. Authenticated PDF bytes stay on the operator volume (BFF stream, no path on JSON). Comparison is visit-local Continue; dismiss is Story 5.2.

## Story-close overview — 5.1 / 5-1-parse-failure-side-by-side-comparison

**Request path:**
browser → `ui` BFF `GET /api/import/sessions/{id}/statements/{id}/pdf` (cookie) → FastAPI `GET /import/sessions/{id}/statements/{id}/pdf` → `GetStatementPdfService` → `PdfStorage.read` (volume confinement). Session JSON: upload/GET → `run_import_pipeline` / `create_session` JSONB `parse_evidence` → `asImportSession` → `ParseComparisonPanel`.

**Key components:**
`ParseEvidence` (`api/domain/parse_evidence.py`), adapter `fail_parse`, Alembic `0028_stmt_parse_evidence`, `GetStatementPdfService`, `ParseComparisonPanel` + `react-pdf@10.4.0`, `nextReviewStep` / `nextUnacknowledgedFailedStatement`.

**Why this shape:**
AD-3 keeps bytes off JSON; AD-1 keeps evidence in domain; FR-24 forbids putting failed lines on the assign queue; AC #5 Continue must not dismiss or commit.

**What not to break:**
Failed statements stay `rows: []` / `candidate_row_count` = candidate count (0). Sibling parse still survives. `nextReviewableRow` still skips empty failed rows. Clean sessions must not load `react-pdf`. Do not light IncompleteDisclosure or add dismiss here.

### File List

- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `api/adapters/bank/_shared.py`
- `api/adapters/bank/bac_credit/adapter.py`
- `api/adapters/bank/promerica_stub.py`
- `api/adapters/persistence/import_sessions.py`
- `api/adapters/persistence/migrations/versions/0028_stmt_parse_evidence.py`
- `api/adapters/persistence/models.py`
- `api/adapters/storage/pdf_storage.py`
- `api/api/routes/import_sessions.py`
- `api/api/schemas/import_sessions.py`
- `api/application/import_session.py`
- `api/application/ports.py`
- `api/domain/errors.py`
- `api/domain/parse_evidence.py`
- `api/scripts/generate_parse_failure_fixture.py`
- `api/tests/fixtures/pdf/promerica_stub_parse_failure_mixed.pdf`
- `api/tests/test_bac_adapter.py`
- `api/tests/test_import_session_application.py`
- `api/tests/test_import_sessions_integration.py`
- `api/tests/test_parse_evidence.py`
- `api/tests/test_pdf_storage.py`
- `api/tests/test_promerica_stub_adapter.py`
- `ui/app/api/import/sessions/[sessionId]/statements/[statementId]/pdf/route.ts`
- `ui/app/upload/ParseComparisonPanel.test.tsx`
- `ui/app/upload/ParseComparisonPanel.tsx`
- `ui/app/upload/bulk/[sessionId]/BulkReviewPanel.test.tsx`
- `ui/app/upload/bulk/[sessionId]/BulkReviewPanel.tsx`
- `ui/app/upload/review/[sessionId]/IndividualReviewPanel.test.tsx`
- `ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx`
- `ui/app/upload/reviewSequence.ts`
- `ui/app/upload/uploadClient.test.ts`
- `ui/app/upload/uploadClient.ts`
- `ui/lib/i18n/upload.ts`
- `ui/package-lock.json`
- `ui/package.json`

### Change Log

- 2026-08-26: Implemented parse-failure evidence, authenticated PDF GET, and side-by-side comparison UI (Story 5.1).

