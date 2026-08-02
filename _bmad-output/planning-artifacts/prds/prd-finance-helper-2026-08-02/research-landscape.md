---
title: "Landscape research: statement-import prior art"
created: 2026-08-02
source: web-research subagent, Discovery phase
---

# Landscape research: statement-import prior art

Grounding digest for the finance-helper PRD. Reported landscape, not recommendations.

## 1. Importer/adapter contracts in plain-text accounting

**beangulp** ([github.com/beancount/beangulp](https://github.com/beancount/beangulp)) is the closest prior art. An importer subclasses `beangulp.importer.Importer` with four methods: `identify(filepath) -> bool` (required — content/filename sniffing to claim a file), `account(filepath)` (required), `date(filepath)` (optional, parses the statement date out of the document), and `extract(filepath, existing) -> Entries`. `extract` receives the *existing ledger* — dedup context is passed into the adapter rather than bolted on afterward. Registration is not a plugin registry: an `import.py` instantiates a plain Python list of importers and passes it to `beangulp.Ingest`. Beancount 2's `beancount.ingest.ImporterProtocol` (`file_account`/`file_date`/`file_name`) is the deprecated predecessor.

Testing is the strongest pattern: `tests/` holds real downloaded statements next to golden `.beancount` files. `python import.py generate ./tests` produces expected output (eyeballed once), and `test` re-verifies after every change. See [beangulp/examples](https://github.com/beancount/beangulp/tree/master/examples) and [Importing External Data](https://beancount.github.io/docs/importing_external_data/).

Community convention for PDF fixtures: run `pdftotext` on a real statement, anonymize the text, print back to PDF, commit that ([m-d-brown/plain-text-accounting-tools](https://github.com/m-d-brown/plain-text-accounting-tools)).

**hledger** is declarative, not code — a `bank.csv.rules` file next to the data declares `skip`, `fields`, `date-format`, `account1`, and `if` blocks. No Python interface. **hledger-flow** ([apauley/hledger-flow](https://github.com/apauley/hledger-flow)) adds convention-over-configuration: `import/<owner>/<bank>/<account>/1-in/<year>/statement.csv` with generated `2-preprocessed/` and `3-journal/` stages, plus optional executable `preprocess`/`construct` shell hooks as the non-CSV escape hatch.

**ledger-cli** has no framework — standalone CSV-only converters ([icsv2ledger](https://github.com/quentinsf/icsv2ledger), [reckon](https://github.com/cantino/reckon)).

**beancount-import** ([jbms/beancount-import](https://github.com/jbms/beancount-import)) defines a `Source` with `prepare(journal, results)` and `is_posting_cleared(posting)`, and can wrap beangulp importers via `generic_importer_source`.

## 2. Deduplication / idempotent re-import

The three ecosystems genuinely disagree:

- **hledger** — high-water mark, not identity. Stores the latest processed record date in a hidden `.latest.FILE.csv`, skips anything at or before it. Documented as assuming stable chronological order and append-only records. Wrong for statements that restate or backfill.
- **beangulp** — fuzzy heuristic matching ([similar.py](https://github.com/beancount/beangulp/blob/master/beangulp/similar.py)): ±2-day date window, account-set subset match, amounts within ~5%. Matches are *marked*, not dropped — a `__duplicate__` metadata key points at the original, human decides. Comparator is swappable.
- **beancount-import** — writes provenance back into the ledger. Accepting a match inserts `date` and `source_desc` posting metadata marking it cleared; future runs key off that. Its `generic_importer_source` keys on `(account, date, units, narration)` and handles N-of-a-kind duplicates by counting existing identical keys and importing only the surplus.

**Nobody relies on bank-supplied reference IDs.** The shared assumption is that external references are missing or unstable.

## 3. Python PDF parsing prior art

- **pdfplumber** ([jsvine/pdfplumber](https://github.com/jsvine/pdfplumber)) — current default for new work. Pip-only, actively maintained, per-character coordinates, `extract_text(layout=True)`, tunable `table_settings`, visual debugging. Best fit for unruled/positionally-aligned multi-column layouts; tuning takes real effort.
- **Camelot** — wins on genuinely ruled tables (`flavor="lattice"`), returns nothing without borders, pulls in Ghostscript.
- **tabula-py** — solid zero-config baseline, requires a JRE, per-invocation JVM startup cost.
- **PyMuPDF/fitz** — fast raw words-plus-coordinates for hand-rolled reconstruction; the usual fallback when detection fails on inconsistent layouts.
- **pypdf** — text/metadata only, not a table extractor.
- **Docling**, **PyMuPDF4LLM** — ML/layout-model converters for RAG pipelines; heavy for a local CLI.

None do OCR; all return empty on scanned PDFs. Beancount's own guidance: no single extractor works on all documents, so beancount refuses to depend on any of them, and `pdftotext -layout` from poppler remains a common pragmatic choice. Spanish text is a non-issue for text-layer extraction (all Unicode-clean); the risk is decimal-comma parsing and accented merchant strings, not extraction.

**Directly relevant prior art:** [`bac_tools`](https://git.posixlycorrect.com/fabian/bac_tools) is an open-source pdfplumber-based extractor for BAC Costa Rica *credit card* statement PDFs. Its JSON schema mirrors the sectioned layout — separate `purchases`, `other_charges`, `voluntary_services` arrays, a `card_holders` list keyed by card suffix, and per-transaction `reference`, `currency`, `amount_crc`, `amount_usd`. [erojas150604/bancos-reader](https://github.com/erojas150604/bancos-reader) is a Spanish-language multi-bank PDF reader using per-bank parser modules selected by content sniffing.

## 4. Commercial/consumer comparables

Statement-file import is the dividing line:

- **Lunch Money** — the only one advertising native PDF statement import, and it ships the file to a third party (bankstatementconverter.com), conflicting with local-only goals. CSV import is client-side.
- **Monarch Money** — CSV with keyword-based column auto-mapping. Crude duplicate strategy: "Prioritize CSV" (deletes all existing transactions in the CSV's date range and replaces) or "Import all" (accepts duplicates). No identity matching.
- **Copilot Money** — CSV per-account. **Maybe Finance** (open source, Ruby) — single- vs multi-account CSV modes.
- **Firefly III** ([data-importer](https://github.com/firefly-iii/data-importer)) — CSV and CAMT.052/.053, with explicit documentation: *"PDF files will never be supported."*
- **Actual Budget** — OFX/QFX/QIF/CSV, local-first SQLite.

Plaid covers the US, Canada, and Europe and **does not cover Costa Rica**. Regional aggregator Belvo covers Brazil, Mexico, Colombia, Chile, Argentina, and Peru — also not CR. Statement-file parsing isn't a fallback in this market, it's the only path, and no mainstream tool serves it locally.

## 5. Shared-expense splitting

**Splitwise** — `expenses` + `expense_splits(expense_id, user_id, owed_amount)` with materialized pairwise `balances`; split types equal/exact/percentage/shares/itemized; optional greedy debt simplification.

**Monarch "Shared Views"** — closest match to a per-account model. Ownership assigned per-account by default and inherited by transactions, with per-transaction override and rules-based reassignment. Reviewers call it "a glorified tag." Budgets stay unified; only reporting/filtering splits.

**Actual Budget** — no native concept. [Joint-accounts docs](https://actualbudget.org/docs/budgeting/joint-accounts/) prescribe category-based workarounds; an open [reimbursable-expense-tracking issue](https://github.com/actualbudget/actual/issues/7158) confirms the gap. Community routes through a Splitwise clearing account. **Firefly III** likewise has no shared/personal dimension — tags and split transactions.

**Notable absence:** outside Monarch's account-level ownership default, per-account (rather than per-transaction) shared flags are not an established pattern. Every other tool models sharing at the transaction or category level.
