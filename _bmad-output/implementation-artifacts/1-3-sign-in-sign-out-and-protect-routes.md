---
baseline_commit: 62587638fec505a0f5c57db93341808693f47f1b
---

# Story 1.3: Sign in, sign out, and protect routes

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a registered user,
I want to sign in with email and password and sign out,
so that only I can access my lists and uploads while signed in.

## Acceptance Criteria

1. **Given** I have a registered account  
   **When** I sign in with correct email and password  
   **Then** I receive an authenticated session (httpOnly Secure cookie; no Bearer token in localStorage)

2. **Given** I enter invalid credentials  
   **When** I attempt to sign in  
   **Then** sign-in fails with a generic error that does not reveal whether the email exists

3. **Given** I am signed in  
   **When** I sign out  
   **Then** my session ends and protected list/upload actions require authentication again

## Tasks / Subtasks

- [x] Task 0: Confirm Stories 1.1 + 1.2 are implemented (prerequisites)
  - [x] 1.1: Compose + hex + health + lockfiles
  - [x] 1.2: users/lists/membership (+ session if opaque), argon2 hashes, signup register route, httpOnly Secure cookie, standalone signup UI, AD-8 forks documented in 1.2 completion notes
  - [x] If either is incomplete: stop — finish those stories first (do not invent a parallel auth stack on this branch)

- [x] Task 1: Reuse AD-8 contract from 1.2 (AC: #1, #3) — do not re-decide forks
  - [x] Read 1.2 completion notes for: library, JWT vs opaque, BFF vs proxy, cookie name, session secret env var
  - [x] Same cookie issuer, flags (`HttpOnly`, `Secure` in prod, `SameSite`, `Path=/`), and hasher — never expose session to JS
  - [x] **Forbidden:** Bearer in `localStorage`; Better Auth / Lucia / NextAuth; dual independent cookies; `NEXT_PUBLIC_*` secrets; second session system alongside 1.2

- [x] Task 2: Sign-in API (AC: #1, #2)
  - [x] `POST` sign-in endpoint on `api` (via `/api/auth/sign-in` or equivalent under the chosen BFF/proxy mount) accepting email + password
  - [x] Verify against argon2 hash from 1.2 user row; on success issue/refresh session cookie (same cookie name/issuer as signup)
  - [x] On any failure (unknown email, bad password, malformed body): return **same generic** error shape/message — no email-existence oracle, no different status that leaks existence
  - [x] Never log plaintext passwords; keep structured logs free of credential material
  - [x] Domain/application owns credential check; ORM models stay under `adapters/persistence`; routes/DTOs/cookie edge in `api/api/` (AD-1)

- [x] Task 3: Sign-out API (AC: #3)
  - [x] `POST` sign-out clears the session cookie **and** revokes server session (delete/invalidate opaque session row — JWT-only clear-cookie without revoke is insufficient if opaque sessions exist)
  - [x] After sign-out, `GET` current-user / protected api routes return 401 Unauthorized
  - [x] Idempotent: signing out when already signed out is safe (200/204 with cleared cookie)

- [x] Task 4: Protect API + UI routes (AC: #3)
  - [x] **API:** any list/upload (and other authenticated) handlers require a valid session; unauthenticated → 401. Membership ACL (AD-19) is Epic 2 — here only **authentication** gate
  - [x] **UI:** gate authenticated app surfaces (lists homepage / last-opened list, upload entry, Account chrome that assumes signed-in). Public: `/sign-in`, `/signup` (1.2), `/health`, and later reset routes (1.4)
  - [x] Next.js 16: use **`proxy.ts`** (middleware rename) for coarse cookie-presence redirect to `/sign-in`; **also** verify session in server layouts/route handlers/BFF — proxy alone is not auth
  - [x] Unauthenticated visit to protected path → redirect to sign-in (optional `returnTo` / callback query for post-login bounce)
  - [x] Signed-in visit to `/sign-in` → redirect to first-paint landing (remembered last-opened list if present; else lists homepage per UX-DR9) — stub lists page OK if Epic 2 not built

- [x] Task 5: Minimal sign-in UI (AC: #1, #2)
  - [x] Standalone `/sign-in` page (no dedicated UX mock — spine-only): email + password + submit; clear+calm generic error on failure (EXPERIENCE error voice)
  - [x] Submit via same-origin BFF/proxy only — **never** `fetch` to a browser-exposed API with tokens stored client-side
  - [x] Neutral shell OK (Warm Balance full tokens = 3.1); no kit purple/brand defaults (AD-12)
  - [x] Sign-out control: minimal button/link reachable while signed in (Account menu chrome lands in 1.6 — a bare “Sign out” affordance is enough here to satisfy AC #3)
  - [x] Prefer i18n key stubs for chrome/errors (EN strings fine if 1.6 wires ES) — avoid hardcoding that blocks bilingual later

- [x] Task 6: Tests (AC: #1–#3)
  - [x] API pytest: valid sign-in sets session cookie; invalid credentials → generic error (assert same message for unknown email vs bad password); sign-out clears/revokes; protected endpoint 401 after sign-out
  - [x] Integration against **Postgres 16** (Compose `db`) — not SQLite stand-in
  - [x] UI: critical test that protected route redirects when unauthenticated; sign-in form shows generic error (test-after OK; respect 1.1 coverage floor)
  - [x] Do **not** require full Playwright every PR

## Dev Notes

### Epic context

Epic 1 = Accounts & personal workspace (FR-1…FR-5). Demo gate = authenticated user with personal list — needs **1.2 + 1.3** at minimum.

| Sibling | Relationship to 1.3 |
|---------|---------------------|
| 1.1 Scaffold | Prerequisite Compose / hex / health / env |
| **1.2 Signup + personal list** | **Hard prerequisite** — users, password hashes, session cookie issuance, personal list |
| 1.4 Password reset | Uses this story’s sign-in path to prove new password |
| 1.5 Email verification | Orthogonal gate on top of session |
| 1.6 Account menu | Wires sign-out + language/theme chrome (UX-DR10) |

**FR-2** is the primary requirement. NFR-1 (hashing) established in 1.2; NFR-3 membership ACL is Epic 2 — 1.3 only ensures **authenticated** access for list/upload surfaces.

### Hard prerequisites / ordering

- **Do not implement 1.3 before 1.2 is done** (or on the same branch). 1.2 owns user table, argon2 hashes, signup cookie, personal list. 1.3 reuses that session issuer for returning users + protection.
- If 1.2 story file is missing when you start: create/implement 1.2 first (`create-story` / `dev-story` for `1-2-sign-up-with-email-password-and-personal-list`).
- Branch: `feat/1/1-3-sign-in-sign-out-and-protect-routes` (AD-13) — one story per branch.

### Scope boundaries (anti-scope)

| In 1.3 | Out of 1.3 |
|--------|------------|
| Sign-in with email/password | Signup / personal list (1.2) |
| Sign-out + session revoke | Password reset SMTP (1.4) |
| Generic invalid-credential errors | Email verification gate (1.5) |
| Protect list + upload (auth gate) | Membership ACL / invites (Epic 2 / AD-19 details) |
| Minimal sign-in page + bare sign-out | Full Account menu EN/ES + theme (1.6) |
| Same AD-8 cookie as 1.2 | Better Auth, OAuth/Google, session-management UI |
| `proxy.ts` + server verify | Profile/settings product |

### Architecture compliance

[Source: `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md`]

- **AD-8:** httpOnly Secure cookie (JWT **or** opaque); same-origin via reverse proxy and/or Next BFF; Bearer-in-client-storage forbidden; fastapi-users **or** custom argon2 + signed cookies  
  - **Bias for this project:** custom **argon2-cffi 25.x** + **opaque DB session** (real logout) + **single issuer**; close JWT vs opaque and proxy vs BFF forks in 1.2 and **reuse here**
- **AD-1:** Auth cookie edge in `api/api/`; domain has no FastAPI/SQLAlchemy imports; `ui` → HTTP only
- **AD-19:** Membership for list R/W — Epic 2; 1.3 only requires “must be signed in”
- **AD-12:** DESIGN.md + EXPERIENCE.md win; kits = unstyled primitives only
- **AD-22:** secrets (session signing key) via Compose env outside repo; `/health` remains public
- **Conventions:** generic auth failures; Same-site first-party cookies; Secure in HTTPS; UUIDs for users/sessions

**Do not confuse:** Auth **session** (cookie) ≠ **Import Session** (AD-4 staging aggregate).

### Library / framework requirements

| Piece | Pin / guidance | Notes |
|-------|----------------|-------|
| argon2-cffi | **25.x** (e.g. 25.1.0) | Password verify; same hasher as 1.2 |
| fastapi-users | 15.x | Only if 1.2 already chose it; prefer custom |
| FastAPI / Pydantic | 0.141.x / 2.13.x | From 1.1 lockfile |
| Next.js / React | 16.2.x / 19.2.x | Use **`proxy.ts`** export `proxy` — `middleware.ts` deprecated in Next 16 |
| Session secret | Compose env | Placeholder in `.env.example`; never `NEXT_PUBLIC_*` |

After 1.1 lockfiles exist: patches only via `chore/` PRs — do not bump majors inside this feature story.

### Recommended API / UI shapes (implementer may rename if 1.2 already fixed names)

```text
POST /api/auth/sign-in   { email, password } → Set-Cookie + minimal user DTO (no password)
POST /api/auth/sign-out  → clear + revoke session
GET  /api/auth/me        → 200 user | 401   (useful for UI/BFF session check)

ui/app/sign-in/page.tsx          # public
ui/proxy.ts                      # coarse auth redirect (Next 16)
ui/app/(authenticated)/…         # lists/upload stubs gated
```

Wire snake_case on API DTOs; map at UI edge.

### File structure requirements

Expect **UPDATE** of 1.1/1.2 files; **NEW** sign-in UI + protection + sign-in/out routes if not present.

```text
api/
  domain/…                     # credential/session rules (no framework imports)
  application/…                # SignIn / SignOut use-cases
  adapters/persistence/…       # User + Session models/repos (from 1.2); Alembic if session table needed
  api/auth.py (or routers/)    # cookie edge: sign-in, sign-out, me
ui/
  app/sign-in/page.tsx         # NEW standalone sign-in
  app/(app)/…                  # protected layouts
  proxy.ts                     # NEW Next 16 route gate
  app/api/auth/…               # optional BFF Route Handlers forwarding to api
```

### Existing code being modified

| Path | Expected state entering 1.3 | This story | Preserve |
|------|----------------------------|------------|----------|
| `api` auth signup + user/session | From **1.2** | Add sign-in/out; reuse cookie issuer | Same cookie name, hasher, hex boundaries |
| `ui` shell / health | From **1.1** | Add sign-in page + `proxy.ts` gates | `/health` public; standalone output |
| `.env.example` | Session secret placeholder from 1.1/1.2 | Confirm `SESSION_SECRET` (name may vary) documented | No real secrets committed |
| Compose / proxy | `/api/*` → api preferred | Ensure cookies work same-origin | No Redis/worker |

**Greenfield note (as of story creation):** `api/` and `ui/` may not exist yet on `main` — 1.1 and 1.2 must land first. Do not scaffold a parallel auth stack.

### UX requirements

[Source: EXPERIENCE.md / DESIGN.md / epic-1-context]

- Standalone sign-in exists **outside** invite flows (invitee landing = Epic 2 / J4)
- Error voice: what happened + what to do; clear + calm — **generic** credential failure only
- After successful sign-in: first-paint rules — remembered last-opened list else Lists homepage (stub OK)
- After sign-out: protected list/upload require auth again (redirect to sign-in)
- Account menu with Language/Theme is **1.6**; provide minimal sign-out affordance now
- No profile/settings surface

### Testing requirements

- Red→green for domain credential/session rules where applicable; UI test-after
- Must prove: cookie set on success; generic failure; revoke on logout; 401/redirect when protected without session
- No PII in fixtures; no real emails that look personal — use `user@example.com` style
- CI: extend api pytest + ui critical tests; not full Playwright every PR (AD-15)

### Project context reference

Follow `_bmad-output/project-context.md`. Highest-risk misses for this story:

- Bearer in `localStorage` / client token storage
- Dual session cookies (ui + api) without linked revocation
- Email enumeration via distinct errors/status codes
- Building Better Auth / Node-primary auth against FastAPI stack
- Using Next 15 `middleware.ts` name on Next 16 without `proxy.ts`
- Implementing membership ACL or invites here
- Confusing Import Session with auth session
- Starting before 1.2 auth primitives exist

Source-of-truth order: ARCHITECTURE-SPINE + project-context → SPEC/DESIGN/EXPERIENCE → PRD/epics → README/research.

### Previous story intelligence

**Story 1.1** (`1-1-scaffold-compose-app-with-health-checks.md`, ready-for-dev; no app code on `main` yet):

- Compose `db`/`api`/`ui`, hex layout, Alembic ready, `/health`, CI lint, coverage floor **60%**, `API_INTERNAL_URL` + BFF/proxy preferred over browser→`NEXT_PUBLIC_API_URL`
- Auth stack deferred to 1.2; custom argon2 preferred

**Story 1.2** (`1-2-sign-up-with-email-password-and-personal-list.md`, ready-for-dev) — **must complete before 1.3**:

- **Closes AD-8 forks** in completion notes: library (prefer argon2-cffi 25.x), JWT vs opaque, BFF vs proxy — **single session issuer**. 1.3 **extends** those choices; never re-open or dual-stack
- Persistence: User (UUID, unique email, password hash), List, ListMembership (+ Session table if opaque); models only under `adapters/persistence`; Alembic migrations
- Cookie edge on signup register route under `api/api/` — httpOnly Secure; same cookie name/issuer for sign-in
- Standalone `/signup` UI via same-origin BFF/proxy; FR-4 off = usable without verify
- Explicit anti-scope for 1.2: “Full route protection / sign-out UI (**1.3**)”
- Visual: Manrope + moss primary CTA `rounded.sm` 8px if feasible; no kit purple; full Soft-Ledger = 3.1
- Tests: domain TDD signup; Postgres integration for register + cookie; generic vocabulary fixtures
- **1.3 reuses:** hasher, user repo, session issuer, cookie flags, BFF/proxy path, DTO snake_case — add sign-in/out + protection only

### Git intelligence

Recent commits are planning/BMAD artifacts only. **No application auth code on `main` yet.** After 1.1→1.2 merge, follow their conventions (ruff, ESLint+tsc, branch naming, lockfiles as pin truth).

### Latest tech information

- **argon2-cffi 25.1.0** — current 25.x line; use `PasswordHasher.verify`; support Python 3.12+
- **Next.js 16.2.x:** `middleware` file convention **renamed to `proxy`** (`proxy.ts`, export `function proxy`). Coarse cookie check in proxy + fine-grained verify in layouts/BFF/server code. Matcher should exclude static assets and `/health`
- Prefer opaque server sessions so logout is immediate revocation (cookie clear alone is weak for long-lived JWTs)
- Local HTTP: `Secure` cookie may need careful local overlay (Secure only behind TLS / prod) — document local vs prod cookie flags in `.env.example` / README without weakening prod

### References

- `_bmad-output/planning-artifacts/epics.md` — Story 1.3, FR-2
- `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md` — AD-8, AD-1, capability map
- `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/stack-options.md` — fastapi-users 15.x / argon2-cffi 25.x
- `_bmad-output/specs/spec-finance-helper/SPEC.md` — CAP-1 session constraint
- `_bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/EXPERIENCE.md` — first paint, Account, error voice
- `_bmad-output/implementation-artifacts/epic-1-context.md`
- `_bmad-output/implementation-artifacts/1-1-scaffold-compose-app-with-health-checks.md`
- `_bmad-output/implementation-artifacts/1-2-sign-up-with-email-password-and-personal-list.md`
- `_bmad-output/project-context.md`

## Dev Agent Record

### Agent Model Used

Cursor Grok 4.5 (bmad-dev-story)

### Debug Log References

- Domain: `uv run pytest tests/test_signin_domain.py` — green
- Integration (Compose network → Postgres 16): 25 pytest passed incl. signup + sign-in/out
- Ruff check/format — green
- UI: `npm test` 21 passed; `test:coverage` statements ~94% (≥60%); typecheck + eslint green

### Completion Notes List

- Reused 1.2 AD-8 contract: custom argon2-cffi, opaque `fh_session` cookie, api single issuer, Next BFF at `/api/auth/*`.
- Added `SignInService` + `InvalidCredentialsError` (identical message for unknown email / bad password / empty body).
- `POST /auth/sign-in`, `POST /auth/sign-out` (204 + revoke), `GET /auth/me` via `require_authenticated_user`.
- UI: `/sign-in`, BFF sign-in/out, `proxy.ts` coarse gate, server `fetchSession` on `/lists` + `/upload`, bare `SignOutButton`.
- No new auth libraries; no Bearer/localStorage; membership ACL deferred to Epic 2.

### File List

- `api/domain/errors.py`
- `api/application/signin.py`
- `api/adapters/persistence/repositories.py`
- `api/adapters/persistence/sessions.py`
- `api/api/deps.py`
- `api/api/routes/auth.py`
- `api/api/schemas/auth.py`
- `api/pyproject.toml`
- `api/tests/test_signin_domain.py`
- `api/tests/test_signin_integration.py`
- `ui/proxy.ts`
- `ui/proxy.test.ts`
- `ui/app/sign-in/page.tsx`
- `ui/app/sign-in/SignInForm.tsx`
- `ui/app/api/auth/sign-in/route.ts`
- `ui/app/api/auth/sign-in/route.test.ts`
- `ui/app/api/auth/sign-out/route.ts`
- `ui/app/api/auth/sign-out/route.test.ts`
- `ui/app/lists/page.tsx`
- `ui/app/lists/lists.module.css`
- `ui/app/upload/page.tsx`
- `ui/app/page.tsx`
- `ui/components/SignOutButton.tsx`
- `ui/components/SignOutButton.module.css`
- `ui/lib/i18n/signin.ts`
- `ui/lib/i18n/signin.test.ts`
- `_bmad-output/implementation-artifacts/1-3-sign-in-sign-out-and-protect-routes.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Change Log

- 2026-08-04: Implemented sign-in/sign-out, route protection (`proxy.ts` + server gates), and tests — story ready for review.

## Story completion status

Status: review  
Completion note: All ACs and tasks complete; ready for code-review.
