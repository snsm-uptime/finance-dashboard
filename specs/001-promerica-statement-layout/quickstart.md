# Quickstart: Validate Promerica Credit Card Statement Layout Support

**Feature**: `001-promerica-statement-layout` | **Date**: 2026-11-09

This guide shows how to check the feature end to end. It does not include implementation code. For the rules being checked, see [spec.md](./spec.md); for the data shapes, see [data-model.md](./data-model.md).

## Prerequisites

- The worktree is on branch `001-promerica-statement-layout`, or the feature changes are applied to it.
- Python dependencies for `api/` are installed (`uv sync` in `api/`, per the project setup).
- No real statement PDF is needed for CI checks. Real statements live outside the repo (`bank_data/`, gitignored) and are used only for an optional manual smoke test.

## 1. Run the adapter tests

From `api/`:

```bash
uv run pytest tests/test_promerica_adapter.py -q
```

**Expected**: all Promerica tests pass, including the new newer-layout cases:
- points transfer is not imported and appears as a statement note
- payment rows read the transaction columns only
- interest concept and amount pairs are matched
- an unreadable row is flagged and the readable rows are returned
- section totals match the golden values

## 2. Check the earlier layout did not change

```bash
uv run pytest tests/test_promerica_adapter.py -q -k "earlier or synthetic"
```

**Expected**: the earlier-layout fixture produces exactly the rows in its golden file (SC-004).

## 3. Check other banks are not affected

```bash
uv run pytest tests/test_bac_adapter.py tests/test_bac_debit_adapter.py tests/test_bank_adapters_application.py -q
```

**Expected**: all pass with no changes to their expected output. BAC still fails loud on an unreadable row (spec assumption on other banks).

## 4. Check the import session

```bash
uv run pytest tests/test_import_session_application.py -q
```

**Expected**: a statement with one flagged row stores its readable rows and its flag, and the PDF is kept until the flag is cleared, then removed (FR-014, per [research.md](./research.md) R4). A statement with no flagged rows has its PDF removed right after import.

## 5. Optional manual smoke test (not a merge gate)

1. Start the API and UI locally (project run instructions).
2. Upload the newer-layout sample statement from a local path outside the repo.
3. Confirm:
   - the statement is identified as Promerica credit without manual selection (SC-003)
   - purchases total `800,252.26` CRC and `425.31` US$ from imported rows, with the `80,133.00` points transfer shown as a note (SC-001)
   - no summary, total, or card-number lines appear as transactions (SC-002)
   - any unreadable row appears in the review list, and the other rows still import (SC-006)

## Done when

- Steps 1 to 4 pass in CI.
- The open items in [research.md](./research.md) are resolved: the title accent check (R1), the `parse()` return shape for flagged rows (R2), and the code path that reads the PDF after import (R4).
