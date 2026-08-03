---
title: "Reconcile PRD → Architecture Spine"
reviewed: 2026-08-03
prd: prd-finance-helper-2026-08-02/prd.md
spine: architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md
---

# PRD ↔ Architecture Spine Reconciliation

## Verdict

**Partially aligned — structurally sound substrate, materially incomplete product contract.**

The spine nails v1 *build substrate* (hexagonal layout, Compose topology, Import Session staging, money/FX/auth ADs, CI fixture policy) and correctly defers v2 settlement and ML categorization. It does **not** yet carry large slices of the PRD's behavioral contract: cards/IBAN, payer and split semantics, quarantine/provenance flows, shared-expenses presentation rules, adapter parsing invariants, and several quiet product constraints (peer symmetry, receipt-shaped practice, human-in-the-loop tone).

One **hard contradiction** (AD-9 swipe mandate vs PRD open question). One **premature product decision** beyond PRD scope (AD-10 list-configurable match window). Several PRD `[OPEN — architecture]` items are **closed** in the spine (FX source, split remainder) — recorded below as resolutions, not contradictions.

---

## What landed well

| PRD area | Spine coverage |
| --- | --- |
| Thin vertical slice scope (upload → parse → store → shared-expenses) | Scope line, capability map |
| Hexagonal / pluggable adapters | Design paradigm, AD-1, AD-11 |
| Self-hosted Compose (`db` + `api` + `ui`) | AD-2, stack, structural seed |
| Import Session staging before commit | AD-4 |
| Interactive (not batch) ingest | AD-2, NFR-12 binding |
| Email/password + SMTP + httpOnly cookies | AD-8 |
| BCCR FX, CRC settlement, no v1 override | AD-7 (closes PRD open FX source) |
| Fail-loud detect/parse posture | Errors convention |
| No PII in repo; synthetic CI fixtures | AD-11, naming convention |
| `America/Costa_Rica` dates | Consistency conventions |
| NUMERIC/Decimal money | AD-5 |
| Streamlit rejected | Stack explicit rejects |
| Same-price collision concept | AD-10 |
| PDF on operator volume, path in Postgres | AD-3 |
| Alembic in stack (partial NFR-13) | Stack table |

---

## Contradictions (spine AD vs PRD)

### 1. AD-9 — Mandatory phone swipe (contradiction)

| | PRD | Spine AD-9 |
| --- | --- | --- |
| Requirement | Review-one-at-a-time **pattern** is mandatory; literal swipe is **preferred** where the client supports it | Phone Individual review **must** implement **true swipe** commits |
| Open status | `[OPEN — UX/architecture]` — "Whether literal swipe is mandatory vs review-one-at-a-time pattern only" | Closed: swipe mandatory on phone |

**Impact:** Spine pre-empts a PRD open question and narrows acceptable implementations. PRD explicitly allows non-swipe mobile UX if the pattern (chosen list / default / skip) is preserved.

**Recommendation:** Reword AD-9 to match PRD: pattern + three outcomes locked; swipe preferred on phone, not mandatory. Keep WCAG non-gesture equivalents.

---

### 2. AD-10 — List-configurable match window (scope beyond PRD)

| | PRD FR-22 | Spine AD-10 |
| --- | --- | --- |
| Window | "date-window tightness is left to architecture" | Default ±3 days **and** window is **list-configurable** |

**Impact:** Not a direct contradiction (PRD delegates to architecture), but AD-10 adds a **product surface** (per-list configuration) the PRD never requested. v1 PRD account surface is explicitly minimal — no settings for FX, notifications, etc.; a list-level match-window setting may conflict with that restraint.

**Recommendation:** Either drop list-configurable for v1 (fixed ±3 or architecture-only constant) or add explicit FR/UX acceptance for the setting.

---

### 3. AD-6 — Remainder to list creator (resolution, not contradiction)

PRD open question: deterministic one-subunit remainder when percentages sum to 100%. AD-6 assigns leftover to **list creator**. PRD invited architecture to propose; this is a valid closure. **Note:** "list creator" should be defined (list owner at creation? current owner?) — PRD uses "owner" for list administration (FR-9).

---

## Major functional gaps (PRD requirements absent or thin in spine)

### Cards, IBAN, and routing (FR-11, FR-16, FR-37)

PRD requires:
- User-scoped **card registry** keyed by IBAN (or equivalent), user-chosen label
- IBAN match reuses card + label without re-registration
- Fixed-list vs review-routing modes per card
- v1 uniqueness: one fixed list per card; relation model must allow multiple later

Spine ER diagram has **no CARD entity**, no card↔list relation, no IBAN matching. Capability map does not mention card registration or routing modes.

---

### Payer and split semantics (FR-9, FR-10, FR-19, FR-44)

PRD requires:
- **Explicit payer** on every shared expense; defaults to current user on import/manual entry
- List default split (even or percentage, sum = 100%)
- **Owner-only** edit of list default split (FR-9)
- Item overrides: whole-line to one member, **absolute sub-amounts** per member, per-item percentage
- Balances from **per-transaction share allocations + payer**, not month aggregates

Spine: AD-6 covers percentage **remainder** only. No payer field, no absolute-amount split validation, no owner-only ACL for split defaults, no share-allocation entity in ER diagram.

---

### Manual entry and alias seed (FR-21, FR-23)

PRD requires manual items (same split/payer rules, provenance), same-price review at import end, and **alias storage** (manual label ↔ bank description) for post-v1 ML.

Spine: AD-3 mentions "aliases" in Postgres store list but no AD, entity, or capability mapping. Manual item entry absent from capability map.

---

### Quarantine, provenance, and conflict flows (FR-24–28, FR-32)

PRD requires:
- Statement-scoped failure; comparison view only on failure
- Accept-with-quarantine vs dismiss; incomplete statement marking
- **Provenance** on every row (parser vs hand-entered)
- Hand-fix quarantined rows against PDF (mobile editing surface)
- Manual-vs-parsed re-upload conflict prompt (keep manual / take parsed / keep both)
- Line-type taxonomy; must_parse / best_effort / ignore; installment schedules distinct, no double-count

Spine: quarantine named in AD-3/AD-4 and capability map but **no rules** for quarantine lifecycle, provenance, hand-fix, or conflict resolution. No line-type or installment AD. No dual-column CRC/USD normalization rule (FR-33: prefer nonzero, if both nonzero prefer CRC).

---

### Shared-expenses presentation (FR-38–45, FR-39–42)

PRD requires:
- Period aligned to **statement/billing cycles** (not calendar month); user selects cycle when cards differ
- Layout: top settle-up in CRC + **simplify** (fewer transfers, no payment recording); below **receipt list newest-first**
- Foreign lines show original + converted CRC for audit
- **Incomplete/quarantined data disclosure** on balance and receipt views
- Only included line types feed settle-up; `credit_note` excluded until classified as purchase reversal

Spine: "Settle-up / simplify CRC" in capability map with AD-5/6/7. Missing: cycle selection, receipt layout, newest-first ordering, simplify semantics, incomplete disclosure AD (NFR-6 / FR-43), line-type inclusion rules, payer in settle math.

---

### Import/review UX contract (FR-17, FR-12, FR-18, FR-20)

PRD requires:
- **Bulk** review mode (whole upload → one list) in addition to individual
- Configurable **default destination** for low-effort accept (not hardwired to personal list)
- Post-import **dedup summary** ("imported N, skipped M")
- Dismiss entire file vs skip single statement

Spine: AD-9 covers individual review outcomes only. Bulk mode, configurable default, dedup summary not referenced.

---

### Correction (FR-29, FR-30)

PRD: reassign statement between lists; journaled batch rollback.

Spine: AD-4 batch rollback/discard partial. **Reassign statement** not mentioned.

---

### Adapter contract detail (FR-31–36)

PRD: detect order (override → filename → content); `account_kind`; BAC section map; walmart acceptance bar; Promerica stub multi-statement; ref quality stable/derived/absent; canonical identity keys with fallback.

Spine: pipeline named; AD-11 golden fixtures. Missing: detect order, account_kind, section policies, walmart as explicit release gate, identity fallback spec, ref quality.

---

### Auth edge (FR-4)

PRD: email verification **only when required** for invites or recovery — not a profile feature.

Spine AD-8: signup/reset/cookies. Conditional verification logic not stated.

---

### NFR-13 Schema migrations

PRD: PostgreSQL evolution via migrations; upgrades must not discard operator data volume.

Spine: Alembic in stack only — no AD or deploy rule.

---

## Quiet requirements, tone, and constraints dropped

These are product posture statements the PRD treats as binding but the spine does not echo. They should inform domain ADs and UX acceptance even if not literal FR numbers.

### Product philosophy and user model

| Quiet requirement | PRD source | Spine gap |
| --- | --- | --- |
| **Peers, not roles** — no admin/viewer split; visibility = list membership only | Users and roles, FR-8 | ACL mentioned (AD-1, NFR-3) but peer symmetry and absence of privileged product role not stated |
| **Symmetric multi-user** — deliberate departure from brief's single-user CLI | Users and roles | Not recorded (context loss for implementers) |
| **List-level sharing design position** — household splitting follows the card, not per-transaction; contrast with Splitwise/Actual/Firefly | Lists | Product rationale absent; affects default UX assumptions |
| **Personal list = shared list with one member** — same entity, not separate concept | Lists | Not in entity model or conventions |
| **v1 proves end-to-end architecture** — thin slice chosen over assembled pieces | Overview | Aligned in scope line; rationale not preserved |
| **Operator (Sebas) is deploy role, not product role** | Users and roles | Not distinguished — risk of baking operator-only features into user ACL |

### Receipt-shaped practice and settlement tone

| Quiet requirement | PRD source | Spine gap |
| --- | --- | --- |
| Everyday use matches a **receipt**, not a spreadsheet of percentages | Balances — Receipt-shaped practice | Not reflected in settle ADs or UI capability |
| Two modes: whole-receipt default split **or** item-by-item "what I bought" | Same | Split override semantics incomplete (see FR-10) |
| **Who paid** is first-class — not inferred from cardholder | Who paid, FR-19 | Missing entirely |
| v1 shows balances only; **settling happens outside the app** | Balances and settlement | Deferred table mentions v2; v1 "outside app" tone not stated |
| Simplify = suggested transfer plan, **does not record payment or invent debt** | Shared-expenses view, FR-41 | Simplify mentioned in map; constraints not AD-bound |

### Ingestion human-in-the-loop tone

| Quiet requirement | PRD source | Spine gap |
| --- | --- | --- |
| **Nothing partial enters the ledger without a human decision in front of evidence** | Failure handling, FR-26 | Fail-loud in errors convention; override path tone missing |
| Comparison view is an **editing surface**, not just a diff | Statement ingestion | react-pdf in map; editing/provenance tone missing |
| Clean parses **skip** comparison view | FR-25 | Not stated |
| Mobile: PDF in **lower half** on phone | FR-25, form factor | Not stated |
| Re-upload dedup is **silent**; manual-vs-parsed is **never silent** | Duplicates, FR-28 | Dedup vs conflict distinction not in spine |

### Data integrity and trust

| Quiet requirement | PRD source | Spine gap |
| --- | --- | --- |
| **Provenance** on every row for trust, debugging, audit | Parsing, FR-32 | Not an AD or entity field |
| Incomplete balances must **disclose** understatement | Incomplete data, FR-43, NFR-6 | Not an AD |
| Generic vocabulary for **future open-source** — no personal names in code | Constraints | Naming convention ✓; SMTP-vs-Google auth tradeoff for self-hosters not recorded |

### Parsing culture (from brief, restated in PRD)

| Quiet requirement | PRD source | Spine gap |
| --- | --- | --- |
| Fail-loud on unparseable **must-parse** sections | Parsing, NFR-8 | Partial (errors convention) |
| Unmapped sections → **best_effort quarantine**, not silent drop | FR-32 | Missing |
| Installment schedules: distinct type, excluded from shared totals, no double-emit with purchases | FR-32, scope | Missing |
| Walmart fixture = **v1 parsing exit bar** | FR-35, constraints | AD-11 synthetic fixtures; walmart not named as gate |
| Positional PDF fixture risk — highest technical risk | Constraints | AD-11 addresses strategy; risk severity not echoed |
| Two-tier test reality; repo fixtures gate release | Constraints | AD-11 aligned |

### Account surface minimalism

| Quiet requirement | PRD source | Spine gap |
| --- | --- | --- |
| v1 auth only: signup, signin, reset; verification **if required** for invites/recovery | Account surface, FR-4 | Partial |
| No settings: display name, notifications, FX overrides, session UI | Account surface, scope out | AD-7 no FX override ✓; rest not listed as out-of-scope in spine |

---

## PRD open questions — spine disposition

| PRD open question | Owner | Spine disposition |
| --- | --- | --- |
| One-subunit remainder after 100% split | Architecture | **Closed** — AD-6: to list creator |
| FX source, missing-date, override | Architecture | **Closed** — AD-7: BCCR, nearest prior + flag, no override |
| Literal swipe vs pattern only | UX/Architecture | **Closed (contradicts PRD openness)** — AD-9: swipe mandatory on phone |
| Front end for gestures/PDF/mobile | Architecture | **Closed** — Next.js + react-pdf + @use-gesture/react in stack |
| Positional fixture fidelity | Architecture | **Closed** — AD-11: synthetic PDFs with known geometry |
| Settlement payment double-count | Product v2 | **Deferred** — spine deferred table ✓ |
| BAC debit/eco section maps | Implementation | **Still open** — not in spine |

---

## FR coverage matrix (summary)

| Status | FRs |
| --- | --- |
| **Covered or partially covered** | FR-1–3, 13–15, 17–18 (individual only), 22, 24–25 (thin), 31 (paradigm), 38 (thin), 40–41 (thin) |
| **Missing or materially incomplete** | FR-4–12, 16, 19–21, 23, 26–30, 32–37, 39, 42–45 |
| **NFR gaps** | NFR-3 (owner-only actions), NFR-6 (incomplete honesty AD), NFR-13 (migration AD) |

---

## Recommended spine additions (priority order)

1. **Entity/model AD** — CARD (IBAN, label, user, routing mode, fixed list relation); LEDGER_ENTRY provenance; payer; share allocations; line_type; installment_schedule; description aliases.
2. **Split AD** — percentage sum = 100%, absolute amounts sum = line total, owner-only default split edit; AD-6 remainder recipient = list owner (define term).
3. **Quarantine/provenance AD** — accept-with-quarantine, dismiss, hand-fix, manual-vs-parsed conflict, incomplete flag propagation to balances.
4. **Settle-up AD** — statement-cycle period selection, line-type inclusion, simplify constraints, incomplete disclosure, receipt layout (newest-first, FX audit line).
5. **Adapter AD** — detect order, account_kind, dual-column rule, identity keys + ref quality, section policy enum.
6. **Review AD** — bulk mode; configurable default destination; dedup summary; reconcile AD-9 with PRD swipe openness.
7. **Reassign AD** — statement move between lists with balance recomputation.
8. **Fix AD-10** — remove list-configurable window unless product adds FR.

---

## Summary table

| Category | Count | Severity |
| --- | --- | --- |
| Hard contradictions | 1 (AD-9 swipe) | High — revert or amend PRD |
| Premature product decisions | 1 (AD-10 list-config window) | Medium |
| Major FR clusters missing | ~6 (cards, splits/payer, quarantine, shared-expenses UI rules, adapter detail, correction) | High |
| Quiet requirements dropped | ~20 tone/constraint items | Medium — drives wrong UX/domain defaults if ignored |
| Open questions closed appropriately | 4 | Low — document in spine changelog |
| Open questions closed prematurely | 1 (swipe) | High |

**Bottom line:** The spine is a credible **engineering substrate** but not yet a **product-faithful architecture**. Before story breakdown, extend ADs and the entity seed to carry FR-5–12, FR-16–21, FR-23, FR-26–30, FR-32–37, FR-39, FR-42–45, and NFR-6/13; reconcile AD-9 with the PRD open question on swipe.
