---
baseline_commit: 905fe5de852dc4c2d29a78efd2fd321215123474
---

# Story 4.10: Row-level review data model + per-row commit

Status: ready-for-dev

> **Renumbered 2026-08-20: this key was previously multi-file upload (now Story 4.16).**
> Epic 4 was reordered so numeric order matches build order (Sprint Change Proposal
> 2026-08-20). Old → new for this slot: **4.12 → 4.10**. Do not implement multi-file
> upload here. Do not reopen Story 4.8 (`done`, superseded).

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer enabling per-transaction routing,
I want import_candidate_rows to carry independent status and resolution, and commits to operate on one row at a time,
so that a statement's rows can be routed to different lists instead of committing as one atomic unit.

## Acceptance Criteria

1. **Given** the `import_candidate_rows` table, **when** the migration runs, **then** it gains `status` (`pending` | `committed` | `deleted` | `excluded_zero_amount`, default `pending`), `resolved_list_id`, `resolved_at`, and a non-null `sequence` column, **and** it does **not** gain `resolved_ledger_entry_id` — the link is the reverse FK on `ledger_entries` (two pointers that must agree is a drift hazard).
2. **Given** row ordering must be deterministic across sessions, **when** rows are created, **then** `sequence` is assigned 0-based per statement from parse order — do not rely on insertion order or `created_at`.
3. **Given** `uq_import_batches_statement_id` encodes the old AD-4 per-statement batch boundary, **when** per-row commits are introduced, **then** the constraint is dropped (one statement may spawn many batches) and uniqueness moves to `ledger_entries.import_candidate_row_id` (UUID, nullable, UNIQUE, FK to `import_candidate_rows`). **AD-4 is already amended in `ARCHITECTURE-SPINE.md` (2026-08-20)** — do not re-write the spine; implement the amended rule.
4. **Given** double-commit protection must stay two-layered, **when** a row is committed, **then** the guarded conditional `UPDATE ... WHERE id = :row_id AND status = 'pending'` is the fast path / clean-error path, and the new UNIQUE constraint is the DB backstop — `IntegrityError` is caught via the existing `begin_nested()` SAVEPOINT pattern and surfaced as `ImportRowNotAvailableError`. The guarded UPDATE **must precede** the ledger INSERT in the same transaction. **Both layers must exist before `uq_import_batches_statement_id` is dropped**, not after.
5. **Given** manual (non-import) ledger entries, **when** the UNIQUE column is added, **then** they keep `import_candidate_row_id` NULL and are unaffected — Postgres UNIQUE treats NULLs as distinct (do **not** set `postgresql_nulls_not_distinct=True`). Undo-then-reassign reuses the value because ledger entries are hard-deleted (no `deleted_at`).
6. **Given** the concurrent-commit race regression test at `test_import_sessions_integration.py:310`, **when** commit moves to row grain, **then** an equivalent row-grain race test exists.
7. **Given** a parsed row with a zero amount, **when** the session is created, **then** the row is persisted with status `excluded_zero_amount` and never enters the review queue, and its per-statement count remains queryable.
8. **Given** a row resolves (assigned or deleted), **when** the commit/delete completes, **then** the statement flips to `committed` only once every non-excluded row has left `pending` — an all-deleted statement also reaches this state, reusing the idle-check shape of `_release_source_pdf_if_idle`.
9. **Given** bulk review runs against a session, **when** it commits, **then** it skips `excluded_zero_amount` rows and marks every row it touches `committed`, and rejects any statement already carrying non-pending rows with `import_row_not_available` — a backstop, since Story 4.14 makes that state unreachable from the UI.
10. **Given** statement-level individual review is retired, **when** this story lands, **then** `AssignIndividualImportService`, `SkipStatementService`, `validate_individual_accept_eligible`, `validate_individual_skip_eligible`, and the `commit_individual_statement` / `skip_individual_statement` routes are **deleted**, not left as unused parallel paths.

## Scope Note (read before starting)

This story is **schema + commit-path grain**. It is not the Individual review UI, not the row HTTP API, not the completion summary, and not the "new" badge.

| This story owns | Later story owns |
| --- | --- |
| Migration, models, row status/sequence, per-row commit persistence, bulk adaptation, retire statement-level Individual **backend** | **4.11** — `GET` rows payload, assign/delete/undo/edit HTTP, undo pointer columns on `import_sessions` |
| Statement-complete rule; `ImportRowNotAvailableError`; row-grain race test | **4.12** — domain dedup identity at commit, imported-N / skipped-M summary data, Soft-Ledger landing |
| Transitional: hide the broken Individual entry point so Bulk/upload keep working | **4.13** — rewrite `IndividualReviewPanel` (four-direction card + title edit) |
| | **4.14** — resume entry + completion summary UI + discard-partial copy |
| | **4.15** — `ledger_entries.import_reviewed_at` + "New" badge |

**Do not add in this story:** `import_sessions.last_resolved_*`, `ledger_entries.import_reviewed_at`, `resolved_ledger_entry_id`, row HTTP endpoints, PATCH description, undo, merchant/time fields, `postgresql_nulls_not_distinct`.

**AD-4 / AD-9 spine amendments already landed 2026-08-20.** Implementing this story against the *old* "one batch per statement" / "down → skip" wording is a spec violation. Read the amended AD-4 and AD-9 in `ARCHITECTURE-SPINE.md` before coding. `project-context.md` and `SPEC.md` still carry the old batch-grain sentences — this story updates `project-context.md`; leave `SPEC.md` alone.

**End-to-end after this story:** upload + Bulk still work (Bulk now skips zero-amount rows and writes `import_candidate_row_id`). Individual review HTTP is gone; hide `UploadPanel`'s "Review individually" link so the superseded 4.8 UI is not the live entry point. Leave `IndividualReviewPanel.tsx` in the tree for 4.13 to rewrite — do not rewrite the card here.

## Tasks / Subtasks

- [ ] **Task 0: Prerequisite check** (AC: #3)
  - [ ] 0.1 Confirm `sprint-status.yaml`: `4-9-bac-credit-real-statement-compatibility-fix` is `done` (or at least merged); `4-6`, `4-7`, `4-8` are `done`. If 4.6/4.7 are not done, stop.
  - [ ] 0.2 Confirm AD-4 in `ARCHITECTURE-SPINE.md` already says batch boundary = **one commit action** and names `ledger_entries.import_candidate_row_id UNIQUE`. If someone reverted that amendment, **stop** and restore it — do not invent a third wording.
  - [ ] 0.3 Do **not** reopen or edit Story 4.8's status. Its ACs describe superseded statement-level routing.

- [ ] **Task 1: Domain — row status + errors + bulk gate** (AC: #1, #4, #7, #8, #9, #10)
  - [ ] 1.1 `api/domain/import_session.py`: add row-status constants (`pending`, `committed`, `deleted`, `excluded_zero_amount`) and a frozenset. **`excluded_zero_amount` is 20 characters** — persistence column must be `String(20)` / `VARCHAR(20)`, not the statement-status `String(16)`.
  - [ ] 1.2 Add `row_is_zero_amount(amount: Decimal) -> bool` (exact zero only; negative payment/credit lines stay reviewable).
  - [ ] 1.3 Add `statement_is_fully_resolved(row_statuses: Sequence[str]) -> bool`: true iff every status that is not `excluded_zero_amount` is not `pending`. Vacuous true when every row is excluded (all-zero statement).
  - [ ] 1.4 `api/domain/errors.py`: add `ImportRowNotAvailableError` (`CODE = "import_row_not_available"`, `MESSAGE` in the same voice as `ImportStatementNotAvailableError`). Add `ImportRowNotFoundError` (`CODE = "import_row_not_found"`) now — 4.11's HTTP maps it, and the per-row commit service needs it when `row_id` is not in the session.
  - [ ] 1.5 **Delete** `validate_individual_accept_eligible` and `validate_individual_skip_eligible` and their tests in `test_import_session_domain.py`. Keep `STATEMENT_STATUS_SKIPPED` — historical skipped statements may exist; `session_needs_source_pdf` still treats skipped as done.
  - [ ] 1.6 Update `validate_bulk_commit_eligible`: **stop rejecting the whole session because a sibling statement is already `committed`**. That gate encoded old AD-4 (session-atomic). After this story, an all-zero statement may already be `committed` at create time (Task 4.3) while siblings are still `staged`. New rules: discarded → `ImportSessionDiscardedError`; at least one `staged` statement → else `NoCleanStatementsToCommitError`. Mixed row status on a statement being committed is **not** this function's job — that is `ImportRowNotAvailableError` in the service/repo (AC #9).
  - [ ] 1.7 Unit tests (red → green, no DB): zero-amount helper; fully-resolved true for all-deleted, all-committed, all-excluded, mix of committed+deleted; false if any non-excluded `pending`; bulk-eligible accepts staged+committed sibling mix; still rejects discarded and all-failed/empty.

- [ ] **Task 2: Migration `0020_row_level_review.py`** (AC: #1, #3, #4, #5)
  - [ ] 2.1 `down_revision = "0019_import_statements_iban"` (current head). Do not branch.
  - [ ] 2.2 **Order inside `upgrade()` is a correctness requirement, not style:**
    1. Add `import_candidate_rows.status` (`VARCHAR(20)`, NOT NULL, server_default `'pending'`).
    2. Add `resolved_list_id` (UUID NULL, FK `lists.id` ON DELETE SET NULL).
    3. Add `resolved_at` (TIMESTAMPTZ NULL).
    4. Add `sequence` as nullable INTEGER; backfill (below); then `alter_column` to NOT NULL.
    5. Add `ledger_entries.import_candidate_row_id` (UUID NULL, FK `import_candidate_rows.id` ON DELETE SET NULL) + unique constraint `uq_ledger_entries_import_candidate_row_id`.
    6. **Only then** `drop_constraint("uq_import_batches_statement_id", "import_batches", type_="unique")`.
  - [ ] 2.3 Backfill existing candidate rows **before** `sequence` NOT NULL:
    - `sequence` = `ROW_NUMBER() OVER (PARTITION BY statement_id ORDER BY created_at, id) - 1`.
    - `status`: parent `committed` → `committed`; parent `skipped` → `deleted`; else if `amount = 0` → `excluded_zero_amount`; else `pending`. Parent committed/skipped **wins over** zero-amount (those rows may already have ledger entries).
    - Do **not** backfill `ledger_entries.import_candidate_row_id` for historical committed rows (matching is ambiguous). NULL is correct; UNIQUE allows unlimited NULLs.
  - [ ] 2.4 Recommended extra (encodes AC #2): unique `(statement_id, sequence)` as `uq_import_candidate_rows_statement_sequence`.
  - [ ] 2.5 `downgrade()`: drop new unique/FK/columns, **re-create** `uq_import_batches_statement_id`. Document in the migration docstring that downgrade is unsafe once a statement has two batches — matches the SCP rollback posture. Do not invent a data-repair downgrade.
  - [ ] 2.6 **Never** `postgresql_nulls_not_distinct=True` on the ledger unique — that would reject a second manual expense (both NULL). Postgres 16 default (NULLs distinct) is the required behavior. [Source: SQLAlchemy 2.0 PostgreSQL dialect — omit the flag to keep default `NULLS DISTINCT`.]

- [ ] **Task 3: ORM models** (AC: #1, #3, #5)
  - [ ] 3.1 `ImportCandidateRowModel`: add `status`, `resolved_list_id`, `resolved_at`, `sequence`. No `resolved_ledger_entry_id`. Update the class docstring.
  - [ ] 3.2 `LedgerEntryModel`: add `import_candidate_row_id` + `__table_args__ = (UniqueConstraint("import_candidate_row_id", name="uq_ledger_entries_import_candidate_row_id"),)`. Today this model has **no** `__table_args__` — that absence is why dropping the batch unique without a replacement would leave the commit path with zero DB guards.
  - [ ] 3.3 `ImportBatchModel`: **remove** `UniqueConstraint("statement_id", name="uq_import_batches_statement_id")`. Rewrite the docstring: one batch = one **commit action** (amended AD-4), not "one Statement's accept". `statement_id` stays a non-unique FK (many batches per statement).
  - [ ] 3.4 Do not add undo columns on `ImportSessionModel` (4.11).

- [ ] **Task 4: Persistence — create + commit grain** (AC: #2, #4, #6, #7, #8, #9)
  - [ ] 4.1 **Do not put review fields on `CanonicalLine`** (AD-16). Introduce `CandidateRowRecord` (frozen dataclass) on `api/application/import_session.py`: `id`, `sequence`, `status`, `resolved_list_id`, plus the CanonicalLine fields already copied today (or a `line: CanonicalLine` plus the review fields). Change `StagedStatementRecord.candidate_rows` from `list[CanonicalLine]` to `list[CandidateRowRecord]`. Update `_session_record` / `_candidate_line` in `api/adapters/persistence/import_sessions.py` accordingly.
  - [ ] 4.2 `create_session`: for each `enumerate(detected.candidate_rows)` assign `sequence=index` (parse order). `status = excluded_zero_amount if amount == 0 else pending`. Persist zero-amount rows (needed for AC #7 count); they must not be omitted.
  - [ ] 4.3 After inserting a staged statement's rows, if `statement_is_fully_resolved` (all excluded), flip that statement to `committed` **without** creating an Import Batch. This is the all-zero vacuous case of AC #8.
  - [ ] 4.4 Rewrite `commit_statement_batch` (do **not** fork a second "individual" statement commit). New contract:
    - `rows` must carry `candidate_row_id` (replace `list[tuple[ManualExpenseDraft, MaterializedFx]]` with a small frozen `CommitRow` dataclass: `candidate_row_id`, `draft`, `fx` — a 3-tuple will be scrambled).
    - For the targeted ids: `UPDATE import_candidate_rows SET status='committed', resolved_list_id=:list_id, resolved_at=now() WHERE id IN (...) AND status='pending'`. If `rowcount != len(ids)` → `ImportRowNotAvailableError` (**before** any ledger INSERT).
    - Insert `ImportBatchModel` (no statement-id unique).
    - Insert each `LedgerEntryModel` with `import_batch_id` **and** `import_candidate_row_id`. Wrap the unique-constrained insert(s) in `begin_nested()`; `except IntegrityError` → `ImportRowNotAvailableError` (not `ImportSessionAlreadyCommittedError` — that code was the old batch-unique mapping).
    - Call `_complete_statement_if_resolved(statement_id)` instead of unconditionally `status = committed`.
  - [ ] 4.5 Add `commit_candidate_row(...)` **or** have the application call `commit_statement_batch` with a 1-element `rows` list. Prefer reuse of `commit_statement_batch` — that is the "one commit action" primitive. Do not copy-paste the SAVEPOINT/UPDATE sequence into a second method.
  - [ ] 4.6 Add `mark_candidate_row_deleted(*, session_id, statement_id, row_id, user_id)`: guarded `UPDATE ... SET status='deleted', resolved_at=now() WHERE id=:row_id AND status='pending'`; `rowcount==0` → `ImportRowNotAvailableError`; then `_complete_statement_if_resolved`. No ledger writes. HTTP for this is 4.11; the method must exist so AC #8's all-deleted path is testable now.
  - [ ] 4.7 `_complete_statement_if_resolved`: load non-excluded row statuses; if none pending, set statement `committed`. Reuse this from commit, delete, and the all-zero create path.
  - [ ] 4.8 Delete `skip_statement` from the Protocol and the SQLAlchemy repo.
  - [ ] 4.9 `_release_source_pdf_if_idle` / `session_needs_source_pdf` stay statement-status based. Once every statement is `committed`/`skipped`/`failed`-only-with-no-staged, PDF release still runs. Do not switch PDF idle-check to row grain in a way that deletes the PDF while any statement is still `staged` with pending rows.

- [ ] **Task 5: Application — bulk adapt + per-row assign/delete services** (AC: #8, #9, #10)
  - [ ] 5.1 `AssignBulkImportService.execute`: skip `status == excluded_zero_amount`; if a staged statement has any non-excluded row whose status is not `pending` → raise `ImportRowNotAvailableError` (AC #9) and commit **nothing** (request-scoped transaction already rolls back). Pass `CommitRow` ids into `commit_statement_batch`. Keep `"import_to_list"` ACL, `validate_bulk_candidate_row`, `ManualExpenseDraft` payer=actor, `MaterializeFxService.materialize_fx_for_entry`. Keep the `routing_mode` canary comment + `test_staged_statement_record_has_no_unchecked_card_routing_field`.
  - [ ] 5.2 Add `AssignCandidateRowService` + command `(actor_user_id, session_id, row_id, list_id)`: fetch session, find the row (404-equivalent `ImportRowNotFoundError` if not in this user's session), ACL `import_to_list`, discard check, skip if status is not `pending` via the repo guard, build one draft + FX, call `commit_statement_batch` with one `CommitRow`, then `_release_source_pdf_if_idle`. **No FastAPI route in this story** — 4.11 adds `POST .../rows/{rowId}/assign`.
  - [ ] 5.3 Add `DeleteCandidateRowService` wrapping `mark_candidate_row_deleted` + PDF idle-check. No HTTP route this story.
  - [ ] 5.4 **Delete** `AssignIndividualImportService`, `SkipStatementService`, and their commands.
  - [ ] 5.5 Application tests with the existing `_FakeImportSessionRepo` (extend it; do not write a second fake): bulk skips zeros and marks remaining committed; bulk on a statement with a `committed`/`deleted` row raises `ImportRowNotAvailableError` with zero commits; per-row assign writes one batch / one ledger id; second assign of the same row raises `ImportRowNotAvailableError`; delete then `_complete_statement_if_resolved` flips an all-deleted statement; discarded session still rejected.

- [ ] **Task 6: API — retire statement-level Individual HTTP; map new error on Bulk** (AC: #10)
  - [ ] 6.1 Delete `commit_individual_statement` and `skip_individual_statement` from `api/api/routes/import_sessions.py`. Keep `GET /import/sessions/{session_id}` (4.11 extends its payload; this story does **not** add `rows[]` to `StagedStatementResponse` — still `candidate_row_count` only). Keep `POST .../statements/{statement_id}/identify-card` and `MatchStatementCardService` (Story 4.8.1 / AD-20) — that is not statement-level *commit*.
  - [ ] 6.2 Delete BFF proxies `ui/app/api/import/sessions/[sessionId]/statements/[statementId]/commit/route.ts` and `.../skip/route.ts` (they would 502 once the API routes are gone).
  - [ ] 6.3 Bulk-commit route: map `ImportRowNotAvailableError` → 409 `import_row_not_available`. Keep existing discarded / ACL / FX mappings. Sequential double bulk-commit now 409s this code (rows already `committed`), not `import_session_already_committed` — update the integration assertion.
  - [ ] 6.4 Delete or rewrite integration tests that POST the removed Individual routes (`test_individual_commit_*`, `test_individual_skip_*` in `test_import_sessions_integration.py`). Replace coverage with:
    - Bulk happy path still lands ledger rows **and** `import_candidate_row_id` is set and unique.
    - Bulk skips zero-amount rows (seed or fixture: if the BAC fixture has no zeros, insert a zero `CanonicalLine` via a focused repo/create_session test rather than hacking goldens).
    - **Row-grain race test (AC #6):** after a successful per-row (or bulk) commit, a second `commit_statement_batch` for the **same candidate_row_id** raises `ImportRowNotAvailableError`, not a bare `IntegrityError`. Mirror `test_bulk_commit_duplicate_batch_insert_raises_already_committed_not_integrity_error` (call the repo directly with `db_session`).
    - Direct `AssignCandidateRowService` / `DeleteCandidateRowService` against Postgres (no HTTP): one row → one batch; sibling rows stay `pending`; statement stays `staged` until the last non-excluded row resolves; all-deleted statement becomes `committed`; PDF retained while siblings pending.
  - [ ] 6.5 Leave `uploadClient.commitIndividualStatement` / `skipStatement` and `IndividualReviewPanel*.tsx` in place for 4.13. Their unit tests mock fetch and will still pass. Do not rewrite the panel.

- [ ] **Task 7: Transitional UI + agent rules** (end-to-end)
  - [ ] 7.1 `UploadPanel.tsx`: remove (or comment with a 4.13 pointer) the "Review individually" `Link` at `href=/upload/review/...` so the superseded statement-level UI is not offered. Keep Discard + Bulk. No new i18n keys required if the link is simply omitted.
  - [ ] 7.2 `_bmad-output/project-context.md`: replace stale AD-4/AD-9 bullets so the next story's agent does not re-implement statement-level batching:
    - Import Batch = one **commit action** (bulk: one statement; individual: one candidate row).
    - Partial commit is normal; `ledger_entries.import_candidate_row_id UNIQUE` is the double-commit backstop.
    - Individual review unit = transaction; up → delete; undo is button-only (AD-9) — note that **UI lands in 4.13**.
  - [ ] 7.3 Do not edit `SPEC.md` or 4.8's story file.

- [ ] **Task 8: Story-close overview** (required before `done`)
  - [ ] Paste the four-section template from `story-close-overview-checklist.md` into Completion Notes.

## Dev Notes

### Why this story exists

Story 4.8 shipped statement-level Individual review ("When I act on a statement"). That made Individual functionally identical to Bulk. Rows already exist in `import_candidate_rows` (migration `0016`) but:

1. `StagedStatementResponse` only serializes `candidate_row_count` — clients never see rows (4.11 will).
2. `commit_statement_batch` (`api/adapters/persistence/import_sessions.py:170`) builds ledger entries from **all** `statement.candidate_rows`, wraps one `ImportBatchModel`, and **unconditionally** sets the statement to `committed`.
3. `ImportBatchModel.__table_args__` is `uq_import_batches_statement_id` — one batch per statement, Postgres-enforced.
4. Candidate rows have no `status`, assignment, sequence, or ledger link.

Per-row assignment cannot be a UI change. This story is the one-way schema door.

### Current code (UPDATE files — read completely before editing)

**`commit_statement_batch` today** (`api/adapters/persistence/import_sessions.py:170-244`):

- SAVEPOINT around **batch insert** catching `uq_import_batches_statement_id` → `ImportSessionAlreadyCommittedError`.
- Then inserts ledger rows **without** a candidate-row FK.
- Then `statement_row.status = STATEMENT_STATUS_COMMITTED` unconditionally.

**Must preserve:** FK ordering (batch row flushed before ledger `import_batch_id`); request-scoped transaction (mid-loop failure rolls back); `MaterializedFx` fields copied onto the ledger row; payer/provenance/`ManualExpenseDraft` shape from 4.7.

**Must change:** SAVEPOINT target (ledger unique, not batch unique); guarded row UPDATE **before** ledger INSERT; statement complete only via `_complete_statement_if_resolved`; pass `candidate_row_id`.

**Guarded UPDATE precedent:** `skip_statement` (`import_sessions.py:266-282`) already does `update(...).where(status.in_(...))` + `rowcount == 0` → domain error. That was a Story 4.8 review finding. Copy that idiom onto **candidate rows**, then delete `skip_statement`.

**SAVEPOINT precedent:** `begin_nested()` + `IntegrityError` in the same file (`:197-201`) and `adapters/persistence/repositories.py` / `cards.py`. Keep that pattern; change the mapped error class.

**`create_session` today** (`:111-132`): loops `detected.candidate_rows` with no `sequence`/`status`. Parse order **is** the loop order — assign `sequence=index` here. Do not sort by `created_at` after flush.

**`AssignBulkImportService` today** (`application/import_session.py:353-425`): `validate_bulk_commit_eligible` then every staged statement's every `CanonicalLine` → drafts → `commit_statement_batch`. Failed statements already skipped by status. After this story, also skip excluded rows; reject mixed non-pending on a statement being committed.

**`AssignIndividualImportService` / `SkipStatementService`:** delete. Their tests in `test_import_session_application.py` (~line 705+) go with them.

**Ledger hard-delete:** `repositories.py:284` and `:672` (`session.delete(row)`). No `deleted_at` on `ledger_entries`. 4.11 undo-then-reassign relies on this; do not add soft-delete here.

**Zero amounts today:** `validate_bulk_candidate_row` **allows** zero (4.7 review finding: FX pass-through). After this story zeros are excluded at create, so Bulk never feeds them to that validator. Do **not** change the validator to reject zero — that would confuse future hand-fix / Epic 5 paths. Exclusion is a **status**, not a validation failure.

### Invariants (non-negotiable)

- **AD-1:** no FastAPI/SQLAlchemy in `domain/`; no `ui` → DB; bank adapters still emit `CanonicalLine` only — they do not set row status.
- **AD-3:** PDF delete still goes through `_release_source_pdf_if_idle`. Partial review (some rows committed, some pending) **must keep the PDF** (statement still `staged`).
- **AD-4 amended:** batch = one commit action; partial commit is normal; two-layer double-commit guard.
- **AD-5:** `Decimal` / `NUMERIC`; money as strings on the wire.
- **AD-7:** FX still `MaterializeFxService.materialize_fx_for_entry` at commit. This story does not add dedup skip (4.12 / AD-18). Every assigned non-excluded row still writes a ledger entry, including re-imports — duplicate suppression is 4.12.
- **AD-16:** `CANDIDATE_ROW` = CanonicalLine + session review fields. Review fields live on `CandidateRowRecord` / the ORM model, **not** on `CanonicalLine`.
- **AD-18:** do not call `compute_canonical_identity` yet (4.12). Do not invent adapter-side dedup keys.
- **ACL:** `"import_to_list"` only — do not add `import_row_to_list`.

### Anti-patterns (will fail review)

- Adding `resolved_ledger_entry_id` "for convenience".
- Dropping `uq_import_batches_statement_id` in a revision **before** the ledger unique exists (even "we'll add it in the next commit").
- Setting `postgresql_nulls_not_distinct=True`.
- Leaving `AssignIndividualImportService` as a wrapper around the new per-row loop "so 4.8 UI keeps working".
- Deleting `identify-card` / `MatchStatementCardService` (4.8.1). Only the accept/skip **commit** path is retired.
- Putting `rows[]` on `GET /import/sessions/{id}` this story (that's 4.11; adding it early is fine only if 4.11's exact shape is implemented fully — do not half-add).
- Using JS `Date` or `float` anywhere near amounts/dates.
- Committing real PDFs / PII into fixtures to test zero-amount — synthesize a `CanonicalLine(amount=Decimal("0.00"), ...)` in a unit/integration seed.
- Rewriting `IndividualReviewPanel` (4.13) or adding swipe/undo UI.
- Changing Bulk's product behavior for an **untouched** session (all pending): still one list, one batch per statement, payer = actor.

### Migration is a one-way door

Once mixed row statuses and multi-batch statements exist, restoring `uq_import_batches_statement_id` requires collapsing those statements. Both protection layers + the row-grain race test must be green **before** merge.

### Previous story intelligence

**4.9 (BAC real-statement fix)** — predecessor in build order; persistence-irrelevant. Learnings: red→green domain tests; CI gates on synthetic fixtures only; operator `bank_data/` PDFs never in repo. This story does not touch adapters.

**4.8 (Individual review)** — shipped statement-level accept/skip. Review findings that this story **must not regress:**

- Guarded write on status transitions (skip was patched to `WHERE status IN (staged, failed)`).
- `commit_statement_batch` is shared; changing its signature requires updating **all remaining** call sites (after this story: Bulk + new per-row service only).
- `"import_to_list"` ACL reused, not forked.
- `GET /import/sessions/{id}` is read-only — keep it.
- Integration tests run in the Compose `api` container (`DATABASE_URL` + `PDF_STORAGE_PATH`); host venv often has neither.

**4.7 (Bulk)** — introduced `import_batches`, `commit_statement_batch`, the race test at `test_import_sessions_integration.py:310`, and the comment that `uq_import_batches_statement_id` is "the real backstop" because two requests can both pass `validate_bulk_commit_eligible`. That backstop **moves** to `import_candidate_row_id`; the test must move with it. Other 4.7 review findings still in force: assert `import_batch_id` on ledger rows; `validate_bulk_candidate_row` before draft build; None-guard on statement fetch.

**4.16 (multi-file, ready-for-dev)** — independent of review grain; do not block on it; do not steal its key/files.

### Git intelligence

Recent import-path commits: `1e7c0e3` (4.7 bulk), `94d852b` (4.7 review fixes — SAVEPOINT + race test), `0907ad1` (4.8 accept/skip), `a06f615` (PDF release after assign), `e8ffeb9` (4.8.1 IBAN). Pattern: review findings land as follow-up commits, not amends. Alembic head is `0019_import_statements_iban` (`99b1ae5` resolved a head conflict — do not create a second head).

### Latest tech notes

- **SQLAlchemy 2.0 / Postgres 16:** `UniqueConstraint("import_candidate_row_id", name="uq_ledger_entries_import_candidate_row_id")` on `LedgerEntryModel`. Default UNIQUE = NULLs distinct. Only set `postgresql_nulls_not_distinct=True` if you intend NULL = NULL (we do not).
- **Alembic:** `op.drop_constraint("uq_import_batches_statement_id", "import_batches", type_="unique")` — same helper `0017_import_batches.py` already uses in `downgrade()`. Add the ledger unique with `op.create_unique_constraint` + `op.create_foreign_key` (or `sa.ForeignKey` on `add_column`).
- **`begin_nested()`:** SAVEPOINT; IntegrityError on the inner flush does not poison the outer `get_db` transaction if caught inside the `with` — this is why 4.7 used it. Keep it around the unique insert, not around the whole request.

### Testing requirements

| Layer | Where | Must cover |
| --- | --- | --- |
| Domain | `test_import_session_domain.py` | Row statuses, zero-amount, fully-resolved, new bulk-eligible rules; delete old individual-gate tests |
| Application | `test_import_session_application.py` | Bulk skip zeros; bulk reject mixed; per-row assign/delete; fake repo |
| Integration | `test_import_sessions_integration.py` on **Postgres 16** | Bulk still works; `import_candidate_row_id` set; row-grain race → `ImportRowNotAvailableError`; statement completes only when all non-excluded resolved; Individual HTTP gone (those tests removed) |
| UI | existing panel tests | Leave as-is (mocked). UploadPanel: Individual link removed — add/adjust a test only if one currently asserts that link (none does as of this story) |

Money asserts: `Decimal`, never `float`. No SQLite stand-in.

### Project Structure Notes

- Same Import Session bounded context: `api/domain/import_session.py`, `api/application/import_session.py`, `api/adapters/persistence/{models,import_sessions}.py`, `api/api/routes/import_sessions.py`, `api/adapters/persistence/migrations/versions/0020_*.py`.
- No new Python package. No UI Soft-Ledger primitives. No new npm dependency.
- Branch: `feat/4/4-10-row-level-review-data-model-per-row-commit` (AD-13).

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` — Story 4.10 ACs; Epic 4 sequencing 4.9 → 4.10 → 4.11 → 4.12]
- [Source: `_bmad-output/planning-artifacts/sprint-change-proposal-2026-08-20.md` — root cause, two-layer guard, migration order, rollback posture]
- [Source: `_bmad-output/planning-artifacts/ux-designs/row-level-individual-review-2026-08-20.md` §1 Data model — schema, guarded UPDATE SQL, dead-code list]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md` — AD-4 and AD-9 as amended 2026-08-20; AD-1, AD-3, AD-5, AD-7, AD-16, AD-18]
- [Source: `_bmad-output/planning-artifacts/prds/prd-finance-helper-2026-08-02/prd.md` — FR-17 / FR-18 amended (transaction unit; delete replaces skip)]
- [Source: `api/adapters/persistence/import_sessions.py` — `commit_statement_batch`, `skip_statement`, `create_session`, `begin_nested`]
- [Source: `api/adapters/persistence/models.py` — `ImportCandidateRowModel`, `ImportBatchModel.__table_args__`, `LedgerEntryModel` (no `__table_args__` today)]
- [Source: `api/tests/test_import_sessions_integration.py:310` — race test to port]
- [Source: `_bmad-output/implementation-artifacts/4-7-bulk-review-assign-commit-path.md` — SAVEPOINT + race-test review finding]
- [Source: `_bmad-output/implementation-artifacts/4-8-individual-review-swipe-desktop-buttons.md` — what to delete; guarded skip; shared `commit_statement_batch`]
- [Source: SQLAlchemy 2.0 PostgreSQL dialect — UNIQUE NULLS DISTINCT default; do not enable `postgresql_nulls_not_distinct`]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

- 2026-08-20: Story context created via `bmad-create-story` for `4-10-row-level-review-data-model-per-row-commit`. Status → ready-for-dev.
