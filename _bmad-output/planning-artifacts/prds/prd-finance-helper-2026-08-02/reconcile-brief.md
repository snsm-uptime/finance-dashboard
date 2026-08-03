---
title: "Input reconciliation: product brief → PRD"
created: 2026-08-03
source_brief: ../../briefs/brief-finance-helper-2026-08-01/brief.md
target_prd: prd.md
---

# Input reconciliation: product brief → PRD

Reconciliation of `brief-finance-helper-2026-08-01/brief.md` against `prd.md`. The brief described a single-user CLI; the PRD describes a multi-user web app. Parsing substance is largely retained; product surface and shared-expense mechanics are largely superseded. Evidence-level detail lives in the brief addendum (see `reconcile-addendum.md`).

## Retained in PRD

| Brief topic | PRD location | Notes |
|---|---|---|
| Adapter contract: detect → parse → normalize | Extended to detect → **split** → parse → normalize → import batch | Multi-statement PDFs add split step |
| `{bank, product_id, account_kind}`; debit ≠ credit section maps | FR-31, Parsing section | Retained |
| Canonical line-type taxonomy | FR-32 | Retained |
| Required canonical fields on must-parse lines | FR-32 | + provenance (PRD extension) |
| Fail-loud on unknown/ambiguous detection | FR-14, FR-31, NFR-8 | Retained |
| Must-parse fail vs best-effort quarantine | Extended via FR-24..FR-27 | Human-in-loop override; acknowledged in Brief reconciliation |
| Primary + fallback canonical identity; idempotent re-import | FR-34, FR-20 | Retained |
| Dual-column CRC/USD collapse; Spanish date parsing | FR-33, Parsing section | PRD decided dual-nonzero → prefer CRC (supersedes addendum fail-loud) |
| Installment schedules distinct; excluded from shared totals | FR-32, Scope | Retained |
| Walmart fixture = v1 parsing acceptance bar | FR-35 | Retained |
| Eco / dolares / colones provisional until fixture review | FR-35, Open questions | Retained |
| Promerica stub/contract only | FR-36 | + multi-statement case |
| Journaled import batch + rollback | FR-30, NFR-5 | Retained |
| CSV/HTML as future format parsers behind adapter contract | Parsing section, Scope — Out | Retained; v1 PDF only |
| Per-product shared flag → list model rationale | Lists, Brief reconciliation | Deliberate replacement |
| 50/50 default split unless config overrides | FR-9 (even split; configurable percentages) | Spirit retained at list level |
| Deferred: ML categorization, analytics UI, Promerica parse, PyPI | Scope — Out | Retained by reference to brief addendum |

## Superseded — correctly acknowledged in PRD

| Brief topic | PRD acknowledgment | Replacement |
|---|---|---|
| CLI surface (`import`, `shared-total`, `detect`) | Brief reconciliation § Superseded | Web upload + shared-expenses view |
| pip/pipx/uv tool install; real CLI end-to-end | Brief reconciliation § Superseded | Self-hosted web app (NFR-9) |
| Local single-file DB; filesystem-copy backup | Brief reconciliation § Superseded | PostgreSQL container + external volume |
| Multi-user access excluded | Users and roles; Brief reconciliation | Peers with email/password auth |
| Per-product boolean shared flag (walmart, eco) | Lists; Brief reconciliation | Named lists with membership and splits |
| Monse as passive beneficiary | Users and roles | Peer user with own account |
| Separate CRC/USD shared totals; no FX | Balances § Currency; Brief reconciliation | CRC settlement currency with purchase/statement-date FX (FR-40) |
| Calendar month period (`America/Costa_Rica`) | FR-39 | Statement/billing cycle period |
| Directory import with per-file summary; fail-fast on unsupported | Brief reconciliation (CLI superseded) | Web upload; N/A |
| `--bank` / `--product` CLI overrides | Detection chain mentions override strategy | No explicit upload-time override FR |
| Operational: configurable local DB path | Superseded by container model | Postgres volume outside repo |
| Operational: backup/restore = filesystem copy | Superseded | Container/volume ops (architecture) |
| Success criterion: not published to PyPI | Scope — Out (CLI, open-source deferred) | Web deploy model |

## Gaps — brief requirements not explicit in PRD

1. **Shared-expense line-type include/exclude rules.** Brief Shared-expense rules define what counts toward the split total: **include** `purchase` (and purchase reversals/refunds once classified); **exclude** `payment`, `interest`, `fee`, `voluntary_service`, `credit_note` (until mapped as purchase reversal), `installment_schedule`, `balance_forward`. PRD excludes only `installment_schedule` from shared totals (FR-32) and does not state which imported line types feed settle-up / receipt-list items on a shared list. Implementers could treat all parsed rows as splittable items.

2. **`credit_note` / purchase-reversal policy for shared totals.** Brief excludes `credit_note` until explicitly classified as a purchase reversal. PRD lists the line type in taxonomy but carries no rule for when credit notes affect shared balances.

3. **`America/Costa_Rica` timezone for posted-date boundaries.** Brief Shared-expense rules and Import contract anchor calendar-month (now superseded) and date storage to Costa Rica local time. PRD requires ISO-8601 dates but does not specify timezone for date normalization or period boundaries.

4. **Schema migrations supported.** Brief Operational model: "Schema migrations supported as the model evolves." PRD specifies Postgres persistence (NFR-9, Scope) but does not state migration support as a requirement.

5. **Upload-time bank/product override.** Brief Operational model: "Explicit overrides such as `--bank` / `--product` are supported." PRD detection chain includes override as first strategy (FR-14) but no FR covers a user-provided bank/product override when auto-detect is ambiguous — only fail-loud (may be acceptable if web UI adds override later; brief treated it as v1).

## Qualitative ideas dropped by FR structure

| Brief tone / intent | PRD disposition |
|---|---|
| **Small CLI, monthly low-effort ritual** — Sebas drops in statements, runs `shared-total`, done | Replaced by authenticated web app: upload, review routing, invitations, failure comparison, settle-up view. Configurable review defaults (FR-12) partially preserve low-effort path; overall ceremony is higher. Not surfaced as a design constraint in NFRs. |
| **"Complete personal financial record" across all accounts** — brief positions the DB as single source of truth for every product | PRD v1 centers shared-list settle-up and personal lists; cross-account personal dashboard and trends explicitly out of scope. Ledger completeness for non-shared lines is implied by parsing FRs but not framed as a user-facing success criterion. |
| **"Reliable, low-effort way to know what he owes Monse"** — one command, separate CRC/USD figures | Problem retained; mechanism shifted to statement-cycle settle-up in CRC with FX conversion and item-level overrides. Simplicity of the original `shared-total --month YYYY-MM` output is not preserved as a qualitative goal. |
| **Household split follows the card, not the purchase** | Explicitly retained and expanded in Lists § design rationale and FR-11 card-to-list routing. |
| **Secondary beneficiary (Monse never touches the tool)** | Superseded; acknowledged. Monse is a peer who logs in and sees shared lists. |

## Brief completion criteria — status

| Criterion | Status |
|---|---|
| v1 vs planned banks/products consistent | Reconciled in PRD Scope + FR-35/36 |
| Shared-expense, Import, Adapter, Operational model sections exist | Parsing/import retained; shared-expense and operational model superseded by lists/web/Postgres |
| Section taxonomy + BAC credit must_parse agreed | Retained via addendum + PRD table |
| Open decisions as follow-ups only | PRD Open questions table includes eco/debit maps; others triaged |
| Sebas accepts brief | Product direction moved to PRD; brief remains historical input |

## Verdict

Parsing, adapter, identity, and fixture acceptance from the brief are **fully reconciled** into PRD requirements. Major surface supersessions (CLI → web, per-product flag → lists, no FX → CRC FX, calendar month → statement cycle) are **correctly acknowledged** in PRD § Relationship to the product brief. One **substantive product-rule gap** remains: brief Shared-expense **line-type include/exclude** rules are not restated for the list/settle-up model — recommend a **PRD patch** (FR-38–FR-44 or Shared expenses narrative), not addendum-only. Minor gaps (timezone, credit_note policy, schema migrations, detection override UI) can ride with that patch or architecture. Qualitative "low-effort CLI ritual" is intentionally dropped by the web-app pivot; no action unless PM wants an explicit low-friction NFR.
