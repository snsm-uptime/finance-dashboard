---
title: "Product Brief: finance-helper"
status: draft
created: 2026-08-01
updated: 2026-08-02
---

# Product Brief: finance-helper

## Executive Summary

`finance-helper` is a personal CLI that turns monthly bank statement exports into a structured local database of transactions, interest/fees, and installment lines. **v1 supports BAC PDF statements** for four products (dolares, colones, walmart, eco): Sebas drops in new statements, the tool detects bank and product via a pluggable adapter, parses structured detail, and loads a local database — with a per-product flag for household expenses shared with Monse. **Promerica (black, platinum) is a planned adapter** after sample statements exist; the architecture must accept that adapter without redesigning the core pipeline.

Today this reconciliation is manual: statements arrive in bank-specific PDF layouts with multiple currencies (CRC/USD) mixed within a single document, sectioned data (purchases, interest, fees, installment financing), and no shared view across accounts. Figuring out what's owed to Monse each month means digging through PDFs by hand. `finance-helper` replaces that with a small CLI (`import`, `shared-total`) and one queryable local database as the source of truth.

## The Problem

Sebas and Monse split expenses on two BAC products (walmart, eco), while Sebas separately tracks additional personal accounts (BAC dolares/colones today; Promerica black/platinum planned). Every statement is a bank-formatted PDF with its own layout, and BAC statements alone mix colones and dollars within the same document across multiple sections (purchases, payments, interest, voluntary services, installment credit lines). There's no single place to see spending across accounts, and figuring out the shared-with-Monse total each month means manually reading through PDFs.

## The Solution

A CLI tool (dev workflow via `uv`; install via local `pip` / `pipx` / `uv tool` from this repo) that:

- Ingests statement exports — PDF first; CSV and HTML as additional *format parsers* behind the same Adapter contract as banks make them available
- Detects bank and product via a pluggable adapter (override → filename → content signatures)
- Extracts structured detail into a canonical line-type taxonomy — purchases, payments, interest, fees, installment schedules, and more as mapped per product
- Loads everything into a local relational database (**SQLAlchemy preferred**; final ORM/driver confirmed in architecture), safely re-run each month without duplicating overlapping data
- Flags every ledger line from shared products (walmart, eco) as shared with Monse (a per-product rule, not a per-transaction judgment call)
- Reports the monthly shared-expense total via a first-class CLI command

PDF/HTML/CSV libraries and the CLI framework are **selected in technical research / architecture**, validated against BAC fixtures. Brief stack defaults are preferences, not irrevocable locks.

## Who This Serves

**Primary user: Sebas.** Technical, comfortable with a CLI, running this monthly as new statements arrive. Wants a complete personal financial record and a reliable, low-effort way to know what he owes Monse.

**Secondary beneficiary: Monse.** Doesn't touch the tool, but benefits from an accurate, low-friction shared-expense split each month instead of manual PDF reconciliation.

## Success Criteria

- For each **supported** BAC product, importing a fixture statement persists every **must-parse** line with required canonical fields (posted date, signed amount, currency, product id, line type, and external reference when the statement provides one), with zero manual edits. Import fails loudly if a must-parse section cannot be parsed; it does not invent or skip required rows.
- walmart fixture acceptance is required for v1 exit; dolares, colones, and eco must pass the same bar before those products are called “supported” (they remain provisional until fixture review).
- Re-importing a statement, or importing one with an overlapping period, never creates duplicate ledger lines for the same canonical identity.
- A CLI command reports the shared-with-Monse total for a given calendar month from the database (no manual SQL), applying the Shared-expense rules below — separate CRC and USD totals, no FX conversion.
- Auto-detect bank+product via adapter strategies (override → filename → content). Ambiguous or unknown statements fail the import with a clear error; no silent mis-association.
- The tool installs as a local package from this repo (`pip install .` / pipx / uv tool) and runs as a real CLI end to end, independent of the dev environment. Not published to PyPI in v1.
- A Promerica stub (or contract-test adapter) satisfies the Adapter contract without modifying core import / dedup / shared-total logic. Real Promerica parse remains out of v1.

## Shared-expense rules

- **Membership:** products flagged `shared=true` (v1: BAC walmart, BAC eco). All other products are never shared. No per-transaction override in v1.
- **Split ratio:** 50/50 Sebas/Monse unless config overrides.
- **Include in shared total:** `purchase` lines (and purchase reversals/refunds once classified as such).
- **Exclude:** `payment`, `interest`, `fee`, `voluntary_service`, `credit_note` (until explicitly mapped as a purchase reversal), `installment_schedule`, `balance_forward`.
- **Currency:** no FX conversion in v1. Report separate CRC and USD shared totals (and Sebas’s share of each). Mixed-currency months are expected.
- **Period:** calendar month on posted/transaction date in the canonical store (timezone: America/Costa_Rica).

## Import contract

- **Required canonical fields** on must-parse ledger lines: posted date (ISO-8601 after adapter parse), signed amount, ISO 4217 currency, product id, line type, and external reference when the statement provides one.
- **Fail vs quarantine:** must-parse sections that cannot be parsed fail the import with a diagnostic. Best-effort sections may warn and quarantine unparsed rows. Required data is never silently dropped.
- **Identity / dedup:** `(product_id, posted_date, currency, amount, external_ref)` after adapter normalization. Dual-currency bank columns are never stored as parallel amounts on one row. When `external_ref` is missing or unstable, use the documented fallback identity (see addendum) and remain idempotent.
- **Canonical money and dates:** adapters own locale date parsing and multi-column amount collapse; the store only sees ISO dates and single-currency amounts. v1 acceptance includes Spanish BAC date fixtures and dual-column normalization tests.
- **Fixtures:** golden statements under sample data drive acceptance for each supported product.

## Adapter contract

- Pipeline: **detect → parse → normalize** to canonical line types + identity fields → emit an import batch.
- Each product declares `{bank, product_id, account_kind}` where `account_kind` ∈ {credit, debit, other}. Section must-parse lists may differ by kind; debit products are not assumed to mirror credit section maps.
- Canonical line-type taxonomy includes at least: `purchase`, `payment`, `interest`, `fee`, `voluntary_service`, `credit_note`, `installment_schedule`, `balance_forward`, `other`. Each adapter maps bank sections → taxonomy with `must_parse` | `best_effort` | `ignore`.
- Installment schedules are a **distinct record type**, excluded from shared-expense totals. Adapters must not double-emit the same spend as both a counted purchase and a counted installment principal without an explicit link policy.
- New bank or format = new adapter (+ fixtures), not a parallel core pipeline. CSV/HTML are format parsers behind this same contract.
- Extension proof for v1: Promerica stub/contract-test adapter; real Promerica parsing deferred until samples exist.

## Operational model

- Local file database; path configurable (default documented).
- Schema migrations supported as the model evolves.
- Every import is a journaled batch; a batch can be removed to undo a bad import, then re-run.
- Backup/restore = filesystem copy of the DB file; no hosted backup in v1.
- CLI surface (v1): `import` (file or directory; directory processes each statement file independently with a per-file result summary; default fail-fast on unsupported files), `shared-total --month YYYY-MM`, optional `detect`. Explicit overrides such as `--bank` / `--product` are supported.

## Scope

**In for v1:**

- PDF parsing for BAC products with validated fixtures: walmart required for v1 exit; dolares, colones, eco provisional until fixture review, then required for calling them “supported”
- Bank/product auto-detection with fail-loud unknown/ambiguous behavior
- Documented Adapter contract, Import contract, Shared-expense rules, and Operational model as above
- Local relational database capturing ledger lines and distinct installment schedule records
- Per-product boolean flag for shared-with-Monse (walmart, eco = always shared)
- Canonical identity dedup (including fallback when refs are absent)
- Fixture-based import acceptance; Spanish date and dual-column normalization coverage for BAC
- CLI: `import`, `shared-total`, optional `detect`
- Packaging: `uv` for development; local install via `pip` / `pipx` / `uv tool` from this repo
- Promerica stub/contract-test adapter proving extension without core redesign

**Out for v1 (explicitly deferred):**

- Promerica parsing itself (architecture and stub must support it; actual parser follows once statement samples are collected)
- Spend categorization — planned post-v1 Hugging Face / local ML layer for Spanish (and mixed EN brand) descriptions; model direction in addendum, not part of this build
- Analytics, budgeting views, or reporting UI beyond the shared-total CLI command and direct database access for ad-hoc inspection
- FX conversion for shared totals
- Per-transaction shared overrides
- Multi-user access, remote/hosted database, or real-time bank API integration
- Publishing to PyPI

## Vision

`finance-helper` becomes the single local source of truth for household finances across every bank and account Sebas and Monse use — Promerica (black, platinum) fully onboarded, new statement formats (CSV, HTML) added as banks offer them, and eventually a local Hugging Face categorization layer (Spanish-aware; see addendum) that turns raw transaction history into spending insight without manual bookkeeping.

## Brief completion criteria

Status moves from `draft` to `ready-for-prd` when:

1. v1 vs planned banks/products are consistent across Summary, Scope, and Success.
2. Shared-expense rules, Import contract, Adapter contract, and Operational model sections exist (this revision).
3. Section taxonomy + BAC credit must_parse list are agreed (see addendum).
4. Open decisions are listed only as PRD / architecture / research follow-ups (not unresolved product contradictions).
5. Sebas explicitly accepts the brief.
