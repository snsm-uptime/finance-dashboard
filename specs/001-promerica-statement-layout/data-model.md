# Data Model: Promerica Credit Card Statement Layout Support

**Feature**: `001-promerica-statement-layout` | **Date**: 2026-11-09

This model covers only what this feature adds or changes. Existing entities (`CanonicalLine`, the import session, the statement record) keep their current shape unless noted.

## Existing: CanonicalLine (unchanged)

One transaction row. Fields used for Promerica:

| Field | Source on the newer-layout statement |
|---|---|
| `posted_date` | Row date, `DD/MM/YYYY` (year printed on the row) |
| `amount` | Signed amount, from the currency column that is non-zero (`normalize_dual_column_amount`) |
| `currency` | `CRC` or `USD` |
| `product_id` | `promerica_credit` |
| `line_type` | Section kind: payment, purchase, interest, fee, or voluntary service |
| `normalized_description` | Row text without the date and amount tokens (location text stays in the description, see note below) |

**Note on location (spec FR-006)**: The spec asks for the purchase location to be read as part of the row without being added to the description used for matching. The current `CanonicalLine` has no location field. Plan: keep location in the description for now and treat a separate location field as a follow-up, unless research R1 shows matching depends on it. This is an open point, recorded here so it is not lost.

## New: FlaggedRow

A transaction-looking row the adapter could not read. Returned alongside readable rows. Not stored as a `CanonicalLine`.

| Field | Type | Rules |
|---|---|---|
| `raw_text` | string | The printed row text, exactly as extracted |
| `section` | string | The printed section title the row sits under (for example, "Detalle de compras del periodo") |
| `page` | integer | 1-based page index of the row, for the user's reference |
| `reason` | string | Short, user-facing reason (for example, "amount missing", "date missing", "interest amount with no concept line") |
| `review_status` | enum | `unreviewed` (default), `fixed` (now imports as a transaction), or `dismissed` (not a transaction). Dismissed rows stay in the statement record. |

**Validation**:
- A flagged row is never a `CanonicalLine`, so it never affects section totals.
- Flagged rows are shown to the user as a review list (FR-009, SC-006). The statement stays usable; readable rows import.
- A statement with any `unreviewed` flagged row cannot be finalized (clarification, FR-009).
- A section with flagged rows that does not match its printed total reports the mismatch with those rows as its reason (FR-012).

## New: StatementNote

A printed amount that is not a transaction. Currently only the points transfer ("Traslado de puntos a cuenta crédito").

| Field | Type | Rules |
|---|---|---|
| `label` | string | The printed label, for example "Traslado de puntos a cuenta crédito" |
| `section` | string | The section it was printed under (purchases for the newer-layout sample) |
| `currency` | `CRC` or `USD` | From the non-zero amount column |
| `amount` | decimal | Signed, as printed (negative for the newer-layout transfer: `-80,133.00`) |

**Validation**:
- Notes are excluded from `CanonicalLine` output and from transaction totals.
- A note is kept for the statement's record and display. Its display format is a UI decision (spec assumption).

## Derived check: section total reconciliation (FR-012, SC-001)

For each transaction section on a statement:

- `imported_total` = sum of `CanonicalLine.amount` for that section, per currency.
- `printed_total` = the total printed at the end of the section.
- For the purchases section, `printed_total` plus the points-transfer note amount equals `imported_total` (because the note is removed from imports). For the newer-layout sample: printed `720,119.26` CRC, plus `80,133.00` = `800,252.26` CRC; US$ `425.31` unchanged.

This check is computed in tests (the golden file), not stored, unless the UI later needs it.

## Statement lifecycle (spec FR-014)

| State | Meaning | PDF kept? |
|---|---|---|
| Parsing | Upload received, adapter running | Yes |
| Imported, no flagged rows | All readable rows stored | Yes while under review; released at finalize (AD-3) |
| Imported, with flagged rows | Readable rows stored; flagged rows listed for review | Yes until every flagged row is fixed or dismissed and the import is finalized (AD-3 plus FR-014) |
| Failed | Adapter could not produce any rows (for example, detection failed on the content) | Kept while staged or failed, per AD-3 and the Story 5.1 comparison |

Decision (2026-11-09): AD-3 applies. The PDF is released at finalize, not at import (see spec FR-014).
