# Story 2.1: Create and rename owned lists

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an authenticated user,
I want to create additional named lists I own and edit their names,
so that I can organize spending beyond my personal list.

## Acceptance Criteria

1. **Given** I am signed in  
   **When** I create a new list with a name  
   **Then** I own that list and it appears among lists I belong to  
   **And** I may own more than one list (FR-6)

2. **Given** I own a list  
   **When** I edit its name  
   **Then** the new name is visible to members of that list

3. **Given** I am not a member of a list  
   **When** I attempt to rename it  
   **Then** the action is rejected (membership ACL / NFR-3)

4. **Given** I am a member but not the owner of a list *(PRD FR-6 / NFR-3 owner-only — stronger than AC3 alone)*  
   **When** I attempt to rename it  
   **Then** the action is rejected

5. **Given** I am not authenticated  
   **When** I attempt to create or rename a list  
   **Then** the action is rejected (401 / auth gate from Story 1.3)

## Tasks / Subtasks

- [ ] Task 0: Confirm Epic 1 list + auth primitives exist (prerequisite)
  - [ ] Stories **1.2** (User / List / ListMembership + signup personal list) and **1.3** (session cookie + auth-gated routes) must be implemented
  - [ ] If missing: **HALT** — do not invent a parallel user/list/auth stack; finish 1.2 → 1.3 first
  - [ ] Reuse the **exact** session cookie issuer, membership schema, and hex ports from 1.2/1.3 completion notes — do not re-open AD-8 forks

- [ ] Task 1: Domain — create owned list + rename rules (AC: #1–#5) — TDD first
  - [ ] Red→green domain tests before routes/UI:
    - Authenticated create → list with non-empty name → creator is **owner** + **member**
    - User may own personal list **plus** additional lists (multi-own)
    - Owner rename updates name; members reading that list see the new name
    - Non-member rename → rejected
    - Member-but-not-owner rename → rejected (FR-6)
    - Empty / whitespace-only name → rejected with clear validation error
  - [ ] Persist **list creator** at create time (AD-6 remainder → list creator later). Treat creator ≡ owner at creation; no ownership transfer in v1
  - [ ] Seed **even default split** among members on create (FR-9 continuity for Story 2.5): 1-member new list ⇒ 100% to creator — same seed logic as 1.2 personal list; **no** split UI here
  - [ ] Same `List` entity as personal lists — **never** a separate “shared list” type/table
  - [ ] Domain free of FastAPI / SQLAlchemy imports (AD-1)

- [ ] Task 2: Application use-cases + persistence ports (AC: #1–#5)
  - [ ] `CreateOwnedList` / `RenameList` (names may vary) in `api/application/` — orchestrate ports only
  - [ ] Atomic create: list row → membership (owner) → even-split seed in one transaction
  - [ ] Rename: load list → authorize owner → update name → commit
  - [ ] Extend 1.2 repositories; do **not** duplicate User/List/ListMembership models
  - [ ] If 1.2 omitted durable `owner_id` / `created_by` / name column: Alembic revision **only** for the gap — never wipe PG volume (AD-22)

- [ ] Task 3: API edge — auth-gated list mutations (AC: #1–#5)
  - [ ] FastAPI routes under `api/api/` (suggested shape — not locked by spine; match Epic 1 style):
    - `POST /api/lists` — body `{ "name": "..." }` → created list DTO (id, name, …) + membership implies “appears among lists I belong to”
    - `PATCH /api/lists/{list_id}` — body `{ "name": "..." }` → updated list DTO
  - [ ] Require authenticated session (reuse 1.3 dependency); unauthenticated → 401
  - [ ] Non-member / non-owner rename → 403 (or project’s structured ACL error); do not leak existence details beyond what membership ACL already allows
  - [ ] Pydantic DTOs **snake_case** on the wire; never return password/secrets
  - [ ] Keep `/health` working; structured logs — no PII spam

- [ ] Task 4: Minimal UI to exercise create + rename (AC: #1–#2)
  - [ ] Enough authenticated UI to create a named list and rename an owned list — **not** the full Lists homepage / first-paint memory contract (Story **2.2**)
  - [ ] Submit via same-origin BFF or proxied `/api` — reuse 1.2/1.3 auth path; never Bearer in `localStorage`
  - [ ] After create: new list visible in whatever membership-scoped list surface already exists (1.3 stub or thin list of memberships) — if none, add a **minimal** membership list + create control only
  - [ ] Rename: affordance on an owned list (inline edit or simple form) — updated name visible after refresh/navigation
  - [ ] Visual: Warm Balance-compatible chrome if feasible (Manrope, moss CTA `rounded.sm` 8px — not pill); strip kit purple. Full Soft-Ledger = Story 3.1
  - [ ] EN+ES keys for create/rename chrome + validation/ACL errors (UX-DR18 / project-context). Empty-state copy remains **not journeyed** — minimal functional strings OK
  - [ ] **Do not** invent a Settings/profile product or list-admin dashboard

- [ ] Task 5: Integration verification + CI (AC: #1–#5)
  - [ ] Postgres **16** integration (Compose `db`): signed-in create → owner + membership + even-split seed; second list allowed; owner rename persists; non-member + non-owner member rename denied; unauthenticated denied
  - [ ] pytest green; ui typecheck/lint green; thin UI test for create/rename path if practical (coverage floor from 1.1)
  - [ ] No secrets/PII committed; fixtures use generic vocabulary (`user@example.com`, “Household”, etc.)

## Dev Notes

### Epic context

Epic 2 = Shared lists & household membership (FR-6…FR-10). Demo gate = unregistered invite → signup → land on inviting list (Stories 2.3–2.4).

This story delivers **FR-6 only**: create additional owned named lists + rename. Downstream:

| Story | Depends on 2.1 for |
|-------|-------------------|
| 2.2 | Lists homepage rows / membership listing polish |
| 2.3 | Owned list to invite into |
| 2.5 | Standing default-split edit on lists that already seed even on create |
| Epic 4 | Destination pickers include membership lists |

### Scope boundaries (anti-scope)

| In 2.1 | Out of 2.1 |
|--------|------------|
| Create additional owned named lists | Full Lists homepage / first-paint memory (2.2) |
| Owner rename; name visible to members | Invites / SMTP (2.3, 2.4) |
| Reject non-member **and** non-owner rename | Configurable % default-split UI (2.5) |
| Even default-split **seed** on create | Item/receipt override API/UI (2.6 / Epic 3) |
| Minimal create/rename UI + auth-gated API | Soft-Ledger token system (3.1); real settle balances |
| Reuse 1.2 List + ListMembership | Delete list / leave list / transfer ownership (not in v1) |
| | Profile/Settings product; marketing empty-state copy |

**Forbidden:** Separate personal vs shared list entity types · reinventing auth/session · Bearer in `localStorage` · wiping PG volume · auto-create tables outside Alembic · building Story 2.2 homepage polish “while we’re here” · float money (N/A for names) · real PII in fixtures.

### Critical ACL nuance (do not under-implement)

- Story AC3 only tests **non-member** deny.
- **PRD FR-6:** names are **editable by the owner**.
- Story **2.3** / **2.5** reject **member-but-not-owner** for invite / default-split.
- **Implement owner-only rename** (AC4). Membership alone is insufficient for rename.

Peer equality (FR-8) applies to expenses/balances/split **participation** — not to owner-only admin actions (create is always “I become owner”; rename/invite/default-split are owner-only).

### Architecture compliance

[Source: `ARCHITECTURE-SPINE.md`, `project-context.md`]

- **AD-1:** Hex — rules in `domain`/`application`; ORM in `adapters/persistence`; HTTP/cookie in `api/api/`; `ui` → HTTP only
- **AD-2:** Still exactly `db` | `api` | `ui`
- **AD-6:** Split remainder → **list creator** — durable creator/owner at create
- **AD-8:** Reuse 1.2/1.3 httpOnly Secure cookie session — single issuer
- **AD-12:** DESIGN.md + EXPERIENCE.md win over mocks; no dedicated create/rename journey — keep functional
- **AD-13:** Branch `feat/2/2-1-create-and-rename-owned-lists`; one story per branch; Conventional Commits
- **AD-15:** Domain TDD; CI = lint · api pytest · ui typecheck/lint · critical ui tests
- **AD-19:** Membership for list R/W; peers; no product admin; personal list already from signup
- **AD-22 / NFR-13:** Alembic only; never recreate operator PG volume

### Library / framework requirements

Pins: **lockfiles are truth** after Story 1.1. Do not bump majors inside this feature story.

| Piece | Pin / guidance | Notes |
|-------|----------------|-------|
| FastAPI / Pydantic | 0.141.x / 2.13.x (lockfile) | Route + DTOs at API edge |
| SQLAlchemy / Alembic / psycopg | 2.0.x / 1.18.x / 3.3.x | Models only in persistence; `Mapped[]` + `mapped_column` style |
| PostgreSQL | 16.x | Integration tests against Compose `db` — **not SQLite** |
| Auth stack | From 1.2 completion notes | argon2-cffi / session shape already chosen |
| Next.js / React | 16.2.x / 19.2.x | Minimal App Router UI + BFF/proxy path |

**Reject:** SQLModel-as-HTTP-shape · new auth libraries · Redis · Node-primary list API.

### File structure requirements

Extend Epic 1 tree (paths may match 1.2/1.3 naming — follow actual tree):

```text
api/
  domain/…                    # NEW/EXTEND: create/rename/ACL rules (pure)
  application/…               # NEW: CreateOwnedList, RenameList use-cases + ports
  adapters/persistence/       # EXTEND: List/Membership repos; Alembic only if schema gap
  api/routes/…                # NEW: lists router; register on app
  tests/…                     # NEW: domain unit + Postgres integration
ui/
  app/…                       # EXTEND/NEW: minimal create + rename on authenticated surface
  …                           # i18n keys EN+ES for chrome/errors
```

REST paths above are **suggested**. Spine does not lock `/api/lists` — stay consistent with Epic 1 `/api/auth/*` style and document final paths in completion notes.

### Existing code being modified (UPDATE files)

**As of story-creation time:** only Story **1.1** scaffold exists in the working tree (health + empty hex packages). Stories 1.2–1.3 are `ready-for-dev` but **not implemented**. Treat the table below as **post-1.2/1.3** reality — if those stories have not landed, stop at Task 0.

| Path | Expected state after 1.2/1.3 | This story | Preserve |
|------|------------------------------|------------|----------|
| `api/adapters/persistence/*` List/Membership models | Users, lists, membership (+ session?) | Create/rename persistence ops; optional Alembic for owner/name gaps | Same entity; UUID PKs; Alembic workflow |
| `api/domain/*` + `application/*` | Signup + personal-list rules; auth ports | Extend with create/rename use-cases | Do not fork parallel list model |
| `api/api/*` | Auth routes + `/health` | Add lists router; auth dependency on mutations | Keep `/health` + auth cookie contract |
| Session / current-user dependency | From 1.3 | Reuse for list mutations | Single session issuer |
| `ui` authenticated shell / lists stub | From 1.3 | Wire create + rename | Do not replace with full 2.2 homepage |
| CI | Lint + pytest (+ Postgres if 1.2 added it) | List ACL integration tests | Keep ruff / eslint / tsc gates |

### UX / copy guardrails

[Source: `EXPERIENCE.md`, `DESIGN.md`]

- **No dedicated create/rename journey or mock** — implement functional controls without inventing Settings
- Lists homepage list-row / Warm Balance balance scan / first-paint memory = **Story 2.2** (UX-DR7, UX-DR9)
- `list-settle.html` shows list **title** in detail nav — rename must update that title when detail exists; do not build settle UI here
- Errors: what happened + what to do; calm ACL failures
- Account menu is **not** list management (1.6)

### Testing requirements

- **Domain/unit (TDD):** create → owner+member+even seed; multi-own; owner rename; deny non-member; deny non-owner member; reject blank name; unauthenticated rejected at edge
- **Integration (Postgres 16):** HTTP + session cookie create/rename; ACL 403s; DB membership rows correct
- **UI:** thin create/rename path test if practical; maintain 1.1 coverage floor
- **Do not:** SQLite stand-in; Playwright every PR; real emails/IBANs in fixtures

### Previous story intelligence

From `1-2-sign-up-with-email-password-and-personal-list.md` (ready-for-dev; **must land before 2.1**):

- `List` = same entity for personal and shared; personal = owned + one membership
- Atomic signup: user → list → membership; even-split seed (1-member ⇒ 100%)
- **Explicit anti-scope:** “Additional lists (FR-6 / Epic 2)” — that is **this** story
- Models only under `adapters/persistence/`; domain/application free of SQLAlchemy
- Prefer custom argon2; close JWT vs opaque + BFF vs proxy in **1.2 completion notes** — 2.1 consumes those choices

From `1-3-sign-in-sign-out-and-protect-routes.md`:

- Auth gate only — membership ACL for list data is Epic 2 (starts here for write/rename)
- Stub lists page OK until Epic 2; first-paint memory polish is 2.2
- Next 16: prefer `proxy.ts` (not deprecated `middleware.ts`) per that story

From `1-1-scaffold-compose-app-with-health-checks.md` / current tree:

- Hex seed + Alembic baseline empty; `/health` only until 1.2
- Toolchains: api **ruff** + pytest; ui ESLint + `tsc --noEmit`; Vitest coverage floor **60%** on `lib/**`
- Env: `DATABASE_URL`, `API_INTERNAL_URL`, `SESSION_SECRET`

### Git intelligence

Recent commits are planning/BMAD story-context adds (`1.5`, `1.6`, sprint-status). Application scaffold is largely **uncommitted** on `feat/1/1-1-…`. After Epic 1 lands, follow Conventional Commits + `feat/2/2-1-…` branch. No list CRUD code patterns exist yet — mirror auth route module style from 1.2/1.3.

### Latest tech information

- **SQLAlchemy 2.0:** prefer `Mapped[T]` + `mapped_column`; unified `select()`; avoid legacy `Query` API. UUID PKs via SQLAlchemy `Uuid` / `UUID(as_uuid=True)` — project mandates UUID PKs for lists (do **not** switch to int PK + public UUID unless spine changes).
- **Alembic:** import all models in `env.py` so autogenerate sees them; review autogenerate diffs (indexes/constraints); schema changes via revision only.
- **FastAPI + sessions:** keep per-request session dependency pattern from 1.2; commit/rollback at use-case or repo boundary consistently.
- **Pins (api lockfile as of 1.1 scaffold):** fastapi `0.141.1`, sqlalchemy `2.0.51`, alembic `1.18.5`, psycopg `3.3.4`, pydantic `2.13.4`, pytest `9.1.1` — do not churn inside this story.

### Project context reference

Follow `_bmad-output/project-context.md` entirely. Highest-risk misses for this story:

- Owner-only rename (FR-6) — not membership-only
- Reuse 1.2 List entity + even-split seed; persist list creator (AD-6)
- Auth cookie / BFF only — never Bearer in `localStorage`
- Hex: domain free of FastAPI/SQLAlchemy; ORM only in persistence
- Alembic only; Postgres 16 for integration; UUIDs; snake_case wire
- Do not steal Story 2.2 homepage / first-paint scope
- SoT order: ARCHITECTURE-SPINE + project-context → SPEC/DESIGN/EXPERIENCE → PRD/epics → README/research

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` — Story 2.1, Epic 2]
- [Source: `_bmad-output/planning-artifacts/prds/prd-finance-helper-2026-08-02/prd.md` — FR-5, FR-6, FR-8, FR-9, NFR-3, Lists narrative]
- [Source: `_bmad-output/specs/spec-finance-helper/SPEC.md` — CAP-2]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md` — AD-1, AD-6, AD-8, AD-13, AD-15, AD-19, AD-22, ER, Capability map]
- [Source: `_bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/EXPERIENCE.md` — Lists homepage, list row, empty state]
- [Source: `_bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/DESIGN.md` — Soft-Ledger / Warm Balance]
- [Source: `_bmad-output/implementation-artifacts/1-2-sign-up-with-email-password-and-personal-list.md`]
- [Source: `_bmad-output/implementation-artifacts/1-3-sign-in-sign-out-and-protect-routes.md`]
- [Source: `_bmad-output/implementation-artifacts/1-1-scaffold-compose-app-with-health-checks.md`]
- [Source: `_bmad-output/implementation-artifacts/epic-1-context.md`]
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
