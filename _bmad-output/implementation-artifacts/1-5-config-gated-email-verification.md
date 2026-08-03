# Story 1.5: Config-gated email verification

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an operator (and as a user when verification is on),
I want email verification to run only when required for invites or secure recovery,
so that deployments can stay simple unless that gate is needed.

## Acceptance Criteria

1. **Given** verification is disabled for the deployment  
   **When** a user completes signup (FR-1)  
   **Then** they can use the app without verifying email

2. **Given** verification is enabled (required for invite delivery or secure recovery)  
   **When** an unverified user tries to complete a gated flow (e.g. invite acceptance path that requires it)  
   **Then** that flow is blocked until they verify control of the address

3. **Given** verification is enabled  
   **When** the user completes verification  
   **Then** previously gated flows become available

## Tasks / Subtasks

- [ ] Task 0: Confirm prerequisites (1.1–1.4) before coding
  - [ ] **1.1** Compose `db`/`api`/`ui`, hex layout, Alembic, `/health`, lockfiles, CI
  - [ ] **1.2** User + personal list + argon2 + httpOnly Secure cookie; `EMAIL_VERIFICATION_REQUIRED=false` stub; FR-4 **off** path already proven
  - [ ] **1.3** Sign-in/out + route protection; same AD-8 session issuer; verification treated as orthogonal gate
  - [ ] **1.4** SMTP email adapter under `api/adapters/email/` (`aiosmtplib` ≥5.1.2), fail-loud misconfig, public base URL for links, reset token table patterns — **hard prerequisite for verification-on send path**
  - [ ] If any prerequisite is incomplete: stop — finish those stories first. Do **not** invent a parallel auth stack or a second SMTP client on this branch
  - [ ] Read 1.2/1.3/1.4 completion notes for: hasher, cookie name/issuer, BFF vs proxy, session shape, email port API, SMTP env names, token TTL/hash conventions

- [ ] Task 1: Wire the config gate (AC: #1–#3)
  - [ ] Single operator switch: **`EMAIL_VERIFICATION_REQUIRED`** (bool; default **`false`** / absent = off) — reuse the 1.2 stub name; do not invent parallel flags (`VERIFY_EMAIL`, `FR4_ON`, etc.)
  - [ ] Document on/off behavior in `.env.example` (placeholders only; no real secrets)
  - [ ] When **off/absent**: signup → authenticated + usable app with **no** verification step (preserve Story 1.2 AC #2 / this story AC #1)
  - [ ] When **on**: verification is required only for **gated flows** (invite acceptance / secure recovery) — **not** a global “must verify to log in or use lists” wall, and **not** a profile/settings product
  - [ ] Config read at application/domain boundary (injectable setting) — not scattered `os.getenv` in UI or domain pure rules

- [ ] Task 2: Persistence — verified state + verification tokens (AC: #2, #3)
  - [ ] Alembic migration: user verified state (e.g. `email_verified_at` nullable timestamp **or** `email_verified` bool + timestamp — pick one; document in completion notes)
  - [ ] Mirror **1.4 secure token defaults** unless a later AD contradicts: time-limited (recommend ≤24h for verify, or match 1.4’s ≤1h if shared helper), single-use, **hash of token at rest**, invalidate outstanding unused tokens on new request and/or on confirm
  - [ ] Prefer separate Alembic table (e.g. `email_verification_token`) under `adapters/persistence/` — UUID PK; FK to user; expires_at; used_at/consumed; token_hash — do not overload password-reset token rows unless 1.4 completion notes explicitly designed a shared token table
  - [ ] Models **only** under `api/adapters/persistence/`; domain free of SQLAlchemy (AD-1)
  - [ ] **Never** recreate PG volume; Alembic only (AD-22 / NFR-13)
  - [ ] UUIDs for users/tokens; never store raw tokens or plaintext passwords in DB

- [ ] Task 3: Domain + application verification rules (AC: #1–#3) — TDD first
  - [ ] Red→green: flag **off** → gated-flow checks pass without verified state (or gate is no-op)
  - [ ] Flag **on** + unverified → gated-flow check **rejects** with a clear structured error (not a silent allow)
  - [ ] Flag **on** + request verification → create token + enqueue/send via email port (SMTP adapter from 1.4)
  - [ ] Flag **on** + confirm valid token → mark verified + consume token → gated-flow checks pass
  - [ ] Expired / already-consumed / unknown token → reject generically (no email-existence oracle; calm error shape)
  - [ ] Provide a **stable application port** for “requires verified email for this action” that Epic 2 invite acceptance will call — do **not** implement full invitee landing (Story 2.4) here

- [ ] Task 4: API + SMTP send path (AC: #2, #3)
  - [ ] Reuse **`api/adapters/email/`** from 1.4 (`aiosmtplib` ≥5.1.2 / CVE-2026-55558 floor) via the same application **email port** — verification mail is auth infrastructure, not a new product mail type; no Nodemailer / UI-side SMTP
  - [ ] Build verify links with the same **public app base URL** env pattern 1.4 introduced for reset links
  - [ ] Recommended routes (rename only if 1.2–1.4 already fixed auth mount names):
    - `POST /api/auth/verify/request` — send verification email when flag on (prefer authenticated user; if unauthenticated email-based request is added, apply 1.4 non-enumeration posture)
    - `POST /api/auth/verify/confirm` — consume token → mark verified
  - [ ] Snake_case DTOs; cookie session contract **unchanged** (AD-8); verification is orthogonal to session
  - [ ] SMTP misconfigured/unavailable when sending verify mail → **fail loudly** (same discipline as 1.4 / NFR-10) — never return “sent” when send did not succeed
  - [ ] When flag **off**: request/confirm endpoints may 404 or return a clear “verification not required” — do not force users through a verify UI
  - [ ] Keep `/health` public; never log raw tokens or plaintext credentials

- [ ] Task 5: Gated-flow hook + minimal UI (AC: #2, #3)
  - [ ] **Hook now / full invite in Epic 2:** implement the gate check behind a domain/application API; prove it with a **test double or thin internal endpoint** representing “gated flow” (e.g. invite-accept stub) until Stories 2.3/2.4 exist
  - [ ] Minimal verify UX only if needed for AC #3 (spine-only — no dedicated UX journey): e.g. `/verify` confirm page consuming link token, optional “check your email / resend” when flag on
  - [ ] Voice: clear + calm — what happened + what to do (UX-DR17); prefer i18n key stubs (EN fine until 1.6 wires ES)
  - [ ] **Anti-scope UI:** no Account-menu “verification settings”; no profile product; no banner forcing verify to use Lists when flag is off
  - [ ] Public routes: confirm link path must work for signed-in or link-token flows as designed; keep `/sign-in`, `/sign-up`, reset (1.4), `/health` public patterns from 1.3
  - [ ] Submit via same-origin BFF/proxy only — **never** Bearer in `localStorage`

- [ ] Task 6: Tests (AC: #1–#3)
  - [ ] Domain TDD: off → no gate; on → block gated flow until verified; confirm unlocks
  - [ ] Postgres 16 integration (Compose `db`, not SQLite): signup usable when off; when on → request → token → confirm → gate opens; SMTP failure path loud (mock adapter OK)
  - [ ] Assert session cookie from 1.2/1.3 still works regardless of verify flag
  - [ ] Generic errors — no email enumeration via distinct status/messages on token/request failures where applicable
  - [ ] UI critical path only if verify UI ships; maintain 1.1 coverage floor; **do not** require full Playwright every PR
  - [ ] Fixtures: `user@example.com` style only — no real PII

## Dev Notes

### Epic context

Epic 1 = Accounts & personal workspace (FR-1…FR-5). Demo gate = authenticated user with personal list — needs **1.2 + 1.3** at minimum; **1.5 is not on the demo-gate critical path** but closes FR-4 for deployments that need invite/recovery gates.

| Sibling | Relationship to 1.5 |
|---------|---------------------|
| 1.1 Scaffold | Prerequisite Compose / hex / health / env |
| 1.2 Signup + personal list | Prerequisite — FR-4 **off** path; `EMAIL_VERIFICATION_REQUIRED` stub; users/lists/session |
| 1.3 Sign-in/out + protect | Prerequisite — session protection; verification is **orthogonal** on top of session |
| **1.4 Password reset / SMTP** | **Hard prerequisite** for verification-on send — same email adapter + fail-loud SMTP |
| 1.6 Account menu | Language/theme chrome — **not** a verification settings surface |
| Epic 2 (2.3/2.4) | Real invite acceptance gated flow — consume the 1.5 hook |

**FR-4** is the primary requirement. Verification is **not** a standalone profile feature (PRD Account surface / SPEC assumption).

### Hard prerequisites / ordering

- Implement **after** 1.2, 1.3, and **1.4** (SMTP adapter + token lifecycle patterns). Story 1.4 is `ready-for-dev` — implement/merge it before this branch.
- Do **not** start 1.5 on the same branch as 1.2–1.4. Branch: `feat/1/1-5-config-gated-email-verification` (AD-13).
- Greenfield note: as of story creation, `api/` and `ui/` may not exist on `main` yet (1.1 in-progress; 1.2–1.4 ready-for-dev). Treat those stories’ outputs as the base; never invent a parallel layout.

### Scope boundaries (anti-scope)

| In 1.5 | Out of 1.5 |
|--------|------------|
| `EMAIL_VERIFICATION_REQUIRED` on/off behavior | Signup/personal list (1.2); sign-in/out protection (1.3) |
| Verified state + token lifecycle (expiry, single-use) | Full invite delivery / invitee landing (Epic 2 / J4) |
| Gate hook for invite/recovery-style flows | Global login wall when flag on (unless that flow *is* the gated recovery path) |
| Verification email via existing SMTP adapter | Password-reset product flow (1.4 owns reset; 1.5 only shares adapter) |
| Minimal verify confirm/resend UI if needed | Account menu verification settings / profile product |
| Prove gate with test double / stub gated action | Membership ACL details (AD-19 / Epic 2) |
| Fail-loud SMTP on verify send | Better Auth / OAuth / Bearer in `localStorage` / dual cookies |

**Forbidden:** second auth stack · second SMTP client · inventing locked marketing verify copy / multi-step onboarding · treating verification as always-on · blocking FR-1 usability when flag is off · committing real emails as fixtures · wiping PG volume for schema changes.

### Product / gate semantics (do not misread ACs)

- **Off (default):** FR-1 signup succeeds; user is authenticated; **can use the app** with no verification step.
- **On:** Signup may still create the account and session, but **gated flows** (invite acceptance, secure recovery paths that require proof of email control) are **blocked** until verified. After verify, those flows unlock.
- Gate is **flow-scoped**, not “verify or you cannot open Lists” — unless a future story explicitly expands the gated set. Epic 2 wires the real invite acceptance call site.

### Architecture compliance

[Source: `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md`]

- **AD-8:** Preserve httpOnly Secure cookie session; same-origin BFF/proxy; Bearer-in-client-storage forbidden. FR-4 conditional logic is **not** stated in AD-8 text (spine gap per `review-reconcile-prd.md`) — implement as config + domain gate **on top of** the existing session, not a second auth system.
- **AD-1:** Verification rules in `domain`/`application`; ORM in `adapters/persistence`; SMTP in `adapters/email`; routes/DTOs/cookie edge in `api/api/`; `ui` → HTTP only.
- **AD-2:** Still exactly `db` \| `api` \| `ui` — no Redis/worker for tokens (Postgres token row is fine).
- **AD-13:** One story per branch `feat/1/1-5-…`
- **AD-15:** Domain TDD for gate rules; CI merge = lint + api pytest + ui typecheck/lint (+ critical ui tests)
- **AD-19 / AD-22:** Peers only; Alembic only; secrets via Compose env outside repo
- **Single session issuer** (adversarial review Pair 15): do not add a second cookie/token scheme for “verified” — verified is a **user attribute**, not a second session

**Do not confuse:** Auth **session** (cookie) ≠ **Import Session** (AD-4) ≠ email **verification token**.

### Library / framework requirements

Pins: respect **lockfiles from Story 1.1** as truth. After 1.1, bump majors only via `chore/` PRs.

| Piece | Pin / guidance | Notes |
|-------|----------------|-------|
| aiosmtplib | **≥5.1.2** (floor; CVE-2026-55558; current line **5.1.2**) | Reuse 1.4 email adapter/port — do not pin open `5.x` below 5.1.2 |
| argon2-cffi | **25.x** (from 1.2) | Unchanged — verification does not rehash passwords |
| FastAPI / Pydantic / SQLAlchemy / Alembic | From 1.1 lockfile | Models only in persistence adapters |
| Next.js / React | 16.2.x / 19.2.x | Use **`proxy.ts`** if coarse public-route allowlist needs `/verify` |

**Reject:** Better Auth, Lucia, NextAuth-as-SoT, Node-primary API, Bearer in `localStorage`, inventing a second mail library beside the 1.4 adapter.

### Recommended API / UI shapes

```text
# Config
EMAIL_VERIFICATION_REQUIRED=false   # default off

# API (extend existing auth mount)
POST /api/auth/verify/request   → send verification email (flag on; fail loud if SMTP broken)
POST /api/auth/verify/confirm   { token } → mark verified; consume token

# Application port for Epic 2
ensure_email_verified(user) / requires_verified_email(action)  # no-op when flag off

# UI (minimal, optional)
ui/app/verify/page.tsx          # confirm / resend when flag on — spine-only
```

Wire snake_case on API DTOs; map at UI edge.

### File structure requirements

Expect **UPDATE** of 1.2–1.4 auth/email files; **NEW** verification use-cases, migration, routes, and optional verify UI.

```text
api/
  domain/…                     # verified-gate rules (pure) — NEW
  application/…                # RequestVerification / ConfirmVerification / EnsureVerified — NEW
  adapters/persistence/…       # UPDATE User (+ token table); Alembic revision — NEW migration
  adapters/email/…             # UPDATE or reuse 1.4 send templates/helpers for verify link
  api/…                        # verify request/confirm routes — NEW
  tests/…                      # domain TDD + Postgres integration — NEW
ui/
  app/verify/…                 # optional confirm/resend — NEW
  proxy.ts                     # UPDATE allowlist if needed
  app/api/auth/…               # UPDATE BFF handlers if that issuer pattern was chosen
.env.example                   # UPDATE: document EMAIL_VERIFICATION_REQUIRED on/off
docker-compose*.yml            # UPDATE only if new env wiring required
```

### Existing code being modified

| Path | Expected state entering 1.5 | This story | Preserve |
|------|----------------------------|------------|----------|
| User / session / signup (1.2) | Users, hashes, cookie, personal list, FR-4-off | Add verified fields; do not break signup-when-off | Same hasher, cookie issuer, personal list |
| Sign-in/out + `proxy.ts` (1.3) | Session protection | Orthogonal verify gate; public verify routes if needed | Auth gate stays session-based |
| `adapters/email` + reset (1.4) | SMTP send + fail-loud | Verification mail via same adapter | No second SMTP stack |
| `.env.example` | `EMAIL_VERIFICATION_REQUIRED=false` stub from 1.2 | Document on → gate behavior | Default remains false |
| `/health`, Compose triad | From 1.1 | Unchanged | No Redis/worker |

### UX requirements

[Source: EXPERIENCE.md / DESIGN.md / PRD Account surface — **no dedicated verify journey**]

- UX docs do **not** specify verify-pending screens, copy, or banners — keep spine-only minimalism aligned with signup/sign-in
- Errors: what happened + what to do; clear + calm; no alarmist theatre
- Account menu (1.6) remains: sign out, password reset, Language, Theme — **no** verification settings
- Invite climax (land on inviting list) = Epic 2 / J4 — 1.5 only supplies the verified gate those flows will call when config is on
- Prefer i18n stubs for any new chrome/errors (EN until 1.6)

### Testing requirements

- Red→green domain for flag off / on-blocked / on-verified-unlocked
- Integration on **Postgres 16**: prove AC #1–#3 including SMTP fail-loud on send (mocked transport OK)
- Do **not** use SQLite as auth/integration stand-in
- No PII fixtures; generic emails only
- CI: extend api pytest; ui critical only if verify UI exists; not full Playwright every PR (AD-15)

### Project context reference

Follow `_bmad-output/project-context.md`. Highest-risk misses for this story:

- Breaking FR-1 usability when `EMAIL_VERIFICATION_REQUIRED` is off/absent
- Building a second auth/session system instead of an orthogonal verified-state gate
- Inventing a parallel SMTP client instead of reusing 1.4 `adapters/email`
- Treating verification as a profile/settings product or Account-menu feature
- Implementing full Epic 2 invitee landing inside this story
- Email enumeration via verify request/confirm errors
- Bearer in `localStorage` / dual cookies / `NEXT_PUBLIC_*` secrets
- Skipping 1.4 and hand-rolling SMTP
- Token lifecycle without expiry / single-use (rubric gap — close it here)
- Confusing Import Session with auth session or verify tokens

Source-of-truth order: ARCHITECTURE-SPINE + project-context → SPEC/DESIGN/EXPERIENCE → PRD/epics → README/research.

### Previous story intelligence

**Story 1.2** (`1-2-sign-up-…md`, ready-for-dev) — foundation this story extends:

- Stubs `EMAIL_VERIFICATION_REQUIRED=false`; AC explicitly requires FR-4 **off** usable without verify
- Explicit anti-scope: “verification-enabled gate (**1.5**)”
- Closes AD-8 forks in completion notes — **reuse** hasher, cookie issuer, BFF/proxy; never re-open
- Personal list = same List entity, one membership

**Story 1.3** (`1-3-sign-in-…md`, ready-for-dev):

- States **“1.5 Email verification | Orthogonal gate on top of session”**
- Public routes pattern + `proxy.ts`; session revoke on logout — preserve
- Generic credential errors — apply same non-enumeration discipline to verify endpoints

**Story 1.4** (`1-4-password-reset-via-email.md`, ready-for-dev) — **must complete before 1.5**:

- First real `adapters/email/` SMTP adapter (`aiosmtplib` ≥5.1.2); sync send; fail loud; public app base URL for links
- Token lifecycle secure defaults: TTL, single-use, **hash at rest**, invalidate outstanding — **reuse the same discipline** for verification tokens (prefer a separate `email_verification_token` table unless 1.4 designed a shared helper)
- Non-enumeration on email-based request endpoints; no Nodemailer / UI SMTP
- Explicit anti-scope for 1.4: “Email verification gate (**1.5**)”
- 1.4 notes FR-4 “secure account recovery” relation but reset works when verification is off — 1.5 adds the optional gate, not a rewrite of reset

**Story 1.1:** Compose triad, hex seed (`adapters/email/` path), coverage floor 60%, lockfiles as pin truth.

### Git intelligence

Recent commits are planning/BMAD artifacts only (`sprint-status`, story context files, project-context). **No application auth code on `main` yet.** After 1.1→1.4 merge, follow their conventions (ruff, ESLint+tsc, branch naming, lockfiles as pin truth, Conventional Commits).

### Latest tech information

- **aiosmtplib 5.1.2** — project floor and current PyPI line; includes STARTTLS buffered-data discard (GHSA-vxj7-4xrp-5vr4). Stay ≥5.1.2; do not pin below the floor.
- **argon2-cffi 25.x** — unchanged from 1.2; verification tokens are not password hashes (use a separate random opaque token + hash-at-rest).
- **Next.js 16.2.x:** continue using `proxy.ts` (not deprecated `middleware.ts` name) if public-route allowlists need updating for `/verify`.
- Token design: opaque single-use token with expiry; store only a hash of the token server-side; invalidate on use — fills architecture rubric gap on invite/reset/verify token lifecycle.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` — Story 1.5, FR-4, NFR-10]
- [Source: `_bmad-output/planning-artifacts/prds/prd-finance-helper-2026-08-02/prd.md` — FR-4, Account surface]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md` — AD-8, AD-1, AD-15, AD-22]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/stack-options.md` — auth/email capabilities, aiosmtplib]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/reviews/review-reconcile-prd.md` — FR-4 spine gap]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/reviews/review-rubric-walker.md` — token lifecycle gap]
- [Source: `_bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/EXPERIENCE.md` — standalone auth backlog, J4 invite (Epic 2)]
- [Source: `_bmad-output/implementation-artifacts/epic-1-context.md`]
- [Source: `_bmad-output/implementation-artifacts/1-2-sign-up-with-email-password-and-personal-list.md`]
- [Source: `_bmad-output/implementation-artifacts/1-3-sign-in-sign-out-and-protect-routes.md`]
- [Source: `_bmad-output/implementation-artifacts/1-4-password-reset-via-email.md`]
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
