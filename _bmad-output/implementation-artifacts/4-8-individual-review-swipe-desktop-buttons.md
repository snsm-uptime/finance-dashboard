---
baseline_commit: 7721e9a4b811c884b5140b06afb26015dde91b9a
---

# Story 4.8: Individual review (swipe / desktop buttons)

Status: done

> **⚠️ Superseded by Stories 4.12–4.16 (Sprint Change Proposal 2026-08-20).**
> This story shipped and satisfied the acceptance criteria below, which specify statement-level
> routing ("when I act on a statement"). That granularity was a specification defect: it makes
> individual review functionally identical to bulk review. The criteria below describe
> delivered-then-replaced behavior and are retained for history — they do not describe current
> product intent. Status stays `done`; the replacement is tracked as new stories.

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user reviewing statements one at a time,
I want phone swipes and desktop buttons for chosen list / default / skip,
so that I can route each statement deliberately (J1).

## Acceptance Criteria

1. **Given** Individual review on phone, **when** I act on a statement, **then** true swipe commits: right → chosen list (list picker first), left → configurable default list, down → skip. (FR-17, FR-18, AD-9, UX-DR11)
2. **Given** Individual review on desktop, **when** I act on a statement, **then** labeled buttons are primary for the same three outcomes — not swipe theatre.
3. **Given** high-intent accept (chosen list), **when** I proceed, **then** the list picker opens before the commit gesture/button.
4. **Given** accessible / Reduce Motion needs, **when** review is used, **then** non-gesture equivalents exist so outcomes are operable without swipe. (UX-DR19)
5. **Given** skip or dismiss file, **when** I confirm, **then** skip stores nothing for that statement; dismiss abandons remaining uncommitted statements from the upload. (FR-18)
6. **Given** clean parse, **when** I accept, **then** comparison UI does not appear — failures are Epic 5.

## Scope Note (read before starting)

This story builds the **Individual review screen only** — one statement at a time, three outcomes (chosen list / configurable default / skip), plus reusing the existing "dismiss file" (session discard). It assumes:

- Stories 4.6 (Import Session) and 4.7 (Bulk review) are `done` — confirmed in `sprint-status.yaml`. This story extends the **same** Import Session model 4.7 built on, not a parallel one.
- Statements in the session have a `status` of `staged` (clean parse) or `failed` (parse failure). This story's happy path is `staged` statements only — a `failed` statement is still shown in the review list (siblings must not be hidden, same invariant 4.6/4.7 already honor) but only **Skip** / **Dismiss file** are available for it; **Accept is disabled for `failed` statements** — the parse-failure comparison UI (PDF vs extracted rows) is Epic 5's territory, not this story's (AC #6).
- **Per-statement commit already exists and needs no change**: `ImportSessionRepository.commit_statement_batch` (`api/adapters/persistence/import_sessions.py`) already operates on **one** statement at a time — Story 4.7's `AssignBulkImportService` merely calls it in a loop over all staged statements. This story's individual-accept service calls the **same** port method **once**, for the one statement being reviewed. Do not modify `commit_statement_batch`'s signature or behavior.
- **Reuse, do not fork, the following exactly as Story 4.7 built them:** `AuthorizeListAccessService` with the existing `"import_to_list"` ACL action (4.7's own Completion Notes explicitly say: *"Story 4.8 (Individual review) should reuse the same action for its own per-statement commits rather than adding a third one"*) · `validate_bulk_candidate_row` (the money/description-integrity gate — despite its "bulk" name it is a generic candidate-row invariant, not Bulk-specific; do not write a second copy for Individual) · `MaterializeFxService.materialize_fx_for_entry` · `ManualExpenseDraft`.
- **New this story:** a statement-level (not session-level) eligibility gate — Bulk's `validate_bulk_commit_eligible` rejects the **whole session** if *any* statement is already committed (correct for Bulk's all-in-one-list semantics). Individual review commits statements one at a time, potentially to *different* lists, so that whole-session gate is wrong here. Add a narrower per-statement gate instead (Task 1).
- **New this story:** a `skipped` statement status + skip service/route/persistence, since nothing durable currently distinguishes "not yet reviewed" from "reviewed, chose skip" — without it, re-opening the same session would re-present already-skipped statements.
- **New this story:** `GET /import/sessions/{session_id}` — no route currently returns a session's current state without mutating it (upload/discard/bulk-commit all return a session or batch result as a side effect of an action). The Individual review screen needs to (re)fetch the live statement list + statuses to know which statement to show next. This is a thin addition: `import_sessions.py`'s route module already has a private `_session_response(session: ImportSessionRecord)` helper built for exactly this shape — reuse it, do not duplicate it.
- Not in scope: PDF comparison UI for parse failures (Epic 5), the dedup-count commit summary UI (Story 4.9 — land on the plain shared-expenses view instead, same minimal-landing precedent Story 4.7 set), card `routing_mode` gating on statements (still doesn't exist — Story 4.7 left an inline comment + canary test in `AssignBulkImportService.execute` about this; add the same comment to this story's individual-accept service so both call sites are flagged consistently, do not silently invent the gate here).

## Tasks / Subtasks

- [ ] Task 0: Prerequisite check
  - [ ] 0.1 Confirm `sprint-status.yaml` shows `4-6-...` and `4-7-...` as `done` (they are, as of this story's creation). If not, stop and flag rather than guessing the schema.

- [x] Task 1: Domain — statement-level accept/skip gates (AC: #1, #3, #5, #6)
  - [x] 1.1 `api/domain/import_session.py`: add `STATEMENT_STATUS_SKIPPED = "skipped"` to the module and to `STATEMENT_STATUSES`.
  - [x] 1.2 Add `validate_individual_accept_eligible(*, discarded_at, statement_status) -> None`: raises `ImportSessionDiscardedError` if `discarded_at is not None`; raises a new `ImportStatementNotAvailableError` if `statement_status != STATEMENT_STATUS_STAGED` (covers `failed` — no comparison UI yet, AC #6 — and `committed`/`skipped` — already resolved).
  - [x] 1.3 Add `validate_individual_skip_eligible(*, discarded_at, statement_status) -> None`: raises `ImportSessionDiscardedError` if discarded; raises `ImportStatementNotAvailableError` if `statement_status not in {STATEMENT_STATUS_STAGED, STATEMENT_STATUS_FAILED}` (a `failed` statement CAN be skipped — that's how the user moves past it until Epic 5 exists; `committed`/already-`skipped` cannot be skipped again).
  - [x] 1.4 `api/domain/errors.py`: add `ImportStatementNotAvailableError` (`CODE = "import_statement_not_available"`) and `ImportStatementNotFoundError` (`CODE = "import_statement_not_found"`, for a `statement_id` that doesn't belong to the fetched session).
  - [x] 1.5 Unit tests in `api/tests/test_import_session_domain.py`: accept-eligible on staged; rejects failed/committed/skipped/discarded; skip-eligible on staged and failed; rejects committed/skipped/discarded.

- [x] Task 2: Application — individual accept + skip services (AC: #1, #3, #5, #6)
  - [x] 2.1 `api/application/import_session.py`: `AssignIndividualImportCommand(actor_user_id, session_id, statement_id, list_id)` + `AssignIndividualImportService(session_repo, list_lookup, fx_service)`. Mirrors `AssignBulkImportService.execute` but operates on the **one** statement matching `statement_id` (raise `ImportStatementNotFoundError` if absent from the session): ACL-check `list_id` via `"import_to_list"` (reused, not new), run `validate_individual_accept_eligible`, build `ManualExpenseDraft` rows from that statement's `candidate_rows` via `validate_bulk_candidate_row` (reused) + FX materialization (reused), call `commit_statement_batch` **once** for this statement. Same inline comment as `AssignBulkImportService.execute` about the missing card/`routing_mode` gate (Scope Note).
  - [x] 2.2 `SkipStatementCommand(actor_user_id, session_id, statement_id)` + `SkipStatementService(session_repo)`: fetch session, find statement (404 if absent), run `validate_individual_skip_eligible`, call new repo method `skip_statement`.
  - [x] 2.3 `ImportSessionRepository` Protocol (same file): add `skip_statement(self, *, session_id: UUID, statement_id: UUID, user_id: UUID) -> ImportSessionRecord`.
  - [x] 2.4 `api/adapters/persistence/import_sessions.py`: implement `skip_statement` — fetch + verify ownership (`session_id`+`user_id`, same pattern as `discard_session`), set the matching `ImportStatementModel.status = STATEMENT_STATUS_SKIPPED`, flush, return `_session_record(row)`. Raise `ImportSessionNotFoundError` if the session/user pair doesn't match; raise `ImportStatementNotFoundError` if the statement isn't in that session.
  - [x] 2.5 Unit tests with fakes in `api/tests/test_import_session_application.py` (extend `_FakeImportSessionRepo` with `skip_statement`): accept commits exactly one batch for the targeted statement only (sibling staged statements untouched); accept on a `failed` statement → `ImportStatementNotAvailableError`; accept on already-`committed`/`skipped` → `ImportStatementNotAvailableError`; accept on discarded session → `ImportSessionDiscardedError`; unknown `statement_id` → `ImportStatementNotFoundError`; non-member list → denied, zero commits; skip on staged/failed → status flips to `skipped`; skip on committed/already-skipped → `ImportStatementNotAvailableError`.

- [x] Task 3: API — routes (AC: #1, #3, #5, #6)
  - [x] 3.1 `GET /import/sessions/{session_id}` in `api/api/routes/import_sessions.py`: thin read using existing `get_session` + the module's existing `_session_response` helper (reuse, do not duplicate). 404 via `import_session_not_found` if absent for this user.
  - [x] 3.2 `POST /import/sessions/{session_id}/statements/{statement_id}/commit`, body `{list_id: UUID}` (reused `BulkCommitBody`/`ImportBatchResponse` directly — same shape family as bulk-commit, no new schema classes needed). Composes `AssignIndividualImportService`. Serves **both** phone/desktop outcomes ("chosen list" and "configurable default list") — the caller picks which `list_id` to send (selected-in-picker vs. the user's `default_import_list_id` from `GET /auth/me`); the route does not need to know which case it is.
  - [x] 3.3 `POST /import/sessions/{session_id}/statements/{statement_id}/skip` (no body). Composes `SkipStatementService`.
  - [x] 3.4 Error mapping, following the existing bulk-commit route's exact pattern in the same file: `ImportSessionNotFoundError`/`ImportStatementNotFoundError` → 404; `NotListMemberError` → 403 `not_list_member`; `ImportSessionDiscardedError` → 409 `import_session_discarded`; `ImportStatementNotAvailableError` → 409 `import_statement_not_available`; `InvalidCanonicalLineError` → 422; FX errors → same 500/503/422 split the bulk-commit route already uses.
  - [x] 3.5 Postgres integration tests in `api/tests/test_import_sessions_integration.py`: `GET` round-trip (+ nonexistent/foreign 404s); accept happy path (1 batch, ledger row payer=actor, `import_batch_id` set, statement flips to `committed`); accept twice on same statement → second 409 `import_statement_not_available`; skip → statement status `skipped` in a follow-up `GET`; skip then accept same statement → 409; dismiss after a partial accept — session `discarded_at` set, already-committed statement's ledger rows untouched; unauthenticated → 401 on all 5 routes; non-member list on accept → 403; nonexistent session/statement → 404; discarded session → 409. (Accept-on-`failed`-statement 409 is covered at the application layer with a fake adapter — no real failing-parse PDF fixture exists yet to exercise it at the integration tier; documented rather than invented.)

- [x] Task 4: UI — Individual review screen (AC: #1, #2, #3, #4, #5, #6)
  - [x] 4.1 New route `ui/app/upload/review/[sessionId]/page.tsx` + `IndividualReviewPanel.tsx` (client component), following `BulkReviewPanel.tsx`'s composition (`usePreferences`, `uploadCopy`, `useFormSubmission`, `fetchLists`).
  - [x] 4.2 `ui/app/upload/uploadClient.ts`: added `fetchImportSession`, `commitIndividualStatement`, `skipStatement` + new BFF routes (`GET .../[sessionId]`, `POST .../statements/[statementId]/commit`, `POST .../statements/[statementId]/skip`) proxying to the new API routes. Widened `StagedStatement.status`/the response type guard to include `committed`/`skipped` (was `staged`/`failed`-only, would have silently dropped the new statuses).
  - [x] 4.3 Screen state: mount + post-action refetch via a `refreshKey`-driven effect (server is the source of truth); "current statement" = first `staged`/`failed` entry. When none remain, lands on `/lists/{lastAcceptedListId}` if an accept happened, else `/lists`.
  - [x] 4.4 List picker via `SoftLedgerSelect` + `fetchLists()`; chosen-list Accept disabled until picked (AC #3). Default list fetched via `fetch("/api/auth/me", ...)` (`DefaultImportListControl.tsx` pattern), no picker needed.
  - [x] 4.5 Three labeled buttons always rendered (Accept to chosen / Add to default / Skip) + Dismiss file (reuses `discardSession` unchanged).
  - [x] 4.6 Installed `@use-gesture/react@10.3.1` (was pinned in project-context, absent from `package.json` — this story's first consumer). `useDrag` bound to the statement card via `target: cardRef`, gated behind a `(pointer: coarse)` check computed via lazy `useState` initializer (not an effect — avoids the `react-hooks/set-state-in-effect` lint rule this repo enforces per the 4.7 CI-fix precedent). Right → chosen (only if picked), left → default (only if configured), down → skip; desktop never binds/fires.
  - [x] 4.7 No animated transform added on drag at all — buttons are the operable path unconditionally, trivially satisfying Reduce Motion.
  - [x] 4.8 `UploadPanel.tsx`: added "Review individually" link next to "Assign to a list".
  - [x] 4.9 i18n keys added to `ui/lib/i18n/upload.ts` — EN+ES.
  - [x] 4.10 Tailwind utilities only — no new `.module.css`/`.module.scss`.
  - Verified end-to-end against the live worktree dev stack (not just typecheck/lint): registered a user, uploaded the real BAC fixture, hit the new BFF routes through the actual Next.js dev server — skip flips status and persists (confirmed via follow-up `GET`), commit reaches the real service and fails loud (503 `fx_service_unavailable`) exactly like Bulk does on this fixture's one USD row without a live BCCR client wired, matching the existing `client_with_fx`-gated integration-test behavior. `tsc --noEmit` and `eslint .` both clean (0 errors).

- [x] Task 5: UI tests (AC: #1, #2, #3, #4, #5, #6)
  - [x] 5.1 `IndividualReviewPanel.test.tsx` (6 cases): chosen-list Accept button disabled until a list is selected, then commits `{sessionId, statementId, listId}` and advances to the next statement; default-list Accept commits with `default_import_list_id` without requiring a picker selection; Skip advances without any commit call; Accept is disabled for a `failed` statement (only Skip/Dismiss usable); Dismiss calls `discardSession` and navigates to `/upload`; when the last statement resolves, navigates to the accepted list's shared-expenses view. All exercised via button `click` events alone (the required non-gesture path, AC #4) — `@use-gesture/react`'s `useDrag` is mocked to a no-op since jsdom has no real pointer/touch gesture support to simulate.
  - [x] 5.2 `uploadClient.test.ts` (+11 cases): request-shape + error-mapping for `fetchImportSession` (200 incl. `committed`/`skipped` statuses, 404), `commitIndividualStatement` (200, 403/404/409×2/503), `skipStatement` (200, 409).

- [x] Task 6: Story-close overview (required before `done` — see Dev Notes)

### Review Findings

- [x] [Review][Patch] Delete unused i18n hint strings (`individualReviewAcceptChosenHint`/`AcceptDefaultHint`/`SkipHint`, EN+ES) — decided leftover from an earlier draft, never wired into `IndividualReviewPanel.tsx`. [ui/lib/i18n/upload.ts:42-46, 100-106]
- [x] [Review][Patch] Skip and commit can race without a guard: `skip_statement` re-reads and unconditionally overwrites `status` with no re-check at write time, so a concurrent commit landing between the service's eligibility read and this write can be silently overwritten to `skipped` even though ledger rows were already created for it. [api/adapters/persistence/import_sessions.py:242-264]
- [x] [Review][Patch] The card's `touch-pan-y` class plus `useDrag`'s `eventOptions: { passive: true }` lets the browser's native vertical scroll compete with (and can override) the same vertical axis the down-swipe "skip" gesture needs to detect — a reliability risk directly against AC #1's "down → skip". [ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx:211, 278]
- [x] [Review][Patch] `commit_individual_statement` returns only `ImportBatchResponse` (unlike `skip_individual_statement`, which returns the full session), forcing the UI to bump `refreshKey` and issue a second GET; in the window before that refetch resolves, `current` still reflects the pre-commit statement as actionable, risking a confusing duplicate-submit attempt. [api/api/routes/import_sessions.py:275-352, ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx:143-164]
- [x] [Review][Patch] The Dismiss button and the Accept/Skip actions use two independent `useFormSubmission` instances with separate `pending` flags and no cross-guard — a user can trigger Dismiss (session discard) while an Accept/Skip request is still in flight. [ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx:304, 316, 329, 344]
- [x] [Review][Patch] `nextReviewable()` does not check `session.discarded_at`, so after a session is discarded (e.g. via another tab) the panel still shows active Accept/Skip controls until the user clicks and hits a 409. [ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx:32-37]
- [x] [Review][Patch] When no default list is configured, the secondary button's label falls back to the full long hint sentence (`individualReviewNoDefaultList`) instead of a short placeholder, producing "Add to No default list configured — set one from your cards page." — deviates from the labeled-button pattern in AC #2. [ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx:322-325]
- [x] [Review][Patch] `aria-label={current.product_id}` on the review card exposes a raw internal identifier (e.g. `"bac_credit"`) to screen readers instead of a human-readable label. [ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx:277]
- [x] [Review][Patch] The same "Loading your lists…" copy is shown both while the session itself is still loading and in the brief post-load/no-current state, with no distinct "loading session" message. [ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx:254-258, 338]
- [x] [Review][Patch] `commit_individual_statement`'s request body reuses `BulkCommitBody` directly — same shape today, but couples the Individual endpoint's contract to a type named for Bulk. [api/api/routes/import_sessions.py:279]
- [x] [Review][Patch] No test exercises the real swipe→action mapping logic — `IndividualReviewPanel.test.tsx` mocks `useDrag` to a no-op, so the direction/distance/velocity branches inside the actual handler are never executed by any test. [ui/app/upload/review/[sessionId]/IndividualReviewPanel.test.tsx, IndividualReviewPanel.tsx:192-212]
- [x] [Review][Patch] The failed-statement UI test doesn't assert the primary "Accept to {chosen list}" button is disabled — only the default-list button and Skip are checked. [ui/app/upload/review/[sessionId]/IndividualReviewPanel.test.tsx]
- [x] [Review][Patch] No integration test proves a `statement_id` from a different session is rejected as not-found via the Individual routes (existing "not found" tests only use a random UUID); code appears correctly scoped but the guarantee is untested. [api/tests/test_import_sessions_integration.py]
- [x] [Review][Patch] No dedicated "reject on first invalid candidate row, no partial commit" test for the Individual accept path — Bulk has one covering shared validation code; Individual has none of its own. [api/tests/test_import_session_application.py]
- [x] [Review][Defer] `discarded_at: object | None` typing on the new eligibility-gate functions loses type-checker protection — deferred, pre-existing pattern inherited from Bulk's identical `validate_bulk_commit_eligible` signature (Story 4.7), not a new regression. [api/domain/import_session.py:65-90]
- [x] [Review][Defer] Zero-candidate-row staged statement can be committed via Individual accept with 0 ledger entries — deferred, extends the identical Bulk-path gap already reviewed and accepted as "benign, untested" in Story 4.7's own deferred-work entry; Individual has no equivalent check either. [api/application/import_session.py:417-446, api/domain/import_session.py:65-78]

## Dev Notes

### What is certain regardless of exact naming choices above

- **AD-9** (binding, adopted): phone **must** implement true swipe; desktop **must** use buttons as primary; vectors are right→chosen (picker first), left→default, down→skip; same three outcomes as labeled buttons on both platforms; accessible non-gesture equivalents required (WCAG 2.2 AA floor). This story is AD-9's first and only implementer — do not invent a fourth vector or reorder R/L/D.
- **AD-4**: one `batch_id` per Statement — already enforced by the existing `commit_statement_batch`/`import_batches.statement_id` UNIQUE constraint (Story 4.7). This story's individual-accept path reuses that unchanged; it must not add a second batching mechanism.
- **AD-19 / FR-11/FR-12 membership**: "chosen list" and "default list" both mean *a list the user is a member of* — the existing `"import_to_list"` ACL action already enforces this identically for both; do not add a separate check for "default" vs "chosen".
- **FR-19**: payer defaults to the actor, remains editable — unchanged from 4.7, no new payer logic needed here.
- **FR-18 "skip means no ledger rows"**: skip must never call `commit_statement_batch` or write to `ledger_entries` — it only flips the statement's own status.
- **AC #6 boundary**: this story's happy path is clean (`staged`) parses only. A `failed` statement is visible (siblings not hidden — same invariant as 4.6/4.7) but not acceptable; Epic 5 owns the comparison UI.

### Hexagonal placement (AD-1)

Same boundaries every Epic 4 story has followed: `domain/` pure validation only (no DB/HTTP) — Task 1; `application/` composes ports (session repo + `ListAccessLookup` + FX service), mirroring `AssignBulkImportService`'s two/three-port shape — Task 2; `adapters/persistence/` implements the new `skip_statement` port method — Task 2.4; `api/routes/` stays a thin HTTP→service translation layer — Task 3; `ui` talks to `api` only via same-origin BFF routes (`ui/app/api/import/sessions/...`) — never directly, never DB/parsers in `ui`.

### Testing Requirements (project-context "Discipline" + "Layers")

- Domain: pure unit tests, no DB.
- Application: unit tests with fakes, no DB — extend `test_import_session_application.py`'s existing `_FakeImportSessionRepo`/`_FakeListLookup`/`_FakeFxService` rather than writing new fakes (Story 4.7 precedent).
- Integration: Postgres 16 via the existing `DATABASE_URL`-gated `TestClient` fixtures in `test_import_sessions_integration.py` — reuse the BAC acceptance-bar fixture and `client_with_fx` fixture 4.7 already built; do not create a second fixture helper.
- UI: co-located component test file (`IndividualReviewPanel.test.tsx`) next to the component, Testing Library convention already established.
- Money assertions use `Decimal`, never `float` (AD-5) — this story's rows flow through the same `commit_statement_batch` path as Bulk/manual expenses, which already enforces this; no new money logic is introduced here.
- UI critical minimum (project-context "Layers"): Individual review outcomes **including the non-gesture path** must be covered — do not rely on a single gesture-simulated smoke test.

### Story-close overview (required before `done`)

Per `_bmad-output/implementation-artifacts/story-close-overview-checklist.md`, paste the four-section template (Request path / Key components / Why this shape / What not to break) into Completion Notes before marking this story `done` — see `4-7-bulk-review-assign-commit-path.md`'s Completion Notes for the expected format.

### Project Structure Notes

- Extends the existing Import Session bounded context (`api/domain/import_session.py`, `api/application/import_session.py`, `api/adapters/persistence/import_sessions.py`, `api/api/routes/import_sessions.py`) — do not create a competing module.
- No new Alembic migration expected: `skipped` is a new *value* for the existing `import_statements.status` `String(16)` column, not a new column/table (`"skipped"` is 7 characters, fits the existing width).
- `@use-gesture/react` is pinned in `project-context.md`'s stack table (`10.3.x`) but **absent from `ui/package.json`** as of this story — this is the story that installs it. It is not an "additional dependency needing approval" — it was already pre-approved at the architecture-spine level for exactly this purpose (AD-9). Do not substitute a different gesture library.
- Reuses (do not duplicate): `fetchLists()` + `SoftLedgerSelect` (Story 4.3/4.7), `AuthorizeListAccessService`/`"import_to_list"` action (Story 2.2/4.7), `commit_statement_batch` (Story 4.7, unmodified), `validate_bulk_candidate_row` (Story 4.7 review finding — despite the name, it's a generic candidate-row gate), `MaterializeFxService.materialize_fx_for_entry` (Epic 3), the `GET /api/auth/me` → `default_import_list_id` fetch pattern (`ui/app/cards/DefaultImportListControl.tsx`).
- `PDF_STORAGE_PATH` must be set for the `api` CI job for any new import-session integration tests to run (Story 4.7 fixed a pre-existing gap here — confirm it's still set, do not re-break it).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.8: Individual review (swipe / desktop buttons)] — ACs, story statement.
- [Source: _bmad-output/planning-artifacts/prds/prd-finance-helper-2026-08-02/prd.md#FR-17: Bulk or individual review, #FR-18: Individual review outcomes, #FR-19: Explicit payer] — exact outcome semantics ("skip means no ledger rows", "dismiss abandons remaining uncommitted statements", payer default/editable).
- [Source: _bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md#AD-9 — Individual review gestures, AD-4, AD-19] — binding gesture/vector rule; batch/ACL invariants reused from 4.7.
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/EXPERIENCE.md] lines 30-31, 79-81, 113-115, 136, 148-149 — Individual review IA, review card/action-button component patterns, accessibility floor (labeled outcomes, non-gesture equivalents), phone-swipe-primary/desktop-buttons-primary platform split.
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/.working/journey-j1-upload.md] — J1 narrative: list picker before accept gesture/button; outcomes = chosen / default (household) / skip.
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/mockups/review-individual.html] lines 655-707 — concrete desktop button labeling reference ("Accept to {list}" primary / "Add to {default}" secondary / "Skip" ghost) and list-picker-before-actions layout. DESIGN.md/EXPERIENCE.md win over this mock on any conflict (project-context).
- [Source: _bmad-output/implementation-artifacts/4-7-bulk-review-assign-commit-path.md] — real Import Session schema/services (`ImportSessionRepository.commit_statement_batch` is already per-statement), `"import_to_list"` ACL-action reuse instruction (explicit forward note to this story in its own Completion Notes/story-close overview), `validate_bulk_candidate_row`/FX/draft reuse, UI composition pattern (`BulkReviewPanel.tsx`), error-mapping convention, `GET /api/auth/me` default-list-fetch precedent.
- [Source: _bmad-output/project-context.md] — hexagonal boundaries, membership-over-ownership ACL, Decimal money, Tailwind-only styling (no new CSS Modules), i18n per-domain TS files, testing layers/discipline, "Individual: phone swipe R/L/D; desktop buttons; list picker before high-intent accept; a11y equivalents (AD-9)" verified-conventions line.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- Ran the full domain/application/integration suite inside the worktree's own Compose `api` container (`docker compose exec api uv run pytest ...`) rather than the host venv for the Postgres-gated integration tests — host had no `DATABASE_URL`; the container already carries it plus `PDF_STORAGE_PATH`.
- First run of the new nested BFF routes (`/api/import/sessions/{id}/statements/{id}/commit|skip`) 404'd against the live `ui` dev server even though the files existed on disk and in the container (confirmed via `docker compose exec ui find ...`). Root cause: stale Turbopack route manifest — the dev server was already running when these doubly-nested dynamic route files were added. Fixed by restarting the `ui` container; not a code defect (single-level-nested routes added earlier, like the `GET` on `[sessionId]/route.ts`, worked immediately). Re-verified both routes end-to-end afterward.
- `ruff format` reformatted 5 files on first run (line-length/wrap only, no logic changes) — re-ran the affected test files after to confirm behavior unchanged.
- Two `react-hooks/set-state-in-effect` ESLint errors on first pass (fetch-on-mount effect calling an externally-defined async function; a synchronous `matchMedia` effect) — this is the same rule Story 4.7's CI-fix commit (`60c384c`) hit on `OriginChipPicker.tsx`. Fixed by (1) inlining the async fetch function inside the effect per the `BulkReviewPanel`/`UploadPanel` convention, driven by a `refreshKey` dependency instead of an imperative external call, and (2) replacing the `matchMedia` effect with a lazy `useState` initializer (no effect needed at all for a one-time synchronous read).

### Completion Notes List

- All 6 tasks complete, TDD red→green per task. Backend: domain (12 new unit tests), application (12 new unit tests with fakes), API (18 new Postgres-gated integration tests incl. `GET` round-trip, individual accept/skip happy paths, 403/404×2/409×3/401). UI: `uploadClient.test.ts` (+11 cases), `IndividualReviewPanel.test.tsx` (6 new cases).
- Individual review reuses Story 4.7's per-statement `commit_statement_batch` port method **unchanged** — `AssignIndividualImportService` calls it once per statement instead of looping over all staged statements like `AssignBulkImportService` does. No new persistence primitive for the commit path itself; the only new persistence is `skip_statement` (flips one statement's status, no ledger writes).
- New per-statement (not session-wide) eligibility gates were required because Bulk's `validate_bulk_commit_eligible` rejects the *whole session* on any already-committed statement — wrong for Individual, which commits statements one at a time to potentially different lists. Added `validate_individual_accept_eligible`/`validate_individual_skip_eligible` plus a new `skipped` statement status and two new domain errors (`ImportStatementNotAvailableError`, `ImportStatementNotFoundError`) rather than overloading the existing Bulk-specific ones.
- Reused per the story's own reuse instructions (all confirmed unchanged): `"import_to_list"` ACL action, `validate_bulk_candidate_row`, `MaterializeFxService.materialize_fx_for_entry`, `ManualExpenseDraft`, `SoftLedgerSelect`/`fetchLists()`, the `GET /api/auth/me` → `default_import_list_id` fetch pattern from `DefaultImportListControl.tsx`.
- New: `GET /import/sessions/{session_id}` (thin read, reuses the existing `_session_response` helper) — needed since no prior route returned a session's live state without also mutating it, and Individual review must refetch statement statuses between actions.
- Installed `@use-gesture/react@10.3.1` (pinned in `project-context.md`, previously absent from `package.json`) — this story's swipe gestures are its first real consumer. `useDrag` is bound via `target: cardRef` and gated behind a `(pointer: coarse)` check so desktop mouse input never fires a gesture-driven commit (AC #2); right/left/down map to chosen/default/skip exactly per AD-9, with the three labeled buttons always rendered as the non-gesture equivalent (AC #4) — no animated transform was added at all, so Reduce Motion is trivially satisfied rather than needing a `prefers-reduced-motion` branch.
- Widened `StagedStatement.status` (and its runtime type guard) from `"staged" | "failed"` to include `"committed" | "skipped"` in `uploadClient.ts` — the existing guard would have silently dropped those two new statuses from any parsed `GET`/skip response, which Individual review depends on to detect "no statement left to review."
- Verified end-to-end against the live worktree Compose stack (not just unit/integration tests): registered a real user, uploaded the real BAC acceptance-bar fixture, and drove the new BFF routes through the actual Next.js dev server — skip flips status and persists across a follow-up `GET`; commit reaches the real service and fails loud (503 `fx_service_unavailable`) on the fixture's one USD row without a live BCCR client, matching the same behavior Story 4.7's `client_with_fx`-gated integration tests already prove for Bulk.
- Final regression: `api` 569 passed (0 failed), `ruff check` / `ruff format --check` clean on all touched files. `ui` 291 passed / 1 pre-existing unrelated failure (`OriginChipPicker.test.tsx`, confirmed via `git log` to originate from commit `7721e9a` "removed border" at this story's own `baseline_commit` — predates this story), `tsc --noEmit` clean, `eslint .` clean (0 errors, 3 pre-existing unrelated warnings in files this story never touched).

## Story-close overview — 4-8-individual-review-swipe-desktop-buttons

**Request path:**
Browser → `ui` `UploadPanel` ("Review individually" link) → `IndividualReviewPanel` (`ui/app/upload/review/[sessionId]/page.tsx`, client component: `SoftLedgerSelect` + `fetchLists()` + `fetch("/api/auth/me")` for the default list) → same-origin BFF (`GET /api/import/sessions/{id}`, `POST .../statements/{id}/commit`, `POST .../statements/{id}/skip`, new) → `api` (`GET /import/sessions/{id}`, `POST .../statements/{id}/commit`, `POST .../statements/{id}/skip`, new routes) → `AssignIndividualImportService` / `SkipStatementService` (new) → `AuthorizeListAccessService` (`import_to_list`, reused) + `validate_individual_accept_eligible`/`validate_individual_skip_eligible` (new pure domain gates) + `MaterializeFxService.materialize_fx_for_entry` (reused, accept only) → `SqlAlchemyImportSessionRepository.commit_statement_batch` (Story 4.7, reused unmodified, called once per statement) or the new `.skip_statement` (flips status only, no ledger writes) — same request-scoped-transaction all-or-nothing semantics as Bulk. On success, the panel refetches the session (accept) or uses the returned session directly (skip) to find the next un-reviewed statement; when none remain it navigates to the last-accepted list's shared-expenses view (or `/lists` if only skips/none accepted).

**Key components:**
`api/domain/import_session.py` (`STATEMENT_STATUS_SKIPPED`, `validate_individual_accept_eligible`, `validate_individual_skip_eligible`) · `api/domain/errors.py` (`ImportStatementNotAvailableError`, `ImportStatementNotFoundError`) · `api/application/import_session.py` (`AssignIndividualImportService`, `SkipStatementService`, `skip_statement` port) · `api/adapters/persistence/import_sessions.py` (`skip_statement` impl) · `api/api/routes/import_sessions.py` (`GET`, per-statement `commit`/`skip` routes) · `ui/app/upload/uploadClient.ts` (`fetchImportSession`, `commitIndividualStatement`, `skipStatement`) · `ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx` (+`page.tsx`) · 3 new BFF route files under `ui/app/api/import/sessions/[sessionId]/...`.

**Why this shape:**
Bulk's session-wide commit-eligibility gate and its "loop over all staged statements" service shape are both wrong for Individual review, which commits one statement at a time to potentially different lists — so this story added narrower per-statement gates and a per-statement service, while deliberately reusing the underlying per-statement `commit_statement_batch` persistence method Story 4.7 already built (it never needed to be session-wide in the first place). A `skipped` status was added rather than treating "not yet reviewed" and "reviewed, chose skip" as the same state, so a re-opened session doesn't re-present resolved statements.

**What not to break:**
- `commit_statement_batch`'s per-statement, one-batch-per-statement contract (AD-4) is now called from two places (Bulk's loop, Individual's single call) — do not change its signature without checking both call sites.
- The `"import_to_list"` ACL action is now used by three services (manual bulk-commit precedent aside) — Story 4.9 (commit batch / dedup summary) should keep reusing it, not add a fourth action.
- `STATEMENT_STATUS_SKIPPED` is a terminal status like `committed` — no code path should transition a `skipped` or `committed` statement back to `staged`; `validate_individual_accept_eligible`/`_skip_eligible` are the only gates that should ever guard a statement-status transition.
- The new `GET /import/sessions/{session_id}` route is read-only and side-effect-free — future stories needing session state should call it rather than piggybacking a read onto a mutating route's response.
- Card `routing_mode` gating on statements still does not exist (same gap Story 4.7 flagged) — both `AssignBulkImportService.execute` and `AssignIndividualImportService.execute` carry the same inline comment and are covered by the same canary test (`test_staged_statement_record_has_no_unchecked_card_routing_field`); do not remove either comment until that gate is actually added.

### File List

**New files:**
- `_bmad-output/implementation-artifacts/4-8-individual-review-swipe-desktop-buttons.md`
- `ui/app/upload/review/[sessionId]/page.tsx`
- `ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx`
- `ui/app/upload/review/[sessionId]/IndividualReviewPanel.test.tsx`
- `ui/app/api/import/sessions/[sessionId]/statements/[statementId]/commit/route.ts`
- `ui/app/api/import/sessions/[sessionId]/statements/[statementId]/skip/route.ts`

**Modified files:**
- `api/domain/import_session.py`
- `api/domain/errors.py`
- `api/application/import_session.py`
- `api/adapters/persistence/import_sessions.py`
- `api/api/routes/import_sessions.py`
- `api/tests/test_import_session_domain.py`
- `api/tests/test_import_session_application.py`
- `api/tests/test_import_sessions_integration.py`
- `ui/app/api/import/sessions/[sessionId]/route.ts`
- `ui/app/upload/UploadPanel.tsx`
- `ui/app/upload/uploadClient.ts`
- `ui/app/upload/uploadClient.test.ts`
- `ui/lib/i18n/upload.ts`
- `ui/package.json`
- `ui/package-lock.json`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Change Log

- 2026-08-19: Story context created via `bmad-create-story` (deferred from Epic 4's original queue position — Stories 4.6/4.7 already `done`, no prerequisite gap this time). Status → ready-for-dev.
- 2026-08-19: Implemented via `dev-story` — per-statement accept/skip domain gates, `AssignIndividualImportService`/`SkipStatementService`, 3 new API routes, Individual review UI (phone swipe via `@use-gesture/react` + desktop buttons + list picker + dismiss), tests at every layer. Status → review.
