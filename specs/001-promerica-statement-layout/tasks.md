# Tasks: Promerica Credit Card Statement Layout Support

**Input**: Design documents from `/specs/001-promerica-statement-layout/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, quickstart.md

**Tests**: Included. research.md R5 sets the testing strategy (synthetic newer-layout fixture, goldens, regression and detect tests). Real statements are never committed; CI gates on the synthetic fixture only.

**Organization**: Tasks are grouped by user story so each story can be implemented and tested on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story the task belongs to (US1, US2, US3)
- All paths are relative to the repository root (the worktree root)

## Path Conventions

Backend API lives under `api/`. Tests live under `api/tests/`. The adapter package is `api/adapters/bank/promerica/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the facts the rest of the work depends on

- [X] T001 Extract the printed section titles from the newer-layout sample with pdfplumber (run locally against a file outside the repo, never committed), and record in `specs/001-promerica-statement-layout/research.md` (R1) whether "Detalle de pagos del periodo" and the other titles carry accents as printed
- [X] T002 [P] Read `api/application/bank_adapters.py` and record in `specs/001-promerica-statement-layout/research.md` (R2) the current `BankAdapter.parse()` return type and how `api/application/import_session.py` consumes it, so the flagged-row shape can be chosen without changing BAC

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared test fixture and golden values that every user story uses. MUST complete before any user story work.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 Extend `api/scripts/generate_promerica_fixture.py` to emit a newer-layout synthetic statement: account-summary preamble, payments with four amount columns, purchases with location and country column (including a US$-only row, a negative refund, a "- 80,133.00"-style points transfer row, and a card-number marker line), a two-line interest pair and a reversal, a fees row, a voluntary-service row, an empty "Cargos por gestión" section, section total lines, and one deliberately unreadable row
- [X] T004 Generate the synthetic fixture PDF `api/tests/fixtures/pdf/promerica_newer_layout_synthetic.pdf` from T003's generator (synthetic data only, no real names or account numbers), and the clean variant `api/tests/fixtures/pdf/promerica_newer_layout_clean_synthetic.pdf` (same rows and totals, without the unreadable row). The clean variant is used for SC-001 and the totals checks; the unreadable-row fixture is used only for flagged-row tests (A1 decision, option A)
- [X] T005 Create `api/tests/fixtures/pdf/promerica_newer_layout_goldens.py` with expected values: per-section imported totals per currency, purchases total excluding the points transfer (plus the transfer as a statement note), the flagged row's raw text and section, and the expected row count (mirrors `promerica_synthetic_goldens.py`)

**Checkpoint**: Fixture and goldens exist. User story work can begin.

---

## Phase 3: User Story 1 - Import a Promerica statement in the newer layout (Priority: P1) 🎯 MVP

**Goal**: The newer-layout statement is identified as Promerica credit and every transaction row in the five sections imports, with currency and sign kept, section totals matching, and the points transfer kept out of transactions and shown as a note.

**Independent Test**: Import `promerica_newer_layout_synthetic.pdf` and compare per-section totals with `promerica_newer_layout_goldens.py`. Purchases total excludes the points transfer, and the transfer amount appears as a note.

### Tests for User Story 1

> **NOTE: Write these tests first and confirm they fail before implementing**

- [X] T006 [P] [US1] Add tests in `api/tests/test_promerica_adapter.py` that the newer-layout fixture is detected as Promerica credit by content and by filename, and that a BAC credit and a BAC debit fixture are not detected as Promerica (SC-003, SC-005)
- [X] T007 [P] [US1] Add a test in `api/tests/test_promerica_adapter.py` that the newer-layout fixture's imported totals per section and per currency match `promerica_newer_layout_goldens.py`, run on the clean variant (SC-001, SC-002)
- [X] T008 [P] [US1] Add a test in `api/tests/test_promerica_adapter.py` that a points transfer row ("Traslado de puntos a cuenta crédito") is not returned as a transaction and its signed amount is returned as a statement note (FR-013)
- [X] T009 [P] [US1] Add a test in `api/tests/test_promerica_adapter.py` that summary, total, "Saldo anterior", card-number, and footer lines never appear as transactions (FR-003)
- [X] T010 [P] [US1] Add a test in `api/tests/test_promerica_adapter.py` that a 4-column payment row records only the transaction amount per currency, and that a US$-only purchase records a 0.00 colones amount as US$ (FR-004, FR-008)

### Implementation for User Story 1

- [X] T011 [US1] Set the section titles in `_SECTIONS` in `api/adapters/bank/promerica/adapter.py` to the exact printed strings confirmed in T001
- [X] T012 [US1] Add a points-transfer rule in `api/adapters/bank/promerica/adapter.py`: detect rows whose description starts with "Traslado de puntos", skip them before amount parsing, and extract their signed amount for the statement note (per R1 and R3)
- [X] T013 [US1] Update the amount token pattern in `api/adapters/bank/promerica/adapter.py` so a leading minus followed by a space ("- 80,133.00") parses as a negative amount (the existing `_AMOUNT_TOKEN_RE` only matches a minus with no space)
- [ ] T014 [US1] Return the statement notes from `parse()` in `api/adapters/bank/promerica/adapter.py` using the shape chosen in T002, without adding them to the transaction rows
- [X] T015 [US1] Confirm in `api/adapters/bank/promerica/adapter.py` that the purchases total line and the "Cargos por gestión" total line are skipped by `_TOTAL_LINE_RE` (update the regex only if T007 shows a total line leaking through)

**Checkpoint**: User Story 1 works on its own. Run `uv run pytest tests/test_promerica_adapter.py -q` from `api/`.

---

## Phase 4: User Story 2 - Import interest and payments, and flag unreadable rows (Priority: P2)

**Goal**: Interest concept/amount pairs and four-column payments import correctly. Unreadable rows are flagged for review instead of failing the whole statement (Q1). The PDF is kept only while flagged rows await review (FR-014, Q3 and planning decision).

**Independent Test**: Import a statement with one deliberately unreadable row. The readable rows import, the flagged row is listed with its raw text, section, and reason, and the PDF is kept until the flag is cleared.

### Tests for User Story 2

- [X] T016 [P] [US2] Add tests in `api/tests/test_promerica_adapter.py` for interest pairing: a concept line followed by its amount line becomes one interest row; the reversal with `-3,564.56 0.00` is negative; an amount line with no concept line is flagged, not dropped (FR-007, US2 scenario 4)
- [X] T017 [P] [US2] Add a test in `api/tests/test_promerica_adapter.py` that a statement with one unreadable row returns its readable rows plus one flagged row carrying raw text, section, and reason (FR-009, SC-006)
- [ ] T018 [P] [US2] Add a test in `api/tests/test_bac_adapter.py` that a BAC credit statement with an unreadable row still fails the whole statement (other banks unchanged, spec assumption)
- [ ] T019 [P] [US2] Add a test in `api/tests/test_import_session_application.py` that a statement with flagged rows stores its readable rows and its flagged rows as review items
- [ ] T020 [P] [US2] Add a test in `api/tests/test_import_session_application.py` that the stored PDF is kept while flagged rows exist and removed once they are cleared, and removed right away when there are no flagged rows (FR-014)

### Implementation for User Story 2

- [ ] T021 [US2] Add a flagged-row shape (raw text, section, page, reason) to the parse result in `api/application/bank_adapters.py`, scoped so BAC adapters keep raising on the first unreadable row (R2)
- [X] T022 [US2] Replace the `fail_parse` path for unreadable rows in `api/adapters/bank/promerica/adapter.py` with a flagged-row entry and continue parsing; keep the interest-pairing rule that an amount line with no concept line is flagged (T016)
- [ ] T023 [US2] Consume flagged rows and statement notes in `api/application/import_session.py`: store readable rows, store flagged rows as review items, store notes with the statement
- [ ] T024 [US2] Implement the PDF retention rule in `api/application/import_session.py`: remove the stored PDF right after import when there are no flagged rows; keep it while flagged rows are open and remove it when the last flagged row is cleared (FR-014, R4)
- [ ] T025 [US2] Add a way to clear a flagged row in the import session so the PDF retention rule can run (the review action itself is a UI decision; this task only adds the application-layer operation in `api/application/import_session.py`)

### Added after the 2026-11-09 clarifications (finalize gate, review outcomes, mismatch reason)

- [ ] T033 [P] [US2] Add tests in `api/tests/test_import_session_application.py` that finalizing a statement is refused while any flagged row is `unreviewed`, and succeeds once every flagged row is `fixed` or `dismissed` (FR-009 clarification)
- [ ] T034 [P] [US2] Add a test in `api/tests/test_import_session_application.py` that a `dismissed` flagged row stays in the statement record with its review status and is not returned as a transaction (FR-009 clarification)
- [ ] T035 [P] [US2] Add a test in `api/tests/test_import_session_application.py` that a section with a flagged row and a total mismatch reports the mismatch with those flagged rows as its reason, and the check passes once they are reviewed (FR-012)
- [ ] T036 [US2] Add `review_status` (`unreviewed` default, `fixed`, `dismissed`) to the flagged-row shape in `api/application/bank_adapters.py`, extending T021 (data-model.md FlaggedRow)
- [ ] T037 [US2] Add the finalize gate in `api/application/import_session.py`: refuse finalizing while any flagged row is `unreviewed` (FR-009)
- [ ] T038 [US2] Add the dismiss operation in `api/application/import_session.py`: mark a flagged row `dismissed` and keep it in the statement record, and mark a flagged row `fixed` when it is re-imported as a transaction (FR-009)
- [ ] T039 [US2] Add the section-total reconciliation in `api/application/import_session.py` (or the module that computes section totals, to confirm in T002): when a section has flagged rows and its total does not match, report the mismatch with those rows as the reason (FR-012)

**Checkpoint**: User Story 2 works on its own. Run `uv run pytest tests/test_promerica_adapter.py tests/test_import_session_application.py tests/test_bac_adapter.py -q` from `api/`.

---

## Phase 5: User Story 3 - Keep the earlier Promerica layout working (Priority: P3)

**Goal**: Statements in the earlier layout keep producing the same rows, amounts, and dates as before this change.

**Independent Test**: Re-run the existing Promerica golden tests unchanged. Their expected output must match exactly.

### Tests for User Story 3

- [X] T026 [P] [US3] Confirm the existing golden test for the earlier-layout fixture in `api/tests/test_promerica_adapter.py` passes without changes to its expected values (SC-004, FR-011)
- [X] T027 [P] [US3] Add a test in `api/tests/test_promerica_adapter.py` that the earlier-layout fixture produces no notes and no flagged rows

### Implementation for User Story 3

- [X] T028 [US3] Verify in `api/adapters/bank/promerica/adapter.py` that the new rules (points transfer, leading minus with space, flagged-row path) do not change any output for the earlier-layout fixture; fix any regression found by T026 and T027

**Checkpoint**: All three stories pass. Run the full Promerica and import-session suites.

---

## Phase N: Polish & Cross-Cutting Concerns

**Purpose**: Final checks across stories

- [X] T029 [P] Run `ruff check` and `ruff format --check` on the changed files under `api/` and fix any issues
- [X] T030 [P] Run the full `api/` pytest suite from `api/` and confirm no unrelated test changed its result
- [ ] T031 Confirm no real statement content (names, account numbers, real amounts from the sample) appears in any committed file under `api/tests/` or `specs/001-promerica-statement-layout/`
- [ ] T032 Run the steps in `specs/001-promerica-statement-layout/quickstart.md` and record the result in the plan

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies. T001 and T002 can run in parallel.
- **Foundational (Phase 2)**: Depends on Setup. T003 must finish before T004 and T005.
- **User Story 1 (Phase 3)**: Depends on Foundational. T011 depends on T001. T012 to T014 depend on T002.
- **User Story 2 (Phase 4)**: Depends on Foundational. T021 depends on T002. T022 depends on T021. T023 and T024 depend on T021. T036 extends T021. T037 to T039 depend on T036 and T023.
- **User Story 3 (Phase 5)**: Depends on US1 and US2, because it checks that their new rules leave the earlier layout unchanged.
- **Polish (Final Phase)**: Depends on all user stories.

### User Story Dependencies

- **US1 (P1)**: Starts after Foundational. Independent of US2 and US3.
- **US2 (P2)**: Starts after Foundational. Touches the shared parse result, so coordinate T021 with US1's T014 (both change what `parse()` returns).
- **US3 (P3)**: Verification only. Run after US1 and US2.

### Within Each User Story

- Tests first, and confirm they fail before implementing
- Adapter changes before import-session changes
- Story complete before moving to the next priority

### Parallel Opportunities

- T001 and T002 (Setup)
- T006 to T010 (US1 tests, different test cases in one file; can be written in parallel but merged by one author)
- T016 to T020 (US2 tests; T018, T019, and T020 touch different files)
- T026 and T027 (US3 tests)
- T029 and T030 (Polish)

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (fixture and goldens)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: the newer-layout fixture imports with matching totals and the points transfer is a note
5. Demo or merge if ready

### Incremental Delivery

1. Setup + Foundational: fixture and goldens ready
2. US1: newer layout imports (MVP)
3. US2: unreadable rows flagged, PDF retention
4. US3: regression check on the earlier layout

---

## Notes

- [P] tasks = different files or independent test cases, no dependencies on incomplete tasks
- [Story] label maps each task to its user story for traceability
- Each story must be independently completable and testable
- Real statements are never committed; all test data is synthetic
- Commit after each task or logical group

---

## Summary

- **Total tasks**: 39
- **Per story**: Setup 2, Foundational 3, US1 10, US2 17 (T016–T025 plus T033–T039 added for the 2026-11-09 clarifications), US3 3, Polish 4
- **Parallel opportunities**: T001/T002; US1 tests T006-T010; US2 tests T016-T020; US3 tests T026-T027; Polish T029-T030
- **MVP scope**: User Story 1 (newer layout imports with matching totals and the points transfer as a note)
- **Format validation**: All tasks use the `- [ ] TID [P?] [Story?] description with path` format. Setup, Foundational, and Polish tasks have no story label; story-phase tasks all have one.
