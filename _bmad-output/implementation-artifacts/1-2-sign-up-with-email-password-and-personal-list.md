---
baseline_commit: c0114a76b3109b544a0b2d47cb6d39c7f077eec3
---

# Story 1.2: Sign up with email/password and personal list

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a new user,
I want to create an account with email and password and immediately get a personal list,
so that I can start owning expenses without a separate setup step.

## Acceptance Criteria

1. **Given** I am not registered  
   **When** I sign up with a valid email and password  
   **Then** my password is stored hashed (never plaintext) and I am authenticated (httpOnly Secure session cookie per AD-8)  
   **And** the system creates exactly one personal list I own (FR-5)  
   **And** signing up with an email that already exists is rejected

2. **Given** email verification is not required for this deployment (FR-4 off)  
   **When** signup succeeds  
   **Then** I can use the app without a verification step

## Tasks / Subtasks

- [x] Task 0: Confirm Story 1.1 scaffold exists (prerequisite)
  - [x] `api/`, `ui/`, Compose `db`/`api`/`ui`, Alembic ready, `/health` on api+ui, lockfiles, CI lint — **must be present before coding 1.2**
  - [x] If 1.1 is not done: stop and finish `1-1-scaffold-compose-app-with-health-checks` first

- [x] Task 1: Close AD-8 forks and wire auth deps (AC: #1)
  - [x] **Choose and document in completion notes** (pick one each):
    - Library: **prefer custom `argon2-cffi` 25.x + signed/opaque cookie sessions** (fastapi-users 15.x is maintenance-mode — allowed only if speed wins; document why)
    - Session shape: JWT-in-cookie **or** opaque session id stored in DB — one only
    - Delivery: Next Route Handler BFF **and/or** reverse-proxy `/api` → api — **single session issuer** (api sets the only cookie, or BFF holds opaque session — no dual independent cookies)
  - [x] Add deps to `api` lockfile: `argon2-cffi` (25.x line; latest verified **25.1.0**) and any cookie/signing helpers needed; do **not** add Better Auth / Prisma / NextAuth / Lucia
  - [x] Add env placeholders: session secret, cookie name/Secure/SameSite notes, optional `EMAIL_VERIFICATION_REQUIRED=false` (FR-4 off for this story)
  - [x] Never put Bearer tokens in `localStorage` or expose secrets via `NEXT_PUBLIC_*`

- [x] Task 2: Persistence — users, lists, membership (+ session if opaque) (AC: #1)
  - [x] SQLAlchemy models **only** under `api/adapters/persistence/` — UUID PKs; unique email; password hash column (never plaintext)
  - [x] `List` = same entity for personal and shared; personal = owned list with **one** membership (not a separate type/table)
  - [x] `ListMembership` linking user ↔ list (owner + sole member on signup)
  - [x] Alembic migration(s) for these tables — **never** recreate PG volume; never auto-create domain tables outside Alembic (AD-22 / NFR-13)
  - [x] Wire repositories / ports so `domain` and `application` stay free of SQLAlchemy imports

- [x] Task 3: Domain + application signup use-case (AC: #1, #2) — TDD first
  - [x] Red→green domain/application tests: valid signup → user + exactly one owned personal list + membership; duplicate email → rejected; password never stored plaintext
  - [x] Atomic transaction: create user → create personal list → create membership → (session issued at API edge)
  - [x] Default split for new lists is even among members (FR-9 seed): 1-member personal list ⇒ 100% to creator — no split UI in this story
  - [x] FR-4 off path: no verification gate in the signup use-case when verification config is false/absent
  - [x] Generic vocabulary in fixtures — no real PII / personal names

- [x] Task 4: API auth cookie edge — register route (AC: #1, #2)
  - [x] FastAPI route under `api/api/` (e.g. register/signup) — Pydantic DTOs snake_case on the wire
  - [x] On success: set **httpOnly Secure** session cookie (SameSite appropriate for first-party); return success payload without password fields
  - [x] Duplicate email → structured JSON error (reject); do not leak internals; avoid email-enumeration patterns on auth failures where applicable
  - [x] Keep `/health` working; structured logs — never log plaintext passwords
  - [x] Domain has **no** FastAPI imports; cookie issuance stays at the API edge

- [x] Task 5: UI standalone signup surface (AC: #1, #2)
  - [x] Standalone signup page (email + password) — **outside** invite flows (invitee landing = Epic 2 / Story 2.4)
  - [x] Submit via same-origin BFF or proxied `/api` — not browser→public API with Bearer storage
  - [x] On success: user is authenticated (cookie set) and can use the app with no verification step when FR-4 is off
  - [x] Post-signup navigation: cold first paint → Lists homepage if no remembered list (EXPERIENCE); empty-state copy is **not** journeyed — minimal functional landing OK
  - [x] Visual: Warm Balance-compatible form chrome if feasible — Manrope for UI/buttons, moss primary CTA (`rounded.sm` 8px, not pill); strip kit purple defaults. Full Soft-Ledger tokens = Story 3.1 — do not invent locked marketing copy
  - [x] EN+ES keys for signup chrome/errors if i18n scaffolding exists from 1.1/1.6 prep; otherwise structure copy for later i18n — Account menu prefs = Story 1.6

- [x] Task 6: Integration verification + CI (AC: #1, #2)
  - [x] Integration test against **Postgres 16** (Compose `db`): signup → hashed password in DB → session cookie → exactly one list + membership; duplicate email rejected; FR-4-off usable
  - [x] pytest green in CI; ui typecheck/lint remain green; thin ui test for signup form/submit path if practical (coverage floor from 1.1 still holds)
  - [x] Confirm no secrets/PII committed; `.env.example` updated with session/verification placeholders only

## Dev Notes

### Epic context

Epic 1 = Accounts & personal workspace (FR-1…FR-5). Demo gate: authenticated user with personal list — this story delivers the **signup + personal list** half; Story 1.3 completes sign-in/out and route protection.

Sibling stories (do **not** implement here): 1.3 sign-in/out · 1.4 password reset/SMTP · 1.5 verification-on path · 1.6 Account EN/ES + theme · Epic 2 invitee landing on inviting list.

### Scope boundaries (anti-scope)

| In 1.2 | Out of 1.2 |
|--------|------------|
| Email + password register | Google/OAuth/social login (explicitly dropped) |
| Argon2 (or fastapi-users) hash + httpOnly Secure cookie | Bearer in `localStorage`; dual session cookies |
| Exactly one personal list + membership at signup | Additional lists (FR-6 / Epic 2); invite flows (FR-7) |
| Alembic users/lists/membership (+ session if opaque) | Password reset SMTP (1.4); verification-enabled gate (1.5) |
| Standalone signup UI + same-origin cookie path | Full route protection / sign-out UI (1.3); Account menu (1.6) |
| FR-4 **off** usable without verify | Profile/display name/settings product |
| Domain TDD for signup rules | Full Warm Balance Soft-Ledger (3.1); Playwright every PR |

**Forbidden:** Better Auth / Prisma / NextAuth as auth SoT · separate “personal list” entity type · hardwiring personal list as only import default (FR-12) · plaintext password storage/logging · Redis/worker · inventing locked standalone-auth marketing copy or multi-step onboarding wizard · committing real emails as fixtures.

### Architecture compliance

[Source: `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md`]

- **AD-1:** Hex layout; `ui` → HTTP only; `domain` imports no FastAPI/SQLAlchemy/pdfplumber — signup rules in domain/application; persistence in adapters; cookie edge in `api/api/`
- **AD-2:** Still exactly `db` | `api` | `ui` — do not add Redis for sessions unless spine changes (opaque session row in Postgres is fine)
- **AD-8:** Email+password; httpOnly Secure cookie (JWT or opaque); same-origin via reverse proxy and/or Next BFF; Bearer-in-client-storage forbidden; library may be fastapi-users **or** custom argon2 + signed cookies
- **AD-8 review tightening:** **single session issuer** — close JWT vs opaque and BFF vs proxy forks in this story’s completion notes
- **AD-19:** Membership ACL; personal list **auto-created at signup**; users are peers — no product admin role
- **AD-22 / NFR-13:** Alembic for user/list tables; never wipe operator PG volume
- **AD-13:** Branch `feat/1/1-2-sign-up-with-email-password-and-personal-list` (or `feat/1/1.2`); one story per branch
- **AD-15:** Domain TDD for signup/list creation; CI merge = lint + api pytest + ui typecheck/lint (+ critical ui tests as they exist)

### Library / framework requirements

Pins: respect **lockfiles from Story 1.1** as truth for FastAPI/Next/SQLAlchemy majors. Add only what this story needs.

| Piece | Pin / guidance | Notes |
|-------|----------------|-------|
| argon2-cffi | **25.x** (verified **25.1.0** on PyPI as of research) | Preferred path per Story 1.1 + version-reality review |
| fastapi-users | **15.x** (e.g. 15.0.5) | Allowed by AD-8 but **maintenance mode** since ~2025-10 — prefer custom argon2 unless documenting speed tradeoff |
| Session signing | itsdangerous / Starlette SessionMiddleware / custom JWT — pick one consistent with opaque-vs-JWT choice | Single issuer |
| SQLAlchemy / Alembic / psycopg | From 1.1 lockfile (2.0.x / 1.18.x / 3.3.x majors) | Models only in `adapters/persistence` |
| Next.js / React | From 1.1 lockfile (16.2.x / 19.2.x) | Signup via App Router + BFF if chosen |

**Reject for this story:** Better Auth, Prisma, Drizzle, Lucia, NextAuth-as-SoT, Node-primary API.

### File structure requirements

Extend the 1.1 seed (paths may vary slightly once 1.1 lands — follow actual tree):

```text
api/
  domain/…                 # signup/list membership rules (pure)
  application/…            # SignUp use-case / ports
  adapters/persistence/    # User, List, ListMembership (+ Session?) models + Alembic revision
  api/…                    # register route + cookie issuance (+ health unchanged)
  tests/…                  # domain unit + Postgres integration signup
ui/
  app/…                    # /signup (or equivalent) + optional BFF route handlers
  …                        # form components; i18n keys if scaffolded
.env.example               # UPDATE: session secret, verification flag stub
docker-compose*.yml        # UPDATE only if new env vars required
```

### Existing code being modified (after 1.1)

| Path | Expected state after 1.1 | This story | Preserve |
|------|--------------------------|------------|----------|
| `api/adapters/persistence/*` + Alembic | Empty/baseline — **no domain tables** | First users/lists/membership migration | Keep Alembic workflow; never wipe volume |
| `api/api/*` | `/health` only | Add register + cookie edge | Keep `/health` contract |
| `api/pyproject.toml` / lockfile | FastAPI stack locked | Add argon2 (and/or fastapi-users) | Do not churn unrelated pins |
| `ui/app/**` | Neutral shell + `/health` | Signup page + same-origin API path | Keep standalone Docker/`HOSTNAME` behavior |
| `.env.example` | DB/API placeholders | Session + FR-4-off flag | Placeholders only — no real secrets |
| CI workflow | Lint + thin tests | Signup domain/integration tests | Keep ruff / eslint / tsc gates |

**Greenfield note:** As of story-creation time, `api/` and `ui/` do **not** exist yet (1.1 is `ready-for-dev`). Treat 1.1 outputs as the base; do not invent a parallel layout (`apps/`, `packages/`, Nx).

### Personal list semantics (must not invent)

- Same **List** entity as shared lists; personal = single-member owned list at signup
- Exactly **one** at signup (FR-5)
- Available later as a review destination; **not** the hardwired-only import default (FR-12 / Epic 4)
- Default display name string is **not** journeyed — pick a simple generic default (e.g. localized “Personal”) and note it in completion notes; do not invent a separate product type

### UX / copy guardrails

[Source: `EXPERIENCE.md`, `DESIGN.md`, `project-context.md`]

- Standalone auth is **spine-only backlog** — functional email+password form; no invented multi-step onboarding
- Errors: what happened + what to do; calm; no email enumeration theatre
- No profile/settings; Account menu chrome = Story 1.6
- Invitee signup climax (land on inviting list) = Epic 2 — not this story’s post-signup path

### Testing requirements

- **Domain/unit (TDD):** signup creates user + one list + membership; duplicate email fails; hash ≠ plaintext
- **Integration (Postgres 16):** full register HTTP path sets httpOnly cookie; DB state correct; FR-4-off has no verify step
- **UI:** form submit path smoke/unit as practical; maintain 1.1 coverage floor
- **Do not:** SQLite as stand-in for integration; real PII in fixtures; require full Playwright for merge

### Previous story intelligence

From `1-1-scaffold-compose-app-with-health-checks.md` (ready-for-dev; not yet implemented):

- **Explicit handoff:** “no domain tables yet (users/lists land in 1.2)”
- Auth library deferred to 1.2; **prefer custom argon2** over fastapi-users maintenance risk
- Prefer Next BFF / reverse-proxy `/api` over `NEXT_PUBLIC_API_URL` for auth
- Single session issuer when auth lands
- Toolchains locked in 1.1: api **ruff**; ui ESLint + `tsc --noEmit`; UI coverage floor **60%**
- Env contract: `DATABASE_URL` (api), `API_INTERNAL_URL=http://api:8000` (ui server)

### Git intelligence

Recent commits are planning/BMAD only (`sprint-status`, `project-context`, epics). No application code patterns on `main` yet. After 1.1 merges, follow conventions established there (Conventional Commits, branch naming). For this story expect first domain migration + auth surface commits.

### Latest tech information

- **argon2-cffi 25.1.0** — current 25.x line; Python-only package with `argon2-cffi-bindings` dependency; supports Python 3.12+
- **fastapi-users 15.0.5** — still published but project is in **maintenance mode** (security/deps only; no new features). Prefer custom argon2 sessions unless documenting a deliberate speed tradeoff
- Cookie Secure flag: enable in prod / HTTPS; local Compose may need documented SameSite/Secure exceptions — note operator reality in README/dev notes without weakening AD-8 for prod overlay

### Project context reference

Follow `_bmad-output/project-context.md` entirely. Highest-risk misses for this story:

- Auth: httpOnly Secure cookie / same-origin BFF only — never Bearer in `localStorage`
- Auth errors: generic — no email enumeration
- Alembic only for schema; UUIDs for users/lists/sessions
- Hex: domain free of FastAPI/SQLAlchemy
- Secrets never via `NEXT_PUBLIC_*`
- Personal list = same list entity, one member
- SoT order: ARCHITECTURE-SPINE + project-context → SPEC/DESIGN/EXPERIENCE → PRD/epics → README/research

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` — Story 1.2, Epic 1]
- [Source: `_bmad-output/implementation-artifacts/epic-1-context.md`]
- [Source: `_bmad-output/implementation-artifacts/1-1-scaffold-compose-app-with-health-checks.md`]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md` — AD-8, AD-19, Stack, ER]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/stack-options.md`]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/reviews/review-version-reality.md` — fastapi-users maintenance]
- [Source: `_bmad-output/planning-artifacts/prds/prd-finance-helper-2026-08-02/prd.md` — FR-1, FR-4, FR-5, NFR-1]
- [Source: `_bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/EXPERIENCE.md` — standalone auth backlog, first paint]
- [Source: `_bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/DESIGN.md` — button-primary, tokens]
- [Source: `_bmad-output/project-context.md`]

## Dev Agent Record

### Agent Model Used

Cursor Grok 4.5 (bmad-dev-story)

### Debug Log References

- Domain/unit: `uv run pytest tests/test_signup_domain.py tests/test_health.py` — green
- Integration: Postgres 16 container + `DATABASE_URL=… uv run pytest tests/test_signup_integration.py` — 5 passed
- Full api pytest — 12 passed; ruff check/format — green
- UI: `npm run lint`, `typecheck`, `test:coverage` — green (statements ≥60%)

### Completion Notes List

- AD-8 decisions: **custom argon2-cffi 25.1.0** (not fastapi-users); **opaque session token in Postgres `sessions` table**; **api is single cookie issuer**; ui BFF at `/api/auth/register` forwards `Set-Cookie` only (no dual cookies, no Bearer/localStorage).
- Personal list default name: `"Personal"` (generic; not journeyed).
- Local HTTP: `SESSION_COOKIE_SECURE=false` in `.env.example`; prod overlay defaults Secure to true.
- FR-4 off via `EMAIL_VERIFICATION_REQUIRED=false` — no verification step on signup.
- CI api job now runs Postgres 16 service for integration tests.

### File List

- `.env.example`
- `docker-compose.yml`
- `docker-compose.prod.yml`
- `.github/workflows/ci.yml`
- `api/pyproject.toml`
- `api/uv.lock`
- `api/domain/errors.py`
- `api/domain/signup.py`
- `api/application/ports.py`
- `api/application/signup.py`
- `api/adapters/persistence/models.py`
- `api/adapters/persistence/password_hasher.py`
- `api/adapters/persistence/repositories.py`
- `api/adapters/persistence/sessions.py`
- `api/adapters/persistence/migrations/env.py`
- `api/adapters/persistence/migrations/versions/0002_users_lists_sessions.py`
- `api/api/app.py`
- `api/api/deps.py`
- `api/api/settings.py`
- `api/api/routes/auth.py`
- `api/api/schemas/__init__.py`
- `api/api/schemas/auth.py`
- `api/tests/test_signup_domain.py`
- `api/tests/test_signup_integration.py`
- `ui/vitest.config.mts`
- `ui/app/globals.css`
- `ui/app/layout.tsx`
- `ui/app/page.tsx`
- `ui/app/signup/page.tsx`
- `ui/app/signup/SignupForm.tsx`
- `ui/app/signup/signup.module.css`
- `ui/app/lists/page.tsx`
- `ui/app/lists/lists.module.css`
- `ui/app/api/auth/register/route.ts`
- `ui/app/api/auth/register/route.test.ts`
- `ui/lib/api.ts`
- `ui/lib/i18n/signup.ts`
- `ui/lib/i18n/signup.test.ts`
- `_bmad-output/implementation-artifacts/1-2-sign-up-with-email-password-and-personal-list.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Change Log

- 2026-08-03: Implemented signup + personal list (FR-1/FR-5), opaque httpOnly sessions, BFF proxy, Alembic 0002, Postgres integration tests; status → review.

## Story completion status

Status: review  
Completion note: All tasks complete; ACs satisfied; tests green — ready for code-review.
