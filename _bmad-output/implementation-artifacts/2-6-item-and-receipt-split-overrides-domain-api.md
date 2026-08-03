# Story 2.6: Item and receipt split overrides (domain + API)

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a list member (via API / domain),
I want item and receipt split overrides — whole-line, absolute amounts, or percentages —
so that Epic 3 settle-up and the Adjust-split UI can consume a stable share-allocation model.

## Acceptance Criteria

1. **Given** an item or receipt with no override  
   **When** share allocations are computed  
   **Then** the list default split is used (FR-10)

2. **Given** a member sets a whole-line (or whole-receipt) override to one member via API  
   **When** allocations are computed  
   **Then** that member receives 100% of the line/receipt

3. **Given** absolute amounts per member are submitted  
   **When** they sum to the line/receipt total  
   **Then** those amounts become the share allocations  
   **And** amounts that do not sum to the total are rejected

4. **Given** a percentage override is submitted  
   **When** percentages sum to exactly 100%  
   **Then** allocations follow those percentages (AD-6 remainder → list creator)  
   **And** percentages that do not sum to 100% are rejected

5. **Given** this story is complete  
   **When** product UI is considered  
   **Then** no Adjust-split UI is required yet — Epic 3 manual expense ships the disclosure UI against this API

## Tasks / Subtasks

- [ ] Task 0: Confirm hard prerequisites (do not invent parallel stacks)
  - [ ] **1.1** Compose `db`/`api`/`ui`, hex layout, Alembic, `/health`, lockfiles, CI
  - [ ] **1.2 / 2.1** User + List + ListMembership; durable **`created_by` / list creator** ≡ owner at creation (no ownership transfer in v1); even-split **seed** on create
  - [ ] **1.3** Session cookie auth + protected routes; same-origin BFF/proxy
  - [ ] **2.2** Membership ACL port (`authorize_list_access` / equivalent) — repos require `acting_user_id`
  - [ ] **2.5 Configurable list default split (HARD)** — even | percentage standing default; owner-only mutate; member-readable get; shared AD-6 apply helper; membership-change → even fallback when % map invalid. **If 2.5 implementation missing: stop**
  - [ ] Reuse 2.5 completion notes for `default_split_mode`, share map shape, apply/remainder helper module path, ACL action names — **never re-decide or fork a second allocator**
  - [ ] If any hard prerequisite is incomplete: **stop** — one story per branch

- [ ] Task 1: Domain — share-allocation engine (AC: #1–#4) — TDD first (AD-15)
  - [ ] Red→green **before** routes/persistence:
    - No override → resolve to **list default** (even or standing %) and allocate (AC #1 / FR-10)
    - Whole-line / whole-receipt → assignee gets **100%** of total (AC #2)
    - Absolute amounts → accept iff `sum(amounts) == total` (Decimal equality); else reject (AC #3)
    - Percentage → accept iff sum == exactly 100%; apply via **shared 2.5 AD-6 helper** (floor-division; leftover → **list creator**) (AC #4 / AD-6)
    - Percentages ≠ 100% → reject (no silent clamp)
    - Creator not in member set / empty members / zero or negative total → reject with clear domain errors
    - N-member lists (2+) — never hardcode two-party math
  - [ ] **Reuse** `apply_percentage_split` / equivalent from **2.5** — single domain applicator for list-default and item/receipt % overrides; do not copy-paste remainder logic
  - [ ] Pure domain types (names may vary; keep snake_case on wire later):
    - `SplitKind`: `list_default` | `whole_assignee` | `absolute_amounts` | `percentage`
    - `SplitSpec` / override payload: kind + member→share map (percent or absolute) or single `assignee_id`
    - `ShareAllocation`: `{ member_id, amount: Decimal, currency }` — **stable output** for Epic 3 settle-up
  - [ ] **Resolution order (must be one function):**  
    `item_override` → else `receipt_override` → else `list_default`  
    Document in completion notes. Item-level overrides are highest precedence and must survive later list reassignment (Story 5.5 consumes this).
  - [ ] **Receipt vs item:** `subject_kind=item` attaches to one ledger line’s amount; `subject_kind=receipt` attaches to a receipt/group subject whose total is the receipt total (sum of child lines **or** an explicit receipt amount — pick one, document for 3.2/4.x). Whole-receipt assignee = 100% of that receipt total.
  - [ ] **AD-6 scope (binding — close Pair 9 ambiguity):** Remainder → **list creator** for **both** list-default **and** item/receipt **percentage** splits. Absolute overrides never use remainder logic (exact sum or reject). **Payer is never the remainder sink** in v1.
  - [ ] Money: `Decimal` only — construct from strings; `quantize` to currency minor unit with `ROUND_DOWN` / floor for percentage shares; assert `sum(allocations) == total` after remainder assignment. **Never `float`.**
  - [ ] Domain free of FastAPI / SQLAlchemy / pdfplumber (AD-1)

- [ ] Task 2: Persistence — override storage + minimal allocatable subject (AC: #1–#4)
  - [ ] Architecture ER has `LEDGER_ENTRY` but **no** share-allocation / override entity — design additive tables under `adapters/persistence/` (Alembic only; never auto-create on startup)
  - [ ] Recommended shape (adjust names to match 2.5/3.x if already chosen; document):
    - Minimal **`ledger_entry`** (or equivalent) stub: UUID PK; `list_id`; `amount NUMERIC`; ISO 4217 `currency`; optional `receipt_id` / `receipt_group_id` for receipt-scoped overrides; timestamps. **Do not** implement full manual-expense fields here (payer, description, origin, `hand` provenance = **Story 3.2**)
    - **`split_override`**: UUID PK; `list_id`; `subject_kind` (`item`|`receipt`); `subject_id`; `kind` (`whole_assignee`|`absolute_amounts`|`percentage`); payload (assignee_id **or** member→percent/amount JSON/`NUMERIC` rows); `set_by_user_id`; timestamps. Unique `(subject_kind, subject_id)` (one active override per subject)
  - [ ] Persist **configuration** (override spec), not only computed cents — recomputation must stay deterministic when members/total/list-default change rules are applied at compute time
  - [ ] Extend existing List / Membership / default-split models — **never** fork a second List entity
  - [ ] Generic fixture vocabulary only — no personal names / real IBANs

- [ ] Task 3: Application use-cases + API (AC: #1–#5) — **no UI**
  - [ ] Use-cases (names may vary): `SetSplitOverride`, `ClearSplitOverride`, `GetSplitOverride`, `ComputeShareAllocations` (or compute on read)
  - [ ] **Who may set overrides:** any **list member** (FR-8 / FR-10) — **not** owner-only. Contrast with Story **2.5** standing default (owner-only). Extend ACL with member write action; non-member → **403** (match 2.1/2.2 policy)
  - [ ] Assignee / absolute / percentage member ids must be **current list members** — reject unknown/non-member ids
  - [ ] Recommended routes (snake_case DTOs; money amounts as **strings**):
    ```text
    PUT    /api/lists/{list_id}/subjects/{subject_kind}/{subject_id}/split-override
           body: { kind, assignee_id? } | { kind, amounts: { member_id: "123.45", ... } }
                | { kind, percentages: { member_id: "50.00", ... } }
    GET    /api/lists/{list_id}/subjects/{subject_kind}/{subject_id}/split-override
    DELETE /api/lists/{list_id}/subjects/{subject_kind}/{subject_id}/split-override
    GET    /api/lists/{list_id}/subjects/{subject_kind}/{subject_id}/share-allocations
           → { allocations: [{ member_id, amount, currency }], resolved_from: item|receipt|list_default }
    ```
    Alternate nesting under `/ledger-entries/...` is fine if documented for Story 3.2 — **one** consistent convention.
  - [ ] Validation failures → structured JSON 4xx (fail-loud); never coerce under/over-allocated % or absolute sums
  - [ ] Auth: session cookie from 1.3 — same issuer; same-origin only; never Bearer in `localStorage`
  - [ ] **Anti-scope UI:** no Adjust-split disclosure, no manual-expense form, no settle-up math UI (AC #5 / Story 3.2)

- [ ] Task 4: Tests (AC: #1–#5)
  - [ ] Domain TDD (AD-15): all Task 1 cases including ₡100 / 3-way even remainder → creator; 60/40 on odd subunit; absolute sum mismatch reject; % ≠ 100 reject; resolution chain item > receipt > list_default
  - [ ] Integration on **Postgres 16**: member sets each override kind → GET allocations match; non-member denied; clear override → falls back to list default; owner-only default from 2.5 still used when no override
  - [ ] Money asserts use `Decimal` — never float
  - [ ] No UI tests required for Adjust-split (out of scope); keep api pytest green in CI
  - [ ] Fixtures: `creator@example.com`, `member-a@example.com`, `member-b@example.com` — generic only

## Dev Notes

### Epic context

Epic 2 = Shared lists & household membership (FR-6…FR-10). Override **UI deferred to Epic 3**; this story closes **FR-10 domain/API** only.

| Sibling | Relationship to 2.6 |
|---------|---------------------|
| **2.1** Create/rename + list creator field | Hard — AD-6 sink identity |
| **2.2** Membership ACL | Hard — member R/W choke |
| **2.5** List default split | Hard — no-override fallback + % apply/remainder |
| **2.3 / 2.4** Invites | Soft — more members exercise N-way splits; not required to code overrides |
| **3.2** Manual expense + Adjust split UI | Downstream consumer — validation must match these rules |
| **3.4** Settle-up from shares | Consumes `ShareAllocation` output + payer |
| **5.5** Reassign statement | Item-level overrides **persist** and outrank destination list default |

**FR-10 product “done”:** domain/API here; user-visible complete only with **3.2** (`project-context.md` gate). Epic 2 demo gate does **not** exercise overrides.

### Hard prerequisites / ordering

```text
1.1 → 1.2 → 1.3 → 2.1 → 2.2 → 2.5 → 2.6 → (3.2 UI consumer)
```

- Branch: `feat/2/2-6-item-and-receipt-split-overrides-domain-api` (AD-13) — **one story per branch**
- Do **not** implement 2.6 before **2.5** lands
- Predecessor story file: `_bmad-output/implementation-artifacts/2-5-configurable-list-default-split.md`

### Scope boundaries (anti-scope)

| In 2.6 | Out of 2.6 |
|--------|------------|
| Domain allocation engine + resolution chain | Adjust-split **UI** / manual expense form (**3.2**) |
| Persist item + receipt override specs | Payer field, origin, `hand` provenance (**3.2**) |
| API set/get/clear override + compute allocations | Settle-up balances / simplify (**3.4**) |
| AD-6 remainder → list creator on % splits | FX materialization (**3.5** / AD-7) |
| Member-can-set override ACL | Owner-only **list default** edit (**2.5**) |
| Minimal ledger/subject stub to hang overrides on | Full CanonicalLine import commit (**Epic 4**) |
| Decimal money; string on wire | Client-side share/FX math; JSON number amounts |

**Forbidden:** `float` money · silent clamp of bad %/absolute sums · payer-as-remainder-sink · owner-only gate on **overrides** · Adjust-split UI · domain→SQLAlchemy/FastAPI · Bearer in `localStorage` · reinventing list-default logic instead of calling 2.5 resolver · SQLite as prod stand-in for integration tests

### Architecture compliance

[Source: `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md`]

- **AD-1:** Allocation + validation in `domain/`; ORM only under `adapters/persistence/`; routes in `api/api/`; `ui` untouched
- **AD-5:** `NUMERIC` + ISO 4217; Python `Decimal`; wire amounts as **strings**
- **AD-6:** After floor-division of 100%-valid percentage shares, leftover minor unit → **list creator** (item/receipt % overrides included — see Pair 9 closure below)
- **AD-15:** Domain rules = red→green TDD mandatory
- **AD-19:** Membership ACL for list-scoped R/W; peers for split participation (no owner-vs-viewer product role for overrides)
- **Capability map:** Lists, membership, splits → `domain` + persistence | AD-19, AD-5, AD-6
- **ER gap:** No share-allocation entity in spine diagram — this story introduces override (+ minimal entry) tables; document mapping to future `LEDGER_ENTRY` in completion notes

**Pair 9 closure (binding for implementer):**  
Floor-division remainder → list creator for list-default **and** item/receipt percentage splits. Absolute overrides: exact sum or reject. Payer never remainder sink in v1.  
[Source: `architecture/.../reviews/review-adversarial-divergence.md` — Pair 9]

**Creator vs owner:** v1 pins creator ≡ owner at creation (`created_by` / `owner_id` from 2.1); no transfer. AD-6 sink = that durable creator id — do not invent a third identity.

### Library / framework requirements

| Piece | Pin / guidance | Notes |
|-------|----------------|-------|
| Python | 3.12+ | `decimal.Decimal` stdlib — no third-party money lib required |
| FastAPI / Pydantic / SQLAlchemy / Alembic | From 1.1 lockfile (`0.141.x` / `2.13.x` / `2.0.x` / `1.18.x`) | Routes + persistence |
| pytest | 9.x | Domain unit + Postgres integration |
| Next.js / React | — | **Do not touch `ui/`** for Adjust-split |

After lockfiles exist: no unrelated dependency bumps inside this feature story.

### Latest tech information (money splits)

- Build money `Decimal`s from **strings**, never floats (`Decimal("10.00")`).
- Percentage allocate: exact ratio → `quantize(..., ROUND_DOWN)` / floor to minor units → assign leftover subunits to **list creator** so `sum(shares) == total`.
- Note: Python `Decimal` `//` truncates toward zero (not floor for negatives). Keep totals **non-negative** for v1 shared expenses; document if negatives are rejected.
- Do **not** add a Money package (e.g. larzmoney) unless a later chore explicitly adopts one — stdlib `Decimal` + domain helpers match AD-5 and project-context.

### Recommended domain algorithm (percentage)

```text
total = Decimal(str(amount)).quantize(minor)
for each member except handle remainder:
  share = (total * percent / Decimal("100")).quantize(minor, rounding=ROUND_DOWN)
remainder = total - sum(floored_shares)
add remainder to list_creator's share
assert sum(shares) == total
```

Even split = equal percentages among current members (or equal floor + remainder to creator) — **reuse 2.5** even/default applicator; do not fork a second even-split implementation.

### File structure requirements

```text
api/
  domain/
    splits.py (or package)           # NEW — SplitSpec, resolve, allocate, validate (pure)
  application/
    set_split_override.py (etc.)     # NEW — use-cases / ports
  adapters/persistence/
    models.py / split_override.py    # NEW — ORM for override (+ minimal ledger_entry if needed)
    migrations/versions/000N_….py    # NEW — Alembic
  api/routes/
    splits.py or lists.py            # NEW/UPDATE — override + allocations endpoints
  tests/
    domain/test_share_allocations.py # NEW — TDD core
    test_split_override_api.py       # NEW — Postgres integration
ui/                                  # DO NOT MODIFY for this story
```

### Existing code being modified

| Path | Expected state entering 2.6 | This story | Preserve |
|------|----------------------------|------------|----------|
| List / Membership / creator | From **1.2 + 2.1** | Read creator for AD-6; membership for ACL | Same List entity; no ownership transfer |
| List default split | From **2.5** | Call resolver when no override | Owner-only edit of standing default unchanged |
| Domain ACL port | From **2.1/2.2** | Member write for overrides (not owner-only) | Repo choke still needs `acting_user_id` |
| `api/api/app.py` | Health + prior routers | Register split/override router | Existing routes unchanged |
| `ui/` | Soft-Ledger shell etc. | **No changes** | Adjust-split reserved for 3.2 |

**Greenfield note (as of story creation):** Working tree may still be scaffold-only until Epic 1–2 land. Treat predecessor **story contracts** as SoT; halt if code prerequisites missing.

### UX requirements

- **None for this story** (AC #5). UX-DR15 / EXPERIENCE “Adjust split” disclosure is **Story 3.2** against this API.
- J5 journey exercises **list-default / no override** path only — still must work via AC #1 once 3.2 saves without opening Adjust split.
- Do not invent UI remainder explanations; AD-6 is domain-silent to UX.

### Testing requirements

- Domain: red→green for all override kinds + resolution chain + AD-6 remainder → creator (must-cover edge in `project-context.md`)
- Integration: Postgres 16 only — not SQLite stand-in
- Assert money with `Decimal`; wire JSON amounts are strings
- ACL: non-member denied on set/get allocations
- No live BCCR; no UI Playwright required for this story

### Previous story intelligence

#### From Story 2.1 (create/rename owned lists)

[Source: `_bmad-output/implementation-artifacts/2-1-create-and-rename-owned-lists.md`]

- Persist **list creator** at create — AD-6 depends on it; creator ≡ owner at creation; no transfer in v1
- Even-split **seed** on create (1-member ⇒ 100% to creator) — FR-9 continuity into 2.5/2.6
- Owner-only admin (rename / invite / **default-split**) ≠ peer **participation** in splits — overrides are peer (member) writes
- Same `List` entity for personal and shared — never a second type

#### From Story 2.2 (lists homepage / ACL)

[Source: `_bmad-output/implementation-artifacts/2-2-lists-homepage-membership-scoped-access.md`]

- Reuse `authorize_list_access(acting_user_id, list_id, action)` — no bare `list_id` repos
- Explicitly deferred “override API (2.6)” — this story owns that surface
- API snake_case; money as string elsewhere — follow same DTO discipline

#### From Story 2.3 / 2.4 (invites)

- More members join lists → N-way allocation tests matter; invite flows themselves are out of scope
- Keep structured 401/403 consistency with prior list routes

#### From Story 2.5 (list default split) — **hard predecessor**

[Source: `_bmad-output/implementation-artifacts/2-5-configurable-list-default-split.md`]

- Modes at list-default level: **`even` | `percentage` only** — whole-line / absolute are **2.6-only** override kinds
- Owner-only **mutate** standing default; **any member may GET** default (needed for inheritance + UI)
- Suggested API: `GET/PUT /api/lists/{list_id}/default-split` — percentages as **strings**
- **Shared AD-6 helper once in domain** — 2.5 implements apply-to-amount; **2.6 must reuse it** for percentage overrides (and for no-override fallback), not fork
- Membership-change rule: `even` derives from current members; invalid % map after join/leave → **fall back to even** until owner re-saves — override resolution must still call current list-default resolver (AC #1)
- Persistence: `default_split_mode` + per-member share map — read via 2.5 ports; do not duplicate List models

### Git intelligence summary

Recent commits are planning/BMAD story-context artifacts; application code may still be untracked scaffold. Follow Conventional Commits + branch `feat/2/2-6-…`. No app-layer commit patterns to copy yet — mirror hex layout and TDD discipline from story files 1.2 / 2.1 / 2.5.

### Project context reference

[Source: `_bmad-output/project-context.md`]

- Money: `Decimal` / `NUMERIC` / string on wire — never float / JSON numbers
- `api/domain`: no FastAPI / SQLAlchemy / pdfplumber
- Split remainder → list creator (AD-6)
- Settle math server-owned — UI must not recompute shares later
- FR-10 done only with UI (3.2) — this story is the API foundation
- Source-of-truth order: ARCHITECTURE-SPINE + project-context → SPEC/DESIGN/EXPERIENCE → prd/epics → README/research

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` — Epic 2, Story 2.5, Story 2.6, Story 3.2]
- [Source: `_bmad-output/planning-artifacts/prds/prd-finance-helper-2026-08-02/prd.md` — FR-9, FR-10, FR-19, FR-44, NFR-3]
- [Source: `_bmad-output/specs/spec-finance-helper/SPEC.md` — CAP-4]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md` — AD-1, AD-5, AD-6, AD-15, AD-19, ER, capability map]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/reviews/review-adversarial-divergence.md` — Pair 9]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/reviews/review-reconcile-prd.md` — creator vs owner; ER gap]
- [Source: `_bmad-output/planning-artifacts/implementation-readiness-report-2026-08-03.md` — FR-10 domain in Epic 2 / UI in Epic 3]
- [Source: `_bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/EXPERIENCE.md` — Adjust split (3.2 consumer)]
- [Source: `_bmad-output/project-context.md`]
- [Source: `_bmad-output/implementation-artifacts/2-1-create-and-rename-owned-lists.md`]
- [Source: `_bmad-output/implementation-artifacts/2-2-lists-homepage-membership-scoped-access.md`]
- [Source: `_bmad-output/implementation-artifacts/2-5-configurable-list-default-split.md`]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

---

**Completion note:** Ultimate context engine analysis completed — comprehensive developer guide created.
