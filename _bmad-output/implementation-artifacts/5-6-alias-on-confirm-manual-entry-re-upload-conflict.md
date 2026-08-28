---
baseline_commit: b3f4203
---

# Story 5.6: Alias on confirm + manual-entry re-upload conflict

Status: review

## Story

As a user who matched a manual label to a bank line (or re-uploaded after resolving a conflict as Manual),
I want the manual label stored as an alias and the same conflict UI on near-matches,
so that I don't silently duplicate a manual row and aliases are ready for later use.

## Acceptance Criteria

1. **Given** I confirm a manual entry and a bank line are the same expense (Story 5.5 survivor path — `manual_survivor` or `parsed_survivor` resolution) **When** the match is saved **Then** the system stores the manual label as an alias for that bank description (FR-23) **And** the alias is stored even when the two descriptions already read identically (not just the differing-text case) **And** v1 does not use aliases for ML categorization — schema/storage only, no read path in this story.
2. **Given** a re-upload produces a parsed row that matches or near-matches a previously-resolved manual entry (the manual entry still exists — i.e. it survived its earlier resolution as `manual_survivor` or was kept via `not_same_expense`) **When** conflict detection runs on the new commit **Then** the system prompts with the exact same FR-22/Story-5.5 resolution UI (Manual | Parsed; confirmed "Not the same expense") (FR-28) **And** it never silently duplicates the manual row **And** v1 near-match = same amount+currency within the list date window (reuse AD-10, Story 5.5's `is_same_price`/`within_window`); description similarity is not required to prompt.
3. **Given** alias storage or a re-upload manual-entry conflict resolution completes **When** I return to shared-expenses **Then** Soft-Ledger reflects a single coherent survivor set — no parallel conflict ledger (the re-upload case reuses the exact `same_price_conflicts` table/queue from Story 5.5; it is not a second detection mechanism).
4. **Given** the escape "Not the same expense" was chosen (either on first detection or on a re-upload near-match) **When** the confirm completes **Then** no alias is stored — alias storage is a survivor-pick-only side effect (AC #1 scope), never the escape path.
5. **Given** a manual entry was the losing side of an earlier resolution (`parsed_survivor` — the manual row was deleted) **When** a later re-upload has the same amount/currency/window **Then** no conflict is raised against it, because the row no longer exists — this is expected, not a regression (nothing to duplicate).

**Out of scope for this story (explicitly deferred):**
- Any alias *read* path — using stored aliases for ML categorization, auto-suggestion, or display anywhere in the UI. v1 only writes the alias row (FR-23's "seed for later ML").
- A settings/management UI for aliases (create, edit, delete, browse).
- Changing the same-price detection window mechanism itself — this story reuses Story 5.5's `is_same_price`/`within_window`/window-days lookup unchanged.

## Tasks / Subtasks

- [x] **Task 1 — Domain: alias pair validation** (AC: 1, 4)
  - [x] `api/domain/description_alias.py` (new): pure function `normalize_alias_pair(manual_label: str | None, bank_description: str | None) -> tuple[str, str] | None` — strips both, returns `None` if either is blank/`None` after stripping (defends against a manual entry with a null `normalized_description` producing a garbage alias row). No new domain error needed — a `None` return is the caller's signal to skip persistence silently (this is a best-effort side-effect of resolution, not a user-facing operation with its own failure mode).

- [x] **Task 2 — Persistence: durable alias table + migration** (AC: 1)
  - [x] New table `description_aliases` (Alembic migration `0030_description_aliases.py`, chained on `0029_same_price_conflicts` head):
    - `id UUID PK`
    - `list_id UUID NOT NULL FK lists.id ON DELETE CASCADE` — scope to the parsed entry's (bank statement's) list; this is the list whose future imports would benefit from the alias.
    - `manual_label TEXT NOT NULL`, `bank_description TEXT NOT NULL` — both post-`normalize_alias_pair`.
    - `source_conflict_id UUID NULL FK same_price_conflicts.id ON DELETE SET NULL` — traceability only; nullable so a later alias-writing path (post-v1) isn't forced to originate from a conflict row, and so the alias survives if the conflict row itself is ever purged.
    - `created_at TIMESTAMPTZ NOT NULL server_default now()`.
    - `UNIQUE (list_id, manual_label, bank_description)` — a re-upload that re-confirms the same pair (AC #2 scenario) must not accumulate duplicate alias rows; mirror Story 5.5's `create_conflict` no-op-on-`IntegrityError` pattern (Task 3 below), do not pre-query for existence.
  - [x] `api/adapters/persistence/models.py`: `DescriptionAliasModel` next to `SamePriceConflictModel`.
  - [x] `api/adapters/persistence/description_aliases.py` (new): `SqlAlchemyDescriptionAliasRepository` implementing the Protocol from Task 3.

- [x] **Task 3 — Application: record-alias service + wire into resolve** (AC: 1, 3, 4)
  - [x] `api/application/description_aliases.py` (new):
    - `DescriptionAliasRepository` Protocol: `record_alias(*, list_id: UUID, manual_label: str, bank_description: str, source_conflict_id: UUID | None) -> None` — no-op (not an error) if the `(list_id, manual_label, bank_description)` triple already exists (UNIQUE guard, same pattern as `SqlAlchemySamePriceConflictRepository.create_conflict`: catch `IntegrityError`, re-raise unless the constraint name matches the new unique constraint). **Deviation from spec:** `source_conflict_id` is `UUID | None`, not the spec'd required `UUID` — see Completion Notes.
    - `NullDescriptionAliasRepository`: no-op default, mirroring `NullSamePriceConflictRepository` — required so the ~7 existing `ResolveSamePriceConflictService(conflict_repo, list_repo)` call sites in `api/tests/test_same_price_conflicts_application.py` keep compiling unchanged (see Task 4's default-parameter note).
    - `RecordDescriptionAliasService`: `execute(*, list_id: UUID, manual_label: str | None, bank_description: str | None, source_conflict_id: UUID | None) -> None` — calls `normalize_alias_pair` (Task 1); if it returns `None`, returns without calling the repo; otherwise calls `repo.record_alias(...)`.
  - [x] `api/application/same_price_conflicts.py` — extend `ResolveSamePriceConflictService`:
    - Constructor gains a **third, defaulted** parameter: `alias_repo: DescriptionAliasRepository | None = None` (defaults to `NullDescriptionAliasRepository()` when `None` inside `__init__`) — do **not** make this a required positional parameter; that would force updating every existing test call site for a Story 5.5 class. Only the production route (Task 5) passes the real repo.
    - After `self._repo.resolve_conflict(...)` succeeds (end of `execute`, still inside the method — the `conflict` object fetched at the top of `execute` already has `conflict.manual.normalized_description`/`conflict.parsed.normalized_description`/`conflict.parsed.list_id` in hand from Story 5.5's `SamePriceConflictRecord`/`SamePriceConflictEntrySnapshot`), if `command.resolution` is `CONFLICT_RESOLUTION_MANUAL_SURVIVOR` or `CONFLICT_RESOLUTION_PARSED_SURVIVOR` (**not** `CONFLICT_RESOLUTION_NOT_SAME_EXPENSE` — AC #4), call `RecordDescriptionAliasService(self._alias_repo).execute(list_id=conflict.parsed.list_id, manual_label=conflict.manual.normalized_description, bank_description=conflict.parsed.normalized_description, source_conflict_id=None)`. **Deviation:** spec said pass `conflict.id`; see Completion Notes for why that FK-violates.
    - This must run **after** `resolve_conflict` succeeds, not before — if the resolve call raises (`SamePriceConflictAlreadyResolvedError` etc.) no alias should be written for a resolution that didn't actually happen.

- [x] **Task 4 — Verify FR-28 re-upload detection needs no new production code** (AC: 2, 3, 5)
  - [x] Read `SqlAlchemySamePriceConflictRepository.find_related_manual_candidates` (`api/adapters/persistence/same_price_conflicts.py`) — its `already_open` subquery excludes a manual entry only when it has an **unresolved** (`resolved_at IS NULL`) conflict against *this exact* `parsed_entry_id`. A manual entry with a **resolved** conflict (from an earlier commit) remains a valid candidate for a new parsed entry — this is already Story 5.5's documented behavior (see its dev notes: "A manual entry that already has a resolved conflict remains a valid candidate for a new, separate collision"). **This is exactly FR-28's re-upload mechanism** — confirmed by tracing the code, no re-implementation of detection. Verified end-to-end with `test_re_upload_creates_independent_second_conflict_in_same_queue`.
  - [x] No second detection path, table, or duplicate UI/API added — AC #3's same queue/UI requirement holds.
  - [x] Confirmed `DetectSamePriceConflictsService` is invoked on every commit through `AssignBulkImportService.execute` and `AssignCandidateRowService.execute` (`api/application/import_session.py:901` and `:1072`) — both already wired from Story 5.5, no change needed.

- [x] **Task 5 — Route wiring** (AC: 1)
  - [x] `api/api/routes/import_conflicts.py` — `resolve_import_conflict`: construct `SqlAlchemyDescriptionAliasRepository(db)` and pass it as the third argument to `ResolveSamePriceConflictService(conflict_repo, list_repo, alias_repo)`.

- [x] **Task 6 — Tests** (AC: all)
  - [x] Domain: `normalize_alias_pair` — both non-blank → returns stripped tuple; either blank/`None`/whitespace-only → returns `None`. (`api/tests/test_description_alias_domain.py`, 7 tests)
  - [x] Application/integration (Postgres 16, not SQLite): 6 new tests appended to `api/tests/test_same_price_conflicts_application.py` covering manual_survivor alias write, parsed_survivor alias write, not_same_expense writes no alias, dedup no-op on repeated triple, re-upload end-to-end (independent second conflict in same queue), and losing-side no-conflict-on-later-reupload (AC #5).
  - [x] No new UI tests — no `ui/` files changed (confirmed via `git status`).

## Dev Notes

### Architecture compliance

| Rule | Apply |
|------|-------|
| AD-1 | `domain/description_alias.py` stays pure (no SQLAlchemy/FastAPI). |
| AD-4 | Not applicable — this story doesn't touch batch/entry deletion semantics, only observes the already-committed Story 5.5 resolve flow. |
| AD-5 | No money fields on `description_aliases` — text only, no `Decimal` concern here. |
| AD-10 | Re-upload detection (Task 4) is a direct reuse of AD-10's existing implementation (Story 5.5) — no new match-window logic. |
| AD-15 | Application-layer TDD (red→green) for `RecordDescriptionAliasService`/repo. Postgres 16 integration for the alias-write-on-resolve path — not SQLite. |
| AD-18 | Unrelated — aliasing is not a dedup-identity mechanism; do not let alias matching influence `import_identity`. |
| AD-19 | `description_aliases.list_id` scopes the row to the list that owns the bank statement; no new ACL surface is added in this story since there is no read/list endpoint yet (out of scope). |
| AD-22 | No Postgres volume recreation; the migration only adds a table + FK. |

### UX

- **No new UI in this story.** FR-23's alias storage is a **silent** side effect of the existing Story 5.5 survivor-pick action — there is no new screen, dialog, or copy. The re-upload conflict (FR-28) surfaces through the *exact same* `ConflictReviewPanel`/`/import-conflicts` UI Story 5.5 already shipped; a user re-uploading a statement that near-matches an old manual entry sees an ordinary conflict card, indistinguishable from a first-import conflict. Do not build a "this is a re-upload" banner or distinct copy — the ACs do not ask for one and AD-10's shared-UI rule argues against it.
- If `_bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/EXPERIENCE.md`/`DESIGN.md` are consulted, note they have **no alias-specific content** (verified — grep for "alias" in both files returns nothing); FR-23/FR-28 and AD-10 are the complete spec surface for this story.

### Files to touch (expected)

**NEW:**
- `api/domain/description_alias.py`
- `api/application/description_aliases.py`
- `api/adapters/persistence/description_aliases.py`
- `api/adapters/persistence/migrations/versions/0030_description_aliases.py`
- `api/tests/test_description_alias_domain.py`
- `api/tests/test_description_aliases_application.py` (or extend `api/tests/test_same_price_conflicts_application.py` with an alias-focused test class — either is fine, keep alias tests grouped together)

**UPDATE:**
- `api/adapters/persistence/models.py` (`DescriptionAliasModel`)
- `api/application/same_price_conflicts.py` (`ResolveSamePriceConflictService.__init__` gains defaulted `alias_repo`; `execute` calls `RecordDescriptionAliasService` after a successful survivor-pick resolve)
- `api/api/routes/import_conflicts.py` (construct + pass `SqlAlchemyDescriptionAliasRepository`)

**No `ui/` files are expected to change in this story** — confirm this holds as you implement; if you find yourself editing `ConflictReviewPanel.tsx` or its i18n file, stop and re-check against AC #2/#3 (the UI is reused unchanged, not extended).

### Anti-patterns (do not)

- Writing the alias row before `resolve_conflict` succeeds, or from inside the persistence-layer `resolve_conflict` method itself — keep it an application-layer, post-success side effect in `ResolveSamePriceConflictService.execute` so it stays independently testable and doesn't entangle the Story 5.5 nested-transaction delete logic.
- Writing an alias for `not_same_expense` — that path explicitly means "these are two different expenses," so labeling them as aliases of each other would be actively wrong data (AC #4).
- Building a second detection mechanism, table, or UI for the re-upload/near-match case (FR-28) — it is the same `same_price_conflicts` queue Story 5.5 already built; Task 4 is verification, not new detection logic.
- Making `alias_repo` a required constructor argument on `ResolveSamePriceConflictService` — that breaks ~7 existing Story 5.5 test call sites for no ACL/behavioral reason; default it.
- Reading `description_aliases` anywhere in this story (UI display, categorization hints, autocomplete) — FR-23 is explicit that v1 does not use aliases for ML categorization; this is a write-only schema seed.
- Storing the alias against the *manual* entry's list instead of the *parsed* entry's list — the alias's future value (post-v1 ML) is "when a bank line with this description shows up again on this statement/list, suggest this label," which is scoped to where the bank description originates (the parsed/statement list), not where the manual entry happened to live.

### Testing requirements

- Postgres 16 for the alias-write-on-resolve and re-upload-detection paths (not SQLite) — same rule as every prior Epic 4/5 story.
- Do not commit real bank PDFs; this story needs no PDF fixtures at all — it only touches already-committed `ledger_entries` and the existing `same_price_conflicts` resolve flow, both of which the Story 5.5 test fixtures (synthetic ledger rows, no PDF parsing) already demonstrate how to set up directly via the repositories.

### Previous story intelligence (5.5)

- `ResolveSamePriceConflictService.execute` (`api/application/same_price_conflicts.py`) already fetches the full `conflict: SamePriceConflictRecord` (with `.manual`/`.parsed` `SamePriceConflictEntrySnapshot`s carrying `normalized_description`, `list_id`, etc.) **before** calling `self._repo.resolve_conflict(...)` — this is the exact data Task 3 needs for the alias write; do not re-fetch or re-query the ledger entries after resolution (the losing entry may already be hard-deleted by then).
- `SqlAlchemySamePriceConflictRepository.resolve_conflict` (`api/adapters/persistence/same_price_conflicts.py`) stamps `resolved_at`/`resolution` **before** deleting the losing entry, because `manual_entry_id`/`parsed_entry_id` are `ON DELETE CASCADE` onto `same_price_conflicts` — the same "stamp before delete" ordering concern does not apply to the new `description_aliases` table (it has no FK-cascade relationship to `ledger_entries`), but the alias write must still happen from the pre-fetched `conflict` snapshot in the application layer, not by re-reading `ledger_entries` post-delete.
- The `create_conflict` no-op-on-`IntegrityError` pattern (catch, check `exc.orig.diag.constraint_name`, re-raise unless it matches the expected unique constraint) is the established idiom for "insert but shrug at exactly this one predictable duplicate" — reuse it verbatim in `SqlAlchemyDescriptionAliasRepository.record_alias` rather than a `SELECT`-then-`INSERT` existence check (race-prone under concurrent commits).
- `NullSamePriceConflictRepository` is the precedent for a Null-object default that keeps pre-existing call sites compiling when a new required-in-production collaborator is added to an existing service — `NullDescriptionAliasRepository` follows the same shape.
- Alembic HEAD going into this story is `0029_same_price_conflicts`; this story adds `0030_description_aliases`.
- 5.5 left one deferred item (actor losing membership makes a conflict permanently invisible/unresolvable) — out of scope for 5.6, not touched by this story.

### Git intelligence

- Recent history on `main` (`b3f4203` merge of PR #90, `3adf675`, `ab8e324`, `d54fb06`) is entirely Story 5.5 landing — `same_price_conflicts` domain/application/persistence/API/UI is exactly as documented above, freshly merged, no drift to account for.
- Current branch `feat/5/5-6-alias-on-confirm-manual-entry-re-upload-conflict` is clean and up to date with `origin/main` at story-creation time — start from `b3f4203`.

### Latest tech

- No new npm/pip dependencies required — pure application/schema work on the existing stack (FastAPI/SQLAlchemy 2.0, Alembic already pinned). Use `begin_nested()` for the alias insert exactly as `create_conflict` does (Story 5.5 precedent), since it may run inside the same request as the resolve-conflict nested transaction.

### Project context reference

Follow `_bmad-output/project-context.md`: membership ACL only where a new ACL surface exists (none added here — no new read endpoint); i18n not applicable (no new UI copy); Alembic-only schema changes; generic vocabulary in fixtures/tests; never silently merge/auto-resolve same-price or manual-vs-parsed conflicts (unaffected — this story only adds a side effect to an already-explicit user choice).

### References

- [Source: `_bmad-output/planning-artifacts/epics.md#Story 5.6` lines 1731-1753]
- [Source: `_bmad-output/planning-artifacts/prds/prd-finance-helper-2026-08-02/prd.md` FR-23 lines 553-560, FR-28 lines 602-611]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md` AD-10 lines 150-154, AD-18 lines 203-207, storage rule line 87]
- [Source: `api/application/same_price_conflicts.py` — `ResolveSamePriceConflictService`, `SamePriceConflictRecord`, `SamePriceConflictEntrySnapshot`]
- [Source: `api/adapters/persistence/same_price_conflicts.py` — `SqlAlchemySamePriceConflictRepository.resolve_conflict`, `.create_conflict`, `.find_related_manual_candidates`]
- [Source: `api/adapters/persistence/migrations/versions/0029_same_price_conflicts.py`]
- [Source: `_bmad-output/implementation-artifacts/5-5-same-price-conflict-review-manual-parsed.md` — Dev Agent Record / Completion Notes]

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- `docker compose -f docker-compose.yml -f docker-compose.worktree.yml -f docker-compose.test.yml run --rm --build api sh -c "alembic upgrade head && pytest -q ..."` — used to run migration + targeted tests against Postgres 16 in this worktree's Compose stack.
- Full regression: `docker compose ... run --rm api sh -c "pytest -q"` → 802 passed.
- Lint: `docker compose ... run --rm api sh -c "ruff check . && ruff format --check ."` → clean.

### Completion Notes List

- Implemented Tasks 1–6 as specified, with one deliberate deviation from the story spec discovered during Task 6 integration testing:
  - **`source_conflict_id` is written as `None`, not `conflict.id`.** `SqlAlchemySamePriceConflictRepository.resolve_conflict` (Story 5.5) hard-deletes the losing ledger entry as part of resolving `manual_survivor`/`parsed_survivor`. Because `same_price_conflicts.manual_entry_id`/`parsed_entry_id` are `ON DELETE CASCADE` onto `ledger_entries`, that delete cascades and removes the `same_price_conflicts` row itself — the very row `conflict.id` (fetched before resolution) refers to. Since alias-writing only happens for `manual_survivor`/`parsed_survivor` (never `not_same_expense`, which is the one resolution that *doesn't* delete anything), every alias write hits this cascade deterministically: passing `conflict.id` as `source_conflict_id` always raises `ForeignKeyViolation` against the just-vanished row (confirmed via failing integration test run before the fix). The `description_aliases.source_conflict_id` FK is nullable specifically for "the alias survives if the conflict row itself is ever purged" per the story's own Task 2 note — that purge just happens synchronously instead of at some later point, so `None` is the correct value here, not a workaround. Updated `DescriptionAliasRepository.record_alias` / `RecordDescriptionAliasService.execute` signatures to `source_conflict_id: UUID | None` accordingly (spec'd them as required `UUID`).
- All other tasks match the spec as written: domain validator is pure/no-I/O (AD-1); persistence repo mirrors `create_conflict`'s catch-`IntegrityError`-unless-matching-constraint dedup idiom verbatim; `ResolveSamePriceConflictService` gained a defaulted third constructor param so all ~7 pre-existing Story 5.5 test call sites kept compiling unchanged; Task 4 was verification-only (no production code changed) — traced `find_related_manual_candidates`' `already_open` subquery and confirmed both `AssignBulkImportService`/`AssignCandidateRowService` call sites already invoke `DetectSamePriceConflictsService` on every commit.
- No `ui/` files touched — confirmed via `git status` before closing out, matching Dev Notes' expectation.

### File List

**NEW:**
- `api/domain/description_alias.py`
- `api/application/description_aliases.py`
- `api/adapters/persistence/description_aliases.py`
- `api/adapters/persistence/migrations/versions/0030_description_aliases.py`
- `api/tests/test_description_alias_domain.py`

**UPDATE:**
- `api/adapters/persistence/models.py` (`DescriptionAliasModel`)
- `api/application/same_price_conflicts.py` (`ResolveSamePriceConflictService.__init__` gains defaulted `alias_repo`; `execute` calls `RecordDescriptionAliasService` after a successful survivor-pick resolve)
- `api/api/routes/import_conflicts.py` (construct + pass `SqlAlchemyDescriptionAliasRepository`)
- `api/tests/test_same_price_conflicts_application.py` (6 new alias-focused integration tests appended)

## Change Log

| Date | Change |
|------|--------|
| 2026-08-28 | Story created via create-story workflow. Ultimate context engine analysis completed - comprehensive developer guide created. |
| 2026-08-28 | Implemented Story 5.6: `description_aliases` table/migration, domain validator, application service wired into `ResolveSamePriceConflictService`, route wiring, tests (7 domain + 6 new integration, 802 total passing). Deviated from spec on `source_conflict_id`: write `None` instead of `conflict.id` because the conflict row is cascade-deleted by the time the alias write runs (see Completion Notes). Status → review. |
