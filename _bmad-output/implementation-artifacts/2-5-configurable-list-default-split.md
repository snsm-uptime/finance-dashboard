# Story 2.5: Configurable list default split

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a list owner,
I want to set the list’s standing split to even or custom percentages,
so that new items inherit our household arrangement without per-item edits.

## Acceptance Criteria

1. **Given** a new list with members  
   **When** no custom default has been set  
   **Then** the default split is even among current members (FR-9)

2. **Given** I own the list  
   **When** I save a percentage default that sums to exactly 100% across members  
   **Then** the standing default updates and new items inherit it until overridden

3. **Given** I own the list  
   **When** I attempt to save percentages that do not sum to 100%  
   **Then** the save is rejected

4. **Given** I am a member but not the owner  
   **When** I attempt to edit the standing default  
   **Then** the action is rejected

5. **Given** percentage shares are applied to a concrete amount later  
   **When** floor-division leaves a leftover minor unit  
   **Then** that remainder is assigned to the list creator (AD-6) — deterministic, not a user preference

## Tasks / Subtasks

- [ ] Task 0: Confirm list + membership + owner ACL primitives exist (prerequisite)
  - [ ] Stories **1.2** (User / List / ListMembership + even-split **seed**), **1.3** (session cookie), **2.1** (create/rename + durable creator/owner + even seed on create), **2.2** (membership ACL + list detail shell) must be implemented
  - [ ] **2.3** (invite) + **2.4** (accept → multi-member) preferred before UI demo with ≥2 members; domain/integration tests may seed multi-member memberships directly
  - [ ] If 1.2 → 2.2 missing: **HALT** — do not invent a parallel list/auth/ACL stack
  - [ ] Reuse exact owner identity (`owner_id` / `created_by` from 2.1), membership ACL port (2.2), and session issuer (1.3) — do not re-open AD-8 / AD-19 forks

- [ ] Task 1: Domain — standing default + AD-6 allocation (AC: #1–#5) — TDD first
  - [ ] Red→green domain tests before routes/UI:
    - New list / no custom default → **even among current members** (1 member ⇒ 100%; 2 ⇒ 50/50; 3 ⇒ equal thirds)
    - Owner sets mode `percentage` with per-member shares summing to **exactly 100%** → standing default updates
    - Shares that under/over-sum 100% → rejected (exact; no float tolerance hacks — use `Decimal`)
    - Member-but-not-owner → edit rejected; non-member → rejected
    - Apply percentage (or even) map to a concrete `Decimal` amount → floor each share to currency minor unit; leftover minor unit(s) → **list creator** (AD-6)
    - Assert allocations sum exactly to the original amount
  - [ ] Modes: **`even` | `percentage`** only at list-default level — never whole-line / absolute-amount as list default (those are FR-10 / Story **2.6**)
  - [ ] Splits are **per member** (map of `member_user_id` → percentage), not a single household ratio
  - [ ] Persist durable **list creator** reference used by AD-6 (same field as 2.1; creator ≡ owner at creation; no ownership transfer in v1)
  - [ ] **Membership-change rule (required — document in completion notes):**
    - Mode `even`: always derive equal shares among **current** members at apply-time
    - Mode `percentage`: stored shares must cover **exactly** the current member set and sum to 100%. On membership add/remove that breaks that invariant → **fall back to `even`** until the owner saves a new valid map (prevents silent bad inheritance). Do not invent auto-redistribution of orphaned %.
  - [ ] Domain free of FastAPI / SQLAlchemy imports (AD-1)
  - [ ] Money: `Decimal` only — never `float` (AD-5)

- [ ] Task 2: Application use-cases + persistence (AC: #1–#5)
  - [ ] `GetListDefaultSplit` / `SetListDefaultSplit` (names may vary) in `api/application/` — orchestrate ports only
  - [ ] Set path: load list + members → authorize **owner** → validate mode/shares → persist → commit
  - [ ] Get path: any **member** may read the standing default (needed for UI + later 2.6/3.2 inheritance); non-member denied
  - [ ] Extend 1.2/2.1 List (+ split-share) persistence — do **not** duplicate List/ListMembership models or invent a second “shared list” type
  - [ ] Schema via Alembic only if 1.2/2.1 seed left no durable standing-default columns — never wipe PG volume (AD-22)
  - [ ] Suggested persistence shape (not spine-locked — document final columns in completion notes):
    - List-level `default_split_mode`: `even` | `percentage`
    - Per-member share rows **or** JSON map keyed by member UUID with `NUMERIC` percentages — must round-trip exactly
  - [ ] Even seed from 1.2/2.1 remains the create-time default (`even`); this story adds **mutation** of that standing default

- [ ] Task 3: API edge — owner-only default-split mutations (AC: #1–#5)
  - [ ] FastAPI routes under `api/api/` (suggested — spine does not lock paths; match Epic 2 lists style):
    - `GET /api/lists/{list_id}/default-split` → `{ mode, shares: [{ user_id, percentage }], … }` (member-readable)
    - `PUT` or `PATCH /api/lists/{list_id}/default-split` → body `{ mode: "even" }` **or** `{ mode: "percentage", shares: [{ user_id, percentage }, ...] }`
  - [ ] Percentages on the wire: **string** Decimal-safe values (e.g. `"50.00"`) — never JSON floats for money-like numerics; percentages are exact domain values
  - [ ] Authenticated session required (1.3); unauthenticated → 401
  - [ ] Non-owner member / non-member mutate → 403 (structured ACL error); do not leak beyond membership norms
  - [ ] Sum ≠ 100% → 422 / validation error with clear message
  - [ ] Pydantic DTOs **snake_case**; keep `/health` working

- [ ] Task 4: List-scoped owner UI (AC: #1–#4)
  - [ ] Owner control on **list detail** (same Soft-Ledger shell as Invite from 2.2/2.3) — even vs custom % per current member
  - [ ] Show live sum / disable or reject save when ≠ 100%; clear validation copy
  - [ ] Non-owners: no edit affordance (read-only inheritance is enough; do not expose a fake editable form)
  - [ ] Submit via same-origin BFF or proxied `/api` — never Bearer in `localStorage`
  - [ ] EN+ES keys for chrome + validation/ACL errors
  - [ ] Warm Balance: moss primary CTA, soft-not-pill corners; plain calm voice — no bank jargon
  - [ ] **Forbidden UI:** global Settings/profile product; Account-menu split controls; shipping FR-10 Adjust-split disclosure (Story **3.2**)

- [ ] Task 5: Integration verification + CI (AC: #1–#5)
  - [ ] Postgres **16** integration: even default after create; owner saves 60/40; reject 60/30; reject non-owner; AD-6 remainder on sample CRC amount (e.g. 100.00 / 3 or 10.00 @ 33.33/33.33/33.34-style maps — prove leftover → creator)
  - [ ] Membership-change: after adding a member under percentage mode, apply-time behavior falls back to even (or rejects inherit until owner re-saves — match Task 1 rule)
  - [ ] pytest green; ui typecheck/lint; thin UI test for owner save / validation if practical (coverage floor from 1.1)
  - [ ] Generic fixtures only — no real PII

## Dev Notes

### Epic context

Epic 2 = Shared lists & household membership (FR-6…FR-10). Demo gate = unregistered invite → signup → land on inviting list (2.3–2.4).

This story delivers **FR-9**: configurable standing list default (even | percentage summing to 100%), owner-only edit, AD-6 remainder when percentages meet money.

| Sibling | Relationship to 2.5 |
|---------|---------------------|
| **2.1** Create/rename | Hard prerequisite — owner + durable creator + even **seed** |
| **2.2** Lists homepage / detail | Hard prerequisite — ACL + list detail host for owner UI |
| **2.3** / **2.4** Invites | Soft/hard for multi-member demos — “even among current members” |
| **2.6** Item/receipt overrides | Downstream — consumes list default when no override |
| **3.2** Manual expense Adjust-split UI | Downstream UI on top of 2.5/2.6 |
| **3.4** Settle-up | Uses allocations; AD-6 in settle math |
| **FR-29** Reassign | Destination list default unless item overrides |

### Hard prerequisites / ordering

```text
1.1 → 1.2 → 1.3 → 2.1 → 2.2 → (2.3 → 2.4) → 2.5 → 2.6 → 3.2
```

- Branch: `feat/2/2-5-configurable-list-default-split` (AD-13) — **one story per branch**
- Do **not** implement before 2.1/2.2 (and 1.2/1.3) land
- Do **not** steal 2.6 override modes or 3.2 Adjust-split UI “while we’re here”

### Scope boundaries (anti-scope)

| In 2.5 | Out of 2.5 |
|--------|------------|
| Even default among current members | Item/receipt override modes (whole-line / absolute / % ) — **2.6** |
| Owner sets standing **percentage** default (sum = 100%) | Adjust-split disclosure UI — **3.2** |
| Reject bad sums; reject non-owner edit | Settle-up strip / receipt list — Epic **3** |
| AD-6 remainder helper when % applied to money | Absolute or whole-line as **list** default (never FR-9) |
| List-scoped owner UI (even ↔ custom %) | Profile / Account **Settings** product |
| Member-readable get of current default | Invite / membership create (2.3/2.4) |
| Membership-change → even fallback when % invalid | Delete list / leave list / transfer ownership |

**Forbidden:** `float` money · Bearer in `localStorage` · domain → FastAPI/SQLAlchemy · `ui` → DB · wiping PG volume · reinventing List/Membership · product admin role · shipping 2.6 override API · kit purple / pill CTAs / Inter-as-brand · personal names in fixtures.

### Critical ACL / product nuances

- **FR-8 / AD-19 peer equality** = expense/balance **participation** among members — **not** standing-default admin.
- **FR-9 owner-only** edit of standing default — same privilege class as rename (2.1) and invite (2.3).
- Members may **read** the default (needed for transparency + later inheritance UX) but cannot mutate.
- “New items inherit until overridden” is a **domain contract** for 2.6/3.2 — this story must expose a stable get/apply API; it does **not** create ledger items.

### Architecture compliance

[Source: `ARCHITECTURE-SPINE.md`, `project-context.md`]

- **AD-1:** Split rules in `domain`/`application`; ORM in `adapters/persistence`; HTTP/cookie in `api/api/`; `ui` → HTTP only
- **AD-2:** Still exactly `db` | `api` | `ui`
- **AD-5:** `Decimal` + `NUMERIC` + ISO 4217 beside amounts; API money/percentage strings
- **AD-6:** After floor-division of percentage shares that sum to 100%, leftover minor unit → **list creator** (applies to list-default **and** later item-% overrides — implement the helper once in domain)
- **AD-8:** Reuse 1.2/1.3 httpOnly Secure cookie session
- **AD-12:** DESIGN + EXPERIENCE win — no dedicated default-split journey exists; keep list-scoped and Warm Balance–compatible
- **AD-13:** Branch `feat/2/2-5-…`; Conventional Commits
- **AD-15:** Domain TDD; CI = lint · api pytest · ui typecheck/lint · critical ui tests
- **AD-19:** Membership ACL for list R/W; owner-only for standing default (FR-9)
- **AD-22 / NFR-13:** Alembic only; never recreate operator PG volume

**Known architecture gaps (close with documented defaults in completion notes):**

1. Spine ER has USER / LIST / LIST_MEMBERSHIP but **no** share-allocation entity — invent persistence consistent with FR-9 semantics
2. Exact DTO field names / REST paths not spine-locked — stay consistent with 2.1/2.2 lists API
3. Creator vs owner: one durable field from 2.1; AD-6 uses that creator id

### Library / framework requirements

Pins: **lockfiles are truth** after Story 1.1. Do not bump majors inside this feature story.

| Piece | Pin / guidance | Notes |
|-------|----------------|-------|
| Python | 3.12+ | `decimal.Decimal` for all share math |
| FastAPI / Pydantic | 0.141.x / 2.13.x (lockfile) | Routes + snake_case DTOs |
| SQLAlchemy / Alembic / psycopg | 2.0.x / 1.18.x / 3.3.x | Models only in persistence |
| PostgreSQL | 16.x | Integration against Compose `db` — **not SQLite** |
| Next.js / React | 16.2.x / 19.2.x | List-scoped owner UI + BFF/proxy |
| Auth stack | From 1.2/1.3 completion notes | Reuse session dependency |

**Reject:** money `float` · client-side settle/share recomputation as SoT · new auth libraries · Redis · Node-primary split API · third-party “money kit” unless already in lockfile (prefer pure `Decimal` domain helper).

### Recommended API / UI shapes

```text
GET  /api/lists/{list_id}/default-split
  → 200 { mode: "even"|"percentage", shares: [{ user_id, percentage }], creator_user_id? }

PUT  /api/lists/{list_id}/default-split
  body: { "mode": "even" }
     | { "mode": "percentage", "shares": [{ "user_id": "...", "percentage": "60.00" }, ...] }
  → 200 updated DTO | 403 non-owner | 422 sum≠100% / unknown member ids

# Domain helper (used now in tests; consumed by 2.6/3.4):
# allocate_percentage_shares(total: Decimal, shares, creator_user_id, currency_exponent) -> mapping
```

Wire snake_case; map at UI edge. UI lives on list detail beside other owner tools (Invite) — **not** Account menu.

### File structure requirements

```text
api/
  domain/…                         # NEW — DefaultSplit rules + AD-6 allocate helper (pure)
  application/…                    # NEW — Get/SetListDefaultSplit + ports
  adapters/persistence/…           # UPDATE — standing default storage + Alembic if needed
  api/routes/…                     # UPDATE/NEW — default-split on lists router
  api/app.py                       # UPDATE — register if new router module
  tests/…                          # NEW — domain TDD + Postgres ACL/validation/AD-6
ui/
  app/…/lists/[listId]/…            # UPDATE — owner Default split control (even / %)
  lib/i18n/…                       # UPDATE — EN+ES chrome + validation
  app/api/lists/.../default-split/ # optional BFF forwarder
```

### Existing code being modified

**As of story-creation time:** working tree is largely **1.1 scaffold** (health + empty hex). Stories 1.2–2.4 are planned / ready-for-dev ahead of this one. Treat the table as **post-2.2** (and preferably post-2.4) reality — if prerequisites missing, stop at Task 0.

| Path | Expected state entering 2.5 | This story | Preserve |
|------|----------------------------|------------|----------|
| List / ListMembership + even seed | From **1.2 + 2.1** | Persist/mutate standing default; keep create-time even seed | Same List entity; UUID PKs; creator field for AD-6 |
| Membership ACL port | From **2.2** | Owner check on set; member check on get | No second ACL truth in Next |
| List detail UI | From **2.2** (+ Invite from **2.3**) | Owner default-split editor | Soft-Ledger shell; empty settle until Epic 3 |
| Auth cookie / BFF | From **1.3** | Authenticate get/set | Same issuer; no Bearer in storage |
| Domain money helpers | May be thin/absent | Add AD-6 allocate; `Decimal` only | Never float |

### Domain semantics — must not invent wrong

| Topic | Rule |
|-------|------|
| List default modes | `even` or standing **percentages** only |
| Percentage validation | Exactly 100% across **current** members or reject |
| Inheritance | New items use current list default until FR-10 override (2.6) |
| Remainder | Always list **creator** — not payer, not “first member”, not user pref |
| Even definition | Equal among **current** members at apply-time |
| % + membership change | Fall back to `even` until owner re-saves (Task 1) |
| Absolute / whole-line | Item override only (2.6) — never list default |

### UX / copy guardrails

[Source: `EXPERIENCE.md`, `DESIGN.md`]

- UX journeys **do not** specify a default-split editor — EXPERIENCE IA forbids a Settings product; Invite is the model for **list-scoped** owner tools
- J5 / manual expense assumes list default (even) until Adjust split opens — that disclosure is **3.2**, not 2.5
- Voice: plain and direct; errors = what happened + what to do; no peer blame
- EN+ES for all chrome; Warm Balance tokens; phone-first same IA as desktop
- Do not place controls in Account menu (language/theme only — Story 1.6)

### Testing requirements

- **Domain/unit (TDD):** even default; set % = 100%; reject ≠100%; reject non-owner; AD-6 remainder → creator; allocations sum to total; membership-change fallback
- **Integration (Postgres 16):** HTTP + session cookie; ACL 403s; persistence round-trip of mode/shares
- **UI:** thin owner save + validation path if practical; maintain 1.1 coverage floor
- **Anti-patterns:** SQLite stand-in · float asserts · Playwright every PR · real emails/IBANs in fixtures · recompute shares only in browser as SoT

### Previous story intelligence

Immediate prior story file: **2.4** (`2-4-invitee-signup-lands-on-inviting-list.md`). Carry-forwards:

| Source | Carry into 2.5 |
|--------|----------------|
| **2.4** | Accept creates membership → multi-member lists; **explicit anti-scope:** “Standing default split when members join (**2.5**)”; after join, even/default inheritance must respect **current** members; still creates FR-5 personal list + inviting membership |
| **2.3** | Owner-only admin privilege class (invite); note “standing default when members change → **2.5**” |
| **2.1** | Even-split **seed** on create; durable creator for AD-6; owner-only write pattern; **explicit defer** of configurable default UI to **2.5**; same List entity |
| **2.2** | Membership ACL port; list detail shell; owner-only default-split called out as **out of scope** — reuse ACL, don’t fork |
| **1.2** | Personal list even seed (1-member ⇒ 100%); session/list primitives |
| **1.3** | Auth gate; BFF/proxy; generic auth errors |

All Epic 1/2 File Lists / Completion Notes are empty (ready-for-dev only) — treat story specs + scaffold as SoT until those land.

### Git intelligence summary

Recent commits are planning/BMAD story-context (`1.1`–`1.6`, `2.1`–`2.3` ready-for-dev). No application feature commits for auth/lists/splits yet. After prerequisites land, follow Conventional Commits on `feat/2/2-5-…`. Mirror lists router / ACL patterns from 2.1/2.2 completion — do not invent a parallel module tree.

### Latest tech information

- **AD-6 allocation:** Use `Decimal` throughout. Pattern: compute each share as `(total * pct / 100)` then `quantize` to currency minor unit with **floor** (`ROUND_DOWN` / `ROUND_FLOOR`); assign `total - sum(floored)` to the **list creator**’s share so parts sum exactly to `total`. Do **not** distribute leftover “to the first N members” or “largest remainder method” unless spine changes — spine says creator only.
- **Python `Decimal`:** Prefer `Decimal` constructed from strings; avoid `float`. Note `Decimal` `//` truncates toward zero — for money floor of positive CRC amounts, prefer `quantize(..., rounding=ROUND_DOWN)` on positive totals.
- **SQLAlchemy 2.0:** `Mapped[]` + `mapped_column`; UUID PKs; Alembic revision for any new share table/columns; import models in `env.py`.
- **Pins (api lockfile as of 1.1 scaffold):** fastapi `0.141.1`, sqlalchemy `2.0.51`, alembic `1.18.5`, pydantic `2.13.4`, pytest `9.x` — do not churn inside this story.
- Do **not** add a money library dependency for this story — keep a small domain helper.

### Project context reference

Follow `_bmad-output/project-context.md`. Highest-risk misses for this story:

- Owner-only standing default (FR-9) — membership alone is insufficient
- AD-6 remainder → **list creator** (not payer)
- `Decimal` only; API numeric strings; never float
- Hex boundaries; Alembic only; Postgres 16 integration
- List-scoped UI — **no** Settings product
- Do not implement 2.6 overrides or 3.2 Adjust-split UI
- Settle/share math is **server-owned** — UI displays, does not redefine
- SoT order: ARCHITECTURE-SPINE + project-context → SPEC/DESIGN/EXPERIENCE → PRD/epics → README/research

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` — Story 2.5 ACs; Epic 2; Stories 2.1–2.6, 3.2]
- [Source: `_bmad-output/planning-artifacts/prds/prd-finance-helper-2026-08-02/prd.md` — FR-9, FR-10, FR-8, NFR-3; Membership and splits]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md` — AD-1, AD-5, AD-6, AD-8, AD-13, AD-15, AD-19, AD-22; Capability map]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/reviews/review-adversarial-divergence.md` — Pair 9 AD-6 scope]
- [Source: `_bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/EXPERIENCE.md` — IA (no Settings); J5 list default until Adjust split]
- [Source: `_bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/DESIGN.md` — Warm Balance / Soft-Ledger]
- [Source: `_bmad-output/implementation-artifacts/2-1-create-and-rename-owned-lists.md`]
- [Source: `_bmad-output/implementation-artifacts/2-2-lists-homepage-membership-scoped-access.md`]
- [Source: `_bmad-output/implementation-artifacts/2-3-invite-members-by-email.md`]
- [Source: `_bmad-output/implementation-artifacts/2-4-invitee-signup-lands-on-inviting-list.md`]
- [Source: `_bmad-output/implementation-artifacts/1-2-sign-up-with-email-password-and-personal-list.md`]
- [Source: `_bmad-output/project-context.md`]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

## Story completion status

Status: ready-for-dev  
Completion note: Ultimate context engine analysis completed — comprehensive developer guide created.
