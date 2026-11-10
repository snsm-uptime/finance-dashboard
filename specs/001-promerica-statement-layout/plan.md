# Implementation Plan: Promerica Credit Card Statement Layout Support

**Branch**: `001-promerica-statement-layout` | **Date**: 2026-11-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-promerica-statement-layout/spec.md`

## Summary

The existing Promerica credit-card adapter (`api/adapters/bank/promerica/adapter.py`, story 4-9-2) parses the earlier Promerica layout. The newer-layout statement adds rows and layout that adapter does not handle, and the spec's clarifications change two behaviors:

1. **Partial import (Q1):** a row the adapter cannot read must be flagged for review, and the readable rows still import. Today a single malformed row fails the whole statement (`fail_parse` raises `InvalidCanonicalLineError`).
2. **Points transfer (Q2):** the "Traslado de puntos a cuenta crédito" row (printed as `- 80,133.00`, with a space after the minus) is kept out of transactions and shown as a statement note.
3. **PDF discard (Q3, FR-014):** a statement with no flagged rows discards its PDF right after import. A statement with flagged rows keeps the PDF until every flagged row is reviewed, then discards it.
4. **Finalize gate (clarification):** a statement cannot be finalized while any flagged row is unreviewed. A flagged row counts as reviewed when it is fixed into a transaction or dismissed; dismissed rows stay in the statement record.
5. **Mismatch reason (FR-012):** a section with flagged rows that does not match its printed total shows the mismatch together with those flagged rows as its reason.

The approach is to extend the existing adapter, not add a second Promerica adapter. Row-level flagging needs a small addition to the import contract, and that addition must not change BAC behavior (spec assumption: other banks unchanged). Details and open questions are in [research.md](./research.md).

## Technical Context

**Language/Version**: Python (API service under `api/`, version pinned in `api/pyproject.toml`)

**Primary Dependencies**: `pdfplumber` (text extraction, used by the adapter and `_shared.sniff_content_marker`), `pypdfium2` (PDF split), the existing `domain/` and `application/` layers

**Storage**: Imported statement rows are stored through the existing import-session repository. Uploaded PDFs are held by the existing `storage` port in `application/import_session.py`. Exact discard point to confirm in research (see R4).

**Testing**: `pytest` under `api/tests/`. Existing Promerica tests in `api/tests/test_promerica_adapter.py`, fixtures in `api/tests/fixtures/pdf/`, golden values in `promerica_synthetic_goldens.py`. Real statements are never committed (project rule); CI gates on the synthetic fixture only.

**Target Platform**: Same as the API service (Docker, `api/Dockerfile`)

**Project Type**: Web application (API plus UI in `ui/`). This feature is backend-only: adapter, import session, and parse-result shape. UI display of flagged rows is out of scope for this plan.

**Performance Goals**: No new target. A statement of the newer-layout size (3 pages, about 100 rows) must parse within the existing import path's timing.

**Constraints**:
- No real statement content in the repo, tests, or fixtures (project rule, spec assumption).
- Earlier-layout Promerica statements and BAC statements produce identical output before and after (spec FR-011, SC-004, assumption on other banks).
- Adapter registration stays through `api/adapters/bank/__init__.py` (no edits needed in `application/bank_adapters.py` or `domain/canonical_line.py` for the adapter itself; the flagged-row path is the exception, see R2).

**Scale/Scope**: One product (`promerica_credit`), one new statement layout, a handful of new section-level rules.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still the unfilled Spec Kit template (placeholders such as `[PRINCIPLE_1_NAME]`). There are no ratified principles to check against, so no gate can fail.

The project's working rules that do apply, taken from the existing Promerica adapter and its story:
- Adapters return normalized rows and do not commit or call other adapters (AD-1/AD-16).
- Parsing fails loud on unreadable rows (NFR-8/FR-14). **This plan changes that for Promerica only, as Q1 requires; see R2 for how.**
- Real bank content never goes into committed fixtures (project context).

Result: **PASS with one noted exception** (the Q1 partial-import behavior, which the user chose).

## Project Structure

### Documentation (this feature)

```text
specs/001-promerica-statement-layout/
├── spec.md              # Feature spec (with clarifications)
├── plan.md              # This file
├── research.md          # Phase 0: decisions and open questions
├── data-model.md        # Phase 1: flagged rows, statement notes
├── quickstart.md        # Phase 1: how to validate end to end
├── checklists/
│   └── requirements.md  # Spec quality checklist (all passing)
└── tasks.md             # Created later by /speckit-tasks (not by this command)
```

No `contracts/` directory: the adapter is internal to the API, and the only new interface (the flagged-row list) is internal between the adapter and the import session. Its shape is in `data-model.md`. If the UI later needs a contract for it, that belongs to the UI feature.

### Source Code (repository root)

```text
api/
├── adapters/bank/
│   ├── __init__.py                     # Registry (no change expected)
│   ├── _shared.py                      # fail_parse, sniff_content_marker (no change expected)
│   └── promerica/
│       └── adapter.py                  # MAIN CHANGE: new rules and flagged-row path
├── application/
│   ├── bank_adapters.py                # BankAdapter protocol: flagged-row return path (R2)
│   └── import_session.py               # Consume flagged rows; discard PDF after import (R2, R4)
├── domain/
│   ├── canonical_line.py               # Unchanged (CanonicalLine shape stays the same)
│   └── statement_layout.py             # Unchanged, reused for section splitting
└── tests/
    ├── test_promerica_adapter.py       # New cases for newer-layout rules
    ├── test_import_session_application.py  # Flagged rows, PDF discard
    ├── fixtures/pdf/                   # Synthetic newer-layout fixture (no real data)
    └── fixtures/pdf/promerica_synthetic_goldens.py  # Expected values for the new fixture
```

**Structure Decision**: Extend the existing Promerica package in place. Do not add a new adapter or a second product id. The earlier layout and the newer layout are handled by the same adapter, distinguished only by the rows they contain. The only cross-layer change is the flagged-row path (R2), which must be scoped so BAC adapters keep their current fail-loud behavior.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Flagged-row path crosses the adapter and import-session layers (Q1) | The user chose partial import, and the adapter currently has no way to return unreadable rows alongside readable ones | Keeping `fail_parse` would contradict Q1. Putting the flagged list only in the adapter's logs would hide rows from the user, which Q1 rules out. |
