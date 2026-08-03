# Adversarial Architecture Review — Divergence Pairs

**Artifact reviewed:** `ARCHITECTURE-SPINE.md` (finance-helper v1, draft 2026-08-03)  
**Review type:** Adversarial divergence — pairs of epics/stories that obey every AD literally yet integrate incompatibly  
**Reviewer stance:** Assume parallel implementation teams; each team cites AD compliance; integration fails at merge.

---

## Verdict

**Not merge-safe for parallel epic work.** The spine’s fifteen ADs govern topology, dependencies, and high-level aggregates well, but they leave **entity shape, lifecycle ownership, and mutation authority** underspecified wherever two capability areas touch the same noun (`CANDIDATE_ROW`, quarantine, card binding, FX amounts, session commit granularity). A conscientious ingest team and a conscientious settle-up team can both pass CI (AD-11, AD-15), respect hexagonal boundaries (AD-1), use `Decimal`/`NUMERIC` (AD-5), and still produce schemas and APIs that cannot compose without a breaking reconciliation sprint.

**Severity:** Structural — not cosmetic naming drift. Each pair below is a **hole** closable only by a new or tightened AD (or an explicit shared contract appendix referenced by AD).

---

## Method

For each pair:

1. Name two **one-level-down units** (epic or story scope) drawn from the spine’s capability map and PRD FR bindings.
2. Show how **every cited AD is satisfied literally** by both sides.
3. Describe the **integration fracture**: clashing shared-data shapes, dual ownership of one entity, or conflicting state-mutation paths.
4. Propose a **closing AD** (tighten existing or add new).

AD inventory referenced: AD-1 … AD-15 as defined in the spine.

---

## Divergence Pairs

### Pair 1 — Staging row shape vs commit promotion

| Unit A | **Epic: Ingest pipeline** — detect → split → parse → normalize → stage in Import Session |
| Unit B | **Epic: Commit & dedup** — promote session rows to ledger under canonical identity |

**ADs obeyed (both):**

- **AD-1:** Bank adapters return normalized rows to application; no adapter commits.
- **AD-4:** Every upload creates an Import Session; commit promotes to durable ledger.
- **AD-5:** Amounts use `Decimal` in domain; no `float`.

**Incompatible outcome — clashing shared-data shapes:**

- **A** persists `CANDIDATE_ROW` as a JSON document per parsed line: `{ "amount": "1234.56", "ccy": "CRC", "desc": "...", "meta": {...} }` — minimal, adapter-friendly.
- **B** expects promotion input matching PRD canonical fields: `posted_date`, signed `amount`, ISO `currency`, `product_id`, `line_type`, optional `external_ref`, `provenance`, plus dedup fallback fields — a typed domain object, not opaque JSON.

Commit cannot promote without a translation layer neither AD mandates. Tests pass in isolation (A’s golden rows ≠ B’s commit fixtures).

**Hole → proposed AD-16 — Canonical row contract:**

> Staging and ledger rows share one **CanonicalLine** field set (PRD §Canonical lines + identity). `CANDIDATE_ROW` is that shape plus session-local review fields (`chosen_list_id`, `payer_id`, `skip`). Adapters MUST emit CanonicalLine; persistence MUST NOT store adapter-specific shapes in staging. JSONB allowed only as an envelope around CanonicalLine, never instead of it.

---

### Pair 2 — Quarantine lifecycle: session-scoped vs ledger-durable

| Unit A | **Story: Accept with quarantine (FR-26)** — review flow stores unresolved rows inside Import Session |
| Unit B | **Story: Incomplete balance disclosure (FR-43)** — shared-expenses view flags understated balances from quarantined committed data |

**ADs obeyed (both):**

- **AD-3:** PostgreSQL is the only durable store for quarantine.
- **AD-4:** Review mutates the session; commit promotes parsed rows; discard drops session.

**Incompatible outcome — two owners of one entity:**

- **A** models quarantine as **session-embedded** rows deleted on discard or fully absorbed on commit; nothing quarantined survives session teardown.
- **B** models quarantine as **durable ledger-adjacent** unresolved rows (statement marked incomplete post-commit) that settle-up must query months later.

After commit-with-quarantine, A has no rows for B to disclose; B expects `QUARANTINE_ENTRY` (or equivalent) keyed to `STATEMENT` / `LEDGER_ENTRY` with lifecycle independent of Import Session.

**Hole → proposed AD-17 — Quarantine ownership:**

> Quarantine rows that survive **accept-with-quarantine commit** are durable entities owned by **`STATEMENT`** (or `LEDGER_ENTRY` stub), not by Import Session. Session-scoped quarantine exists only **pre-commit**. Post-commit unresolved rows mutate via FR-27 hand-fix paths, not via session review APIs.

---

### Pair 3 — Dedup identity: adapter-emitted vs domain-recomputed

| Unit A | **Epic: Bank adapter contract (FR-31–35)** — normalized rows include adapter-computed `identity_key` |
| Unit B | **Epic: Canonical identity & idempotent re-import (FR-34)** — domain derives identity at commit from normalized fields |

**ADs obeyed (both):**

- **AD-1:** Adapters return normalized rows only; domain holds dedup rules (spine paradigm line 30).
- **AD-4:** Commit promotes under dedup/ACL.

**Incompatible outcome — conflicting state-mutation paths:**

- **A** hashes `(product_id, posted_date, currency, amount, external_ref)` at parse time, stores hash on candidate row; commit trusts hash.
- **B** recomputes identity at commit using PRD **fallback** tuple when `external_ref` is `absent`/`derived`: adds `normalized_description`, `line_type`, `statement_period_id` — fields A never populated.

Same physical purchase dedupes on re-import in A’s tests, duplicates in B’s tests. Both cite AD-4 “dedup at commit.”

**Hole → tighten AD-4 (or AD-18 — Identity authority):**

> **Domain alone** computes canonical identity primary and fallback tuples at commit. Adapters MAY expose `ref_quality` (`stable` | `derived` | `absent`) but MUST NOT emit authoritative dedup keys. Commit idempotency tests are domain-owned.

---

### Pair 4 — FX materialization: write-time CRC vs read-time conversion

| Unit A | **Epic: Commit pipeline** — persists `amount_crc`, `fx_rate`, `fx_fallback_flag` on each committed foreign line |
| Unit B | **Epic: Settle-up & FX view (FR-40–41)** — BCCR adapter converts at query time; ledger keeps original currency only |

**ADs obeyed (both):**

- **AD-5:** Postgres `NUMERIC` + explicit currency code; domain `Decimal`.
- **AD-7:** BCCR daily rate; nearest prior + flag on missing date; no user override.

**Incompatible outcome — clashing shared-data shapes:**

- **A** ledger rows carry denormalized CRC columns for fast settle-up.
- **B** ledger rows are currency-pure; `SettleView` calls FX adapter per row using purchase/statement date.

Disagreement surfaces when BCCR republishes a corrected rate, or when A’s commit-time fallback date differs from B’s read-time “statement date” interpretation. Settle-up totals diverge with both teams claiming AD-7 compliance.

**Hole → proposed AD-19 — FX persistence policy:**

> v1 ledger stores **original** `(amount, currency)` only. CRC equivalents are **computed at read** by the FX adapter unless an explicit materialized snapshot table is introduced — if so, it is append-only, keyed `(ledger_entry_id, rate_date, rate_source)`, and settle-up MUST read snapshots when present. Pick one; forbid mixed per-epic choice.

---

### Pair 5 — Session commit granularity vs journaled batch rollback

| Unit A | **Story: Individual review outcomes (FR-18)** — each statement in a multi-statement upload can commit independently |
| Unit B | **Story: Roll back an import batch (FR-30)** — rollback reverses one journaled import batch atomically |

**ADs obeyed (both):**

- **AD-4:** Import Session aggregate; review mutates session; commit promotes; rollback/discard defined.

**Incompatible outcome — conflicting state-mutation paths:**

- **A** state machine: `session.status ∈ { reviewing, partially_committed, committed }`; per-statement commit issues partial ledger writes while session stays open.
- **B** state machine: one `import_batch_id` per upload; commit is atomic; rollback deletes all ledger rows tagged with that batch id.

Rollback in B cannot target “statement 2 of 3” after A’s partial commits. FR-30 and FR-18 cannot both hold without a defined batch boundary.

**Hole → tighten AD-4 — Commit unit:**

> **Import Session** is the staging aggregate; **Import Batch** is the journaled commit unit. v1 batch boundary = **one upload’s full commit action** (all statements committed together) OR explicitly document per-statement batches with stable `batch_id` per statement — choose one in AD, not in stories.

---

### Pair 6 — Same-price pending match: session buffer vs ledger flag

| Unit A | **Story: Same-price match review at import end (FR-22)** — pending pairs live on Import Session until import completes |
| Unit B | **Story: Manual item entry (FR-21)** — manual entries are durable `LEDGER_ENTRY` rows immediately |

**ADs obeyed (both):**

- **AD-10:** Server computes candidates; equal amount+currency vs unresolved manual entries; configurable ±3 day default window.
- **AD-4:** Review mutates session before commit.

**Incompatible outcome — dual ownership + shape clash:**

- **A** stores `PendingMatch { candidate_row_id, manual_entry_id }[]` on session; manual entries untouched until user resolves.
- **B** sets `manual_entry.match_state = pending_import` at parse detection time; exposes via ledger API.

Import-end UI in A reads session endpoint; B’s UI reads ledger endpoint. Resolution in A promotes links into aliases (FR-23); resolution in B mutates ledger rows directly — different APIs, different idempotency.

**Hole → proposed AD-20 — Match pending state:**

> Until import commit completes, same-price candidates exist only on **Import Session** as `pending_matches`. Manual ledger entries MUST NOT expose match-state flags pre-commit. On commit, unresolved pairs surface via a single **`POST /imports/{session}/matches/resolve`** (or equivalent) before session closes.

---

### Pair 7 — Card-to-list binding: user-owned card vs list-owned association

| Unit A | **Story: Card routing mode (FR-11, FR-16)** — `UserCard` entity with optional `fixed_list_id` |
| Unit B | **Story: Reassign statement to another list (FR-29)** — list owner moves committed statement scope via list APIs |

**ADs obeyed (both):**

- **AD-1:** Domain + persistence own lists/membership; UI calls HTTP only.
- **AD-3:** Postgres durable store for users, lists, sessions.

**Incompatible outcome — two owners of one entity:**

- **A:** Card registration is **user-scoped**; fixed-list mode sets `UserCard.fixed_list_id`.
- **B:** Card/list binding is **list-scoped** via `ListCard` junction; reassignment updates junction, not user card.

FR-29 reassignment in B breaks FR-11 fixed routing in A. IBAN → product identity (FR-37) attaches to different parent entity in each design.

**Hole → proposed AD-21 — Card registry authority:**

> **UserCard** (IBAN/product label, owner user_id) is the sole registry. List attachment is `UserCard.routing_mode ∈ { fixed, review }` plus nullable `fixed_list_id`. List APIs never own card records; FR-29 reassigns **statement destination history**, not card registry ownership, unless explicitly updating `fixed_list_id`.

---

### Pair 8 — Statement PDF path reference: absolute vs volume-relative

| Unit A | **Epic: Upload & persistence** — stores absolute filesystem path returned by upload handler |
| Unit B | **Story: Side-by-side PDF comparison (FR-25)** — ui fetches PDF via API using stored reference |

**ADs obeyed (both):**

- **AD-3:** PDF bytes on operator volume outside repo; Postgres stores path references only, not `bytea`.

**Incompatible outcome — clashing shared-data shapes:**

- **A:** `statements.pdf_path = '/data/finance/uploads/7f3a....pdf'` (container-local absolute).
- **B:** `statements.pdf_path = '7f3a....pdf'` resolved with configured `PDF_VOLUME_ROOT` at serve time.

Works in dev for one team; fails cross-container/host when api serve adapter and upload handler disagree on path join semantics. AD-3 satisfied either way.

**Hole → tighten AD-3 — Path reference format:**

> Postgres stores **`pdf_object_key`** relative to configured volume root (UUID filename + optional `{session_id}/` prefix). Absolute paths forbidden in DB. Single `PdfStoragePort` resolves read/write.

---

### Pair 9 — Split remainder scope: list default vs item override

| Unit A | **Story: List default percentage split (FR-9)** — AD-6 remainder to list creator |
| Unit B | **Story: Item/receipt split overrides (FR-10)** — per-item percentage with floor division |

**ADs obeyed (both):**

- **AD-6:** After floor division, leftover minor unit goes to list creator.

**Incompatible outcome — conflicting allocation paths:**

- **A** applies AD-6 only when allocating at **list default** split.
- **B** applies AD-6 to **every** percentage split including item overrides (reads “list creator” as global tie-breaker).
- **Hidden third fork:** item override remainder to **payer** (FR-19) — not forbidden by AD-6 text.

Same CRC 100.01 split three ways yields different member cents; all pass “sum to 100%” validation.

**Hole → tighten AD-6 — Remainder scope:**

> Floor-division remainder minor units go to **list creator** for list-default and item-level **percentage** splits. Absolute-amount overrides (FR-10) use explicit amounts; remainder validation errors if sums don’t match line total. Payer is never remainder sink unless FR explicitly adds payer-remainder mode (not in v1).

---

### Pair 10 — Installment schedule: separate aggregate vs line-type only

| Unit A | **Epic: Parser & taxonomy (FR-32)** — `INSTALLMENT_SCHEDULE` records linked to purchase lines |
| Unit B | **Epic: Settle-up line-type filter (FR-45)** — excludes `installment_schedule` line_type from allocations |

**ADs obeyed (both):**

- **AD-1:** Domain settle math separate from parsers.
- **AD-5:** Money as `NUMERIC`/`Decimal`.

**Incompatible outcome — clashing entity model:**

- **A** double-record pattern: purchase `LEDGER_ENTRY` + schedule header/detail rows; settle excludes schedule table.
- **B** single-table: only `LEDGER_ENTRY` with `line_type`; schedule lines never duplicated as purchases.

Parser epic A emits linked purchase+schedule; B emits schedule-only lines → settle double-counts or omits principal. PRD anti-double-emit rule not reflected in spine ER diagram (only `CANDIDATE_ROW → LEDGER_ENTRY`).

**Hole → proposed AD-22 — Installment schedule shape:**

> Installment schedules are **`LEDGER_ENTRY` rows with `line_type=installment_schedule`** plus optional **`schedule_metadata` JSON** or child rows keyed by `parent_ledger_entry_id`. Purchases and schedule principal MUST NOT both enter settle-up (FR-45). ER diagram and migrations must show parent/child or explicit exclusion link.

---

### Pair 11 — Description alias storage: global table vs entry-embedded

| Unit A | **Story: Remember manual label as alias (FR-23)** — `description_aliases(bank_id, raw_description, manual_label)` |
| Unit B | **Story: Same-price match confirm** — stores alias on confirmed `LEDGER_ENTRY.metadata.aliases[]` |

**ADs obeyed (both):**

- **AD-3:** Aliases durable in Postgres.
- **AD-10 / FR-22:** Match confirmation triggers alias seed.

**Incompatible outcome — two owners, clashing shapes:**

- ML-downstream consumers in A query global alias table.
- B’s analytics read per-entry JSON; no global dedupe of `(bank, description)`.

Re-upload and multi-list scenarios: A global alias collides across lists; B silos aliases per entry — both “seed for later ML,” incompatible schemas.

**Hole → proposed AD-23 — Alias registry:**

> Aliases live in one **`DESCRIPTION_ALIAS`** table: `(adapter_id, normalized_bank_description, manual_label, confirmed_by_user_id, source_ledger_entry_id, created_at)`. Entry metadata may cache display hints but is not authoritative.

---

### Pair 12 — Rollback: soft-delete ledger vs resurrect session

| Unit A | **Story: Roll back import batch (FR-30)** — soft-delete ledger rows (`deleted_at`), retain batch audit |
| Unit B | **Story: Discard / re-review after rollback** — resets Import Session to `reviewing` with original candidates |

**ADs obeyed (both):**

- **AD-4:** Discard drops session; full batch rollback reverts session.

**Incompatible outcome — conflicting mutation paths:**

- **A:** Rollback is ledger-only; session already `committed` and immutable; re-upload creates **new** session.
- **B:** Rollback rewinds session state and **deletes** ledger promotions, restoring same session id for re-commit.

Re-import dedup (FR-34) interacts differently: A leaves tombstones that block re-insert; B hard-deletes and allows clean re-commit. Users see different “imported N, skipped M” summaries.

**Hole → tighten AD-4 — Rollback semantics:**

> Rollback **hard-deletes** (or tombstones with dedup-aware re-insert rules — pick one) ledger rows tagged with `import_batch_id`, sets session to **`rolled_back` terminal** (not reviewable). Re-review requires **new upload** / new session. Document dedup interaction with tombstones explicitly.

---

### Pair 13 — Posted date type: DATE vs TIMESTAMPTZ

| Unit A | **Epic: Bank normalization** — persists `posted_date` as Postgres `DATE` (CR calendar) |
| Unit B | **Epic: Same-price match window (AD-10)** — window math on “parsed row’s posted date” |

**ADs obeyed (both):**

- Spine convention: ISO-8601 calendar dates in `America/Costa_Rica`.
- **AD-10:** ±3 calendar days from posted date.

**Incompatible outcome — clashing shared-data shapes:**

- **A:** `DATE '2026-01-15'`.
- **B:** `TIMESTAMPTZ '2026-01-15T06:00:00Z'` (CR midnight stored as UTC offset).

Boundary comparisons for manual entry `2026-01-12` vs parsed `2026-01-15` differ by one day depending on storage/API serialization. API JSON from FastAPI/Pydantic may emit datetime where ui expects date-only.

**Hole → tighten Consistency Conventions — Dates row:**

> **`posted_date` is always `DATE` in Postgres and ISO `YYYY-MM-DD` in API JSON** — never time-of-day. All calendar window math (AD-10, statement cycle FR-39) uses date arithmetic in `America/Costa_Rica` without timezone conversion on stored values.

---

### Pair 14 — ACL enforcement: repository-scoped vs application-scoped

| Unit A | **Epic: Persistence adapters** — every repo method requires `acting_user_id`, SQL filters membership |
| Unit B | **Epic: Application use-cases** — service checks ACL once, repos fetch by `list_id` only |

**ADs obeyed (both):**

- **AD-1:** Application → domain; persistence adapters → Postgres; UI → HTTP only (no second truth).

**Incompatible outcome — conflicting authorization paths:**

- **A** defense-in-depth: leak requires bypassing repo.
- **B** single gate: new use-case forgetting check exposes list data.

Not a schema clash, but **dual mutation authority** for “who may read ledger” — integration tests in A pass with repo mocks; B’s new endpoint forgets check until production.

**Hole → proposed AD-24 — ACL choke point:**

> **List-scoped reads and writes MUST pass through a domain ACL port** invoked from application services. Repositories MUST NOT accept bare `list_id` without `acting_user_id` **or** an ACL token issued by that port. Forbidden: application-only checks with unscoped repos.

---

### Pair 15 — Auth delivery: API-set cookie vs Next BFF dual-cookie

| Unit A | **Epic: API auth (FR-1–4)** — FastAPI sets `httpOnly Secure` session cookie on `/api/auth/*` |
| Unit B | **Epic: UI account screens** — Next.js Route Handler BFF sets **`ui_session`** cookie, forwards `Authorization` server-side |

**ADs obeyed (both):**

- **AD-8:** httpOnly Secure cookie; same-origin via reverse proxy or Next BFF; Bearer in client storage forbidden.

**Incompatible outcome — conflicting session contract:**

- **A:** Browser holds one cookie (`session=`) on api host/path.
- **B:** Browser holds BFF cookie; api sees Bearer from BFF only — two session stores, logout in ui doesn’t invalidate api session unless coordinated.

Same-origin “via BFF” is explicitly allowed by AD-8, but **who issues and revokes** the session is undefined. Parallel implementation yields login works on desktop path, 401 on direct api fetch from ui client component.

**Hole → tighten AD-8 — Session issuer:**

> Exactly **one session issuer** in v1: either **api sets the only httpOnly cookie** (ui proxies credentials) **or** BFF holds opaque session and api validates server-side token — document chosen pattern in scaffold AD. Forbidden: ui client components holding api tokens; forbidden: two independent session cookies without linked revocation.

---

## Summary — Holes and Recommended Closures

| # | Fracture type | Units | Close with |
| --- | --- | --- | --- |
| 1 | Clashing shapes | Ingest staging vs Commit | **AD-16** CanonicalLine contract |
| 2 | Dual ownership | Quarantine session vs Settle disclosure | **AD-17** Quarantine lifecycle |
| 3 | Conflicting mutation | Adapter identity_key vs Domain dedup | **AD-18** Identity authority (domain) |
| 4 | Clashing shapes | Commit FX columns vs Read-time FX | **AD-19** FX persistence policy |
| 5 | Conflicting mutation | Partial statement commit vs Batch rollback | Tighten **AD-4** commit/batch unit |
| 6 | Dual ownership | Session pending matches vs Ledger flags | **AD-20** Match pending state |
| 7 | Dual ownership | UserCard vs ListCard | **AD-21** Card registry authority |
| 8 | Clashing shapes | Absolute vs relative PDF paths | Tighten **AD-3** path format |
| 9 | Conflicting mutation | Split remainder scope | Tighten **AD-6** scope |
| 10 | Clashing shapes | Schedule table vs line_type only | **AD-22** Installment model |
| 11 | Dual ownership | Global aliases vs entry JSON | **AD-23** Alias registry |
| 12 | Conflicting mutation | Soft rollback vs session resurrect | Tighten **AD-4** rollback semantics |
| 13 | Clashing shapes | DATE vs TIMESTAMPTZ | Tighten **Dates** convention |
| 14 | Conflicting mutation | Repo ACL vs app-only ACL | **AD-24** ACL choke point |
| 15 | Conflicting mutation | API cookie vs BFF dual session | Tighten **AD-8** session issuer |

---

## What the spine does well (for balance)

- **AD-1 / AD-2** eliminate the highest-risk splits (UI→DB, premature workers).
- **AD-5 / AD-7 / AD-10** pin down money, FX source, and match-window authority — when teams don’t invent parallel storage.
- **ER diagram** correctly centers Import Session staging — but omits quarantine post-commit, installment linkage, card registry, and alias table, which invited pairs 2, 7, 10, 11.

---

## Recommended next action

Before epic breakdown or scaffold:

1. Add **AD-16–AD-24** (or equivalent tightens) to the spine.
2. Extend **Core entities** diagram with quarantine, UserCard, DescriptionAlias, and installment parent/child.
3. Publish **`canonical-line.schema.json`** (or Python/Pydantic source of truth) referenced by AD-16 — single artifact both ingest and commit epics import.

Until then, label the spine **draft — not parallelizable**.

---

*Review completed: 2026-08-03*
