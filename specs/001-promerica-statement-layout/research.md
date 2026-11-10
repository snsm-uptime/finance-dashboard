# Research: Promerica Credit Card Statement Layout Support

**Feature**: `001-promerica-statement-layout` | **Date**: 2026-11-09

This file resolves the open technical questions from the spec and plan. Each item is marked **Verified** (checked in the code this session) or **To verify in implementation** (a question to settle with a test or a real-text extraction before coding relies on it).

## R1 — Adapter rules for the newer layout

**Decision**: Extend `api/adapters/bank/promerica/adapter.py` with these rules, each covered by a test:

| Rule | Current behavior | Change |
|---|---|---|
| Points transfer row ("Traslado de puntos…") | Not skipped. It would be read as a purchase row. Its amount `- 80,133.00` has a space after the minus, which `_AMOUNT_TOKEN_RE` (`-?\d…`) does not match. | Skip rows whose description starts with "Traslado de puntos" before amount parsing. Record the printed amount as a statement note (R3). |
| Section total lines | Skipped via `_TOTAL_LINE_RE` (`^Total\b`). | No change. Confirm the purchases total line ("Total de compras del periodo de …") is skipped by it. |
| Card-number marker lines | Skipped via `_CARD_NUMBER_MARKER_RE` (`^X{4}-X{4}-X{4}-`). | No change. newer-layout prints the marker with the holder's name on the same line. |
| Payment rows (4 amounts) | Uses amount columns 0 and 2; columns 1 and 3 are interest. | No change. newer-layout payment rows match this shape. |
| Interest pairing | Buffers the most recent concept line, then pairs it with the next 2-amount line. | No change to the mechanism. Confirm that the reversal line ("REVERSIÓN DE INTERESES…" with `-3,564.56 0.00`) parses. `_AMOUNT_TOKEN_RE` handles the leading minus, so it should. |
| Unreadable rows | Raises via `fail_parse` on the first failure. | Collect the failure into a flagged-row list and continue (R2). |
| Section title spelling | Titles are declared without accents ("periodo"). | **Verified (T001)**: pdfplumber on the local Promerica BLACK statements (`bank_data/0226 CRED_PROMERICA_BLACK.pdf`) prints "Detalle de pagos del periodo" with no accent. The accented "período" appears only in running text ("Pago intereses del período"), not in section titles. `_SECTIONS` already matches; no change needed. No local sample contains "Traslado de puntos", so the points-transfer rule is covered by the synthetic newer-layout fixture only. |

**Rationale**: The adapter already has the mechanisms newer-layout needs (4-column payments, two-line interest, leading minus, section totals, card-number markers). The new work is the points-transfer rule and the flagged-row path, plus the title check.

**Alternatives considered**: A separate `PromericaAdapterV2` for the new layout. Rejected: the spec's FR-011 needs both layouts to produce the same output, and one adapter with one product id avoids duplicated detection.

## R2 — Flagged-row path (Q1: partial import)

**Decision**: Add a flagged-row list to the adapter's parse result for Promerica only. Each flagged row carries its raw text, a reason, and the section it came from. The import session stores readable rows as usual and stores flagged rows as review items. BAC adapters keep raising on the first unreadable row.

**Verified**: Today `fail_parse` raises `InvalidCanonicalLineError`, and `application/import_session.py` handles that exception by failing the statement. Tests in `test_import_session_application.py` depend on that path (for example, `parse_results=[[_row("r1")], InvalidCanonicalLineError("bad row")]`).

**To verify in implementation**:
- How `BankAdapter.parse()` is declared in `application/bank_adapters.py`, and whether a non-exception return path can carry flagged rows without changing the protocol for BAC.
- Whether a new review-item store is needed, or whether the existing parse-evidence mechanism (Story 5.1, `domain/parse_evidence.py`) can carry flagged rows. Reusing it avoids a new table.

**Implemented (T002, T021/T022, adapter side)**: `PromericaAdapter.parse_statement()` returns a `PromericaParseResult` (rows, flagged rows, notes). `parse()` keeps the `BankAdapter` contract: it returns rows and raises `fail_parse` if any row was flagged, so the import session and BAC behave as before. The import session does not yet read `parse_statement()`; storing flags and notes is still open (T019, T020, T023 to T025).

**Rationale**: The import session already has a failure-evidence concept (Story 5.1). Reusing it is the smallest change that gives the user a visible list without changing BAC.

**Alternatives considered**:
- Log flagged rows only. Rejected: Q1 requires the user to see them.
- Make partial import global for all banks. Rejected: the spec assumes other banks are unchanged.

**Open risk**: If the import session cannot mark a statement "complete with flags" without UI changes, the review list must still be stored and returned by the API, even if the UI shows it later. Confirm during implementation which layer owns the status.

## R3 — Points transfer as a statement note (Q2)

**Decision**: The points-transfer amount is kept as a statement-level note (a label and a signed amount) and not as a `CanonicalLine`. The note is returned alongside the rows, using the same channel as flagged rows (R2).

**Rationale**: `CanonicalLine` requires a line type from the existing set (`domain/line_types.py`). None fits a non-transaction note, and adding a line type would affect every consumer of transactions. A separate note keeps transaction totals clean.

**To verify**: That no existing line type or consumer assumes every printed amount is a transaction. Check `domain/line_types.py` and the import session's totals code.

## R4 — Discard the PDF after import (Q3)

**Decision**: After a statement import completes (including imports with flagged rows, per FR-014), delete the stored PDF and keep rows, totals, notes, and flagged rows.

**Verified**: `application/import_session.py` and `application/bank_adapters.py` reference PDF bytes and a storage port. The exact call that stores the upload is not yet traced.

**To verify**:
- Where the upload is stored, and whether anything reads the PDF after import (for example, the parse-failure comparison in Story 5.1, which re-reads the PDF to show side-by-side evidence). If the comparison reads the PDF after import, discarding it on completion would break that feature for failed-or-flagged statements. The spec's FR-014 counts flagged-row imports as complete, so this conflict must be resolved before coding.
- Whether deletion should be a hard delete or a retention-window delete. The spec says discard, so default to hard delete.

**Resolved (user decision, 2026-11-09)**: Keep the PDF only for statements that have flagged rows, until those rows are reviewed. Once the review list is cleared, delete the PDF. Statements with no flagged rows discard the PDF right after import. This keeps the Story 5.1 comparison available for statements that need review. FR-014 is updated to match.

## R5 — Testing strategy

**Decision**:
- Build a synthetic newer-layout fixture, following the pattern of `api/scripts/generate_promerica_fixture.py` and `promerica_synthetic_goldens.py`. Include every rule in R1, a points-transfer row, a 4-column payment, a two-line interest pair, a US$-only purchase, a negative refund, a card-number marker, a total line, and one deliberately unreadable row.
- Golden values assert section totals (purchases total excluding the transfer, and the transfer note separately).
- Add an import-session test that a statement with one flagged row stores its readable rows and the flag.
- Add a regression test that the earlier-layout fixture output is unchanged (SC-004).
- Add a detect test that a BAC credit and a BAC debit fixture are not identified as Promerica (SC-005).

**Rationale**: Real statements are never committed, so the synthetic fixture is the CI gate (project rule). Goldens are kept in a module, as the existing Promerica tests do.

## Summary of open items before coding

1. Title accent check (R1).
2. `BankAdapter.parse()` return shape for flagged rows (R2).
3. Where the PDF is read after import (R4). The retention decision is settled; confirm the code path during implementation.
4. Whether the points-transfer note needs a home in the data model (R3).
