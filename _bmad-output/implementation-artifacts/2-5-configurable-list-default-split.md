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

- [ ] Task 0: Base branch + confirm list/ACL stack (prerequisite)
  - [ ] **Start from `origin/main` after Story 2.2** (merge/rebase before coding). Tip with only 2.1 lacks `list_access` and `ui/app/lists/[listId]/` — do not re-implement 2.2
  - [ ] Required on base: **1.2** (User / List / ListMembership), **1.3** (session cookie), **2.1** (create/rename + `owner_id`), **2.2** (`authorize_list_access` + list detail shell)
  - [ ] **2.3 / 2.4 are story-only today** (no invite runtime). Multi-member demos and tests: **seed** `ListMembership` rows directly — do not invent invite APIs inside 2.5
  - [ ] If 1.2 → 2.2 missing on the branch: **HALT** — do not invent a parallel list/auth/ACL stack
  - [ ] Creator / AD-6 sink = **`List.owner_id` only** (2.1: no `created_by` column; creator ≡ owner at create; no ownership transfer in v1)
  - [ ] Owner mutate via existing ACL action **`edit_default_split`** through `AuthorizeListAccessService` / `authorize_list_access` — do not ad-hoc `owner_id != actor` forks
  - [ ] Same PR: keep living contract in sync — `membership-acl-enforcement-sketch.md` already lists `edit_default_split`; update sketch only if codes/disclosure change

- [ ] Task 1: Domain — standing default + AD-6 allocation (AC: #1–#5) — TDD first
  - [ ] Red→green domain tests before routes/UI:
    - New list / no custom default → **even among current members** (1 member ⇒ 100%; 2 ⇒ 50/50; 3 ⇒ equal thirds)
    - Owner sets mode `percentage` with per-member shares summing to **exactly 100%** → standing default updates
    - Shares that under/over-sum 100% → rejected (exact; no float tolerance — use `Decimal`)
    - Member-but-not-owner → edit rejected; non-member → rejected
    - Apply percentage (or even) map to a concrete `Decimal` amount → floor each share to currency minor unit; leftover → **`owner_id` (list creator)** (AD-6)
    - Assert allocations sum exactly to the original amount
  - [ ] Modes: **`even` | `percentage`** only at list-default level — never whole-line / absolute as list default (FR-10 / **2.6**)
  - [ ] Splits are **per member** (`member_user_id` → percentage), not a single household ratio
  - [ ] AD-6 helper takes `creator_user_id` = list `owner_id` — implement once in domain for list-default and later item-% (2.6/3.4)
  - [ ] **Membership-change rule (documented default — not spine law; record in completion notes):**
    - Mode `even`: equal shares among **current** members at apply-time
    - Mode `percentage`: stored shares must cover **exactly** the current member set and sum to 100%. On add/remove that breaks the invariant → **fall back to `even`** until the owner saves a new valid map. Do not auto-redistribute orphaned %
  - [ ] Domain free of FastAPI / SQLAlchemy imports (AD-1); money `Decimal` only (AD-5)

- [ ] Task 2: Application use-cases + persistence (AC: #1–#5)
  - [ ] `GetListDefaultSplit` / `SetListDefaultSplit` in `api/application/` (extend `lists.py` / ports — do not fork a second list stack)
  - [ ] Set: load list + members → `authorize_list_access(..., "edit_default_split")` → validate mode/shares → persist → commit
  - [ ] Get: authorize **member read** (`read_list` or equivalent member-read action) — any member may read; non-member denied per 2.2 disclosure
  - [ ] **Even today is implicit** (sole/current memberships; no `default_split_mode` column). Alembic **introduces** standing-default storage with create-time default **`even`** — this story adds durable mode + mutation, not “mutate an existing stored seed column”
  - [ ] Suggested persistence (not spine-locked — document final columns in completion notes):
    - List-level `default_split_mode`: `even` | `percentage`
    - Per-member share rows **or** JSON map keyed by member UUID with `NUMERIC` percentages — must round-trip exactly
  - [ ] New Alembic revision **after** `0006_last_opened_list` — never wipe PG volume (AD-22)
  - [ ] Extend existing `ListModel` / repositories — do **not** duplicate List/ListMembership

- [ ] Task 3: API edge — owner-only default-split mutations (AC: #1–#5)
  - [ ] Add to existing `api/api/routes/lists.py` (prefix `/lists`):
    - `GET /lists/{list_id}/default-split` → `{ mode, shares: [{ user_id, percentage }], … }` (member-readable)
    - `PUT` or `PATCH /lists/{list_id}/default-split` → `{ mode: "even" }` **or** `{ mode: "percentage", shares: [{ user_id, percentage }, ...] }`
  - [ ] Wire percent as **string** Decimal-safe values (e.g. `"50.00"`) — never JSON floats
  - [ ] Session required (1.3) → 401 unauthenticated
  - [ ] **Disclosure (match 2.2):** member-readable get for missing/non-member → **404** `list_not_found`; owner-denied mutate → **403** `not_list_owner`; non-member mutate → **403** `not_list_member`
  - [ ] Sum ≠ 100% / unknown member ids → **422** with clear message
  - [ ] Pydantic DTOs **snake_case**; keep `/health` working
  - [ ] **Member roster for % editor:** list detail / memberships-of-self is insufficient for “all members on this list.” Prefer one of: extend `GET /lists/{list_id}` detail DTO with members, add `GET /lists/{list_id}/members` (member-readable), or return member ids on the default-split GET when mode is `even`/`percentage`. Document choice in completion notes — do not block domain tests on UI roster

- [ ] Task 4: List-scoped owner UI (AC: #1–#4)
  - [ ] Owner control on **`ui/app/lists/[listId]/page.tsx`** (Soft-Ledger detail from 2.2) — even vs custom % per current member
  - [ ] Live sum / disable or reject save when ≠ 100%; clear validation copy
  - [ ] Non-owners: no edit affordance (read-only is enough)
  - [ ] Same-origin BFF (`ui/app/api/lists/...`) — never Bearer in `localStorage`
  - [ ] EN+ES in `ui/lib/i18n/lists.ts`; Warm Balance moss CTA, soft-not-pill corners; plain calm voice
  - [ ] **Forbidden UI:** Settings/profile product; Account-menu split controls; FR-10 Adjust-split disclosure (**3.2**)

- [ ] Task 5: Integration verification + CI (AC: #1–#5)
  - [ ] Postgres **16**: even after create; owner 60/40; reject 60/30; reject non-owner; AD-6 remainder on sample CRC (e.g. 100.00 / 3) → leftover on **`owner_id`**
  - [ ] Membership-change: seed extra member under percentage mode → apply-time falls back to even (Task 1 documented default)
  - [ ] pytest green; ui typecheck/lint; thin UI test for owner save / validation if practical
  - [ ] Generic fixtures only — no real PII

## Dev Notes

### Current SoT (enter here)

| Fact | Value |
|------|--------|
| Implementation base | **`origin/main` post-2.2** (`2-2` done there). Rebase/merge before coding if worktree tip is pre-2.2 |
| Already live | Epic 1 auth + lists; **2.1** create/rename; **2.2** ACL + list detail + `last_opened_list` |
| Not live | **2.3 / 2.4** invite runtime (story files / docs only) — seed memberships for multi-member |
| Creator / AD-6 | **`lists.owner_id` only** — never add `created_by` |
| Owner ACL action | **`edit_default_split`** in `api/domain/list_access.py` |
| Even today | Implicit via memberships — Alembic adds `default_split_mode` (+ shares) defaulting to `even` |
| Greenfield | Standing-default persistence + AD-6 allocate helper + default-split routes/UI |
| Local sprint-status | Worktree copy may still show 2.2 `ready-for-dev`; **`origin/main` is SoT** (2.2 `done`) |

### Epic context

Epic 2 = Shared lists & household membership (FR-6…FR-10). This story delivers **FR-9**: standing list default (even | percentage summing to 100%), owner-only edit, AD-6 remainder when % meets money.

| Sibling | Relationship |
|---------|--------------|
| **2.1** | Hard prereq — `owner_id` + create/rename owner pattern |
| **2.2** | Hard prereq — ACL + list detail host |
| **2.3** / **2.4** | Not code blockers — seed multi-member for tests/UI |
| **2.6** | Consumes list default when no override |
| **3.2** | Adjust-split UI on top of 2.5/2.6 |
| **3.4** / **FR-29** | Settle / reassign consume allocations & destination defaults |

### Hard prerequisites / ordering

```text
1.1 → 1.2 → 1.3 → 2.1 → 2.2 → 2.5 → 2.6 → 3.2
         (2.3 → 2.4 optional for invite demos; seed memberships meanwhile)
```

- Branch: `feat/2/2-5-configurable-list-default-split` (AD-13) — one story per branch
- Do not ship 2.6 override modes or 3.2 Adjust-split UI

### Scope boundaries

| In 2.5 | Out of 2.5 |
|--------|------------|
| Even among current members; owner % default (sum = 100%) | Item/receipt overrides (whole-line / absolute / %) — **2.6** |
| Reject bad sums; reject non-owner edit | Adjust-split UI — **3.2**; settle strip — Epic **3** |
| AD-6 allocate helper; member-readable get | Absolute/whole-line as **list** default |
| List-scoped owner UI on detail shell | Settings / Account split controls; invite create (2.3/2.4) |
| Membership-change → even fallback (documented default) | Delete / leave / transfer ownership |

**Forbidden:** `float` money · Bearer in `localStorage` · domain → FastAPI/SQLAlchemy · `ui` → DB · wipe PG volume · reinvent List/Membership/ACL · second creator column · parallel list stack · 2.6 override API · kit purple / pill CTAs / Inter-as-brand · real PII in fixtures.

### Critical ACL / product nuances

- **FR-8 peer equality** = expense/balance participation — **not** standing-default admin
- **FR-9** owner-only edit — same privilege class as rename / invite; wire **`edit_default_split`**
- Members may **read** the default; only owner mutates
- Inheritance is a **domain contract** for 2.6/3.2 — this story exposes get/apply; it does **not** create ledger items
- HTTP disclosure: reads hide existence (**404**); owner/member mutate denies stay **403** with distinct codes

### Architecture compliance

[Source: `ARCHITECTURE-SPINE.md`, `project-context.md`, `membership-acl-enforcement-sketch.md`]

- **AD-1 / AD-2 / AD-5 / AD-6 / AD-8 / AD-12 / AD-13 / AD-15 / AD-19 / AD-22** as in spine + project-context
- **AD-6:** floor % shares that sum to 100%; leftover minor unit → **`owner_id`** (list creator); helper shared with later item-% paths
- **AD-19:** use shared list-access port; owner exceptions include `edit_default_split`

**Gaps to close with documented defaults in completion notes:**

1. Spine ER has no share-allocation entity — invent persistence consistent with FR-9
2. REST/DTO names not spine-locked — match 2.1/2.2 lists style
3. Creator field = `owner_id` (already decided in 2.1)
4. Membership-change fallback = fall back to `even` (story default, not spine law)

### Library / framework requirements

Pins: lockfiles are truth. Do not bump majors inside this feature story.

| Piece | Pin / guidance | Notes |
|-------|----------------|-------|
| Python | 3.12+ | `decimal.Decimal` for all share math |
| FastAPI / Pydantic | 0.141.1 / 2.13.4 (lockfile) | Routes + snake_case DTOs |
| SQLAlchemy / Alembic / psycopg | 2.0.51 / 1.18.5 / 3.3.x | Models only in persistence |
| PostgreSQL | 16.x | Compose `db` — not SQLite |
| Next.js / React | 16.2.x / 19.2.x | Detail shell + BFF |
| Auth | 1.2/1.3 session dependency | `require_authenticated_user` |

**Reject:** money `float` · client-side share math as SoT · new auth libs · Redis · Node-primary split API · third-party money kit (prefer pure `Decimal` helper).

### Recommended API / UI shapes

```text
GET  /lists/{list_id}/default-split
  → 200 { mode: "even"|"percentage", shares: [{ user_id, percentage }], … }
  → 404 list_not_found (missing / non-member read)

PUT  /lists/{list_id}/default-split
  body: { "mode": "even" }
     | { "mode": "percentage", "shares": [{ "user_id": "...", "percentage": "60.00" }, ...] }
  → 200 updated DTO
  → 403 not_list_owner | not_list_member
  → 422 sum≠100% / unknown member ids

# Domain (tests now; 2.6/3.4 later):
# allocate_percentage_shares(total, shares, creator_user_id=owner_id, currency_exponent) -> mapping
```

UI on list detail beside other owner tools — **not** Account menu. Wire snake_case; map at UI edge.

### File structure requirements

```text
api/
  domain/list_access.py              # UPDATE only if action matrix/docs need it — already has edit_default_split
  domain/lists.py                    # UPDATE or sibling module — even/% validation helpers
  domain/<split_allocate>.py         # NEW — pure AD-6 allocate (Decimal)
  application/list_access.py         # REUSE AuthorizeListAccessService
  application/lists.py + ports.py    # UPDATE — Get/SetListDefaultSplit + repo methods
  adapters/persistence/models.py     # UPDATE — mode + shares on List (or related table)
  adapters/persistence/repositories.py
  adapters/persistence/migrations/versions/0007_*.py   # NEW after 0006_last_opened_list
  api/routes/lists.py                # UPDATE — GET/PUT default-split
  api/schemas/lists.py               # UPDATE — DTOs (string percentages)
  tests/test_*default_split*.py      # NEW — domain TDD + Postgres ACL/validation/AD-6
ui/
  app/lists/[listId]/page.tsx         # UPDATE — owner Default split control
  lib/i18n/lists.ts                  # UPDATE — EN+ES
  app/api/lists/[listId]/default-split/route.ts   # optional BFF forwarder
  app/lists/listsClient.ts           # UPDATE — client helpers
```

### Existing code being modified

| Path | State entering 2.5 (on main) | This story | Preserve |
|------|------------------------------|------------|----------|
| `api/adapters/persistence/models.py` (`ListModel.owner_id`) | Live | Add standing-default columns/relation | Same List entity; UUID PKs; **no** `created_by` |
| `api/domain/list_access.py` | Live — includes `edit_default_split` | Authorize set via that action | Fail-closed unknown actions; 404 vs 403 disclosure |
| `api/application/list_access.py` | Live | Reuse for get/set | No second ACL in Next |
| `api/application/lists.py` + `ports.py` | Live create/rename/detail | Add get/set default split | Existing list services |
| `api/api/routes/lists.py` + `schemas/lists.py` | Live `/lists` | Add `/default-split` | Same error helpers (`_list_not_found`, `_access_denied`) |
| `ui/app/lists/[listId]/page.tsx` | Live Soft-Ledger shell | Owner default-split editor | Empty settle until Epic 3 |
| `ui/app/api/lists/[listId]/route.ts` | Live BFF | Forward or sibling default-split BFF | Cookie session only |
| Auth (`api/api/deps.py`) | Live | Authenticate get/set | Same issuer |
| Money / allocate helpers | **Absent** | NEW domain AD-6 helper | Never float |

### Domain semantics — must not invent wrong

| Topic | Rule |
|-------|------|
| List default modes | `even` or standing **percentages** only |
| Percentage validation | Exactly 100% across **current** members or reject |
| Inheritance | New items use current list default until FR-10 override (2.6) |
| Remainder | Always list **creator** = `owner_id` — not payer, not first member, not user pref |
| Even definition | Equal among **current** members at apply-time |
| % + membership change | Fall back to `even` until owner re-saves (documented default) |
| Absolute / whole-line | Item override only (2.6) — never list default |

### UX / copy guardrails

[Source: `EXPERIENCE.md`, `DESIGN.md`]

- No Settings product; list-scoped tools follow Invite placement model (Invite runtime may still be absent — still host default-split on list detail)
- Adjust split disclosure = **3.2**, not 2.5
- Plain voice; errors = what happened + what to do; EN+ES; Warm Balance; phone-first same IA
- Account menu = language/theme/sign-out only (1.6)

### Testing requirements

- **Domain/unit (TDD):** even default; set % = 100%; reject ≠100%; reject non-owner; AD-6 → `owner_id`; sum to total; membership-change fallback
- **Integration (Postgres 16):** session cookie; 404/403 disclosure; persistence round-trip
- **UI:** thin owner save + validation if practical
- **Anti-patterns:** SQLite stand-in · float asserts · Playwright every PR · real emails/IBANs · browser-only share SoT

### Previous story intelligence

| Source | Carry into 2.5 |
|--------|----------------|
| **2.2** (done on main) | `authorize_list_access`; `edit_default_split` reserved; list detail shell; reads → 404; mutations → 403; File List filled — **extend, don’t replace** |
| **2.1** (done) | `owner_id` only (no `created_by`); even seed implicit; owner rename pattern; deferred configurable default UI to **2.5** |
| **2.3** / **2.4** | Story-only — standing default when members change is **2.5**; seed memberships until invite lands |
| **1.2** / **1.3** | Personal list + session/BFF; completion notes filled |
| **1.5.4 ACL sketch** | Owner actions: `rename_list`, `invite_member`, `edit_default_split` — keep living contract aligned |

### Git intelligence summary

`origin/main` includes `feat(2.2): membership-scoped lists homepage, detail ACL, and last-opened` and Epic 1 auth/lists history. Standing-default / AD-6 allocate code does **not** exist yet. Branch from post-2.2 main; Conventional Commits on `feat/2/2-5-…`; extend the lists + `list_access` modules — do not invent a parallel tree.

### Latest tech information

- **AD-6:** `(total * pct / 100)` → `quantize(..., rounding=ROUND_DOWN)` per share; assign `total - sum(floored)` to **`owner_id`**. No largest-remainder / first-N leftover schemes
- Prefer `Decimal("…")` strings; avoid `float`. For positive CRC floors use `ROUND_DOWN` (not `//` toward-zero surprises on edge cases)
- SQLAlchemy 2.0 `Mapped[]` + Alembic after `0006_last_opened_list`; import models in `env.py`
- Lockfile pins: fastapi `0.141.1`, sqlalchemy `2.0.51`, alembic `1.18.5`, pydantic `2.13.4`, pytest `9.x` — no churn
- No money library dependency — small domain helper only

### Project context reference

Follow `_bmad-output/project-context.md`. Highest-risk misses:

- Owner-only via **`edit_default_split`** — membership alone insufficient
- AD-6 → **`owner_id`** (not payer; not a new `created_by`)
- `Decimal` + API numeric strings; server-owned share math
- Hex + Alembic + Postgres 16; list-scoped UI (no Settings)
- Do not implement 2.6 overrides or 3.2 Adjust-split
- SoT order: ARCHITECTURE-SPINE + project-context + ACL sketch → SPEC/DESIGN/EXPERIENCE → PRD/epics

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` — Story 2.5 ACs; Epic 2; Stories 2.1–2.6, 3.2]
- [Source: `_bmad-output/planning-artifacts/prds/prd-finance-helper-2026-08-02/prd.md` — FR-9, FR-10, FR-8, NFR-3]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md` — AD-1, AD-5, AD-6, AD-8, AD-13, AD-15, AD-19, AD-22]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/membership-acl-enforcement-sketch.md` — `edit_default_split`]
- [Source: `_bmad-output/implementation-artifacts/1-5-4-membership-acl-enforcement-sketch.md`]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/reviews/review-adversarial-divergence.md` — Pair 9 AD-6]
- [Source: `_bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/EXPERIENCE.md`]
- [Source: `_bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/DESIGN.md`]
- [Source: `_bmad-output/implementation-artifacts/2-1-create-and-rename-owned-lists.md`]
- [Source: `_bmad-output/implementation-artifacts/2-2-lists-homepage-membership-scoped-access.md`]
- [Source: `_bmad-output/implementation-artifacts/2-3-invite-members-by-email.md`]
- [Source: `_bmad-output/implementation-artifacts/2-4-invitee-signup-lands-on-inviting-list.md`]
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
