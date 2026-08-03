---
title: "Input reconciliation: brief addendum → PRD"
created: 2026-08-03
source_addendum: ../../briefs/brief-finance-helper-2026-08-01/addendum.md
target_prd: prd.md
---

# Input reconciliation: brief addendum → PRD

Reconciliation of adapter/section-map/identity substance from the brief addendum against `prd.md`. Product decisions that supersede the brief are noted; evidence and mapping detail that should survive in a PRD-run addendum are flagged.

## Retained in PRD (adapter / identity / section map)

| Addendum topic | PRD location | Status |
|---|---|---|
| Adapter contract: detect → parse → normalize | Extended to detect → **split** → parse → normalize → import batch (`Parsing and adapter requirements`, FR-31) | Retained + extended |
| `{bank, product_id, account_kind}`; section policies may differ by kind | FR-31 | Retained |
| BAC credit section map (walmart baseline) | Table in `BAC credit baseline`; FR-32 | Retained (letter prefixes A/B/C dropped in table labels only — semantics unchanged) |
| Unmapped sections → best-effort quarantine, not silent drop | FR-32 | Retained |
| Canonical line-type taxonomy | FR-32 | Retained |
| Installment schedules distinct; excluded from shared totals; prefer purchase + attach schedule by ref | FR-32, Scope | Retained |
| Primary identity `(product_id, posted_date, currency, amount, external_ref)` | FR-34 | Retained |
| Fallback identity with `normalized_description`, `line_type`, `statement_period_id` | FR-34 | Retained |
| Ref quality: `stable` \| `derived` \| `absent` | FR-34 | Retained |
| BAC compras `N. Referencia` as primary stable external ref | Identity section, FR-34 | Retained |
| Refs not unique across products without `product_id` | Identity section, FR-34 | Retained |
| Dual-column CRC/USD collapse before identity; prefer nonzero column | FR-33 | Retained |
| Spanish `DD-MMM-YY` → ISO-8601; store never sees bank-local dates or parallel columns | Parsing section, FR-33 | Retained |
| Walmart fixture = v1 parsing acceptance bar | FR-35, Scope | Retained |
| Eco / dolares / colones provisional until fixture review | FR-35, Scope, Open questions | Retained |
| Promerica stub/contract only; real parse deferred | FR-36, Scope | Retained |
| Journaled import batch + idempotent re-import | FR-30, FR-34, NFR-5 | Retained |
| Deferred AI categorization (schema reserve; must not block import) | Scope — Out; points to brief addendum | Retained by reference |

## Explicitly handed to architecture

| Addendum topic | Owner per addendum | PRD disposition |
|---|---|---|
| Exact relational schema (ledger vs installment tables, import batch journal) | architecture | Open in PRD only as requirement shape; no table design |
| PDF/HTML/CSV libraries, CLI framework | technical research → architecture | Web UI supersedes CLI; format extensibility noted; library choice = architecture |
| SQLAlchemy vs alternate persistence | architecture | PRD specifies PostgreSQL container; ORM choice unstated — architecture |
| Dual-nonzero CRC+USD policy if ever observed | architecture (addendum: fail loud) | **PRD decided:** prefer CRC (FR-33, memlog 2026-08-03). Architecture implements; addendum stale on this point |
| Promerica content signatures and section map | after sample collection | FR-36 stub only |
| Authoritative FX rate source, missing-date behavior | architecture/addendum | FR-40 `[OPEN]` |
| Fixture positional-fidelity test strategy | Constraints `[OPEN]` | architecture + PRD addendum evidence |

## Superseded — do not re-import as requirements

| Addendum topic | Reason |
|---|---|
| Per-product shared flag (walmart/eco shared; dolares/colones/black/platinum not) | PRD lists model replaces brief boolean (Overview, Lists, Brief reconciliation) |
| Directory import fail-fast vs skip-unsupported | CLI surface superseded; web upload only — decision closed N/A |
| Brief stack defaults (`uv`, pip install, single-file DB) | Postgres container + web app supersede brief operational model |

## PRD-run addendum suggestions (evidence / qualitative — missing or thin in PRD)

Create or extend a PRD-run addendum only for items below. Do not duplicate FR text.

1. **Sample data inventory and validation matrix** — Addendum table (product × bank × account_kind × samples × layout review × v1 status) and sample path `~/source/personal/finance/bank_data`. PRD names owner labels and “provisional” but not the structured validation status or baseline fixture filename (`BAC_CRED_WALMART_jun.pdf`).

2. **BAC credit layout observations** — Multi-currency side-by-side columns per row; section letter sequence (Saldo Anterior → A…G → installment blocks); purchase row fields (N. Referencia, date, description, currency, amount); Spanish month abbreviations. Qualitative parser evidence; PRD states requirements but not observed layout detail.

3. **Debit / eco section-map spike status** — Memlog records env gap: eco and debit parity with credit layout unconfirmed; spike blocked until fixture inspection. PRD open question lists “BAC debit and eco section maps” but not the blocked-inspection context.

4. **Deferred AI categorization model path** — HF model recommendations, Spanish/mixed-language constraint, pipeline shape (rules → zero-shot → corrections → fine-tune). PRD Scope — Out references brief addendum; PRD-run addendum should carry or link this so architecture does not rely on brief addendum alone after brief supersession on surface.

5. **Dual-nonzero addendum staleness note** — Record that PRD FR-33 (prefer CRC) supersedes addendum “fail loud until policy chosen”; architecture need not re-open unless fixtures show both-nonzero rows.

## Gaps (addendum detail not yet explicit in PRD)

1. **Validation status table** — Per-product v1 gate (walmart required; eco/dolares/colones provisional; Promerica stub-only) lives only in addendum; PRD scatters equivalent intent without the matrix.

2. **Observed BAC structural detail** — Side-by-side CRC/USD columns and section ordering are adapter-implication evidence; PRD states normalize/collapse but not the observed PDF shape driving that requirement.

3. **Import journal + product scoping for fallback identity** — Addendum notes import journal mitigates reuse risk when refs are absent; PRD states journaled batch but not the idempotency rationale tied to fallback keys.

4. **Directory import fail-fast** — Addendum open row assigned to PRD; PRD never closes it (implicit N/A via web-only surface).

5. **Addendum “Open decisions” not mirrored** — SQLAlchemy preference and stack defaults from addendum absent from PRD open questions (acceptable supersession; should not reappear as requirements).

## Verdict

Adapter contract, BAC credit section map, identity/dedup, locale normalization, installment separation, walmart acceptance bar, and Promerica stub are **fully reconciled** into PRD requirements. Evidence tables, observed PDF layout detail, and deferred AI model path belong in a **PRD-run addendum**; one addendum policy (dual-nonzero fail-loud) is **superseded** by PRD (prefer CRC). No new requirements invented.
