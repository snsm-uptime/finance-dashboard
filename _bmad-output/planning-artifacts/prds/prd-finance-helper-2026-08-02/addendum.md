---
title: "PRD addendum: finance-helper"
created: 2026-08-03
---

# PRD addendum: finance-helper

Depth that belongs with architecture, evidence, or deferred mechanisms — not FR prose.

## Evidence and upstream inputs

- Product brief: `../../briefs/brief-finance-helper-2026-08-01/brief.md`
- Brief addendum (BAC section maps, identity detail, sample inventory, deferred AI path): `../../briefs/brief-finance-helper-2026-08-01/addendum.md`
- Landscape research: `research-landscape.md`
- Input reconciliation: `reconcile-brief.md`, `reconcile-addendum.md`

## Architecture handoffs

- Authoritative FX rate source (e.g. BCCR), missing-date behavior, optional override
- Deterministic one-subunit remainder after 100%-valid percentage splits
- Statement-cycle boundaries when a list holds cards with different billing cycles
- Front-end choice for gesture review, in-browser PDF, mobile layout (Streamlit is preference only)
- Fixture strategy that preserves positional PDF layout fidelity; which test tier gates release
- Relational schema (ledger vs installment tables, import journal, card registry by IBAN)
- PDF library and adapter packaging

## Policy supersessions vs brief addendum

- Dual-nonzero CRC+USD on one line: **prefer CRC** (PRD FR-33), not fail-loud
- Directory import fail-fast vs skip: **N/A** (CLI superseded by web upload)
- Open-source-at-v1 contributor docs/CI: **deferred** (post-v1); product stays generic with no personal data committed

## Deferred ML

Schema reserves `category`, `category_confidence`, `category_source`. Manual-label↔bank-description aliases (FR-23) seed later models. Model path details remain in the brief addendum until a dedicated research/architecture spike.
