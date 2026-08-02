---
title: "Addendum: finance-helper"
created: 2026-08-01
updated: 2026-08-02
---

# Addendum: finance-helper

Supplementary detail for PRD / architecture. Product decisions that belong in the brief live in `brief.md`; this file holds evidence, BAC mappings, and open follow-ups.

## Sample Data

- Location: `~/source/personal/finance/bank_data`
- Currently populated: BAC only — 4 products (dolares debit, colones debit, walmart credit, eco credit), ~6 months each, all PDF.
- Promerica (black, platinum) samples not yet collected. Structure is confirmed different from BAC's PDF layout but described as "similar underlying data."

### Validation status

| Product | Bank | account_kind | Samples | Layout review | v1 status |
|---|---|---|---|---|---|
| walmart | BAC | credit | yes | detailed (`BAC_CRED_WALMART_jun.pdf`) | required for v1 exit |
| eco | BAC | credit | yes | parity with walmart **unconfirmed** | provisional until fixture review |
| dolares | BAC | debit | yes | parity with credit layout **unconfirmed** | provisional until fixture review |
| colones | BAC | debit | yes | parity with credit layout **unconfirmed** | provisional until fixture review |
| black | Promerica | credit (expected) | no | — | deferred parse; stub/contract only |
| platinum | Promerica | credit (expected) | no | — | deferred parse; stub/contract only |

Debit products are not assumed to mirror credit section maps. Installment and some fee sections may be credit-only — confirm per product before marking must-parse.

### BAC credit structure observed (walmart)

Reviewed in detail: `BAC_CRED_WALMART_jun.pdf`.

- Multi-currency: CRC and USD columns present side by side per line item, even when one side is always zero for a given product.
- Sectioned layout: Saldo Anterior → A) Detalle de pago → B) Detalle de compras → C) Detalle de intereses → D) Otros cargos → E) Productos y servicios de elección voluntaria → F/G) collection charges / credit notes → per-installment financing ("Otras líneas de financiamiento").
- Each purchase row carries a reference number (N. Referencia), date, description/place, currency, and amount.
- Dates are DD-MMM-YY with Spanish month abbreviations (e.g. `18-JUN-26`).

## Section taxonomy and BAC credit policy

Canonical line types are defined in the brief Adapter contract. BAC credit (walmart baseline) maps as follows:

| Bank section | Taxonomy | v1 policy |
|---|---|---|
| B) Detalle de compras | purchase | must_parse |
| A) Detalle de pago | payment | must_parse |
| C) Detalle de intereses | interest | must_parse |
| D) Otros cargos | fee | must_parse |
| E) Productos y servicios de elección voluntaria | voluntary_service | best_effort |
| F/G collection charges / credit notes | credit_note / fee | best_effort until classified |
| Otras líneas de financiamiento | installment_schedule | must_parse on credit |
| Saldo Anterior | balance_forward | ignore or metadata-only |

Unmapped sections on any bank default to best-effort quarantine, not silent drop. Promerica mapping is filled when samples exist.

## Data Model Implication

"Capture as much as possible" plus the sectioned statement structure implies the local DB is not one flat transaction table. Distinct record types/tables for at least:

- Ledger lines (purchases, payments, interest, fees, etc. — date, amount, currency, description, external_ref, product, line type, shared flag derived from product)
- Installment schedules (multi-month metadata, separate from ledger spend lines)

Shared-expense queries never union schedule rows into purchase sums. If a bank shows both a purchase and an installment plan for the same spend, the adapter prefers the purchase/principal ledger posting and attaches schedule metadata by reference when possible.

Exact table split is a modeling decision for architecture/PRD.

## Identity, dedup, and import resilience

- Canonical identity (brief): `(product_id, posted_date, currency, amount, external_ref)` after adapter normalization.
- BAC adapter normalizes side-by-side CRC/USD columns to a single `(currency, amount)` before identity is computed. Prefer the nonzero column; if both nonzero (not yet observed), fail loud until a policy is chosen.
- BAC compras `N. Referencia` is the primary **stable** external ref when present. Do not assume ref uniqueness across products without `product_id`.
- When refs are missing, derived, or reformatted: fallback identity `(product_id, posted_date, currency, amount, normalized_description, line_type, statement_period_id)` must remain idempotent. Import journal + product scoping mitigate reuse risk.
- Adapters expose ref quality (`stable` | `derived` | `absent`).

## Locale and currency adapter requirements

BAC date and dual-currency handling are **adapter requirements** with fixture coverage, not informal notes:

- Parse Spanish `DD-MMM-YY` into ISO-8601 dates.
- Collapse dual amount columns into one ISO 4217 currency + decimal amount.
- Canonical store never sees bank-local date strings or parallel CRC/USD columns on one row.

Promerica date/amount layout is unknown — same canonical output; adapter owns the mapping.

## Shared-Expense Flag (detail)

Per-product, not per-transaction: walmart and eco are always shared with Monse; all other products (dolares, colones, black, platinum) are never shared. No requirement in v1 for marking an individual line on a personal product as shared. Interest and other excluded line types never count toward the split — see brief Shared-expense rules for the full include/exclude set, 50/50 ratio, and per-currency reporting.

## Deferred: AI Categorization

Sebas wants a future feature where an AI / Hugging Face model assigns spend categories (groceries, dining, etc.) to ledger lines. Explicitly out of scope for v1 — noted so it isn't lost, and so the schema can reserve `category`, `category_confidence`, and `category_source` (model vs manual) without implementing inference yet.

**Language constraint:** store names and descriptions are usually Spanish (BAC/Promerica LatAm extracts), often mixed with English brand tokens (`UBER`, `NETFLIX`, `AUTOMERCADO`). English-only US transaction classifiers on Hugging Face are a poor fit.

### Recommended model path

| Phase | Role | Model / approach |
|---|---|---|
| Rules first | Known merchants | Local merchant→category map (highest precision on repeats) |
| Cold start (no labels) | Bootstrap labels | [`MoritzLaurer/bge-m3-zeroshot-v2.0`](https://huggingface.co/MoritzLaurer/bge-m3-zeroshot-v2.0) with Spanish category names |
| Optional eval | Spanish extract classifier as-is | [`jonjimenez/transaction-categorization`](https://huggingface.co/jonjimenez/transaction-categorization) (12 Plaid-like labels; thin docs — evaluate on BAC fixtures, not lock) |
| Few-shot / light personal set | After a small labeled set | [`sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`](https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2) or [`intfloat/multilingual-e5-small`](https://huggingface.co/intfloat/multilingual-e5-small) + SetFit or LightGBM on embeddings |
| Long-term fine-tune | Production local classifier | [`PlanTL-GOB-ES/roberta-base-bne`](https://huggingface.co/PlanTL-GOB-ES/roberta-base-bne) (alt: `BSC-LT/roberta-base-bne`, or BETO [`dccuchile/bert-base-spanish-wwm-cased`](https://huggingface.co/dccuchile/bert-base-spanish-wwm-cased)) |

Pipeline shape (post-v1): merchant rules → zero-shot or few-shot model → user corrections in DB → fine-tune Spanish/multilingual encoder. Inference stays local; categorization must not block import.

### Explicitly avoid as primary

- US/English DistilBERT transaction models (e.g. `fahadkamraan/transaction-categorizer` and similar) — trained on US merchant strings; poor Spanish generalization.
- Generative LLM-only classification as the sole path — unnecessary for a personal local tool (privacy, latency, dependency weight).

## Deferred: Promerica

Architecture isolates bank-specific parsing (per-bank adapter) so Promerica can be added later without reworking the core pipeline. v1 ships a stub/contract-test adapter; real parse waits on samples. Detection signatures and section maps are TBD from those samples; until then, explicit CLI override or “unsupported” is the only Promerica path.

## Open decisions (PRD / architecture / research)

| Decision | Owner |
|---|---|
| Exact relational schema (ledger vs installment tables, import batch journal) | architecture |
| BAC debit (dolares, colones) and eco section maps after fixture review | PRD + implementation spikes |
| Dual-nonzero CRC+USD column policy if ever observed | architecture |
| Promerica content signatures and section map | after sample collection |
| PDF / HTML / CSV libraries and CLI framework | technical research → architecture |
| SQLAlchemy vs alternate local persistence (brief preference: SQLAlchemy) | architecture |
| Directory import fail-fast vs skip-unsupported default (brief default: fail-fast) | PRD |
| Final categorization taxonomy (Spanish labels) and which HF path to ship first | architecture (direction in Deferred: AI Categorization) |

Brief stack defaults (`uv`, local pip install, SQLAlchemy preferred) are non-binding until the research/architecture pass confirms them against BAC fixtures.
