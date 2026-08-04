# Story 2.2: Lists homepage — membership-scoped access

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a signed-in user,
I want a homepage of every list I belong to,
so that I can open the right household or personal list quickly.

## Acceptance Criteria

1. **Given** I am signed in and belong to one or more lists  
   **When** I open the Lists homepage (or first-paint fallback when no remembered list)  
   **Then** I see only lists I am a member of (FR-8, AD-19)  
   **And** each row shows list name (Warm Balance / Soft-Ledger list-row pattern per UX-DR7; balance figures may be zero/placeholder until Epic 3)

2. **Given** I am not a member of a list  
   **When** I request that list’s expenses or balances via API/UI  
   **Then** access is denied with **404** (same body as missing list) (NFR-3; Story 1.5.4 disclosure)

3. **Given** I select a list row  
   **When** navigation completes  
   **Then** I open that list’s detail surface (shared-expenses shell may be empty until Epic 3)  
   **And** that list becomes the remembered last-opened list for first paint (UX-DR9)

4. **Given** I sign in (or land authenticated with no invite deep link)  
   **When** first paint runs  
   **Then** I open the remembered last-opened list if I still belong to it; otherwise the Lists homepage (UX-DR9)

## Tasks / Subtasks

- [ ] Task 0: Confirm hard prerequisites (do not invent parallel stacks)
  - [ ] Epic 1: **1.2** User + `List` + `ListMembership` + session cookie; **1.3** sign-in/out + `proxy.ts` auth gate + stub first-paint landing
  - [ ] Story **2.1** create/rename owned lists implemented (or at least personal list from 1.2 exists so homepage has ≥1 membership). Prefer 2.1 done so multi-list membership is real
  - [ ] If 2.1 story file is missing when sequencing work: create `2-1-create-and-rename-owned-lists` via create-story first — do not reinvent create/rename inside this branch
  - [ ] Read 1.2 / 1.3 / 2.1 completion notes for: cookie name/issuer, BFF vs proxy mount, List/ListMembership schema, create-list API shapes
  - [ ] Branch: `feat/2/2-2-lists-homepage-membership-scoped-access` (AD-13) — one story per branch

- [ ] Task 1: Domain ACL port — membership authorization (AC: #1, #2) — TDD first
  - [ ] Red→green domain tests: member may read list-scoped resources; non-member denied; personal list member (sole) allowed; no product admin bypass
  - [ ] Implement a **domain ACL port** `authorize_list_access(acting_user_id, list_id, action) -> ListAccessGrant` invoked from application services — AD-19; protocol in `api/application/ports.py`; follow proposed AD-24: list-scoped repos require the grant — no bare `list_id`
  - [ ] Peers only (FR-8): membership grants read of list homepage row + expenses/balances stubs; owner-vs-viewer is **not** a product role for these reads
  - [ ] Keep owner-only actions out of this story’s new endpoints (rename = 2.1, invite = 2.3, default split = 2.5)
  - [ ] Domain has **no** FastAPI / SQLAlchemy imports (AD-1)

- [ ] Task 2: Application + persistence — “lists I belong to” + last-opened (AC: #1, #3, #4)
  - [ ] Use-case: list memberships for current user → ordered/stable list of lists (id, name; balance placeholder fields OK as `"0"` / null until Epic 3) — actor-scoped `list_for_user(acting_user_id)`; does **not** call per-list `authorize_list_access`
  - [ ] Use-case: open list detail / expenses|balances stub — **must** call ACL; missing list ≡ non-member → **404** with the same client-safe body (anti-enumeration; do **not** use 403 on these reads)
  - [ ] Use-case: set / read **last-opened list** for the authenticated user — set path is a member-gated mutation: missing/non-member → **403** `not_list_member`
  - [ ] **Decide and document in completion notes** where last-opened lives (pick one):
    - Preferred: account column on `User` (e.g. `last_opened_list_id` UUID nullable) via Alembic — aligns with Account-remembered language/theme pattern
    - Allowed: httpOnly cookie or same-origin client persistence — still must re-validate membership on first paint
  - [ ] First-paint rule: if remembered list id is set **and** user still holds membership → navigate to that list detail; else → Lists homepage (UX-DR9)
  - [ ] Invalidation: if membership lost (future invite remove / leave), first paint must fall back to homepage — never open a list the user no longer belongs to
  - [ ] Alembic only if schema needs last-opened (or ACL helpers) — never wipe PG volume (AD-22)

- [ ] Task 3: API routes — membership-scoped lists (AC: #1, #2, #3)
  - [ ] Authenticated endpoints (session cookie from 1.2/1.3) under `api/api/` — snake_case DTOs
  - [ ] Recommended shapes (rename only if 2.1 already fixed conventions):
    - `GET /api/lists` → membership-filtered rows `{ id, name, balance_crc? }` (balance may be `"0"` string placeholder; money as **string** never JSON number)
    - `GET /api/lists/{list_id}` → list detail shell DTO for members only; missing/non-member → **404**
    - `GET /api/lists/{list_id}/expenses` and/or `.../balances` → stub empty collections / zero balances for members; missing/non-member → **404** (NFR-3) — required even before Epic 3 ledger exists
    - `PUT` or `POST /api/me/last-opened-list` `{ list_id }` → set remembered list (member-only); missing/non-member → **403** `not_list_member`
    - Extend `GET /api/auth/me` (or equivalent) to include `last_opened_list_id` when useful for first paint
  - [ ] Unauthenticated → 401 (existing 1.3 gate); list-scoped **reads** → **404** for non-member/missing; never leak other users’ list names via enumeration bugs
  - [ ] Register routers in `api/api/app.py`; keep `/health` public
  - [ ] Wire structured JSON errors; no PII in info logs

- [ ] Task 4: UI — Lists homepage + list detail shell + first paint (AC: #1, #3, #4)
  - [ ] Replace 1.3 stub landing with real surfaces under authenticated App Router group:
    - Lists homepage: all memberships as **list rows** (name + balance placeholder owe/owed/zero) — UX-DR7 / DESIGN “Lists homepage (secondary glimpse)”
    - List detail: shared-expenses **shell** (nav with brand + list title; empty settle strip / empty receipts OK) — Soft-Ledger structure without inventing Epic 3 settle math
  - [ ] Row click → navigate to list detail **and** persist last-opened (API call)
  - [ ] First-paint router (post sign-in / cold authenticated open, **no invite deep link**): remembered list if still member → detail; else homepage
  - [ ] **Do not** steal Story 2.4 invite deep-link landing — leave a clear hook/comment so invite signup can land on inviting list instead of this first-paint path
  - [ ] Same-origin BFF/proxy only — `ui` → HTTP only (AD-1); never Bearer in `localStorage`
  - [ ] Visual: Warm Balance tokens — Manrope UI, Petrona for money if shown; moss accent; `rounded.sm` not pills; sand canvas; kits = unstyled primitives only (AD-12). Full Soft-Ledger settle strip polish = Story 3.1 — placeholder zero balances fine
  - [ ] EN+ES keys for homepage/detail chrome (structure for 1.6 if prefs already land)
  - [ ] Empty homepage copy: not journeyed — minimal functional empty/personal-only state OK; do not invent marketing copy
  - [ ] Next 16: keep **`proxy.ts`** coarse cookie redirect from 1.3; authoritative session + ACL still server-side / API

- [ ] Task 5: Tests + CI (AC: #1–#4)
  - [ ] Domain TDD: ACL allow/deny; first-paint membership re-check when last-opened stale
  - [ ] Integration on **Postgres 16**: user A’s `GET /lists` excludes list they are not a member of; A denied on B’s expenses/balances; selecting list updates last-opened; first paint respects membership
  - [ ] UI test-after: homepage renders member lists; non-member navigation/API path denied; first-paint fallback — maintain 1.1 coverage floor (60%)
  - [ ] Fixtures: generic vocabulary (`user@example.com`, “Personal”, “Household”) — no real PII
  - [ ] Do not require full Playwright every PR (AD-15)

## Dev Notes

### Epic context

Epic 2 = Shared lists & household membership (FR-6…FR-10). Demo gate = unregistered invite → signup → lands on inviting list (**Story 2.4**).

| Sibling | Relationship to 2.2 |
|---------|---------------------|
| **2.1 Create/rename** | Hard predecessor — additional owned lists populate homepage; rename ACL already uses membership |
| **2.2 (this)** | FR-8 homepage + membership-scoped read ACL + UX-DR9 first paint |
| 2.3 Invite by email | Needs reachable list detail + ACL ports to reuse |
| 2.4 Invitee lands | Must **not** be overridden by blank homepage / remember-last first paint |
| 2.5 / 2.6 Splits | Reuse membership enumeration + ACL |
| Epic 3 Soft-Ledger | Fills empty detail shell + real owe/owed on list rows |

**Primary FR:** FR-8 (peer access via membership). **NFR-3** denial. **AD-19** ACL. **UX-DR7** list rows. **UX-DR9** first paint / Lists homepage IA.

### Hard prerequisites / ordering

```text
1.1 scaffold → 1.2 User/List/ListMembership + cookie → 1.3 auth gate + stub landing
  → 2.1 create/rename lists
  → 2.2 lists homepage + membership ACL + first paint   ← you are here
```

- Do **not** implement 2.2 on the same branch as 2.1.
- Without 1.2/1.3 there is no membership graph or authenticated UI to hang this on.
- Homepage ACs are satisfiable with only the personal list, but sprint order expects 2.1 first so “lists I belong to” is multi-list.

### Scope boundaries (anti-scope)

| In 2.2 | Out of 2.2 |
|--------|------------|
| Lists homepage of memberships | Create/rename lists (2.1) |
| Domain ACL for list expenses/balances reads | Invites / SMTP (2.3–2.4) |
| List detail shared-expenses **shell** (empty OK) | Live settle math, Soft-Ledger strip polish (3.1 / 3.3) |
| Remember last-opened + first-paint routing | Invite deep-link post-signup landing (2.4) |
| Balance **placeholder** on rows | Default split UI (2.5); override API (2.6) |
| Peer membership reads | Owner-only invite/split; product admin role |
| API + UI deny non-members | Upload/import/review (Epic 4); card registration |

**Forbidden:** reinventing User/List/ListMembership · Bearer in `localStorage` · `ui` → DB · domain → FastAPI/SQLAlchemy · second ACL truth only in Next · global list admin · treating personal list as a separate entity type · building full settle-up / receipt lists · forcing Lists homepage after invitee signup (2.4) · SQLite as integration stand-in · kit purple / pill CTAs / Inter-as-brand.

### Architecture compliance

[Source: `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md`]

- **AD-1:** Hex layout; lists/membership/ACL live in `domain` + persistence; cookie/DTO edge in `api/api/`; `ui` → HTTP only
- **AD-8:** Reuse 1.2/1.3 httpOnly Secure cookie — single session issuer; same-origin BFF/proxy
- **AD-19:** Users are peers; read/write list ledger only with membership; personal list auto-created at signup; no product admin
- **Proposed AD-24 (review guidance — apply as practice):** list-scoped reads/writes through domain ACL port → `ListAccessGrant`; repos require that grant — do not rely on application-only checks with unscoped repos
- **Disclosure (Story 1.5.4):** list-scoped **reads** → **404** missing ≡ non-member; member-gated mutations (e.g. set last-opened) → **403** `not_list_member`; living contract: [`membership-acl-enforcement-sketch.md`](../planning-artifacts/architecture/architecture-finance-helper-2026-08-03/membership-acl-enforcement-sketch.md)
- **AD-12:** DESIGN.md + EXPERIENCE.md win; Warm Balance / Soft-Ledger; kits unstyled only
- **AD-5:** If any money fields appear on wire, `Decimal` / string amounts — never float / JSON numbers
- **AD-22:** Alembic for any last-opened column; never recreate PG volume
- **AD-13:** Branch `feat/2/2-2-…`; one story per branch
- **AD-15:** Domain ACL TDD; CI = lint + api pytest + ui typecheck/lint + critical ui tests

**Do not confuse:** Auth **session** (cookie) ≠ **Import Session** (AD-4).

### Library / framework requirements

Pins: lockfiles from Story 1.1 are truth. Do not bump majors inside this feature story.

| Piece | Pin / guidance | Notes |
|-------|----------------|-------|
| FastAPI / Pydantic / SQLAlchemy / Alembic | From lockfile (0.141.x / 2.13.x / 2.0.x / 1.18.x) | Models only in `adapters/persistence` |
| Next.js / React | 16.2.x / 19.2.x | App Router + `proxy.ts` (not deprecated `middleware.ts` for primary gate) |
| Session / argon2 | From 1.2/1.3 | Reuse — do not add Better Auth / NextAuth / Lucia |
| Vitest / pytest | From 1.1 | UI coverage floor 60%; domain TDD for ACL |

**Next.js 16 note (2026):** `proxy.ts` replaces `middleware.ts` for the network boundary; runs on Node. Use it for coarse cookie-presence redirects only — authoritative auth + ACL remain in server layouts / BFF / FastAPI (proxy alone is not a security boundary).

### File structure requirements

```text
api/
  application/ports.py          # UPDATE: authorize_list_access + ListAccessGrant protocol
  domain/…                      # NEW/UPDATE: membership ACL policy (no FastAPI/SQLAlchemy)
  application/…                 # NEW: ListMyLists, GetList, GetExpenses/Balances stubs, SetLastOpened
  adapters/persistence/…        # UPDATE: membership-scoped queries requiring ListAccessGrant; optional User.last_opened_list_id + Alembic
  api/routes/lists.py (or equiv)# NEW: membership-filtered list routes
  api/app.py                    # UPDATE: register list routers
  tests/…                       # NEW: domain ACL + Postgres membership scoping
ui/
  app/(authenticated)/lists/page.tsx           # NEW: Lists homepage
  app/(authenticated)/lists/[listId]/page.tsx  # NEW: shared-expenses shell
  app/… first-paint redirect helper            # NEW/UPDATE: UX-DR9 routing
  proxy.ts                                     # UPDATE only if matchers need list paths (from 1.3)
  components/… ListRow                         # NEW: name + placeholder balance
  i18n keys                                    # UPDATE: homepage/detail chrome EN+ES
```

### Existing code being modified

| Path | Expected state entering 2.2 | This story | Preserve |
|------|----------------------------|------------|----------|
| `api` User/List/ListMembership | From **1.2** (+ create/rename from **2.1**) | Membership queries + ACL; optional last-opened column | Same entity for personal/shared; UUID PKs; hex boundaries |
| `api` auth session + `/me` | From **1.2/1.3** | May expose `last_opened_list_id` | Same cookie issuer; `/health` public |
| `api/api/app.py` | Health (+ auth/list routers from prior stories) | Register list ACL routes | Do not drop health |
| `ui` authenticated stubs | From **1.3** stub lists/first-paint | Real homepage + detail shell + first paint | `proxy.ts` pattern; public sign-in/up/health |
| Persistence Alembic | Domain tables from 1.2+ | Additive revision only if needed | Never wipe volume |

**Codebase note (story creation time):** scaffold is health-only on disk until Epic 1/2.1 land. Treat prior story files as the contract; follow the live tree once those merge — do not invent `apps/` / Nx / parallel auth.

### Personal list + peer semantics (must not invent)

- Personal list = **same** `List` entity with one membership (FR-5 / 1.2) — always appears on homepage after signup
- Visibility = membership only (FR-8); no global admin
- Non-members cannot read expenses or balances (NFR-3 / CAP-2)
- Owner-only remains for rename/invite/default-split — **not** for homepage listing or expense/balance **reads** among members

### UX / IA guardrails

[Source: `EXPERIENCE.md`, `DESIGN.md`]

| Surface | Behavior |
|---------|----------|
| First paint | Remembered last-opened if still a member; else Lists homepage |
| Lists homepage | All lists the user belongs to; list row opens shared-expenses |
| Shared-expenses | Settle-up first / receipts below — **shell empty OK** until Epic 3 |
| List row | Name + balance owe/owed/zero (placeholder zero fine) |
| Invitee (J4) | Lands on inviting list — **not** blank home (Story 2.4 owns exception) |

- Empty lists copy: not journeyed — keep minimal
- Tab bar List / Upload / Account may exist as chrome stubs; do not build Upload flows here
- Voice: plain + direct; no bank jargon

### Testing requirements

- **Domain (TDD):** ACL allow member / deny non-member; last-opened ignored when membership gone
- **Integration (Postgres 16):** multi-user membership isolation on `GET /lists` and expenses/balances stubs; non-member **read** → **404**; `set_last_opened_list` non-member → **403**; last-opened write + first-paint decision
- **UI:** homepage membership filter; navigate to detail; first-paint fallback — test-after; keep coverage floor
- **Must-cover (project-context):** ACL non-member denied on **read and write** — for 2.2 at least **read** of expenses/balances as **404**; write denial is locked in the ACL sketch as **403** `not_list_member` (assert when ledger/import endpoints land)
- **Anti-patterns:** SQLite stand-in · PII fixtures · settle math only in browser · ACL only in Next without API enforcement · **403 on list-scoped reads**

### Previous story intelligence

**No `2-1-*.md` story file exists yet** at create time — treat epics Story 2.1 ACs + 1.2/1.3 as the predecessor contract.

From `1-2-sign-up-with-email-password-and-personal-list.md`:

- Prefer custom argon2-cffi + single session issuer; List = same entity personal/shared; personal = one membership
- Post-signup cold paint → Lists homepage if no remembered list — **this story makes that homepage real**
- Default split seed even (1-member ⇒ 100%) — do not re-open in 2.2

From `1-3-sign-in-sign-out-and-protect-routes.md`:

- Auth gate only; **membership ACL deferred to Epic 2** ← this story delivers it
- Stub lists/first-paint OK until Epic 2 — replace stubs here
- `proxy.ts` + server verify; signed-in visit to `/sign-in` → first-paint landing
- Explicit: do not implement AD-19 in 1.3

From Epic 1 context / project-context:

- UI coverage floor 60%; ruff + eslint/tsc gates
- Generic fixtures; money as string on wire

### Git intelligence

Recent commits are planning/story-context only (Epic 1 story files, sprint-status, project-context). Application patterns will come from 1.1–1.3 / 2.1 implementation commits — follow whatever those establish for cookie names, BFF paths, and List repo shapes. Prefer Conventional Commits aligned with `feat/2/…`.

### Latest tech information

- **Next.js 16.2.x:** use `proxy.ts` (export `proxy`) instead of `middleware.ts` for coarse redirects; Node runtime; not a sole auth boundary — verify session in layouts/BFF and enforce ACL on FastAPI
- **FastAPI 0.141.x / Pydantic 2.13.x / SQLAlchemy 2.0.x:** stick to lockfile pins; dependency injection for `acting_user_id` from session dependency
- Do not add Redis for last-opened preference

### Project context reference

Follow `_bmad-output/project-context.md` entirely. Highest-risk misses for this story:

- Skipping domain ACL and checking membership only in the UI
- Unscoped repositories that accept bare `list_id`
- Breaking invitee landing later by hardcoding “always Lists homepage” after every signup
- Building full Soft-Ledger settle strip / Epic 3 math here
- Separate “personal list” table or type
- Bearer / `localStorage` session
- Float money or JSON number amounts on placeholder balances
- Using `middleware.ts` as the primary Next 16 gate name

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` — Epic 2 / Story 2.2]
- [Source: `ARCHITECTURE-SPINE.md` — AD-1, AD-8, AD-19, capability map]
- [Source: `reviews/review-adversarial-divergence.md` — proposed AD-24 ACL choke]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/membership-acl-enforcement-sketch.md` — Story 1.5.4 contract]
- [Source: `EXPERIENCE.md` — IA First paint / Lists homepage / List row]
- [Source: `DESIGN.md` — Lists homepage secondary glimpse; Warm Balance tokens]
- [Source: `prd.md` — FR-8, NFR-3]
- [Source: `_bmad-output/project-context.md`]
- [Source: implementation-artifacts `1-2-…`, `1-3-…`]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

---

## Story completion status

Status: **ready-for-dev**

Completion note: Ultimate context engine analysis completed — comprehensive developer guide created (2026-08-03). Disclosure aligned with Story 1.5.4 (reads → 404; mutations → 403; ListAccessGrant) on 2026-08-04. Sketch path linked after Story 1.5.4 landed (2026-08-04).
