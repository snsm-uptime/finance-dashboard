# finance-helper

A self-hosted web app that turns bank statement PDFs into a queryable, shared financial record.

Costa Rican banks aren't covered by aggregation services — neither Plaid nor Belvo reaches BAC or Promerica — so statements are the only data source. This project uploads those PDFs, detects which bank and product they came from, parses them into canonical transactions, and stores them in a database that several people can share.

## Status

Planning. The [PRD](_bmad-output/planning-artifacts/prds/prd-finance-helper-2026-08-02/prd.md) is a draft and no application code exists yet.

## How it works

**Lists** are the organizing concept. A list is a named container of spending that transactions land in. Every user gets a personal list on signup and can create more, then share any of them by email. Splits are defined per member, so a list can be divided unevenly among more than two people.

**Ingestion** decomposes an upload into statements — one BAC PDF can carry several cards — and each statement is reviewed before anything is committed, either in bulk to a single list or one at a time. Re-uploading is safe: canonical identity dedup absorbs duplicates silently and reports what was added versus skipped.

**Parsing fails loudly.** A statement that can't be parsed cleanly is never stored automatically. Instead the source PDF is rendered beside the extracted items so you can see what was missed, then either accept it with the unparsed rows quarantined or discard it. Quarantined rows can be typed in by hand, and every row records whether it came from the parser or a person. Any balance computed over an incomplete statement says so.

## Scope for v1

Upload, parse, store, and one shared-expenses view per list — a thin vertical slice that proves the whole architecture end to end.

In: BAC PDF parsing for walmart, eco, dolares, and colones; email-and-password auth with list invitations; PostgreSQL persistence; a mobile-usable layout; batch rollback and statement reassignment; a Promerica stub proving the adapter contract extends.

Out: settlement ledgers, ML categorization, trends dashboards, FX conversion between CRC and USD, CSV/HTML statement formats, and the open-source release itself.

## Constraints

Nothing personal is committed. Real statements live outside the repository at a configured path, and no personal names, account identifiers, or transaction data appear in code, schema, or fixtures — the product is built with generic vocabulary so open-sourcing later needs no retrofit.
