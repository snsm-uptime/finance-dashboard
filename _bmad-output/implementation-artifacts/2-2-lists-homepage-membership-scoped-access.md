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
   **And** each row shows list name **plus** owe / owed / zero token treatment per UX-DR7 (Warm Balance / Soft-Ledger list-row pattern; placeholder amount e.g. `"0"` OK until Epic 3)

2. **Given** I am not a member of a list  
   **When** I request that list’s expenses or balances via API/UI  
   **Then** access is denied with **404** and body `{"detail": "List not found.", "code": "list_not_found"}` (same body as missing list) (NFR-3; Story 1.5.4 disclosure)

3. **Given** I select a list row  
   **When** navigation completes  
   **Then** I open that list’s detail surface (Soft-Ledger shell: brand + list title nav; settle-first / receipts-below — empty OK until Epic 3)  
   **And** that list becomes the remembered last-opened list for first paint (UX-DR9)

4. **Given** I sign in (or land authenticated with no invite deep link)  
   **When** first paint runs  
   **Then** I open the remembered last-opened list if I still belong to it (revalidated via `authorize_list_access(..., "read_list")`); otherwise the Lists homepage (UX-DR9)

## Tasks / Subtasks

- [ ] Task 0: Confirm hard prerequisites (do not invent parallel stacks)
  - [ ] **Epic 1.5 critical-path pause (sprint):** do **not** start Story 2.2+ until Stories **1.5.1–1.5.5** are done (epics sequencing). Story 2.1 may remain in review until that path completes — if 1.5.1–1.5.5 are incomplete, **HALT**
  - [ ] **Mandatory read** before coding: [`membership-acl-enforcement-sketch.md`](../planning-artifacts/architecture/architecture-finance-helper-2026-08-03/membership-acl-enforcement-sketch.md) — action matrix, error/disclosure policy, caller map for 2.2. Implementation must match that sketch; update the sketch in the **same PR** if this story adds list-scoped operations
  - [ ] Epic 1: **1.2** User + `List` + `ListMembership` + session cookie; **1.3** sign-in/out + `proxy.ts` auth gate + stub first-paint landing — already landed
  - [ ] Story **2.1** create/rename owned lists is **done** — live: `ListMembershipsService` + `GET|POST /lists` + `PATCH /lists/{list_id}` + `ui/app/lists/*` create/rename. Prefer multi-list membership for real homepage rows
  - [ ] **Grandfather 2.1 rename HTTP:** missing list ≡ non-member rename → **403** `not_list_member` (as-built). Do **not** “fix” rename to 404 in this story — that needs an explicit policy-change story. New **reads** use 404; member-gated **mutations** (incl. set last-opened) use 403 per sketch
  - [ ] Read 1.2 / 1.3 / 2.1 / 1.5.4 completion notes + sketch for: cookie name/issuer (`fh_session`), BFF vs FastAPI path split, List/ListMembership schema, create/rename ACL codes, preference pattern on `UserModel` (`language`/`theme` via `/auth/me`)
  - [ ] Branch: `feat/2/2-2-lists-homepage-membership-scoped-access` (AD-13) — one story per branch

- [ ] Task 1: Domain ACL port — membership authorization (AC: #1, #2, #4) — TDD first
  - [ ] Red→green domain tests: member may read list-scoped resources; non-member denied; personal list member (sole) allowed; unknown `action` → deny; no product admin bypass; grant/`list_id` mismatch rejected at repo
  - [ ] Implement domain ACL port `authorize_list_access(acting_user_id, list_id, action) -> ListAccessGrant` invoked from application services — AD-19; protocol in `api/application/ports.py`; follow proposed AD-24: list-scoped repos require the grant — no bare `list_id` on **new** 2.2 use cases
  - [ ] **Action vocabulary (sketch — pin these; aliases per sketch OK):**
    - Member-sufficient: `read_list`, `read_expenses` (≡ `read_ledger`), `read_balances`, `set_last_opened_list`
    - Owner-required (exist / migrate later — do not change 2.1 HTTP): `rename_list`
  - [ ] Peers only (FR-8): membership grants read of list homepage row + expenses/balances stubs; owner-vs-viewer is **not** a product role for these reads
  - [ ] Keep owner-only actions out of this story’s new endpoints (rename = 2.1 grandfathered, invite = 2.3, default split = 2.5)
  - [ ] Domain has **no** FastAPI / SQLAlchemy imports (AD-1)

- [ ] Task 2: Application + persistence — extend membership listing + last-opened (AC: #1, #3, #4)
  - [ ] **Extend** existing `ListMembershipsService` / `list_for_user(acting_user_id)` — do **not** invent a parallel `ListMyLists` use-case. Actor-scoped enum does **not** call per-list `authorize_list_access`
  - [ ] Extend membership row summary to keep **`id`, `name`, `owner_id`, `role`** (live wire + rename UI need these) and add optional **`balance_crc`** (or equivalent) as string placeholder `"0"` / null until Epic 3 — money as **string**, never JSON number
  - [ ] Use-case: open list detail / expenses|balances stub — **must** call `authorize_list_access` with `read_list` / `read_expenses` / `read_balances`; missing list ≡ non-member → **404** `list_not_found` body (anti-enumeration; do **not** use 403 on these reads)
  - [ ] Use-case: set last-opened — member-gated mutation via `authorize_list_access(..., "set_last_opened_list")`; missing/non-member → **403** `not_list_member`
  - [ ] **Last-opened done path (preferred — only justified alternative):** account column on `User` — `last_opened_list_id` UUID nullable — via Alembic; expose on `GET /auth/me` (+ set via authenticated write matching language/theme preference pattern). Cookie / client-only persistence allowed **only** with documented justification in completion notes; still must re-validate membership on first paint
  - [ ] First-paint rule: if remembered list id is set **and** `authorize_list_access(..., "read_list")` grants → navigate to that list detail; else → Lists homepage (UX-DR9). Do **not** use ad-hoc “membership id contains” checks that skip the ACL port
  - [ ] Invalidation: if membership lost (future invite remove / leave), first paint must fall back to homepage — never open a list the user no longer belongs to
  - [ ] Alembic only for `last_opened_list_id` (or ACL helpers) — never wipe PG volume (AD-22)

- [ ] Task 3: API routes — extend live lists router (AC: #1, #2, #3)
  - [ ] Authenticated endpoints (session cookie from 1.2/1.3) under `api/api/routes/lists.py` — **extend**, do not replace create/rename
  - [ ] **Path split (pin both):**
    - FastAPI (internal): prefix `/lists` (live router) — `GET /lists`, `GET /lists/{list_id}`, stubs under `/lists/{list_id}/…`
    - UI BFF (browser): `/api/lists` → forwards to FastAPI `/lists` (already true for GET collection + PATCH)
  - [ ] Wire shapes (extend existing DTOs — preserve `owner_id` / `role`):
    - `GET /lists` → membership-filtered rows `{ id, name, owner_id, role, balance_crc? }` (balance may be `"0"` string placeholder)
    - `GET /lists/{list_id}` → list detail shell DTO for members only; missing/non-member → **404** `list_not_found`
    - `GET /lists/{list_id}/expenses` and/or `.../balances` → stub empty collections / zero balances for members; missing/non-member → **404** `list_not_found` (NFR-3) — required even before Epic 3 ledger exists
    - Set last-opened via account preference path (preferred): e.g. `PATCH /auth/me` body field `last_opened_list_id` **or** a dedicated authenticated write that updates `UserModel.last_opened_list_id` after ACL — do **not** invent a disconnected `/api/me/…` prefs subtree. Prefer same `/auth/me` pattern as language/theme
  - [ ] **Error bodies (locked — assert `code` in tests):**
    | Case | HTTP | Body |
    |------|------|------|
    | Unauthenticated | 401 | Existing session gate |
    | List-scoped **reads** missing ≡ non-member | **404** | `{"detail": "List not found.", "code": "list_not_found"}` |
    | `set_last_opened_list` missing ≡ non-member | **403** | `{"detail": "You do not have access to this list.", "code": "not_list_member"}` |
    | 2.1 rename missing ≡ non-member (grandfather) | **403** | `not_list_member` — do not change |
  - [ ] Unauthenticated → 401; never leak other users’ list names via enumeration bugs on **reads**
  - [ ] Register any new routers in `api/api/app.py`; keep `/health` public
  - [ ] Wire structured JSON errors; no PII in info logs

- [ ] Task 4: UI — polish Lists homepage + Soft-Ledger detail shell + first paint (AC: #1, #3, #4)
  - [ ] **Polish/extend** live `ui/app/lists/` — do **not** invent `(authenticated)/lists/…` and do **not** wipe 2.1 create/rename (`ListsPanel`, `listsClient`, BFF PATCH)
    - Lists homepage (`ui/app/lists/page.tsx` + panel): membership rows with **name + owe/owed/zero token treatment** (UX-DR7 must-check; placeholder amount OK)
    - List detail (`ui/app/lists/[listId]/page.tsx` or equivalent under `ui/app/lists/`): Soft-Ledger shell — nav with **brand + list title**; settle-first / receipts-below structure (empty OK until Epic 3)
  - [ ] Row click → navigate to list detail **and** persist last-opened (API call)
  - [ ] Named first-paint landing resolver — implement `resolveAuthenticatedLanding({ inviteListId? })` (name may live under `ui/lib/` or `ui/app/`); replace ad-hoc “always `/lists`” and leave a single choke for Story 2.4 invite deep-link. **Call sites that hardcode `/lists` today (must route through resolver or document why not):**
    - `ui/app/page.tsx`
    - `ui/app/sign-in/signInClient.ts` (`safeReturnTo` default)
    - `ui/app/sign-in/page.tsx` (signed-in redirect)
    - `ui/app/signup/SignupForm.tsx` / `signup/page.tsx`
    - `ui/app/forgot-password/page.tsx`, `ui/app/reset-password/page.tsx`
    - `ui/components/AccountMenu.tsx` (nav may stay `/lists` intentionally — homepage chrome)
    - Proxy / returnTo defaults as applicable
  - [ ] First-paint (post sign-in / cold authenticated open, **no invite deep link**): remembered list if still member via ACL → detail; else homepage
  - [ ] Same-origin BFF/proxy only — `ui` → HTTP only (AD-1); never Bearer in `localStorage`
  - [ ] **BFF extend:** `ui/app/api/lists/[listId]/route.ts` is PATCH-only today — add GET detail (+ expenses/balances stub forwarding) matching FastAPI paths; keep PATCH rename
  - [ ] Visual: Warm Balance tokens — Manrope UI, Petrona for money if shown; moss accent; `rounded.sm` not pills; sand canvas; kits = unstyled primitives only (AD-12). Full Soft-Ledger settle strip polish = Story 3.1 — placeholder zero balances fine
  - [ ] EN+ES keys for homepage/detail chrome (structure for 1.6 if prefs already land)
  - [ ] Empty homepage copy: not journeyed — minimal functional empty/personal-only state OK; do not invent marketing copy
  - [ ] Next 16: keep **`proxy.ts`** coarse cookie redirect from 1.3; authoritative session + ACL still server-side / API

- [ ] Task 5: Tests + CI (AC: #1–#4)
  - [ ] Domain TDD: ACL allow/deny; unknown action deny; first-paint membership re-check when last-opened stale (via `read_list` grant path)
  - [ ] Integration on **Postgres 16**: user A’s `GET /lists` excludes list they are not a member of; A denied on B’s expenses/balances with **404** + `code=list_not_found`; selecting list updates `last_opened_list_id`; first paint respects membership
  - [ ] **Assert wire `code` fields**, not HTTP status alone (reads → `list_not_found`; set last-opened deny → `not_list_member`)
  - [ ] UI test-after: homepage renders member lists with UX-DR7 row treatment; non-member navigation/API path denied; first-paint fallback — maintain 1.1 coverage floor (60%)
  - [ ] Fixtures: generic vocabulary (`user@example.com`, “Personal”, “Household”) — no real PII
  - [ ] Do not require full Playwright every PR (AD-15)

## Dev Notes

### Epic context

Epic 2 = Shared lists & household membership (FR-6…FR-10). Demo gate = unregistered invite → signup → lands on inviting list (**Story 2.4**).

| Sibling | Relationship to 2.2 |
|---------|---------------------|
| **2.1 Create/rename** | **Done predecessor** — live membership listing + create/rename; this story polishes homepage, adds ACL port, detail shell, first paint |
| **2.2 (this)** | FR-8 homepage polish + membership ACL port + UX-DR9 first paint |
| 2.3 Invite by email | Needs reachable list detail + ACL ports to reuse |
| 2.4 Invitee lands | Must **not** be overridden by blank homepage / remember-last first paint — use `resolveAuthenticatedLanding({ inviteListId })` |
| 2.5 / 2.6 Splits | Reuse membership enumeration + ACL |
| Epic 3 Soft-Ledger | Fills empty detail shell + real owe/owed on list rows |

**Primary FR:** FR-8 (peer access via membership). **NFR-3** denial. **AD-19** ACL. **UX-DR7** list rows. **UX-DR9** first paint / Lists homepage IA.

### Hard prerequisites / ordering

```text
1.1 scaffold → 1.2 User/List/ListMembership + cookie → 1.3 auth gate
  → 1.5.1–1.5.5 critical path (sketch 1.5.4 mandatory)   ← gate before 2.2+
  → 2.1 create/rename lists (done)
  → 2.2 lists homepage + membership ACL + first paint   ← you are here
```

- Do **not** implement 2.2 on the same branch as 2.1.
- Sprint: do not start 2.2+ until Epic 1.5 critical path (1.5.1–1.5.5) is done.
- Without 1.2/1.3 there is no membership graph or authenticated UI to hang this on.
- Homepage ACs are already partially satisfied by 2.1’s membership list UI; this story adds ACL port, detail shell, last-opened, UX-DR7 row polish, and first-paint resolver.

### Scope boundaries (anti-scope)

| In 2.2 | Out of 2.2 |
|--------|------------|
| Polish Lists homepage of memberships (extend 2.1 UI) | Wipe/replace 2.1 create/rename |
| Domain ACL port for list expenses/balances reads | Changing 2.1 rename 403 → 404 |
| Soft-Ledger detail **shell** (brand + title; settle/receipts empty OK) | Live settle math, Soft-Ledger strip polish (3.1 / 3.3) |
| Remember last-opened on account + first-paint routing | Invite deep-link post-signup landing logic beyond the resolver hook (2.4) |
| Balance **placeholder** + owe/owed/zero tokens on rows | Default split UI (2.5); override API (2.6) |
| Peer membership reads | Owner-only invite/split; product admin role |
| API + UI deny non-members on reads (404) | Upload/import/review (Epic 4); card registration |
| Extend BFF GET on `/api/lists/[listId]` | Inventing parallel greenfield `ListMyLists` / `(authenticated)/lists` tree |

**Forbidden:** reinventing User/List/ListMembership · greenfield rewrite of `GET /lists` · dropping `owner_id`/`role` from membership DTO · Bearer in `localStorage` · `ui` → DB · domain → FastAPI/SQLAlchemy · second ACL truth only in Next · global list admin · treating personal list as a separate entity type · building full settle-up / receipt lists · forcing Lists homepage after invitee signup (2.4) · SQLite as integration stand-in · kit purple / pill CTAs / Inter-as-brand · “fixing” 2.1 rename to 404 · ad-hoc first-paint membership contains-check that skips `authorize_list_access(..., "read_list")`.

### Architecture compliance

[Source: `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md`]

- **AD-1:** Hex layout; lists/membership/ACL live in `domain` + persistence; cookie/DTO edge in `api/api/`; `ui` → HTTP only
- **AD-8:** Reuse 1.2/1.3 httpOnly Secure cookie (`fh_session`) — single session issuer; same-origin BFF/proxy
- **AD-19:** Users are peers; read/write list ledger only with membership; personal list auto-created at signup; no product admin
- **Proposed AD-24 (review guidance — apply as practice):** list-scoped reads/writes through domain ACL port → `ListAccessGrant`; repos require that grant — do not rely on application-only checks with unscoped repos for **new** 2.2 use cases (2.1 rename remains a known migration target)
- **Disclosure (Story 1.5.4):** list-scoped **reads** → **404** missing ≡ non-member (`list_not_found`); member-gated mutations (e.g. set last-opened) → **403** `not_list_member`; living contract: [`membership-acl-enforcement-sketch.md`](../planning-artifacts/architecture/architecture-finance-helper-2026-08-03/membership-acl-enforcement-sketch.md)
- **AD-12:** DESIGN.md + EXPERIENCE.md win; Warm Balance / Soft-Ledger; kits unstyled only
- **AD-5:** If any money fields appear on wire, `Decimal` / string amounts — never float / JSON numbers
- **AD-22:** Alembic for `last_opened_list_id`; never recreate PG volume
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

**Extend as-built 2.1 tree** (see 2.1 File List). Do not invent `(authenticated)/` route groups or a parallel my-lists service.

```text
api/
  application/ports.py                    # UPDATE: authorize_list_access + ListAccessGrant protocol
  domain/…                                # NEW/UPDATE: membership ACL policy (no FastAPI/SQLAlchemy)
  application/lists.py                    # EXTEND: keep ListMembershipsService; add detail/stub/last-opened use-cases
  adapters/persistence/models.py          # UPDATE: UserModel.last_opened_list_id (+ Alembic)
  adapters/persistence/repositories.py    # UPDATE: grant-gated list-scoped methods; enum stays list_for_user
  api/routes/lists.py                     # EXTEND: GET /lists/{id}, expenses/balances stubs (prefix /lists)
  api/routes/auth.py                      # EXTEND: expose/set last_opened_list_id on /auth/me pattern
  api/schemas/lists.py                    # EXTEND: keep owner_id/role; optional balance_crc
  api/app.py                              # UPDATE only if new routers split out
  tests/…                                 # NEW/UPDATE: domain ACL + Postgres membership scoping (assert codes)

ui/
  app/lists/page.tsx                      # EXTEND: UX-DR7 row polish (keep create/rename entry)
  app/lists/ListsPanel.tsx                # EXTEND: row navigate + last-opened; preserve create/rename
  app/lists/[listId]/page.tsx             # NEW: Soft-Ledger detail shell (brand + title; settle/receipts empty)
  app/lists/listsClient.ts                # EXTEND: detail/stub/last-opened helpers
  app/api/lists/route.ts                  # KEEP: GET collection + POST create
  app/api/lists/[listId]/route.ts         # EXTEND: add GET (+ stub forwards); keep PATCH rename
  lib/… resolveAuthenticatedLanding       # NEW: named first-paint / landing resolver
  proxy.ts                                # UPDATE only if matchers need list detail paths
  components/… (optional ListRow)         # NEW/EXTEND: name + owe/owed/zero tokens
  lib/i18n/lists.ts                       # UPDATE: homepage/detail chrome EN+ES
```

### Existing code being modified

| Path | Expected state entering 2.2 | This story | Preserve |
|------|----------------------------|------------|----------|
| `api/application/lists.py` | **2.1:** `CreateOwnedList`, `RenameList`, `ListMembershipsService` | Add ACL-backed detail/stub/last-opened; extend membership DTO with optional balance | Keep create/rename + enum services |
| `api/api/routes/lists.py` | `GET\|POST /lists`, `PATCH /lists/{id}`; prefix `/lists` | Add GET detail + expense/balance stubs | Do not drop create/rename; keep 403 rename mapping |
| `api/api/schemas/lists.py` | `{ id, name, owner_id, role }` membership items | Add optional `balance_crc`; do not drop `owner_id`/`role` | Rename UI needs `owner_id` |
| `api` auth session + `/auth/me` | language/theme on `UserModel` | Prefer `last_opened_list_id` same pattern | Same cookie issuer; `/health` public |
| `ui/app/lists/*` | 2.1 create/rename + membership list | Polish homepage rows + detail shell + last-opened | Do not wipe create/rename |
| `ui/app/api/lists/[listId]` | PATCH-only | Add GET/detail/stub forwarding | Keep PATCH |
| Persistence Alembic | Domain tables from 1.2 + prefs | Additive `last_opened_list_id` only | Never wipe volume |

**As-built note:** Epic 1 + Story 2.1 are implemented in this tree. Treat [`2-1-create-and-rename-owned-lists.md`](./2-1-create-and-rename-owned-lists.md) File List + completion notes as the predecessor contract — not a health-only scaffold.

### Personal list + peer semantics (must not invent)

- Personal list = **same** `List` entity with one membership (FR-5 / 1.2) — always appears on homepage after signup
- Visibility = membership only (FR-8); no global admin
- Non-members cannot read expenses or balances (NFR-3 / CAP-2) → **404** `list_not_found`
- Owner-only remains for rename/invite/default-split — **not** for homepage listing or expense/balance **reads** among members

### Locked error / action matrix (from 1.5.4 sketch)

| Operation | Mechanism | Deny |
|-----------|-----------|------|
| Homepage `GET /lists` | `list_for_user(acting_user_id)` — no per-list ACL | N/A (actor-scoped) |
| List detail | `authorize_list_access(..., "read_list")` | 404 `list_not_found` |
| Expenses / balances stubs | `authorize_list_access(..., "read_expenses" \| "read_balances")` | 404 `list_not_found` |
| Set last-opened | `authorize_list_access(..., "set_last_opened_list")` | 403 `not_list_member` |
| First-paint revalidation | `authorize_list_access(..., "read_list")` for remembered id | Fall back to homepage |
| Rename (2.1 grandfather) | Ad-hoc owner check today; migrate later | 403 `not_list_member` / `not_list_owner` |

### UX / IA guardrails

[Source: `EXPERIENCE.md`, `DESIGN.md`]

| Surface | Behavior |
|---------|----------|
| First paint | Remembered last-opened if `read_list` grants; else Lists homepage — via `resolveAuthenticatedLanding` |
| Lists homepage | All lists the user belongs to; **UX-DR7:** row name + owe/owed/zero token treatment (placeholder amount OK) |
| Shared-expenses detail | Soft-Ledger: brand + list title in nav; settle-up first / receipts below — **shell empty OK** until Epic 3 |
| Invitee (J4) | Lands on inviting list — **not** blank home (Story 2.4 owns exception via resolver `inviteListId`) |

- Empty lists copy: not journeyed — keep minimal
- Tab bar List / Upload / Account may exist as chrome stubs; do not build Upload flows here
- Voice: plain + direct; no bank jargon

### Testing requirements

- **Domain (TDD):** ACL allow member / deny non-member; unknown action deny; last-opened ignored when membership gone
- **Integration (Postgres 16):** multi-user membership isolation on `GET /lists` and expenses/balances stubs; non-member **read** → **404** + `list_not_found`; `set_last_opened_list` non-member → **403** + `not_list_member`; last-opened write + first-paint decision
- **Wire codes:** assert `code` on denial responses — status alone is insufficient
- **UI:** homepage membership filter + UX-DR7 row treatment; navigate to detail; first-paint fallback — test-after; keep coverage floor
- **Must-cover (project-context):** ACL non-member denied on **read and write** — for 2.2 at least **read** of expenses/balances as **404**; write denial for last-opened as **403** `not_list_member`
- **Anti-patterns:** SQLite stand-in · PII fixtures · settle math only in browser · ACL only in Next without API enforcement · **403 on list-scoped reads** · **404 on set-last-opened / rename mutations** without policy-change story

### Previous story intelligence

**Story 2.1 is done** — see File List in [`2-1-create-and-rename-owned-lists.md`](./2-1-create-and-rename-owned-lists.md). Key as-built facts:

- FastAPI: `GET|POST /lists`, `PATCH /lists/{list_id}` (prefix `/lists`); UI BFF: `/api/lists`, `/api/lists/[listId]` (PATCH)
- `ListMembershipsService` → actor-scoped membership list with `{ id, name, owner_id, role }`
- Rename ACL: non-member / missing → 403 `not_list_member`; member-non-owner → 403 `not_list_owner`
- UI: `ui/app/lists/page.tsx`, `ListsPanel.tsx`, `listsClient.ts`; rename affordance via `owner_id`
- Session: opaque `fh_session`, `require_authenticated_user`

From `1-2-sign-up-with-email-password-and-personal-list.md`:

- Prefer custom argon2-cffi + single session issuer; List = same entity personal/shared; personal = one membership
- Post-signup cold paint → Lists homepage if no remembered list — **this story makes remembered-list first paint real**
- Default split seed even (1-member ⇒ 100%) — do not re-open in 2.2

From `1-3-sign-in-sign-out-and-protect-routes.md`:

- Auth gate only; **membership ACL deferred to Epic 2** ← this story delivers the shared port
- Stub lists/first-paint OK until Epic 2 — **polish/extend** 2.1 Lists surface here (stubs already replaced by create/rename UI)
- `proxy.ts` + server verify; signed-in visit to `/sign-in` → landing resolver

From `1-5-4` / sketch:

- Action matrix + disclosure policy are the contract; 2.2 implements the port
- Do not silently change 2.1 rename HTTP behavior

From Epic 1 context / project-context:

- UI coverage floor 60%; ruff + eslint/tsc gates
- Generic fixtures; money as string on wire
- Account prefs (`language`/`theme`) on `UserModel` + `/auth/me` — mirror for `last_opened_list_id`

### Git intelligence

Follow patterns from Epic 1 + Story **2.1** implementation commits (lists router, membership DTO, BFF cookie forward, `fh_session`). Prefer Conventional Commits aligned with `feat/2/…`. Predecessor file inventory: 2.1 File List (not “git patterns TBD”).

### Latest tech information

- **Next.js 16.2.x:** use `proxy.ts` (export `proxy`) instead of `middleware.ts` for coarse redirects; Node runtime; not a sole auth boundary — verify session in layouts/BFF and enforce ACL on FastAPI
- **FastAPI 0.141.x / Pydantic 2.13.x / SQLAlchemy 2.0.x:** stick to lockfile pins; dependency injection for `acting_user_id` from session dependency
- Do not add Redis for last-opened preference — account column preferred

### Project context reference

Follow `_bmad-output/project-context.md` entirely. Highest-risk misses for this story:

- Skipping domain ACL and checking membership only in the UI (or ad-hoc contains-check on first paint)
- Unscoped repositories that accept bare `list_id` on **new** use cases
- Dropping `owner_id`/`role` from membership DTOs (breaks rename UI)
- Inventing FastAPI `/api/lists` or UI `(authenticated)/lists/` instead of live prefixes/paths
- Replacing 2.1 Lists page and wiping create/rename
- Breaking invitee landing later by hardcoding “always Lists homepage” after every signup — use `resolveAuthenticatedLanding`
- Building full Soft-Ledger settle strip / Epic 3 math here
- Separate “personal list” table or type
- Bearer / `localStorage` session
- Float money or JSON number amounts on placeholder balances
- Using `middleware.ts` as the primary Next 16 gate name
- “Fixing” 2.1 rename 403 → 404 without a policy story

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` — Epic 2 / Story 2.2]
- [Source: `ARCHITECTURE-SPINE.md` — AD-1, AD-8, AD-19, capability map]
- [Source: `reviews/review-adversarial-divergence.md` — proposed AD-24 ACL choke]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/membership-acl-enforcement-sketch.md` — Story 1.5.4 contract (**mandatory read**)]
- [Source: `EXPERIENCE.md` — IA First paint / Lists homepage / List row (UX-DR7 / UX-DR9)]
- [Source: `DESIGN.md` — Lists homepage secondary glimpse; Warm Balance / Soft-Ledger]
- [Source: `prd.md` — FR-8, NFR-3]
- [Source: `_bmad-output/project-context.md`]
- [Source: implementation-artifacts `1-2-…`, `1-3-…`, `1-5-4-…`, `2-1-…` (File List)]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

---

## Story completion status

Status: **ready-for-dev**

Completion note: Ultimate context engine analysis completed — comprehensive developer guide created (2026-08-03). Disclosure aligned with Story 1.5.4 (reads → 404; mutations → 403; ListAccessGrant) on 2026-08-04. Sketch path linked after Story 1.5.4 landed (2026-08-04). Story context quality review applied **all** improvements (critical 1–9, enhancements 10–14, optimizations 15–17) on 2026-08-06 — aligned with as-built 2.1, path split, ACL sketch, last-opened-on-account, landing resolver, Soft-Ledger shell, and epics AC #2 404 wording.
