---
baseline_commit: 05cd0a0
---

# Story 4.9.3: Fix Promerica real-statement parse failure and manual-entry pre-fill row

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer following up on Story 4.9.2 and Story 5.2.1 after real-world testing,
I want to fix the real Promerica adapter's parse failure on the compras section and the parse-failure surface's manual-entry pre-fill row selection,
so that a real Promerica statement parses in full and, when a row still fails, "add manually" opens pre-filled with the row that actually needs it.

## Acceptance Criteria

1. **Given** the real `bank_data/PROMERICA_CRED.pdf` statement (local, gitignored — not available in this session; re-extract real text for the payment→compras transition, across the page break, before changing any recognition logic, per this project's real-evidence-only convention), **when** `PromericaAdapter.parse()` runs against it, **then** parsing continues past "Detalle de pagos del periodo" into "Detalle de compras del periodo" and every subsequent declared section, extracting all real rows (e.g. `PARQUEOS REAL CARIARI BELEN`) instead of failing loud after only the 3 payment rows.
2. **Given** the root cause found in AC #1, **when** `_SECTIONS` / `_KNOWN_BOILERPLATE_LINES` / the section-header-recognition logic in `PromericaAdapter.parse()` is corrected, **then** a new synthetic regression fixture (or an addition to the existing golden) reproduces the fixed transition — specifically a **multi-page** statement where a `MUST_PARSE` section spans a page break — so CI catches a future regression on this exact boundary.
3. **Given** a statement that fails to parse and lands on the parse-failure comparison surface (FR-25/FR-55, Story 5.2.1), **when** the user opens "add manually" for that statement, **then** the form pre-fills from the `kind: "gap"` item in `parse_evidence.items` (the row that actually failed) — not the first `kind: "row"` item (a row that parsed successfully).
4. **Given** a `kind: "gap"` parse-evidence item only carries `raw_snippet` (no structured `description`/`amount`/`currency`/`posted_date` — see `api/domain/parse_evidence.py`), **when** pre-filling from it, **then** the form's `description` is seeded from `raw_snippet` and `amount`/`currency`/`postedDate` are left blank for the user to fill in — no heuristic re-parsing of the raw snippet (consistent with this project's fail-loud philosophy: never guess a value the parser itself already refused to extract).
5. **Given** the existing `api/tests/test_promerica_adapter.py` suite and `ui/app/upload/ParseComparisonPanel.test.tsx`, **when** both fixes above are implemented, **then** all existing tests are updated to match the corrected behavior and pass — in particular the tests that currently assert the *old* (buggy) pre-fill values must be updated to assert pre-fill from the gap item instead.

## Tasks / Subtasks

- [ ] Task 1 — Diagnose the real-statement parse failure (AC: #1)
  - [ ] Re-extract real `pdfplumber` text from `bank_data/PROMERICA_CRED.pdf` (local only) around the "Detalle de pagos del periodo" → "Detalle de compras del periodo" transition, **including the page break inside the compras section** (Story 4.9.2's own dev notes record the compras section spans page 1→2, with a second, truncated card-number marker line appearing on page 2 — this is the first known evidence of a mid-section page break in this statement).
  - [ ] Compare that real text against `_SECTIONS`, `_KNOWN_BOILERPLATE_LINES`, and `_CARD_NUMBER_MARKER_RE` in `api/adapters/bank/promerica/adapter.py:83-152`. Leading hypothesis to verify first: a per-page repeated header/footer line (e.g. `_BANK_NAME_MARKER`, `_STATEMENT_HEADER_MARKER`, a page-number footer, or a repeated "Fecha de Corte" line) reprints on page 2 mid-section. `parse()` concatenates every page's `extract_text()` into one `lines` list (`adapter.py:270-272`) with no per-page boundary awareness, so any such reprinted line — unrecognized as a section title or known boilerplate — falls through to `elif seen_section_header: cursor.see_header_line(line)` (`adapter.py:323-331`), which flips the cursor to "unmapped" and makes the very next real data row fail loud (`adapter.py:337-346`). This exactly matches the reported symptom: only the 3 payment rows extracted, nothing from compras onward.
  - [ ] Do not invent the exact boilerplate text — confirm it against the real extraction before adding it to `_KNOWN_BOILERPLATE_LINES` or an equivalent per-page-boilerplate skip.

- [ ] Task 2 — Fix the adapter and add regression coverage (AC: #1, #2)
  - [ ] Apply the correction found in Task 1 to `PromericaAdapter.parse()`.
  - [ ] Extend `api/scripts/generate_promerica_fixture.py` (or add a second fixture) to produce a **multi-page** synthetic PDF where a `MUST_PARSE` section (mirror compras) spans a page break, reproducing whatever real boilerplate/header line Task 1 found reprinting. The current fixture (`build_fixture()`, `api/scripts/generate_promerica_fixture.py:53-98`) is single-page — this exact class of bug (page-break-only reprint) cannot be caught by a single-page fixture, which is why it survived commit `05cd0a0`'s otherwise-correct sub-header-boilerplate fix.
  - [ ] Regenerate `api/tests/fixtures/pdf/promerica_synthetic.pdf` and update `api/tests/fixtures/pdf/promerica_synthetic_goldens.py` if the new multi-page shape changes the golden fixture, or add a dedicated new fixture + test (mirroring the existing pattern in `api/tests/test_promerica_adapter.py`, e.g. `test_parse_unmapped_section_raises_rather_than_silently_dropping` at line 280) rather than reworking the existing golden test if that's simpler.
  - [ ] Add a test asserting the fixed transition parses in full (all compras rows extracted, no fail-loud stop).

- [ ] Task 3 — Fix manual-entry pre-fill row selection (AC: #3, #4)
  - [ ] In `ui/app/upload/ParseComparisonPanel.tsx`, `initialValuesFrom()` (lines 53-62) currently does `(statement.parse_evidence?.items ?? []).find((item) => item.kind === "row")` — the first **successfully parsed** row. Change it to find the `kind === "gap"` item instead (per `api/domain/parse_evidence.py:51-73`, `parse_evidence_from_rows()` always appends exactly one trailing `gap` item after all successfully-parsed `row` items, for the single line that stopped the parse).
  - [ ] Map the gap item's `raw_snippet` into `ManualExpenseInitialValues.description` (`ui/app/lists/ManualExpenseForm.tsx:59-64` — all fields already optional/user-editable). Leave `amount`/`currency`/`postedDate` undefined — do not attempt to re-parse `raw_snippet` into those fields.
  - [ ] Handle the case where `parse_evidence` has no `gap` item (defensive — should not happen for a `status: "failed"` statement per current backend invariants, but `initialValuesFrom` should degrade to `undefined` rather than throw, same as today's "no row found" case).

- [ ] Task 4 — Update existing tests to match corrected behavior (AC: #5)
  - [ ] `ui/app/upload/ParseComparisonPanel.test.tsx`: the shared `statement` fixture (lines 112-135) and assertions at lines 203-205, 328-329, and 365-367 currently assert pre-fill from the first `row` item (`"COMERCIO GENERICO UNO"` / `"1000.00"`) — this is the bug being fixed, so these assertions must be rewritten to expect pre-fill from the `gap` item's `raw_snippet` (`"07-ENE-26|COMERCIO GENERICO MALO|not-an-amount"`) in `description`, with `amount`/`currency`/`postedDate` left blank.
  - [ ] `api/tests/test_promerica_adapter.py`: confirm the new multi-page regression test (Task 2) doesn't collide with or duplicate existing golden-row assertions (e.g. `test_parse_matches_goldens_row_for_row`, line 141).
  - [ ] Run the full `api` pytest suite and `ui` test suite for both touched files; both must stay green end to end, not just the new/changed tests.

## Dev Notes

- **Both source stories (4.9.2, 5.2.1) stay `done`.** This is a bugfix story on top of already-shipped, already-`done` work — do not reopen or re-run either story's own workflow; just fix the two defects directly.
- **Real-evidence-only convention (project-context.md, "Anti-patterns"; Story 4.9.2's own docstring comments in `adapter.py`):** every section title, boilerplate line, and card-number-marker pattern currently in `adapter.py` was captured verbatim from real pdfplumber extraction, never invented. The same discipline applies here — Task 1's diagnosis must be grounded in a fresh real extraction, not a guess, even though the exact fix is unknown at story-creation time.
- **Two-tier fixture convention (project-context.md, "Fixtures"):** synthetic PDFs in `api/tests/fixtures/pdf/` + goldens are the CI/release gate; the real `bank_data/PROMERICA_CRED.pdf` is diagnostic-only, gitignored, and must never be committed or block merge. Task 1's real-text extraction stays local to the dev session — only the *pattern* it reveals (as a synthetic multi-page fixture) goes into the repo.
- **Root cause for Defect A is a hypothesis, not confirmed** (no real PDF or its extracted text was available when this story was written) — Task 1 exists specifically to verify it before coding a fix. If the hypothesis is wrong, follow whatever the real text actually shows; don't force-fit the page-break-boilerplate theory.
- **`ParseEvidenceItem` shape** (`api/domain/parse_evidence.py:17-24`): a `row` item has `description`/`amount`/`currency`/`posted_date`; a `gap` item has only `raw_snippet`. `parse_evidence_from_rows()` (line 51) always shapes evidence as zero-or-more `row` items followed by exactly one `gap` item — so "the gap item" and "the last item" are currently equivalent, but prefer `.find(item => item.kind === "gap")` over `.at(-1)` for clarity and to stay correct if evidence shape ever changes.
- **`ManualExpenseInitialValues`** (`ui/app/lists/ManualExpenseForm.tsx:59-64`): every field is optional and user-editable post-fill — leaving `amount`/`currency`/`postedDate` `undefined` when pre-filling from a gap item is a supported, normal state, not a special case requiring new form logic.

### Project Structure Notes

- No new files anticipated for Task 3/4 (edits to existing `adapter.py`, `ParseComparisonPanel.tsx`, and their existing test files). Task 2 may add a new fixture-generation helper or a second `.pdf` fixture file under `api/tests/fixtures/pdf/` if extending the existing single-page fixture to be multi-page is awkward — follow the existing naming convention (`promerica_synthetic.pdf`, `promerica_parse_failure_mixed.pdf`).
- No backend schema/API changes — `parse_evidence` already carries everything Task 3 needs; this is a read-side selection fix in the UI only.

### References

- [Source: api/adapters/bank/promerica/adapter.py] — `_SECTIONS`, `_KNOWN_BOILERPLATE_LINES`, `_CARD_NUMBER_MARKER_RE` (lines 83-152); `parse()` main loop and unmapped-section fail-loud path (lines 264-413, esp. 291-346).
- [Source: api/scripts/generate_promerica_fixture.py] — current single-page synthetic fixture; its own docstring (lines 1-24) documents the exact prior gap this story's Defect A resembles.
- [Source: api/domain/parse_evidence.py] — `ParseEvidenceItem`, `ParseEvidence`, `parse_evidence_from_rows()` (lines 14-77).
- [Source: ui/app/upload/ParseComparisonPanel.tsx] — `initialValuesFrom()` (lines 53-62).
- [Source: ui/app/lists/ManualExpenseForm.tsx] — `ManualExpenseInitialValues` (lines 59-64).
- [Source: ui/app/upload/ParseComparisonPanel.test.tsx] — existing fixture and assertions pinning the current (buggy) pre-fill behavior (lines 112-135, 203-205, 328-329, 365-367).
- [Source: api/tests/test_promerica_adapter.py] — existing adapter test suite, esp. `test_parse_matches_goldens_row_for_row` (line 141) and `test_parse_unmapped_section_raises_rather_than_silently_dropping` (line 280).
- [Source: _bmad-output/implementation-artifacts/4-9-2-real-promerica-credit-card-adapter.md] — dev notes on the compras section spanning pages 1→2 and the page-2 truncated card-number marker (real evidence of a mid-section page break in this exact statement).
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-09-23-promerica-real-statement-parse-failure.md] — full impact analysis and rationale for this story.
- [Source: _bmad-output/project-context.md] — "Fixtures — two-tier (AD-11)" and "Anti-patterns" sections.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
