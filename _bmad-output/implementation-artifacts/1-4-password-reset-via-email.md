# Story 1.4: Password reset via email

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a registered user,
I want to reset a forgotten password via email,
so that I can regain access without losing my account.

## Acceptance Criteria

1. **Given** I have a registered account and SMTP is configured  
   **When** I request a password reset for my email  
   **Then** I receive a reset message that proves control of that address (NFR-10)

2. **Given** I complete the reset with a new password  
   **When** I sign in  
   **Then** the new password works and the prior password no longer does

3. **Given** SMTP is misconfigured or unavailable  
   **When** I request a reset  
   **Then** the API fails loudly with a clear operator-facing/config error path (no silent success)

## Tasks / Subtasks

- [ ] Task 0: Confirm Stories 1.1 + 1.2 + 1.3 are implemented (prerequisites)
  - [ ] 1.1: Compose `db`/`api`/`ui`, hex layout including empty `adapters/email/`, Alembic, `/health`, lockfiles, CI
  - [ ] 1.2: User table (UUID, unique email, argon2 hash), personal list, httpOnly Secure cookie issuer, AD-8 forks documented in completion notes
  - [ ] 1.3: Sign-in / sign-out / `me`, generic invalid-credential errors, `proxy.ts` public-route allowlist that anticipates reset routes
  - [ ] If any prerequisite is incomplete: stop — finish those stories first (do not invent a parallel auth or email stack)

- [ ] Task 1: SMTP email adapter (AC: #1, #3) — first real use of `adapters/email/`
  - [ ] Add **aiosmtplib ≥5.1.2** to `api` lockfile (CVE-2026-55558 STARTTLS floor — do not pin open `5.x` below 5.1.2)
  - [ ] Implement SMTP port + adapter under `api/adapters/email/` — domain/application call a port; no `aiosmtplib` imports in `domain/`
  - [ ] Env placeholders in `.env.example` (and Compose wiring): SMTP host/port/user/password/from, TLS/STARTTLS mode, and **public app base URL** used to build reset links — placeholders only; secrets outside repo (AD-22 / NFR-2)
  - [ ] Misconfigured or unreachable SMTP → structured failure that the API surfaces clearly (AC #3) — never return “email sent” when send did not succeed
  - [ ] Do **not** add Redis/queue/worker for mail (AD-2); sync send from `api` is fine for v1 transactional mail
  - [ ] Reject Nodemailer / UI-side SMTP / Node mail SoT — mail leaves from `api` only

- [ ] Task 2: Reset token lifecycle + persistence (AC: #1, #2) — close architecture gap with secure defaults
  - [ ] Architecture review flagged **token lifecycle as unspecified** — document chosen rules in completion notes. **Required secure defaults unless a later AD contradicts:**
    - Time-limited token (recommend ≤1 hour TTL)
    - Single-use (consumed on successful reset)
    - Store **hash of token** at rest (never plaintext token in DB); raw token only in the email link
    - Invalidate outstanding unused tokens for that user when a new reset is requested and/or when reset completes
  - [ ] Prefer Alembic table (e.g. `password_reset_token`) under `adapters/persistence/` if opaque storage is used — UUID PK; FK to user; expires_at; used_at/consumed flag; token_hash
  - [ ] Signed-stateless token alone is allowed only if it still meets prove-control + single-use/expiry semantics and does not break hex boundaries — document choice
  - [ ] Domain owns “token valid / consume / password replace” rules; ORM stays in persistence

- [ ] Task 3: Request-reset use-case + API (AC: #1, #3)
  - [ ] Application use-case: given email → if user exists, create token + send reset email via email port; if SMTP fails, fail loud (do not mark “sent”)
  - [ ] **Email enumeration:** align with FR-2 / project-context generic auth posture — for **unknown emails**, prefer same client-visible success shape as known emails **without** sending mail (no oracle). SMTP failure still fails loud when a real send is attempted
  - [ ] Never log plaintext passwords or raw reset tokens at info; correlate via user/request ids only
  - [ ] Route under `api/api/` (e.g. `POST /api/auth/password-reset/request` with `{ email }`) — snake_case DTOs; structured JSON errors
  - [ ] Email body: clear reset link using public app base URL + opaque token (prove control of inbox). Minimal transactional copy; prefer i18n-ready EN (ES templates can share keys — invite mail in Epic 2 will reuse adapter)

- [ ] Task 4: Complete-reset use-case + API (AC: #2)
  - [ ] Route (e.g. `POST /api/auth/password-reset/confirm` with `{ token, new_password }`)
  - [ ] Validate token (exists, unexpired, unused, hash matches) → replace password with **same argon2 hasher as 1.2** → consume token → prior password must fail subsequent verify
  - [ ] NFR-1: never store/log plaintext new password
  - [ ] **Session revoke on successful reset:** if opaque sessions from 1.2/1.3 exist, invalidate all sessions for that user (consistent with “prior credential dead”); if JWT-only, document limitation — prefer revoke when sessions are DB-backed
  - [ ] Invalid/expired/used token → clear structured error (user-facing calm copy; no internal SMTP/stack dumps)
  - [ ] After success: user proves access via **1.3 sign-in** with the new password (AC #2). Auto sign-in after reset is optional — if done, must reuse the **same** cookie issuer (no second session system)

- [ ] Task 5: Public UI surfaces (AC: #1, #2)
  - [ ] Standalone public pages (spine-only — no dedicated UX mock): request reset (email) + confirm reset (new password, from email link)
  - [ ] Suggested paths (rename OK if consistent): `/forgot-password` (request), `/reset-password` (confirm; token via query or path)
  - [ ] Wire into Next 16 **`proxy.ts`** public allowlist alongside `/sign-in`, `/sign-up`, `/health` (1.3 already reserved “later reset routes”)
  - [ ] Submit via same-origin BFF/proxy only — never Bearer in `localStorage` / never browser→API with client-stored tokens
  - [ ] Sign-in page: “Forgot password?” link → request page
  - [ ] Account menu “password reset” entry is **1.6** chrome — for 1.4, a link from sign-in + working public routes satisfy FR-3; optional stub link in authenticated chrome is fine if already present
  - [ ] Neutral Warm Balance-compatible shell OK; no kit purple; full Soft-Ledger = 3.1
  - [ ] Error voice: what happened + what to do; clear + calm (EXPERIENCE). Prefer i18n key stubs

- [ ] Task 6: Tests (AC: #1–#3)
  - [ ] Domain/application TDD: token issue/consume; completed reset makes old hash fail and new hash verify; expired/used token rejected
  - [ ] Integration against **Postgres 16**: request → (fake/captured SMTP) → confirm → sign-in with new password succeeds; old password fails
  - [ ] SMTP misconfig/unavailable → API does **not** report success (fail loud)
  - [ ] Unknown-email request does not create an enumeration oracle (same client response as known email when SMTP would have been used for known)
  - [ ] UI: smoke/critical tests for request + confirm forms / public route accessibility (test-after OK; keep 1.1 coverage floor)
  - [ ] Do **not** require full Playwright every PR; no real PII; fixtures like `user@example.com`

## Dev Notes

### Epic context

Epic 1 = Accounts & personal workspace (FR-1…FR-5). Demo gate = authenticated user with personal list (**1.2 + 1.3** minimum). Story 1.4 delivers **FR-3** + **NFR-10** reset path and establishes the **SMTP adapter** Epic 2 invites will reuse.

| Sibling | Relationship to 1.4 |
|---------|---------------------|
| 1.1 Scaffold | Prerequisite Compose / hex / `adapters/email/` path / env pattern |
| **1.2 Signup + personal list** | **Hard prerequisite** — user + argon2 hash that reset replaces |
| **1.3 Sign-in / out / protect** | **Hard prerequisite** — AC #2 proves new password via sign-in; public reset routes in `proxy.ts` |
| 1.5 Email verification | Related (FR-4 “secure account recovery”) but **not** a blocker for core reset when verification is off |
| 1.6 Account menu | UX-DR10 “reach password reset” chrome — link target is this story’s public flow |

### Hard prerequisites / ordering

- **Do not implement 1.4 before 1.1–1.3 are done** (or stack them on one branch). 1.4 extends the existing session issuer + hasher; it owns SMTP + reset token flow only.
- Branch: `feat/1/1-4-password-reset-via-email` (AD-13) — one story per branch.
- Reuse 1.2 completion notes for: library, JWT vs opaque, BFF vs proxy, cookie name, hasher — **never re-open or dual-stack**.

### Scope boundaries (anti-scope)

| In 1.4 | Out of 1.4 |
|--------|------------|
| Request reset email via SMTP (`adapters/email/`) | Invite emails / join-list tokens (Epic 2 — **reuse** this adapter) |
| Prove inbox control via reset link + token | Email verification gate (1.5) |
| Complete reset → new hash; old password dead | Google/OAuth; Better Auth; Nodemailer on `ui` |
| Fail loud on SMTP misconfig | Redis/mail queue/worker |
| Public forgot/confirm pages + sign-in link | Full Account menu EN/ES + theme (1.6) |
| Secure token defaults (TTL, single-use, hashed) | Profile/settings; session-management UI product |
| Same argon2 + 1.3 sign-in proof path | Changing cookie issuer / second auth system |

**Forbidden:** Bearer in `localStorage` · silent “sent” when SMTP failed · storing raw reset tokens or plaintext passwords · email-existence oracle on request · `NEXT_PUBLIC_*` secrets · committing real SMTP credentials · domain importing aiosmtplib/SQLAlchemy/FastAPI.

### Architecture compliance

[Source: `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md`]

- **AD-8:** Email+password **with password reset via SMTP**; httpOnly Secure cookie session; same-origin BFF/proxy; no Bearer in client storage
- **AD-1:** Driving adapter = SMTP under `api/adapters/email/`; domain free of framework/SMTP imports; cookie/HTTP edge in `api/api/`; `ui` → HTTP only
- **AD-2:** Still exactly `db` | `api` | `ui` — no mail worker service
- **AD-22 / NFR-2 / NFR-10:** SMTP secrets outside repo; operator-configured SMTP required for reset mail
- **AD-12:** DESIGN + EXPERIENCE binding; kits unstyled only; standalone reset is spine-only (functional forms)
- **AD-13 / AD-15:** Branch naming; domain TDD for reset rules; CI lint + pytest + ui typecheck — not full Playwright every PR
- **Capability map:** Auth signup/signin/**reset** → `api` auth + SMTP; `ui` account

**Known gap (implementer closes with documented defaults):** invite/password-reset **token lifecycle** was Missing in architecture review (expiry, single-use, revocation). Secure defaults in Task 2 are binding for this story unless a later AD supersedes them.

**Do not confuse:** Auth **session** (cookie) ≠ **Import Session** (AD-4) ≠ **reset token**.

### Library / framework requirements

| Piece | Pin / guidance | Notes |
|-------|----------------|-------|
| aiosmtplib | **≥5.1.2** (verified 5.1.2 on PyPI; patches CVE-2026-55558) | Selected in stack-options; Nodemailer rejected |
| argon2-cffi | **25.x** from 1.2 | Same hasher for new password |
| FastAPI / Pydantic / SQLAlchemy / Alembic | From 1.1 lockfile | Routes + persistence only |
| Next.js / React | 16.2.x / 19.2.x | Public pages + `proxy.ts` allowlist |
| Session cookie | From 1.2/1.3 | Reuse issuer; revoke sessions on reset when opaque |

After 1.1 lockfiles exist: do not bump unrelated majors inside this feature story — add aiosmtplib only (or `chore/` for broader bumps).

### Recommended API / UI shapes (implementer may rename if 1.2/1.3 fixed a convention)

```text
POST /api/auth/password-reset/request   { email } → 200 generic ack | 5xx/4xx on SMTP/config failure when send attempted
POST /api/auth/password-reset/confirm   { token, new_password } → 204/200; then sign-in with new password

ui/app/forgot-password/page.tsx         # public — request
ui/app/reset-password/page.tsx          # public — confirm (token from link)
ui/app/sign-in/…                        # UPDATE — forgot-password link
ui/proxy.ts                             # UPDATE — allow public reset paths
api/adapters/email/…                    # NEW — SMTP
```

Wire snake_case on API DTOs; map at UI edge.

### File structure requirements

```text
api/
  domain/…                      # reset token + password-replace rules (pure)
  application/…                 # RequestPasswordReset / CompletePasswordReset + email port
  adapters/email/…              # NEW aiosmtplib SMTP adapter
  adapters/persistence/…        # UPDATE User hash; NEW reset-token model + Alembic revision
  api/…                         # request + confirm routes (cookie edge only if auto-login)
  tests/…                       # domain TDD + Postgres integration + SMTP fail-loud
ui/
  app/forgot-password/…         # NEW
  app/reset-password/…          # NEW
  app/sign-in/…                 # UPDATE link
  proxy.ts                      # UPDATE public routes
  app/api/auth/…                # optional BFF forwarders
.env.example                    # UPDATE SMTP + PUBLIC_APP_URL (name may vary)
docker-compose*.yml             # UPDATE pass SMTP env into api if needed
```

### Existing code being modified

| Path | Expected state entering 1.4 | This story | Preserve |
|------|----------------------------|------------|----------|
| `api/adapters/email/` | Empty seed from 1.1 | First SMTP implementation | Hex port boundary; no domain SMTP imports |
| `api` auth (signup/sign-in/out) | From **1.2 + 1.3** | Add request/confirm; update password hash; revoke sessions | Same cookie issuer, hasher, generic auth errors |
| `ui/proxy.ts` | Public: sign-in, sign-up, health | Add forgot/reset paths | Coarse gate ≠ full auth; `/health` public |
| `ui` sign-in | From 1.3 | Forgot-password link | Generic credential errors |
| `.env.example` / Compose | Session + DB from 1.1–1.3 | SMTP + public URL placeholders | No real secrets committed |
| User / Session tables | From 1.2/1.3 | Hash replace + session revoke | Alembic only; never wipe PG volume |

**Greenfield note (as of story creation):** `api/` and `ui/` may not exist yet on `main` — 1.1→1.3 must land first. Do not scaffold a parallel layout or mail stack.

### UX requirements

[Source: EXPERIENCE.md / DESIGN.md / epic-1-context / UX-DR10]

- Standalone auth surfaces include **password reset** outside invite flows (J4 is invitee signup only)
- No dedicated forgot-password journey mock — functional forms; clear+calm errors
- Account menu reaches password reset in **1.6**; this story delivers the destination flow
- After completed reset: user signs in with new password (landing rules from 1.3 / UX-DR9)
- No profile/settings product

### Testing requirements

- Red→green for domain token/password-replace rules; UI test-after
- Must prove: SMTP send path when configured; fail loud when not; new password signs in; old password fails; no silent success
- Integration on **Postgres 16** — not SQLite
- Fake/mock SMTP in tests (do not hit real servers in CI)
- Generic vocabulary fixtures; no real PII
- CI: extend api pytest + ui critical tests (AD-15)

### Project context reference

Follow `_bmad-output/project-context.md`. Highest-risk misses for this story:

- Using Nodemailer / UI SMTP instead of `api/adapters/email` + aiosmtplib ≥5.1.2
- Silent success when SMTP is broken
- Email enumeration oracle on reset request
- Storing plaintext passwords or raw reset tokens
- Dual session / Bearer in `localStorage` / re-deciding AD-8
- Skipping session revoke after password change when opaque sessions exist
- Building invite flow or verification gate here
- Confusing Import Session with auth session or reset token
- Starting before 1.1–1.3 auth primitives exist

Source-of-truth order: ARCHITECTURE-SPINE + project-context → SPEC/DESIGN/EXPERIENCE → PRD/epics → README/research.

### Previous story intelligence

**Story 1.1** (`1-1-scaffold-compose-app-with-health-checks.md`, ready-for-dev):

- Seeds hex including `adapters/email/`; defers aiosmtplib pin to first email story (**this one**)
- Coverage floor **60%**; BFF/proxy preferred over browser `NEXT_PUBLIC_API_URL` for auth
- Secrets/SMTP outside repo pattern established

**Story 1.2** (`1-2-sign-up-with-email-password-and-personal-list.md`, ready-for-dev) — **must complete before 1.4**:

- Closes AD-8 forks (hasher, JWT vs opaque, BFF vs proxy) — **reuse**; never dual-stack
- User + argon2 hash that complete-reset replaces
- Explicit anti-scope: “Password reset SMTP (1.4)”

**Story 1.3** (`1-3-sign-in-sign-out-and-protect-routes.md`, ready-for-dev) — **must complete before 1.4**:

- Sign-in path is the **AC #2 proof**; generic invalid-credential errors
- Public routes reserved: “later reset routes (1.4)”
- Notes: “1.4 Password reset | Uses this story’s sign-in path to prove new password”
- Prefer opaque sessions so logout/revoke is real — **extend revoke to password reset**

### Git intelligence

Recent commits are planning/BMAD artifacts only (`project-context`, sprint-status, story context files). **No application auth/SMTP code on `main` yet.** After 1.1–1.3 merge, follow their conventions (ruff, ESLint+tsc, branch naming, lockfiles as pin truth). Expect first `adapters/email` + reset-token migration commits on this branch.

### Latest tech information

- **aiosmtplib 5.1.2** (2026-06-20) — current line; **required floor**. Patches CVE-2026-55558 / GHSA-vxj7-4xrp-5vr4 (STARTTLS response injection). Prefer STARTTLS/TLS per operator SMTP; discard buffered plaintext before handshake is handled in ≥5.1.2
- Typical usage: `aiosmtplib.send(...)` or `SMTP` client with hostname/port/username/password/start_tls — keep config in env, not code
- **argon2-cffi 25.1.0** — continue `PasswordHasher.hash` / `.verify` from 1.2
- **Next.js 16.2.x:** keep using `proxy.ts` (not deprecated `middleware.ts` name) for public reset path allowlisting
- Local Compose: document SMTP catcher options for operators (e.g. Mailpit/Mailhog as **host-side** tools) without adding a Compose app service to the spine’s `db|api|ui` set — if a local mail catcher is added, keep it overlay-only and out of production overlay

### References

- `_bmad-output/planning-artifacts/epics.md` — Story 1.4, FR-3, NFR-10, UX-DR10
- `_bmad-output/planning-artifacts/prds/prd-finance-helper-2026-08-02/prd.md` — FR-3, NFR-1, NFR-10, account surface (reset + invites only transactional mail)
- `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md` — AD-8, AD-1, stack aiosmtplib ≥5.1.2, hex `adapters/email/`
- `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/stack-options.md` — email capability; aiosmtplib selected
- `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/reviews/review-version-reality.md` — aiosmtplib floor
- `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/reviews/review-rubric-walker.md` — token lifecycle gap
- `_bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/EXPERIENCE.md` — standalone auth spine-only backlog; Account menu
- `_bmad-output/implementation-artifacts/epic-1-context.md`
- `_bmad-output/implementation-artifacts/1-1-scaffold-compose-app-with-health-checks.md`
- `_bmad-output/implementation-artifacts/1-2-sign-up-with-email-password-and-personal-list.md`
- `_bmad-output/implementation-artifacts/1-3-sign-in-sign-out-and-protect-routes.md`
- `_bmad-output/project-context.md`
- `_bmad-output/specs/spec-finance-helper/SPEC.md` — CAP-1 reset proves email control; SMTP constraint

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

## Story completion status

Status: ready-for-dev  
Completion note: Ultimate context engine analysis completed — comprehensive developer guide created.
