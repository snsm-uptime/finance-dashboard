---
baseline_commit: 0557bcba977df04e09263a7d0c4a86899d5ed8a2
---

# Story 4.7: Bulk review assign & commit path

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

**Correct-course pointer (2026-08-17):** Story 4.4 is now `done`, but Story 4.6 (this story's direct prerequisite for the Import Session schema) has been flagged for a structural redraft — its guessed `ImportPipeline` port doesn't match 4.4's real `BankAdapter`/`detect_bank_adapter()` shape. See `_bmad-output/planning-artifacts/sprint-change-proposal-2026-08-17.md`. This story's own Task 0 gate (below) already requires 4.4–4.6 all `done` before re-verification — that condition is not yet met (4.6 needs its redraft first). No change to this story's own text otherwise; revisit once 4.6 actually lands.

## ⚠️ Prerequisites gap — read before starting

**Stories 4.4, 4.5, and 4.6 are `backlog` (not implemented) as of this story's creation.** This story was created out of epic order at explicit user request (sprint order in `epics.md` and `project-context.md`'s "Order & independence: follow epics.md" rule would normally block this). Confirmed via repo search: **zero** import/upload/statement/session code exists anywhere in `api/` or `ui/` (only unrelated matches like `uvicorn/importer.py`).

4.7's own ACs assume infrastructure that Stories 4.4–4.6 are responsible for building:

| What 4.7 assumes exists | Which story owns it |
|---|---|
| PDF upload endpoint + operator-volume staging | 4.6 |
| Detect → split → parse → normalize adapter pipeline | 4.4, 4.5 |
| `CanonicalLine` contract (AD-16) | 4.4 |
| **Import Session** entity (staged statements + candidate rows) | 4.6 |
| Product/bank identity per statement (for card→list default) | 4.4 |
| Domain dedup identity computation at commit (AD-18) | 4.4 |

**Do not invent this infrastructure ad hoc inside this story.** The Import Session / Statement / CanonicalLine schema is architecturally significant (AD-4, AD-16, AD-18) and is Stories 4.4–4.6's design responsibility — building a parallel or simplified version here risks a schema that conflicts with (or is discarded by) those stories when they land, wasting this story's work.

**Required sequencing when this story is picked up for `dev-story`:**
1. Confirm Stories 4.4, 4.5, 4.6 are `done` in `sprint-status.yaml`. If not, **stop** and run `create-story` / `dev-story` for 4.4 → 4.5 → 4.6 first, in that order (4.6 depends on 4.4; 4.5 is CI-fixture work that can run alongside 4.4 but must land before 4.6's "clean parse" happy path is testable).
2. Once 4.4–4.6 are `done`, **re-run `create-story` for 4.7** (or at minimum re-read this file against the by-then-real Import Session schema) before writing code — the task breakdown below describes the *behavior* this story owns (Bulk mode assignment + per-statement batch commit) at the level knowable today, but concrete file/table/field names for the Import Session it consumes could not be verified against real code and are marked `[VERIFY AGAINST 4.6 SCHEMA]` throughout.
3. This story's own scope, once unblocked, is strictly: the Bulk-mode review screen, list selection/pre-selection, and the commit-as-batch-per-statement flow. It does **not** include building Individual review (Story 4.8) or the dedup/summary/PDF-cleanup finale (Story 4.9) — those stories consume the same Import Session concept but own their own UI/commit paths.

If you are the dev agent and 4.4–4.6 are still backlog, halt and report back rather than guessing the staging schema.

## Story

As a user importing under review routing,
I want Bulk mode to send the whole upload to one list I choose,
So that I can finish a multi-statement file in one assignment when I'm not reviewing card-by-card.

## Acceptance Criteria

1. **Given** review routing and I choose Bulk, **when** I pick a destination list I belong to, **then** the whole upload is assigned to that list before commit. (FR-17)
2. **Given** I started Upload from inside a list, **when** Bulk mode is selected, **then** that list may be pre-selected as destination — Individual default destination is unchanged. (UX-DR23)
3. **Given** statements parse cleanly, **when** I confirm Bulk commit, **then** each statement commits as its own Import Batch under the session (AD-4), **and** payer on imported expenses defaults to me and remains editable. (FR-19)
4. **Given** parse failure on a statement, **when** Bulk is in progress, **then** failure handling for that statement is deferred to Epic 5 — this story's happy path is clean parses only.

## Scope Note (read before starting)

This story builds the **Bulk review assignment and commit UI/flow only** — pick-one-list-for-the-whole-upload, confirm, and per-statement batch commit. It assumes:
- An Import Session already exists with N staged statements, each carrying candidate `CanonicalLine` rows and a `routing_mode`/card association from Story 4.3 (`fixed`/`review` per card) — Bulk applies only when the relevant card(s) are in `review` mode (Story 4.3's fixed-list mode bypasses review entirely per its own AC #1).
- Statements in the session have already parsed cleanly (4.4/4.5's adapter output) — this story does not parse anything itself.
- The mode choice (Bulk vs Individual) itself is presented by the Upload flow (Story 4.6's UI) before reaching this story's screen; **this story owns what happens after Bulk is chosen**, not the Upload/mode-picker screen itself. If 4.6 has not built that picker yet, this story's dev-story pass may need a minimal entry point (e.g. a directly-linked Bulk review route) — flag this as a deviation in Completion Notes rather than silently building a full mode-picker UI (that's 4.6/4.8 territory).
- Individual review (swipe/buttons, Story 4.8) and the dedup-summary/settle-strip landing + PDF cleanup (Story 4.9) are explicitly **not** part of this story. Bulk commit in this story should land the user somewhere sensible (the assigned list's shared-expenses view is the natural choice, matching 4.9's eventual behavior for Individual) but the dedup-count summary UI itself belongs to 4.9 — implement the simplest correct landing without duplicating 4.9's summary chrome.

## Tasks / Subtasks

- [x] Task 0: Prerequisite gate (read "Prerequisites gap" above)
  - [x] 0.1 Verified `sprint-status.yaml` shows `4-4-...`, `4-5-...`, `4-6-...` all `done`.
  - [x] 0.2 Read 4.4/4.6's real code (not just story files) via a dedicated research pass. Real schema (replacing every marker below): `import_sessions`/`ImportSessionModel`, `import_statements`/`ImportStatementModel` (`status`: `staged`/`failed`, extended this story with `committed`), `import_candidate_rows`/`ImportCandidateRowModel` → `CanonicalLine` (`api/domain/canonical_line.py`). Application: `api/application/import_session.py` (`ImportSessionRepository`, `ImportSessionRecord`, `StagedStatementRecord`). Persistence: `api/adapters/persistence/import_sessions.py` (`SqlAlchemyImportSessionRepository`). Route: `api/api/routes/import_sessions.py`, prefix `/import/sessions`. **No `import_batches` table or Import Batch concept existed at all** — genuinely greenfield, built fresh this story (Task 2/migration below).

- [x] Task 1: Domain — Bulk assignment validation (AC: #1, #3)
  - [x] 1.1 `api/domain/import_session.py`: added `STATEMENT_STATUS_COMMITTED` + pure `validate_bulk_commit_eligible(discarded_at, statement_statuses)` — rejects a discarded session, a session with any already-committed statement (no double-commit, AD-4), or a session with no staged statement (AC #4). No DB/HTTP imports.
  - [x] 1.2 Reused Story 2.2's `AuthorizeListAccessService`/`ListAccessLookup` — **deviation from story text**: `api/domain/list_access.py` already declared `"import_to_list"` in `_MEMBER_MUTATION_ACTIONS`, unused by any prior story. Reused that existing action instead of adding a new `"import_bulk_to_list"` — this story is its first real consumer.
  - [x] 1.3 Unit tests in `api/tests/test_import_session_domain.py`: accepts staged+failed mix; rejects discarded; rejects already-committed; rejects all-failed; rejects empty session (5 new tests).

- [x] Task 2: Application — `AssignBulkImportService` (AC: #1, #2, #3)
  - [x] 2.1 `api/application/import_session.py`: `AssignBulkImportCommand(actor_user_id, session_id, list_id)` + `AssignBulkImportService(session_repo, list_lookup, fx_service)` — fetches session, ACL-checks the chosen list (`import_to_list`), runs Task 1.1 validation, then per staged statement builds one `ManualExpenseDraft` per candidate row (payer = actor per FR-19, reusing Story 3.2's exact draft type — no second payer representation) and commits one Import Batch per statement (AD-4) via the new `ImportSessionRepository.commit_statement_batch` port method.
  - [x] 2.2 N/A as written — domain dedup identity (AD-18, `compute_canonical_identity`) is 4.4's own concern for future re-import dedup; this story's commit path does not need to compute or check it (no re-import/dedup scenario is in this story's scope — see Scope Note). Not skipped by oversight; documented here as a deliberate no-op for this story.
  - [x] 2.3 FX materialization reuses `MaterializeFxService.materialize_fx_for_entry` (Epic 3, `api/application/fx_service.py`) exactly as `CreateManualExpenseService` does — **deviation from story text**: the guessed function name `materialize_fx_to_crc` does not exist; the real one is `materialize_fx_for_entry`.
  - [x] 2.4 Unit tests with fakes in `api/tests/test_import_session_application.py` (new `_FakeListLookup`/`_FakeFxService`, extended `_FakeImportSessionRepo` with `commit_statement_batch`): 2 clean statements → 2 batches, payer = actor; a failed statement is excluded and not committed; nonexistent session → 404-equivalent error; non-member list → denied, zero commits; discarded session → rejected, zero commits; all-failed session → rejected; already-committed session on second call → rejected, no double-commit (7 new tests).

- [x] Task 3: API — routes (AC: #1, #2, #3)
  - [x] 3.1 New route `POST /import/sessions/{session_id}/bulk-commit` (real prefix is `/import/sessions`, not the guessed `/import-sessions`), body `{list_id: UUID}`, `Depends(require_authenticated_user)`. Composes `AssignBulkImportService` with `SqlAlchemyImportSessionRepository(db)` + `SqlAlchemyListRepository(db)` (existing `ListAccessLookup`), mirroring `SetCardRoutingService`'s two-repo composition at `api/api/routes/cards.py`.
  - [x] 3.2 Error mapping (documented choice): ACL denial → 403 `not_list_member`; session not found → 404 `import_session_not_found`; discarded session → **409** `import_session_discarded`; already-committed session → **409** `import_session_already_committed` (state-conflict, not validation failure); no clean statements → 422 `no_clean_statements_to_commit`; FX errors reuse `lists.py`'s existing classification (500/503/422 by error type).
  - [x] 3.3 Postgres integration tests in `api/tests/test_import_sessions_integration.py` (14 new tests): happy path with the real BAC acceptance-bar fixture (incl. its one USD row, via a `client_with_fx` fixture carrying a deterministic fake BCCR client) → 1 batch, ledger rows land with payer = actor, provenance = `parser`; non-member list → 403; nonexistent session → 404; discarded session → 409; commit twice → second call 409, ledger row count unchanged (no double-commit); a USD row against the real deferred `UnavailableBccrClient` → 503 `fx_service_unavailable` (fails loud, AD-7); unauthenticated → 401.

- [x] Task 4: UI — Bulk review screen (AC: #1, #2, #3)
  - [x] 4.1 New route `ui/app/upload/bulk/[sessionId]/page.tsx` + `BulkReviewPanel.tsx` — **deviation from story text, flagged per this story's own contingency note**: Story 4.6 built no Bulk/Individual mode picker at all (`UploadPanel.tsx` only lists staged/failed statements + Discard). This story adds a minimal, directly-linked entry point ("Assign to a list" button in `UploadPanel.tsx` after a successful upload) rather than building 4.6/4.8's mode-picker UI. List picker uses `SoftLedgerSelect` + `fetchLists()` (unchanged). Pre-select reads an optional `?listId=` query param (AC #2/UX-DR23) — nothing yet constructs that URL with a real list context since 4.6 has no list-scoped upload entry point either; the mechanism is in place for a future story to wire. `default_import_list_id` (Individual's setting) is untouched.
  - [x] 4.2 Confirm action calls `bulkCommitSession()` — co-located in `ui/app/upload/uploadClient.ts` (real file name; 4.6 did not create a separate `importsClient.ts`), following the existing fetch-wrapper + `mapError` convention.
  - [x] 4.3 i18n keys added to `ui/lib/i18n/upload.ts` (real file; 4.6 did not create `imports.ts`) — EN+ES.
  - [x] 4.4 On successful commit, navigates to `/lists/{listId}` (the assigned list's shared-expenses view) via `router.push`. No dedup-summary chrome built (4.9's territory).
  - [x] 4.5 Tailwind utilities only, co-located — no new `.module.css`/`.module.scss`.

- [x] Task 5: UI tests (AC: #1, #2, #3)
  - [x] 5.1 `BulkReviewPanel.test.tsx` (3 cases): confirm disabled until a list chosen, then commits with the right `{sessionId, listId}` and navigates via `router.push` on success; pre-selects from `?listId=` when it's a valid membership; a denial error surfaces inline without navigating. Plus 6 new `uploadClient.test.ts` cases for `bulkCommitSession`'s request shape and error-code mapping (403/409×2/503).

- [x] Task 6: Story-close overview (required before `done` — see Dev Notes)

## Dev Notes

### Why this story is unusually thin on concrete file/table names

Unlike Stories 4.1–4.3 (which extended already-live `cards`/`lists`/`users` tables and existing services with verified line numbers), 4.7 sits on top of an Import Session data model that Stories 4.4–4.6 have not yet built. Every `[VERIFY AGAINST 4.6 SCHEMA]` marker above is a placeholder for a design decision that belongs to those stories, not this one. **Do not treat this story's task list as a green light to design the Import Session schema** — that would duplicate (and likely conflict with) 4.4/4.6's own architecture work. See the "Prerequisites gap" section at the top of this file.

### What is certain regardless of 4.4–4.6's exact schema

These project-wide invariants apply no matter how the Import Session ends up shaped:
- **AD-4**: Import Batch boundary is one Statement's accept/commit — Bulk must create one `batch_id` per statement, not one batch for the whole upload.
- **AD-18**: domain alone computes dedup identity at commit — this story's service calls into that, never recomputes or bypasses it.
- **AD-19 / FR-11/FR-12 membership-not-ownership**: "a list I belong to" (AC #1) means membership, reuse `AuthorizeListAccessService` exactly as Story 4.3 did for `route_card_to_list`/`set_default_import_list`.
- **FR-19**: payer defaults to the current user (the person performing the Bulk commit, i.e. `actor_user_id`), remains editable after commit — same payer semantics as Story 3.2's manual expenses, do not invent a separate payer model for imported rows.
- **AD-7**: FX materialization at commit for non-CRC lines is the existing Epic 3 path — reuse it.
- **AC #4 boundary**: this story's happy path is clean parses only; a statement that failed to parse must not be silently included in a Bulk commit — Epic 5 owns what happens to it, this story just must not swallow or crash on it.

### Hexagonal placement (AD-1)

Same boundaries every prior Epic 4 story has followed: `domain/` gets pure validation only (no DB/HTTP), `application/` composes ports (session repo + `ListAccessLookup`, mirroring Story 4.3's two-port `SetCardRoutingService` pattern), `adapters/persistence/` implements the repository methods, `api/routes/` is a thin HTTP→service translation layer, `ui` talks to `api` only via same-origin BFF routes (`ui/app/api/...`) — never directly, never DB/parsers in `ui`.

### Testing Requirements (project-context "Discipline" + "Layers")

- Domain: pure unit tests, no DB.
- Application: unit tests with fakes, no DB — follow `test_cards_application.py`'s `_FakeCardRepo`/local ACL-fake convention (Story 4.3 precedent).
- Integration: Postgres 16 via `DATABASE_URL`-gated `TestClient` tests — will need a way to seed a fixture Import Session with clean-parse statements; check what fixture helper 4.6 built for this before writing a new one.
- UI: co-located component test file, Tailwind/Testing Library convention already established across Epic 3/4 UI stories.
- Money assertions (payer/commit amounts) use `Decimal`, never `float` (AD-5) — this story's rows flow through the same commit path as manual expenses, which already enforces this.

### Story-close overview (required before `done`)

Per `_bmad-output/implementation-artifacts/story-close-overview-checklist.md`, paste the four-section template (Request path / Key components / Why this shape / What not to break) into Completion Notes before marking this story `done` — see `4-3-card-routing-mode-review-default-list.md`'s Completion Notes for the expected format.

### Project Structure Notes

- This story extends whatever Import Session bounded concern Story 4.6 establishes — do not create a competing "imports" module if 4.6 already named one.
- Next Alembic migration number (if this story needs its own, e.g. a `bulk_assigned_list_id` marker on the session): confirm the highest existing revision after 4.4–4.6 land (currently `0015_card_routing.py` is head; 4.4/4.6 will very likely add their own Import Session migration(s) before this story's number is knowable).
- Reuses `fetchLists()` (`ui/app/lists/listsClient.ts`, Story 4.3), `SoftLedgerSelect` (`ui/components/soft-ledger/Select.tsx`), `AuthorizeListAccessService`/`ListAccessLookup` (`api/application/list_access.py`, Story 2.2), and the manual-expense payer model (Story 3.2) — no new cross-cutting primitives expected.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.7: Bulk review assign & commit path] — ACs, story statement.
- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.4/4.5/4.6] — prerequisite stories' scope, used to identify the "assumes exists" gap table above.
- [Source: _bmad-output/planning-artifacts/prds/prd-finance-helper-2026-08-02/prd.md#FR-17: Bulk or individual review] — Bulk = whole upload to one list from lists the user belongs to.
- [Source: _bmad-output/planning-artifacts/prds/prd-finance-helper-2026-08-02/prd.md#FR-19: Explicit payer (default: current user)] — payer default/editable semantics reused verbatim.
- [Source: _bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md#AD-4 — Import Session and Batch] — one `batch_id` per Statement; session vs batch distinction.
- [Source: _bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md#AD-16 — CanonicalLine contract, AD-18 — Dedup identity authority, AD-19 — List authorization, AD-7 — FX conversion] — invariants this story's commit path must honor regardless of 4.6's exact schema.
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/EXPERIENCE.md] lines 30, 32, 43, 79 — "Bulk review: Upload (mode = Bulk) → Assign/commit statements; list-context upload may pre-select destination for Bulk only"; "List-scoped upload pre-selects destination only for Bulk — does not change Individual default destination" (UX-DR23, AC #2).
- [Source: _bmad-output/implementation-artifacts/4-3-card-routing-mode-review-default-list.md] — `SetCardRoutingService`/ACL-action pattern this story's `AssignBulkImportService` mirrors; `fetchLists()`/`SoftLedgerSelect` reuse precedent; error-mapping convention on a new route.
- [Source: _bmad-output/project-context.md] — hexagonal boundaries, membership-over-ownership ACL, Decimal money, i18n per-domain TS files, no new CSS Modules, testing layers/discipline, "a story must leave the system working end-to-end, not just satisfy stated ACs — the dev agent owns this" (the basis for this file's Prerequisites-gap escalation instruction rather than silently inventing missing infrastructure).

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- Research pass (fork) read the real 4.4/4.6 code (not just story files) to resolve every `[VERIFY AGAINST 4.6 SCHEMA]` marker before writing code (Task 0.2) — findings folded into the Task 0/1/2/3/4 notes above.
- First integration-test run hit `FxServiceUnavailableError` on the BAC acceptance-bar fixture's one USD row (`api/adapters/fx/bccr_client.py`'s `UnavailableBccrClient` — BCCR integration is a deferred infra spike per project-context). Fixed by adding a `client_with_fx` Postgres fixture (deterministic fake BCCR client, mirrors `test_manual_expense_api.py`'s `FakeUsdBccrClient`) for the two tests that need a real FX rate, and added a dedicated `test_bulk_commit_non_crc_row_without_bccr_wired_fails_loud_503` test asserting the deferred-BCCR path still fails loud (503) rather than 500ing, since the route hadn't originally mapped FX exceptions.
- Verified the new `0017_import_batches` Alembic migration (`upgrade`/`downgrade`/`upgrade` roundtrip) against the running Compose Postgres before running any tests.
- Confirmed the `soft-ledger.test.tsx` failures (2 tests, `@sebas`/`@dotmail` assertions) are pre-existing on the branch tip (`e6cf7ca`, unrelated commit) via `git stash` + re-run against the clean baseline — not caused by this story's changes.

### Completion Notes List

- All 6 tasks complete, TDD red→green per task. Backend: domain (5 new tests), application (7 new tests with fakes), persistence (verified via integration), API (14 new Postgres-gated integration tests incl. a real fixture-PDF happy path, non-member/404/409×2/503/401 cases). UI: `uploadClient.test.ts` (+6 cases), `BulkReviewPanel.test.tsx` (3 new cases).
- Import Batch (`import_batches` table, `ImportBatchModel`, `ledger_entries.import_batch_id`) was genuinely greenfield — no prior story had built any batch/commit persistence for imports. Designed to satisfy AD-4 (`statement_id` UNIQUE — one Statement commits at most once, ever) without touching 4.6's existing Import Session/Statement/CanonicalLine shapes beyond adding the `committed` statement status and a `candidate_rows` field to `StagedStatementRecord` (both additive, default-safe for existing callers).
- Two small additive changes to existing Story 3.2 code, both backward-compatible (new field defaults to `None`/unused by existing callers): `ManualExpenseDraft` gained `external_ref: str | None = None` so Bulk-imported rows can carry the adapter's dedup hint through the same draft type manual expenses already use; no change to `validate_manual_expense` or any manual-expense call site.
- Deviations from the story's own placeholder task text (all called out inline in the Tasks/Subtasks checkmarks above, largest ones): reused the existing-but-unused `"import_to_list"` ACL action instead of adding a new one; real FX function is `materialize_fx_for_entry` not the guessed `materialize_fx_to_crc`; real route prefix is `/import/sessions` not `/import-sessions`; UI needed its own minimal entry point since 4.6 built no Bulk/Individual mode picker at all.
- Final regression: `api` 526 passed (0 failed), `ruff check` / `ruff format --check` clean. `ui` 242 passed excluding 2 pre-existing unrelated failures in `soft-ledger.test.tsx` (confirmed pre-existing via `git stash` against the clean branch tip — see Debug Log), `tsc --noEmit` clean, `eslint .` clean (0 errors, 3 pre-existing unrelated warnings in files this story never touched).

## Story-close overview — 4-7-bulk-review-assign-commit-path

**Request path:**
Browser → `ui` `UploadPanel` ("Assign to a list" link) → `BulkReviewPanel` (`ui/app/upload/bulk/[sessionId]/page.tsx`, client component: `SoftLedgerSelect` + `fetchLists()`) → same-origin BFF `POST /api/import/sessions/{sessionId}/bulk-commit` (new) → `api` `POST /import/sessions/{session_id}/bulk-commit` (`require_authenticated_user`) → `AssignBulkImportService` (new) → `AuthorizeListAccessService` (`import_to_list` action, Story 2.2's port, reused unused-until-now enum value) + `validate_bulk_commit_eligible` (new pure domain gate) + `MaterializeFxService.materialize_fx_for_entry` (Epic 3, reused) → `SqlAlchemyImportSessionRepository.commit_statement_batch` (new) writes one `import_batches` row + N `ledger_entries` rows (payer = actor, `import_batch_id` FK) per staged statement, then flips that statement's status to `committed` — all in one request-scoped transaction (all-or-nothing; `get_db` rolls back the whole request on any exception, so there is no partial-batch state). On success, UI navigates to `/lists/{listId}`.

**Key components:**
`api/domain/import_session.py` (`validate_bulk_commit_eligible`, `STATEMENT_STATUS_COMMITTED`) · `api/domain/errors.py` (3 new errors) · `api/domain/expenses.py` (`ManualExpenseDraft.external_ref`) · `api/application/import_session.py` (`AssignBulkImportService`, `ImportBatchRecord`, `commit_statement_batch` port) · `api/adapters/persistence/import_sessions.py` (persistence impl) · `api/adapters/persistence/models.py` (`ImportBatchModel`, `LedgerEntryModel.import_batch_id`) · migration `0017_import_batches` · `api/api/routes/import_sessions.py` (new route) · `ui/app/upload/uploadClient.ts` (`bulkCommitSession`) · `ui/app/upload/bulk/[sessionId]/BulkReviewPanel.tsx` · `ui/app/api/import/sessions/[sessionId]/bulk-commit/route.ts` (BFF).

**Why this shape:**
Import Batch didn't exist anywhere before this story (confirmed via a dedicated code-research pass, not just story-file text) — AD-4 requires "one `batch_id` per Statement, ever," so `import_batches.statement_id` is UNIQUE and doubles as the no-double-commit guard the domain layer checks via the statement's own `committed` status (no second lookup needed). Reused `ManualExpenseDraft`/`MaterializeFxService`/`AuthorizeListAccessService` verbatim rather than inventing import-specific equivalents, per the story's own explicit "do not invent a second X" instructions.

**What not to break:**
- `import_batches.statement_id` UNIQUE constraint is the durable no-double-commit invariant (AD-4) — do not relax it even for a future "retry a failed batch" feature; that needs an explicit new state transition, not a relaxed constraint.
- `ledger_entries.import_batch_id` is nullable and unused by hand-entered expenses — Story 4.9's dedup/rollback work should read it, not add a parallel batch-tracking column.
- The `"import_to_list"` ACL action was pre-declared but unused before this story; Story 4.8 (Individual review) should reuse the same action for its own per-statement commits rather than adding a third one.
- This story's Bulk entry point (`/upload/bulk/[sessionId]`, "Assign to a list" link in `UploadPanel`) is a stand-in for the real mode-picker UI Story 4.6/4.8 territory owns — when that lands, it should link into this same route/BFF/service rather than rebuilding the commit path.

### File List

**New files:**
- `api/adapters/persistence/migrations/versions/0017_import_batches.py`
- `ui/app/upload/bulk/[sessionId]/page.tsx`
- `ui/app/upload/bulk/[sessionId]/BulkReviewPanel.tsx`
- `ui/app/upload/bulk/[sessionId]/BulkReviewPanel.test.tsx`
- `ui/app/api/import/sessions/[sessionId]/bulk-commit/route.ts`

**Modified files:**
- `api/domain/errors.py`
- `api/domain/import_session.py`
- `api/domain/expenses.py`
- `api/application/import_session.py`
- `api/adapters/persistence/import_sessions.py`
- `api/adapters/persistence/models.py`
- `api/api/schemas/import_sessions.py`
- `api/api/routes/import_sessions.py`
- `api/tests/test_import_session_domain.py`
- `api/tests/test_import_session_application.py`
- `api/tests/test_import_sessions_integration.py`
- `ui/app/upload/uploadClient.ts`
- `ui/app/upload/uploadClient.test.ts`
- `ui/app/upload/UploadPanel.tsx`
- `ui/lib/i18n/upload.ts`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Change Log

- 2026-08-16: Story context created via `bmad-create-story`, out of epic sequence at explicit user request (4.4–4.6 still backlog) — see "Prerequisites gap" section; status → ready-for-dev.
- 2026-08-19: Implemented via `dev-story` — 4.4/4.5/4.6 confirmed `done`, real schema resolved via code research (not story-file text alone), Bulk assign & commit path built end-to-end (domain/application/persistence/API/UI + tests at every layer). Status → review.
