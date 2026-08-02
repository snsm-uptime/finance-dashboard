---
title: "Adversarial remediation proposals: finance-helper brief"
status: proposal
created: 2026-08-02
updated: 2026-08-02
source: adversarial review of brief.md + addendum.md
---

# Adversarial remediation proposals

For each finding: bank-agnostic solution, BAC/Promerica application, and concrete brief/addendum text to include.

---

### Finding 1: Executive summary oversells Promerica/v1

**General (bank-agnostic) solution:** Separate *supported accounts in v1* from *planned accounts*. The summary states the monthly workflow for accounts the tool actually imports today; Vision/roadmap names future banks. Core pipeline is account-agnostic; adapters register which products they support.

**BAC:** v1 monthly workflow = four BAC products (dolares, colones, walmart, eco).

**Promerica:** Named only as planned products (black, platinum); no claim that monthly drop-in works until an adapter ships.

**Brief updates:**

`brief.md` — replace Executive Summary opening with:

> `finance-helper` is a personal CLI that turns monthly bank statement exports into a structured local database of transactions, interest/fees, and installment lines. **v1 supports BAC PDF statements** for four products (dolares, colones, walmart, eco): Sebas drops in new statements, the tool detects bank and product via a pluggable adapter, parses structured detail, and loads a local database — with a per-product flag for household expenses shared with Monse. **Promerica (black, platinum) is a planned adapter** after sample statements exist; the architecture must accept that adapter without redesigning the core pipeline.

`brief.md` — Problem: change “across all six accounts” / “four other personal accounts across BAC and Promerica” to distinguish current vs planned:

> …tracks additional personal accounts (BAC dolares/colones today; Promerica black/platinum planned). …no single place to see spending across accounts…

---

### Finding 2: “Imports cleanly” is unmeasurable

**General solution:** Define an **Import contract**: required canonical fields per record type; fixture-based acceptance (golden statements → expected row counts/keys); on layout drift or unparseable rows: fail the import with a diagnostic, do not silently drop required data. Optional “warn + quarantine” for best-effort sections only.

**BAC:** Acceptance fixtures from `bank_data` per product; required fields for purchase rows include posted date, amount, currency, external reference (when present), product id, section/line-type.

**Promerica:** Same contract; adapter supplies field mapping. No Promerica fixture gate until samples exist; architecture test = stub adapter satisfying the contract.

**Brief updates:**

`brief.md` — replace first Success Criteria bullet:

> For each supported BAC product, importing a fixture statement persists every **must-parse** line with required canonical fields (posted date, signed amount, currency, product id, line type, and external reference when the statement provides one), with zero manual edits. Import fails loudly if a must-parse section cannot be parsed; it does not invent or skip required rows.

`brief.md` — add under Scope In:

> Fixture-based import acceptance for each supported product; documented Import contract (required fields, fail vs quarantine behavior).

---

### Finding 3: No product surface for Monse total

**General solution:** Keep analytics UI out of scope, but ship one **first-class CLI query** for the primary outcome (e.g. `finance-helper shared-total --month YYYY-MM`), implemented against the canonical store using bank-agnostic filters (shared flag, line type, period), not ad-hoc SQL.

**BAC:** Command sums walmart/eco purchase (and other include-rules) lines for the month.

**Promerica:** Same command; shared products configured on the Promerica adapter when those cards become shared (none planned as shared in v1).

**Brief updates:**

`brief.md` — Success Criteria:

> A CLI command reports the shared-with-Monse total for a given calendar month from the database (no manual SQL), applying the Shared-expense rules below.

`brief.md` — Scope In:

> CLI command for monthly shared-expense total (and optionally a thin `query`/SQL escape hatch). No dashboard or budgeting UI.

`brief.md` — Scope Out — revise:

> Analytics, budgeting views, or reporting UI beyond the shared-total CLI command and direct database access for ad-hoc inspection.

---

### Finding 4: Split ratio / currency / mixed CRC+USD undefined

**General solution:** Shared-expense policy is configuration, not bank logic: **split ratio** (default 50/50), **include/exclude line types**, **no FX conversion in v1** — report **totals per currency** (and optionally list lines). “What is owed” = share of each currency bucket; human settles FX offline if needed.

**BAC:** walmart/eco often dual-column; after normalization each line has one non-zero currency. Monthly shared report: `CRC total`, `USD total`, then Sebas’s share per currency.

**Promerica:** Same policy when a Promerica product is marked shared; adapter only normalizes amounts/currencies into the canonical shape.

**Brief updates:**

`brief.md` — new section **Shared-expense rules**:

> - Membership: products flagged `shared=true` (v1: BAC walmart, BAC eco).
> - Split ratio: 50/50 Sebas/Monse unless config overrides.
> - Line inclusion: see line-type include list (Finding 9); interest and fees always excluded.
> - Currency: no FX conversion in v1. Report separate CRC and USD shared totals (and Sebas’s share of each). Mixed-currency months are expected.
> - Period: calendar month on posted/transaction date in the canonical store (timezone: local, America/Costa_Rica assumed).

---

### Finding 5: Dedup key incomplete / dual-currency amount ambiguous

**General solution:** Canonical **Identity key** for ledger lines: `(product_id, posted_date, currency, amount, external_ref)` where `external_ref` is adapter-normalized. Amount is a single signed decimal in that currency after the adapter collapses multi-column bank layouts. Missing `external_ref` → documented fallback key (see Finding 12). Dedup is on insert against the store, bank-agnostic.

**BAC:** Adapter maps dual CRC/USD columns → one currency + amount (nonzero column; if both nonzero, fail or split into two lines — prefer fail-loud until observed). Include product_id so identical refs across cards don’t collide.

**Promerica:** Adapter maps whatever amount/ref columns exist into the same identity fields; core never reads dual columns.

**Brief updates:**

`brief.md` — Scope In dedup bullet:

> Dedup on canonical identity `(product_id, posted_date, currency, amount, external_ref)` after adapter normalization. Dual-currency bank columns are never stored as parallel amounts on one row.

`addendum.md` — replace Dedup Strategy:

> Identity key is bank-agnostic (above). BAC adapter normalizes side-by-side CRC/USD columns to a single (currency, amount) before identity is computed. Fallback when reference is missing: see Import resilience.

---

### Finding 6: Four BAC products claimed; only one PDF reviewed

**General solution:** Treat each **product** as separately validated. Scope In = “adapter + fixtures for product P”; products without reviewed fixtures are **provisional** until a sample pass completes. Do not claim universal BAC support from one layout.

**BAC:** walmart = validated baseline. dolares, colones, eco = provisional until each has at least one reviewed statement and fixture. Debit vs credit may need distinct BAC sub-adapters or section maps.

**Promerica:** Entirely provisional; no parse claim until samples + fixtures.

**Brief updates:**

`brief.md` — Scope In:

> PDF parsing for BAC products with validated fixtures: walmart required for v1 exit; dolares, colones, eco required before calling those products “supported” (provisional until fixture review).

`addendum.md` — Sample Data:

> Validation status: walmart — detailed review done; dolares, colones, eco — samples present, layout parity with walmart **unconfirmed**; Promerica — no samples.

---

### Finding 7: Debit vs credit collapsed to “cards”

**General solution:** Use **account product** as the unit: `{bank, product_id, account_kind}` where `account_kind` ∈ {credit, debit, other}. Adapters declare which section types and line types that kind emits. Core stores product metadata; shared flag hangs on product, not kind.

**BAC:** dolares/colones = debit; walmart/eco = credit. Expect different section sets (e.g. installments may be credit-only). Confirm from samples before requiring installment parse on debit.

**Promerica:** black/platinum likely credit; declare kind when samples arrive.

**Brief updates:**

`brief.md` — Solution / Who This Serves language: prefer “accounts/products” over “cards” where debit applies.

`brief.md` — new Scope note:

> Each product declares `account_kind` (credit|debit). Section must-parse lists may differ by kind; debit products are not assumed to mirror credit section maps.

`addendum.md`:

> BAC: dolares & colones = debit; walmart & eco = credit. Installment and some fee sections may be credit-only — confirm per product before marking must-parse.

---

### Finding 8: Section must-parse vs best-effort vs ignore

**General solution:** Define a **section/line-type taxonomy** in the core (`purchase`, `payment`, `interest`, `fee`, `voluntary_service`, `credit_note`, `installment_schedule`, `balance_forward`, `other`). Each adapter maps bank sections → taxonomy and marks each as `must_parse` | `best_effort` | `ignore` for that product.

**BAC (credit baseline, from walmart review):**

| Bank section | Taxonomy | v1 policy |
|---|---|---|
| B) Detalle de compras | purchase | must_parse |
| A) Detalle de pago | payment | must_parse |
| C) Intereses | interest | must_parse |
| D) Otros cargos | fee | must_parse |
| E) Voluntarios | voluntary_service | best_effort |
| F/G collection / credit notes | credit_note / fee | best_effort until classified |
| Otras líneas de financiamiento | installment_schedule | must_parse on credit |
| Saldo anterior | balance_forward | ignore or metadata-only |

**Promerica:** Same taxonomy; mapping filled when samples exist. Unmapped sections default to `best_effort` quarantine, not silent drop of unknown must-content.

**Brief updates:**

`brief.md` — Scope In:

> Canonical line-type taxonomy; per-adapter section map with must_parse / best_effort / ignore. v1 BAC credit must_parse: purchases, payments, interest, fees, installment schedules.

`addendum.md` — promote section inventory into that table (policy column included).

---

### Finding 9: What counts toward Monse split

**General solution:** Shared total = sum of lines where `product.shared` and `line_type` ∈ **include set**. Default include: `purchase` (and `refund`/`purchase_credit` as negative purchases if modeled). Default exclude: `payment`, `interest`, `fee`, `voluntary_service`, `installment_schedule`, `balance_forward`. Credit notes that reverse purchases: include if classified as purchase reversals; else exclude until classified.

**BAC:** Compras on walmart/eco included; pagos and intereses excluded; “otros cargos” / voluntarios excluded from split even if stored; installment schedule rows excluded (see Finding 10).

**Promerica:** Same include set; only applies if a product is flagged shared.

**Brief updates:**

`brief.md` — under Shared-expense rules:

> **Include in shared total:** `purchase` lines (and purchase reversals/refunds once classified as such).  
> **Exclude:** `payment`, `interest`, `fee`, `voluntary_service`, `credit_note` (until explicitly mapped as purchase reversal), `installment_schedule`, `balance_forward`.

---

### Finding 10: Installments vs purchases double-count

**General solution:** Store installment **schedule/metadata** separately from **ledger spend lines**. Shared totals use only ledger line types in the include set. If a bank shows both a purchase and installment plan for the same spend, adapter policy picks one spend representation for the ledger (prefer the purchase/principal posting) and attaches installment metadata by reference — never sum both into shared total.

**BAC:** Persist “Otras líneas de financiamiento” as `installment_schedule` records linked by reference/description when possible; do not add schedule rows into shared total. Monthly installment charges that appear under compras (if any) follow purchase rules — verify on samples.

**Promerica:** Same separation once layout known.

**Brief updates:**

`brief.md` — Scope In:

> Installment schedules stored as a distinct record type, excluded from shared-expense totals. Adapters must not double-emit the same spend as both a counted purchase and a counted installment principal without an explicit link policy.

`addendum.md` — Data Model:

> Distinct tables/types: ledger lines vs installment schedules. Shared-expense queries never union schedule rows into purchase sums.

---

### Finding 11: Auto-detection inputs and failure modes

**General solution:** Detection is a **ordered strategy chain** registered by adapters: (1) explicit CLI override `--product`, (2) filename hints, (3) content signatures (text markers, account masks). First confident match wins. If none / conflict → **abort import** with reason; never guess into the wrong product bucket.

**BAC:** Encode known filename patterns and PDF markers per product from `bank_data`; allow `--bank bac --product walmart` override.

**Promerica:** Same hooks; signatures TBD from samples. Until then, only explicit override or “unsupported” error.

**Brief updates:**

`brief.md` — Success / Scope:

> Auto-detect bank+product via adapter strategies (override → filename → content). Ambiguous or unknown statements fail the import with a clear error; no silent mis-association.

---

### Finding 12: Missing / unstable external references

**General solution:** Adapters expose `external_ref` with a **quality flag** (`stable` | `derived` | `absent`). Identity uses `external_ref` when stable; when absent/derived, fallback identity = `(product_id, posted_date, currency, amount, normalized_description, line_type, statement_period_id)` and imports with the same fallback must remain idempotent. Statement-level import journal records what was ingested so a bad import can be reverted (Finding 13).

**BAC:** Prefer `N. Referencia` as stable when present on compras; document sections lacking refs. Do not assume ref uniqueness across products without product_id.

**Promerica:** Map bank’s reference field when known; until then, derived/absent path is acceptable.

**Brief updates:**

`brief.md` — Scope:

> Idempotent re-import using stable external refs when provided; documented fallback identity when refs are missing. Overlapping statement periods must not duplicate stable-key lines.

`addendum.md` — Dedup:

> BAC compras refs are the primary stable key. Sections without refs use fallback identity. Reuse/reformat of refs across periods is a known risk — import journal + product scoping mitigate.

---

### Finding 13: Ops — path, backup, migration, bad import

**General solution:** Document a minimal **operational model**: configurable DB path (default under user data dir); schema migrations on startup/CLI; each import creates an **import batch** id; `finance-helper import --rollback <batch>` or re-import after delete-batch. Backup = copy SQLite file (user responsibility); tool documents the path.

**BAC / Promerica:** Ops are bank-agnostic.

**Brief updates:**

`brief.md` — new short section **Operational model**:

> - Local file DB; path configurable (default documented).  
> - Schema migrations supported as the model evolves.  
> - Every import is a journaled batch; a batch can be removed to undo a bad import, then re-run.  
> - Backup/restore = filesystem copy of the DB file; no hosted backup in v1.

---

### Finding 14: Packaging and CLI UX underspecified

**General solution:** Distribution = **local install from the repo** (`pip install .` / `pipx install .` or `uv tool install`); not PyPI for v1. CLI UX: `import <path>` accepts file or directory (batch all supported statements); `shared-total --month`; `detect <path>` optional. One logical import per statement file inside a directory batch.

**BAC / Promerica:** UX identical; unsupported files in a directory are reported and skipped or fail-fast (configurable; default fail-fast for v1 simplicity).

**Brief updates:**

`brief.md` — Success / Scope packaging:

> Installable as a local package (`pip install .` / pipx/uv tool from this repo). Not published to PyPI in v1.  
> CLI: `import` (file or directory), `shared-total --month YYYY-MM`, optional `detect`. Directory import processes each statement file independently with a per-file result summary.

---

### Finding 15: Solution locks stack before research

**General solution:** Brief states **preferred defaults** and **decision gates**, not irrevocable locks. Persistence: relational local DB (SQLAlchemy preferred). CLI framework and PDF library chosen in technical research / architecture. `uv` for dev workflow; pip-compatible packaging for install.

**BAC / Promerica:** Library choice must handle Spanish PDFs and multi-column tables; research validates against BAC fixtures first.

**Brief updates:**

`brief.md` — Solution intro:

> A CLI tool (dev workflow via `uv`; install via local `pip`/`pipx`) that: …  
> Persistence: local relational database (**SQLAlchemy preferred**, final ORM/driver confirmed in architecture). PDF/HTML/CSV libraries and CLI framework are **selected in technical research/architecture**, validated against BAC fixtures.

`addendum.md` — Open Follow-up: keep, and note brief defaults are non-binding until that pass.

---

### Finding 16: Adapter contract / fixtures / “no redesign” untestable

**General solution:** Document an **Adapter contract**: detect → parse → normalize to canonical line types + identity fields → emit import batch. New bank = new adapter package + fixtures. Acceptance for “no redesign”: a stub Promerica adapter compiling against the contract and a second format (e.g. CSV fixture) parsing through the same pipeline.

**BAC:** First real adapter + fixtures.

**Promerica:** Stub adapter + “unsupported parse” until samples; contract test still runs.

**Brief updates:**

`brief.md` — Scope In:

> Documented Adapter contract (detect, parse, normalize, line types, identity). Fixture harness for BAC. Stub or contract-test adapter for Promerica proving extension without core changes. CSV/HTML are alternate *format parsers* behind the same contract, not a parallel pipeline.

`brief.md` — Success:

> A Promerica stub (or fixture adapter) satisfies the Adapter contract without modifying core import/dedup/shared-total logic. Real Promerica parse remains out of v1.

---

### Finding 17: Locale dates and multi-currency as risks, not just facts

**General solution:** Canonical store uses ISO dates and ISO 4217 currencies. Adapters must parse bank-local date strings and multi-amount layouts into that form. PRD/architecture must list **locale date parsing** and **single-currency normalization** as explicit requirements and test cases.

**BAC:** Spanish `DD-MMM-YY` month abbreviations; dual amount columns → one currency.

**Promerica:** Unknown date/amount layout — adapter responsibility; same canonical output.

**Brief updates:**

`brief.md` — Scope In / risks note:

> Canonical dates are ISO-8601; canonical money is (ISO 4217 currency, decimal amount). Adapters own locale date parsing and multi-column amount collapse. v1 acceptance includes Spanish BAC date fixtures and dual-column normalization tests.

`addendum.md` — elevate from observation to requirement:

> BAC date and dual-currency handling are **adapter requirements** with fixture coverage, not informal notes.

---

### Finding 18: No “brief done” gate

**General solution:** Define exit criteria for the brief before PRD: contradictions resolved; Shared-expense rules, Import contract, Adapter contract, Operational model, and section taxonomy captured; open decisions listed with owners (PRD vs architecture vs research); status → `ready-for-prd` when Sebas accepts.

**BAC / Promerica:** N/A (process).

**Brief updates:**

`brief.md` — frontmatter / new section **Brief completion criteria**:

> Status moves from `draft` to `ready-for-prd` when:
> 1. v1 vs planned banks/products are consistent across Summary, Scope, and Success.
> 2. Shared-expense rules, Import contract, Adapter contract, and Operational model sections exist.
> 3. Section taxonomy + BAC credit must_parse list agreed.
> 4. Open decisions are listed only as PRD/architecture/research follow-ups (not unresolved product contradictions).
> 5. Sebas explicitly accepts the brief.

`addendum.md` — list open decisions for PRD/architecture (data model table split, exact BAC debit section maps, Promerica signatures, library choices).

---

## Summary of proposed structural changes

Add to **`brief.md`**:

1. **Shared-expense rules** (membership, ratio, include/exclude line types, per-currency totals, period)
2. **Import contract** (required fields, fail vs quarantine, fixtures)
3. **Adapter contract** (detect → parse → normalize; stub extension test)
4. **Operational model** (DB path, migrations, import batches/rollback, backup)
5. **Brief completion criteria** (draft → ready-for-prd)
6. Surgical edits: Executive Summary, Success Criteria, Scope In/Out, Solution stack wording, CLI UX

Promote in **`addendum.md`**:

1. Section taxonomy table with must_parse policies  
2. Product validation status (walmart vs provisional)  
3. account_kind (credit/debit)  
4. Dedup/identity + ref fallback  
5. Installment vs ledger separation  
6. Locale/currency adapter requirements  

Keep Vision as the six-account / Promerica future — but keep it out of v1 claims in Summary and Success.
