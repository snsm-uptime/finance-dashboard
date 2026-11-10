# Feature Specification: Promerica Credit Card Statement Layout Support

**Feature Branch**: `001-promerica-statement-layout`

**Created**: 2026-11-09

**Status**: Draft

**Input**: User description: "I want promerica credit cards to have support for this @~/Downloads/ENERO.PDF. This file has extra headers, rows and columns"

## Clarifications

### Session 2026-11-09

- Q: When the import hits a transaction row it cannot read, should the whole statement be rejected, or should the readable rows be imported with the unreadable ones flagged? → A: Import the readable rows and keep the unreadable ones in a flagged list the user can review
- Q: Should the "Traslado de puntos a cuenta crédito" row (a points transfer printed as a negative amount in the purchases section) stay inside purchases as a credit, or be shown under its own category? → A: Leave it out of the import and show it only as a note on the statement
- Q: After a statement is imported, should the original PDF be kept on the account, or should only the extracted transaction rows be stored? → A: Store only the extracted rows and totals; discard the PDF after a successful import
- Q (planning decision, 2026-11-09): When a statement has flagged rows, should the PDF be kept until those rows are reviewed, or discarded anyway? → A: Keep the PDF until the flagged rows are reviewed, then discard it (FR-014 updated)
- Q: Can a statement be finalized while some of its flagged rows are still unreviewed? → A: No. Finalizing is blocked until every flagged row is reviewed
- Q: What counts as "reviewed" for a flagged row? → A: Either fixing the row so it imports as a transaction, or dismissing it as not a transaction; dismissed rows stay in the statement record
- Q: When a section has a flagged row, should its total check still show a mismatch? → A: Yes. Show the mismatch and list the flagged rows as the reason for it

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Import a Promerica credit card statement in the newer layout (Priority: P1)

A user with a Promerica credit card uploads its monthly statement PDF. The statement has a longer header than the earlier sample: an account summary, minimum and full payment breakdown tables, an "Avisos importantes" notice block, and a "Resumen de tarjeta de crédito" block. Its transaction sections also carry more rows and columns: payments show colones and US$ amounts for both the transaction and its interest, purchases include a location and currency-code column, some purchases are made in US$ only, and some rows are negative (a refund, a points transfer, a payment reversal). The user expects every transaction in the statement to appear in the import, with the correct currency and sign, and no summary or header lines counted as transactions.

**Why this priority**: This is the reported gap. Without it, a Promerica credit card statement in the current layout cannot be imported reliably, which blocks the card's main use case.

**Independent Test**: Upload the reference statement. Compare the imported rows for each transaction section against that section's printed total. Every section's imported total must match the printed total.

**Acceptance Scenarios**:

1. **Given** the reference statement, **When** the user uploads it, **Then** the import identifies it as a Promerica credit card statement and imports every row in the sections "Detalle de pagos del período", "Detalle de compras del período", "Detalle de intereses", "Detalle de otros cargos", and "Detalle de productos y servicios de elección voluntaria".
2. **Given** the reference statement, **When** the imported purchase rows are summed by currency, **Then** the colones total is 800,252.26 (the printed purchases total of 720,119.26 plus the 80,133.00 points transfer shown as a note) and the US$ total equals 425.31.
3. **Given** a purchase row that has a colones amount of 0.00 and a US$ amount (for example, an online merchant charged in US$), **When** it is imported, **Then** its amount is recorded in US$ and its colones amount is zero.
4. **Given** the points transfer row printed as "- 80,133.00" in the purchases section, **When** the statement is imported, **Then** it is not imported as a transaction and its amount is shown as a note on the statement.
5. **Given** the summary and notice blocks above the transaction sections, **When** the statement is imported, **Then** none of their lines (minimum payment amounts, "Saldo anterior", "Total de pago de contado", notices, or footer text) appear as transactions.

---

### User Story 2 - Import interest and payment rows with split concept and amount lines (Priority: P2)

In the interest section, each concept (for example, "MONTO POR INTERESES CORRIENTES") is printed on one line and its colones and US$ amounts on the next line, with no date. The payments section has four amount columns: the payment's colones and US$ amounts, and the colones and US$ interest on that payment. The user expects each interest concept to be paired with its amounts, and each payment to carry its transaction amount without double counting the interest columns.

**Why this priority**: These rows are not recognized by the current layout handling. They affect totals but are less frequent than purchases.

**Independent Test**: Upload the reference statement. Check that the interest rows equal the printed interest total ("Total por concepto de intereses", 49,146.11 colones and 12.20 US$), and that the payment rows equal the printed payment total.

**Acceptance Scenarios**:

1. **Given** an interest concept line followed by its amount line, **When** the statement is imported, **Then** one interest row is created with that concept as its description and the two amounts.
2. **Given** an interest reversal printed as a negative amount (for example, "REVERSIÓN DE INTERESES CORRIENTES DEL PERIODO ANTERIOR" with -3,564.56), **When** it is imported, **Then** it is recorded as a negative amount.
3. **Given** a payment row with four amounts, **When** it is imported, **Then** the transaction amount is recorded once in its currency and the interest amounts are not added as separate payments.
4. **Given** an amount line in the interest section with no concept line before it, **When** the statement is imported, **Then** the import reports that row as unreadable instead of creating a row with an empty description.

---

### User Story 3 - Keep the earlier Promerica layout working (Priority: P3)

Users who uploaded Promerica statements in the earlier layout (the sample the existing Promerica support was built from) continue to import them with the same results as today.

**Why this priority**: The change must not break statements that already import correctly.

**Independent Test**: Re-import the earlier-layout sample statements used by the existing Promerica tests. Results must match their current expected output.

**Acceptance Scenarios**:

1. **Given** an earlier-layout Promerica statement, **When** it is imported after this change, **Then** the imported rows, amounts, and dates are the same as before this change.
2. **Given** a statement from another bank (for example, BAC credit or BAC debit), **When** it is uploaded, **Then** it is not identified as Promerica.

---

### Edge Cases

- A section total line (for example, "Total de compras del período de 21/12/2025 al 21/01/2026") has a date range and amounts. It must not be imported as a purchase row, which would double count the section.
- A card-number line appears between a section header and its first row, and the holder's name line appears with a truncated card number on a later page. These lines are not transactions and must be skipped.
- A purchase description contains a number that looks like an amount (for example, "BONO DE BIENVENIDA 15,000" with no decimal places). It must not be read as an amount.
- A section that is empty in the statement (for example, "Cargos por gestión evidenciable de cobro", which shows only a total of 0.00) imports no rows and does not cause an error.
- A row's date is for the period's day and month only, or the row is missing an amount. The import must flag it as unreadable in the review list rather than guess, and still import the readable rows.
- The statement spans several pages, and a section can start on one page and continue on the next. Rows on each page must be imported in order, with no rows lost at the page break.
- Merchant names that mention a country or location code (for example, "LIMON CRI", "GUAJITO PAN", "CUPERTINO USA") must keep their description and location distinct.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST identify a Promerica credit card statement in the newer layout as a Promerica credit card statement, and MUST NOT identify statements from other banks as Promerica.
- **FR-002**: The system MUST import every transaction row from the five transaction sections of a Promerica credit card statement: payments, purchases, interest, other charges, and voluntary products and services. The "Cargos por gestión evidenciable de cobro" section MUST be read and import nothing when it has no rows.
- **FR-003**: The system MUST NOT import as transactions any lines from the account summary, minimum payment and full payment tables, notices, "Saldo anterior", "Resumen", section total lines, card-number lines, or footer text.
- **FR-004**: The system MUST record each amount with its currency. Colones amounts and US$ amounts are recorded separately, and a row with a 0.00 amount in one currency is recorded in the other currency only.
- **FR-005**: The system MUST keep the sign of each amount as printed. Negative amounts (refunds, interest reversals, payment rows) are recorded as negative.
- **FR-013**: The system MUST NOT import points transfer rows ("Traslado de puntos") as transactions. It MUST show each points transfer's printed amount as a note on the statement.
- **FR-014**: After a statement import completes with no flagged rows, the system MUST discard the original PDF right after import. When a statement has flagged rows, the system MUST block finalizing that statement until every flagged row has been reviewed, and MUST keep the original PDF until then, after which it is discarded. In both cases only the extracted transaction rows, section totals, notes, and flagged rows are kept.
- **FR-006**: The system MUST keep the purchase location and country code as part of the row's description. Matching MUST use the description with the location and country code removed, so the merchant name matches the same way with or without them.
- **FR-007**: The system MUST pair each interest concept line with the amount line that follows it, and MUST import the interest section's amounts as printed.
- **FR-008**: For payment rows with four amounts, the system MUST record the transaction amount once per currency and MUST NOT record the interest columns as separate payments.
- **FR-009**: The system MUST report any transaction-looking row it cannot read (missing date, missing amount, or an amount line with no concept) as unreadable and place it in a flagged list the user can review. Readable rows are still imported, the statement is not rejected, and no unreadable row is silently dropped or guessed. A statement with unreviewed flagged rows cannot be finalized. A flagged row is reviewed when it is either fixed so it imports as a transaction, or dismissed as not a transaction; dismissed rows stay in the statement record.
- **FR-010**: The system MUST import rows that continue across a page break in the same order they appear in the statement.
- **FR-011**: The system MUST keep importing statements in the earlier layout with the same results as before this change.
- **FR-012**: Each imported section's total MUST be checkable against the total printed on the statement, so the user can confirm no rows are missing. When a section has flagged rows, a mismatch against its printed total is shown together with those flagged rows as its reason, and the check passes once they are reviewed.

### Key Entities *(include if feature involves data)*

- **Statement**: One monthly Promerica credit card statement. Has a period (cut-off and payment dates), a card product name, and printed section totals. It is one import unit.
- **Transaction row**: One line from a transaction section. Has a date, a description, an optional location, a description that includes the purchase location and country code (FR-006), a section kind (payment, purchase, interest, other charge, voluntary service), colones and US$ amounts, and a sign.
- **Section total**: The total printed at the end of each transaction section. It is used to check the imported rows and is not itself a transaction.
- **Summary block**: The account summary, payment tables, and notices shown before the transaction sections. It is not imported.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For the reference statement, the imported total of every transaction section matches the printed section total in both colones and US$, with a difference of 0.00. For the purchases section, the printed total is compared after adding back the 80,133.00 points transfer shown as a note.
- **SC-002**: For the reference statement, zero transaction rows are dropped or duplicated, and zero summary or total lines appear as transactions.
- **SC-003**: The reference statement is identified as a Promerica credit card statement on the first upload, with no manual selection by the user.
- **SC-004**: Every earlier-layout Promerica statement in the existing test set imports with the same rows and amounts as before this change, with zero differences.
- **SC-005**: Statements from other banks in the existing test set are never identified as Promerica.
- **SC-006**: Every row the import cannot read appears in the user's flagged review list, with none silently dropped, and the readable rows of the same statement are still imported.

## Assumptions

- The reference statement is representative of the newer Promerica credit card layout. Other months may add rows, but they use the same sections and column order.
- The reference sample is used only for testing. Real statement files are not stored in the repository, consistent with the project's existing handling of bank statements.
- A "Traslado de puntos a cuenta crédito" row inside the purchases section is a negative amount that reduces the printed purchases total. It is left out of the imported transactions and shown as a statement note, so the imported purchases exceed the printed total by its amount.
- The purchase location column (for example, "LIMON", "GUAJITO", "Dublin") is kept within the row's description (FR-006), and matching ignores it. Its exact display is a UI decision outside this spec.
- The earlier-layout Promerica statements are the ones the current Promerica support was built from. They remain supported alongside the newer layout, not replaced by it.
- Foreign-currency merchants (for example, online services charged in US$) are imported in US$ with a 0.00 colones amount. No currency conversion is applied.
- Dates printed as day/month/year on each row are authoritative. The statement's cut-off date is not used to fill in a missing year.
- Existing import behavior for other banks, the statement upload flow, and the display of imported statements is unchanged by this feature.
