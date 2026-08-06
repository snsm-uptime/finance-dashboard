# Story 2.4: Invitee signup lands on inviting list

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an invited person without an account,
I want signup from the invite link to drop me on the household list,
so that I see settle-up context immediately instead of a blank home.

## Acceptance Criteria

1. **Given** I received an unregistered-path invite email  
   **When** I open the link and complete signup (email + password)  
   **Then** I become a member of the inviting list and land on that list’s detail surface (FR-7, UX-DR16)  
   **And** I do not land on a blank Lists homepage as the first post-signup screen

2. **Given** I already have an account and open a registered-path join invite  
   **When** I accept while signed in (or after sign-in)  
   **Then** membership is created and I can open that list from Lists homepage / deep link

3. **Given** the invite token is invalid or expired  
   **When** I try to complete the flow  
   **Then** I see a clear error and am not added to the list

## Tasks / Subtasks

- [ ] Task 0: Confirm hard prerequisites are implemented (do not invent parallel stacks)
  - [ ] **1.2** User + List + ListMembership; argon2; `fh_session` cookie issuer; personal list at signup (FR-5) — extend `SignUpService` / `POST /auth/register`
  - [ ] **1.3** Sign-in / sign-out / `me`; protected routes; same-origin BFF/proxy; generic auth errors; public allowlist — add invite paths to `ui/proxy.ts`
  - [ ] **1.4** SMTP adapter + email port + `PUBLIC_APP_URL` + hashed single-use token discipline — **reuse hash helpers; do not create a second token crypto stack**
  - [ ] **1.5.1** Reuse `claim_single_use_email_token` in `api/adapters/persistence/token_claim.py` for invite consume (must include `expires_at` in UPDATE) — see [`auth-email-token-claim-pattern.md`](./auth-email-token-claim-pattern.md)
  - [ ] **1.5 Soft couple:** when `EMAIL_VERIFICATION_REQUIRED` is on, call `EnsureEmailVerifiedService` **before** creating inviting-list membership; when off/absent, accept proceeds without verify — authoritative: [`invite-verify-gate-contract.md`](./invite-verify-gate-contract.md)
  - [ ] **2.1** Owned lists + durable owner/creator
  - [ ] **2.2** Lists homepage + list detail shell + membership ACL + **`resolveAuthenticatedLanding({ inviteListId })`** / `resolveServerAuthenticatedLanding` — pass inviting `listId` after accept; must not force Lists homepage
  - [ ] **2.3** Invite send + `list_invite_token` persistence + join/signup email templates + **completion-note deep-link URLs** — this story consumes those tokens; does not re-issue send. **If 2.3 is not done: stop.**
  - [ ] Read completion notes from 1.2–1.5.x and 2.1–2.3 for: cookie name/issuer, BFF paths, invite table columns, chosen link paths, token TTL — **reuse; never re-decide**
  - [ ] Align deep links to as-built routes: UI signup is **`/signup`** (not `/sign-up`); register API is **`POST /auth/register`** (BFF `ui/app/api/auth/register`). Prefer documenting final invite URLs as `/signup?invite=…` and `/invites/accept?token=…` in **2.3 completion notes** and wire those here
  - [ ] If any hard prerequisite is incomplete: **stop** — finish those stories first (one story per branch). Rebase onto a branch that already includes 2.2 before starting

- [ ] Task 1: Domain — accept invite / signup-with-invite rules (AC: #1–#3) — TDD first
  - [ ] Domain owns: validate invite token (exists, unexpired, unused, hash matches); bind invitee email; create `ListMembership` on inviting list; consume token; reject invalid/expired/used
  - [ ] **Locked ordering** (from verify-gate contract): email-bind → `EnsureEmailVerifiedService` → claim token → create inviting membership. Never claim token or create inviting membership if bind or Ensure fails
  - [ ] **Unregistered success path (flag off, or already verified):** compose reuse of 1.2 SignUp **plus** inviting membership — create personal list (FR-5) **and** second membership on inviting list. Invitee membership role = **`"member"`** (peer; AD-19) — do not invent admin/viewer product roles; creators already use `"owner"`
  - [ ] **Unregistered + `EMAIL_VERIFICATION_REQUIRED` on (intentional partial success):** create user + personal list + **session cookie**; Ensure blocks → return **403** `email_not_verified`; **do not** claim token; **do not** create inviting membership. Client retains invite token → `/verify` → then **`AcceptListInvite(token)`** (never a second `SignUpWithInvite`)
  - [ ] **Registered path:** authenticated accept → email-bind → Ensure → claim → membership; idempotent **silent success** if already a member (UniqueConstraint `(list_id, user_id)`); never duplicate membership rows
  - [ ] Email bind (security): signup/accept email **must match** invitee email on the token row (normalize case); pre-fill and lock email on invitee signup UI from token preview — do not allow arbitrary email to redeem a token
  - [ ] Token lifecycle: enforce 2.3 TTL; consume via **`claim_single_use_email_token`** on the invite model; never store raw token; invalid/expired/used → reject with clear structured error, **no membership**
  - [ ] Call `EnsureEmailVerifiedService.execute(EnsureEmailVerifiedCommand(user_id, email_verification_required=settings.email_verification_required))` — never hard-code the flag; never call the invite-accept **stub** from product UI; map errors like the stub (**403** + `code: "email_not_verified"`)
  - [ ] Domain free of FastAPI / SQLAlchemy / aiosmtplib (AD-1)

- [ ] Task 2: Application + API — accept / signup-with-invite endpoints (AC: #1–#3)
  - [ ] Use-cases: `SignUpWithInvite`, `AcceptListInvite` — orchestrate ports only; compose `SignUpService` rather than forking register
  - [ ] Preferred API shapes (lock exact paths in 2.3/2.4 completion notes; prefer query-token preview to avoid token-in-path access logs):
    - `GET /api/invites/preview?token=` — public; returns safe preview `{ list_name, email_hint, path: "signup"|"join" }` without leaking other users; **404**/`410` for invalid/expired (do not also use a soft `expired: bool` success body)
    - Extend existing `POST /auth/register` with optional `{ email, password, invite_token }` (and matching BFF) — on full success: same httpOnly Secure session cookie as 1.2 + `{ user, inviting_list_id }`; on verify-gate partial success: session set + **403** `email_not_verified` with enough UI context to retain token and route to `/verify`
    - `POST /api/invites/accept` `{ token }` — requires session; registered join path + post-verify retry path
  - [ ] Invalid/expired/used token → clear 4xx + calm error body; no membership; no session elevation from a bad token alone
  - [ ] Auth cookie / BFF: same-origin only; never Bearer in `localStorage`; reuse register rate limits (1.5.6)
  - [ ] Keep `/health` public; never log raw tokens or plaintext passwords
  - [ ] UI i18n for gate/errors keys off stable `code` values (`email_not_verified`, token errors) — do not treat English `detail` as UX contract

- [ ] Task 3: UI — invitee deep links + landing (AC: #1–#3) — J4 Act B
  - [ ] Wire deep-link routes from **2.3 completion notes**, defaulting to as-built: `/signup?invite=…` and `/invites/accept?token=…` — add to `ui/proxy.ts` public allowlist
  - [ ] **Unregistered path:** open link → update `ui/app/signup/` (email pre-filled/locked from preview + password) → on full success navigate via `resolveAuthenticatedLanding({ inviteListId })` to `/lists/{listId}` — **not** Lists homepage, **not** blank home; set remembered last-opened to inviting list after landing
  - [ ] **Verify-on unlock UI:** when register-with-invite returns 403 `email_not_verified`, keep session, retain invite token across `/verify` (query/`returnTo`/equivalent), then call `AcceptListInvite` and land on inviting list
  - [ ] **Registered path:** if signed out → sign-in with `safeReturnTo` back to accept; if signed in → accept → land on list detail via same resolver (`inviteListId`)
  - [ ] Invalid/expired token surface: clear calm error (what happened + what to do); no fake membership; EN+ES in `ui/lib/i18n/` (extend `signup.ts` / new invite strings — **not** `messages/*.json`)
  - [ ] Climax UX: list detail Soft-Ledger shell with settle-up context slot visible — may be zero/empty until Epic 3; do **not** invent settle math in the browser; announce destination on navigate when feasible (UX-DR19)
  - [ ] Warm Balance form chrome; moss primary CTA `{rounded.sm}`; kits unstyled only (AD-12); phone-first (J4)
  - [ ] Submit via same-origin BFF/proxy only

- [ ] Task 4: Tests (AC: #1–#3)
  - [ ] Domain TDD: signup-with-invite success → personal list **and** inviting `"member"` membership; token consumed via claim helper; email mismatch rejected; expired/invalid/used → no membership; already-member silent idempotent
  - [ ] Domain/application: registered accept while authenticated → membership; verification-on SignUpWithInvite → user+session+personal list kept, **403**, token unclaimed, no inviting membership; after verify + `AcceptListInvite` → membership; verification-off proceeds atomically
  - [ ] Integration on **Postgres 16**: full unregistered path through API → membership row + session cookie; registered accept path; bad token leaves membership count unchanged; claim respects `expires_at`
  - [ ] UI test-after: post-invite-signup redirect lands on list detail (not homepage); expired-token error page; verify-on retain-token → accept → list; keep 1.1 coverage floor (60%)
  - [ ] Fixtures: `owner@example.com`, `invitee@example.com` — no real PII / personal names
  - [ ] Assert project-context must-cover edge: **unregistered invite → land on inviting list**
  - [ ] Do **not** require full Playwright every PR; no live SMTP in CI

## Dev Notes

### Epic context

Epic 2 = Shared lists & household membership (FR-6…FR-10). **Demo gate = this story:** unregistered invite → signup → lands on inviting list.

| Sibling | Relationship to 2.4 |
|---------|---------------------|
| **2.1** Create/rename lists | Prerequisite — list exists to invite into (**done**) |
| **2.2** Lists homepage / detail / first paint | Prerequisite — Soft-Ledger shell + `inviteListId` landing resolver (**done on main**; rebase if local worktree lacks it) |
| **2.3** Invite by email | Prerequisite — issues tokens + emails; 2.4 consumes/accepts (**must land before this story**) |
| **2.5** Default split | Downstream — needs multi-member lists from accept |
| **2.6** Split overrides | Downstream — peer membership set |
| **1.2 / 1.3** Auth signup/session | Hard — extend register + cookie issuer |
| **1.4 / 1.5.1** SMTP / token claim | Pattern reuse — hash/TTL; `claim_single_use_email_token` |
| **1.5 / 1.5.3** Verification | Soft gate on accept when config on — [`invite-verify-gate-contract.md`](./invite-verify-gate-contract.md) |
| **Epic 3** Soft-Ledger settle | Landing may show empty settle shell until then |

### Hard prerequisites / ordering

```text
1.1 → 1.2 → 1.3 → 1.4 → 1.5 (+ 1.5.1 claim, 1.5.3 contract) → 1.6
  → 2.1 → 2.2 → 2.3 → 2.4   ← you are here
```

- Branch: `feat/2/2-4-invitee-signup-lands-on-inviting-list` (AD-13) — **one story per branch**
- Do **not** implement 2.4 before 2.3 lands (no tokens/links to consume)
- Reuse 2.3 completion notes for invite table shape and deep-link URL paths
- Reuse 1.2 completion notes for session issuer — never dual-stack cookies for “invite session”

### Scope boundaries (anti-scope)

| In 2.4 | Out of 2.4 |
|--------|------------|
| Unregistered invite → signup → membership + land on inviting list detail | Invite **send** UI/API / SMTP templates (**2.3**) |
| Registered join accept → membership + open list | Owner invite form / invite-sent confirmation (**2.3**) |
| Invalid/expired/used token → clear error, no membership | Standing default split when members join (**2.5**) |
| Email-bind + claim token + FR-5 personal list still created | Real settle-up balances / Adjust-split UI (**Epic 3**) |
| Override first-paint via `inviteListId` resolver | Lists homepage / ACL implementation (**2.2**) |
| Call Ensure gate when config on; verify unlock → `AcceptListInvite` | Global verify-to-login wall; Account settings product |
| EN+ES invitee error/signup chrome | New SMTP client; Redis/worker |

**Forbidden:** Bearer in `localStorage` · landing on blank Lists homepage after invitee signup · creating membership without valid token · claiming token when Ensure/email-bind fails · skipping FR-5 personal list · second session issuer · second register entrypoint · domain importing FastAPI/SQLAlchemy · `NEXT_PUBLIC_*` secrets · inventing owner-vs-viewer product roles (AD-19 peers) · settle math in the browser · SQLite as integration stand-in · hand-rolled token claim that omits `expires_at`.

### Architecture compliance

[Source: `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md`]

- **AD-1:** Hex — accept/signup-with-invite rules in `domain`/`application`; ORM in `adapters/persistence`; cookie edge in `api/api/`; `ui` → HTTP only
- **AD-2:** No Redis/worker for invite tokens — Postgres row only
- **AD-8:** httpOnly Secure cookie session after signup; invite links carry opaque tokens (not API Bearer tokens); same-origin BFF/proxy; AD-8 addendum = claim helper with `expires_at`
- **AD-12:** EXPERIENCE J4 + DESIGN bind landing UX; Soft-Ledger shell OK empty until Epic 3
- **AD-13 / AD-15:** One story per branch; domain TDD; CI lint + pytest + ui typecheck — not full Playwright every PR
- **AD-19:** **Invite acceptance creates membership**; peers (`"member"`); personal list still auto-created at signup; membership ACL for subsequent R/W
- **AD-22:** Alembic only if schema gap vs 2.3; never wipe PG volume; secrets outside repo

**Living contracts (must follow — do not re-decide):**
1. [`invite-verify-gate-contract.md`](./invite-verify-gate-contract.md) — Ensure ordering, partial success, 403 `email_not_verified`, retain token → AcceptListInvite
2. [`auth-email-token-claim-pattern.md`](./auth-email-token-claim-pattern.md) — `claim_single_use_email_token`
3. Architecture review gap close: invite token lifecycle defaults owned by 2.3 issue / 2.4 consume
4. Email-match on redeem — bind token ↔ invitee email (required security default)
5. Invite landing “Dropped” from spine ADs — still binding via EXPERIENCE (AD-12), SPEC CAP-3, epics, project-context tests, and 2.2 `inviteListId` resolver

**Do not confuse:** Auth **session** (cookie) ≠ **Import Session** (AD-4) ≠ **invite token** ≠ **password-reset token** ≠ **verification token**.

### Library / framework requirements

| Piece | Pin / guidance | Notes |
|-------|----------------|-------|
| argon2-cffi / `fh_session` cookie | From **1.2/1.3** lock + completion notes | Same hasher + single cookie issuer (`AuthSettings.session_cookie_name`) |
| aiosmtplib | ≥5.1.2 | Send already done in 2.3 — 2.4 typically does not send mail |
| FastAPI / Pydantic / SQLAlchemy / Alembic | From 1.1 lockfile | Extend register + invite preview/accept routes |
| Next.js / React | 16.2.x / 19.2.x | `/signup` invite param + `/invites/accept` + list detail redirect |
| i18n | `ui/lib/i18n/*.ts` (from 1.6) | Invitee UI chrome/errors EN+ES |

After lockfiles exist: do not bump unrelated majors inside this feature story.

**Latest auth practice (2026):** Prefer opaque DB-backed sessions + httpOnly Secure SameSite cookies for first-party apps; hash invite tokens at rest; single-use consume with `expires_at` re-check; never put tokens in `localStorage`. Aligns with AD-8 and Stories 1.2–1.5.1.

### Recommended API / UI shapes

```text
# Preview (public) — prefer query param over path token
GET  /api/invites/preview?token=…
  → 200 { list_name, email_hint, path: "signup"|"join" }
  → 404/410 invalid or expired

# Unregistered climax — extend as-built register (do not add /auth/sign-up)
POST /auth/register  { email, password, invite_token? }
  → Set-Cookie (fh_session) + { user, inviting_list_id }     # full success
  → Set-Cookie + 403 { code: "email_not_verified", … }       # flag on: retain token → /verify → AcceptListInvite

# Registered join + post-verify retry
POST /api/invites/accept  { token }   # session required
  → { list_id } | 401 → UI routes to /sign-in?returnTo=…

# Landing choke (2.2 — do not fork)
resolveAuthenticatedLanding({ inviteListId }) → `/lists/{id}`

ui/app/signup/…                      # UPDATE — ?invite= token (prefill/lock email)
ui/app/invites/accept/…              # NEW — registered accept / sign-in returnTo
ui/app/lists/[listId]/…              # destination after success (2.2 Soft-Ledger shell)
ui/lib/landing.ts + serverLanding.ts # UPDATE call sites — pass inviteListId
ui/proxy.ts                          # UPDATE — public allowlist for /invites…
ui/lib/i18n/signup.ts (+ invite keys)# UPDATE — EN+ES chrome/errors keyed by code
```

Wire snake_case on API DTOs; map at UI edge.

### Carry-forward from 2.3 (issue contract — consume only)

When 2.3 completion notes land, treat them as SoT. Expected shape unless 2.3 documents otherwise:

| Concern | Default |
|---------|---------|
| Table | `list_invite_token`: UUID PK; `list_id`; invitee email (normalized); `token_hash`; `inviter_user_id`; locale; `expires_at`; `used_at`; `created_at` |
| TTL | ≤7 days recommended (document chosen value) |
| Single-use | Consumed on successful accept here via `claim_single_use_email_token` |
| Resend | Outstanding unused invites for same `(list_id, email)` invalidated on new send (2.3) |
| Membership on send | **Never** — membership only on accept |
| Deep links | Prefer `/signup?invite=…` + `/invites/accept?token=…` (align with as-built `/signup`) |

### File structure requirements

```text
api/
  domain/…                         # accept + signup-with-invite rules (pure) — NEW/UPDATE
  application/signup.py            # UPDATE/compose — SignUpWithInvite orchestration
  application/…                    # AcceptListInvite — NEW
  application/email_verification.py# REUSE EnsureEmailVerifiedService
  adapters/persistence/token_claim.py  # REUSE claim_single_use_email_token
  adapters/persistence/…           # UPDATE invite token consume; ListMembership insert
  api/routes/auth.py               # UPDATE register optional invite_token; map gate errors
  api/routes/…                     # invite preview + accept
  api/schemas/auth.py              # UPDATE RegisterRequest
  tests/…                          # domain TDD + Postgres integration
ui/
  app/signup/…                     # UPDATE — invite query param path
  app/invites/accept/…             # NEW — registered accept surface
  app/lists/[listId]/…             # destination (existing 2.2)
  app/api/auth/register/…          # UPDATE BFF if body gains invite_token
  lib/landing.ts, serverLanding.ts # UPDATE — pass inviteListId
  proxy.ts                         # UPDATE — public invite routes
  lib/i18n/*.ts                    # UPDATE — invitee errors/chrome EN+ES
```

### Existing code being modified

| Path | Expected state entering 2.4 | This story | Preserve |
|------|----------------------------|------------|----------|
| `SignUpService` / `POST /auth/register` | From **1.2** — standalone signup → personal list + cookie | Compose SignUpWithInvite / optional `invite_token` on register | Same hasher, cookie issuer, FR-5 personal list |
| `list_invite_token` + email templates | From **2.3** — issued, hashed, emailed | Consume/validate only; do not re-send | TTL/hash/single-use; link URL shapes from 2.3 notes |
| `resolveAuthenticatedLanding` / server twin | From **2.2** — `inviteListId` → `/lists/{id}` else remembered/homepage | Pass inviting list id after accept/signup success | Membership re-check; ACL ports |
| List detail shell | From **2.2** | Landing climax surface | Empty settle OK until Epic 3 |
| `EnsureEmailVerifiedService` | From **1.5** | Call on accept / signup-with-invite before membership | Flow-scoped gate; not global login wall; stub remains probe until deleted post-2.4 |
| `claim_single_use_email_token` | From **1.5.1** | Claim invite rows | `expires_at` in UPDATE |
| `proxy.ts` / BFF | From **1.3** | Allowlist `/invites…` | Same-origin cookie; no Bearer storage |
| `api/adapters/email/` | From **1.4/2.3** | Usually untouched (send = 2.3) | Do not add second SMTP client |
| `safeReturnTo` / sign-in | From **1.3** | Registered accept when signed out | Open-redirect safety |

**As-built baseline:** Epic 1 + 1.5 + 2.1 are done; 2.2 landing resolver exists on main. Treat File Lists / completion notes in those stories as SoT. Do **not** scaffold a parallel auth, membership, i18n, or landing stack. **2.3 must still land first** (tokens/templates/URLs).

### UX requirements

[Source: EXPERIENCE.md · DESIGN.md · journey-j4-invite.md · UX-DR9/16/17/18/19 · list-settle.html as visual climax reference]

- **J4 Act B (this story):** Open invite email → sign up (email + password) → land on inviting household list (**not blank home**) → climax: shared list with settle-up context visible (empty Soft-Ledger OK until Epic 3)
- **IA:** Invitee signup + Invitee lands states (UX-DR9)
- **UX-DR16:** Invitee signup lands on inviting list with settle-up context (email language already set by 2.3 from inviter Account EN/ES)
- First-paint remembered-list / homepage applies when there is **no** invite deep link (2.2 AC) — invitee path always supplies `inviteListId`
- Errors: what happened + what to do; clear + calm; no peer blame; i18n keyed by stable API `code`
- No dedicated invitee mock — use Warm Balance forms + `mockups/list-settle.html` composition for post-landing shell
- Registered join is required by FR-7 / AC #2 even though J4 narrates the unregistered path

**Documented product choices for this story:**
- Already-member accept → **silent success** (idempotent; no duplicate row)
- After registered accept → prefer **list detail** via `inviteListId` (AC also allows homepage visibility)
- Exact EN/ES copy for expired-token / email-mismatch → define in `ui/lib/i18n` and record in completion notes

### Testing requirements

- Domain: red→green TDD for accept / signup-with-invite / token reject / email bind / claim helper (AD-15)
- Integration: Postgres 16 — membership created only on success; cookie set; bad token no membership; flag-on partial success retains unclaimed token
- Must-cover (project-context): **unregistered invite → land on inviting list**
- UI: redirect target after invite signup; expired token error; verify retain-token unlock — test-after OK; keep coverage floor
- When 1.5 on: SignUpWithInvite blocks inviting membership until verified + AcceptListInvite; when off: full success without verify
- No live SMTP; no Playwright-every-PR requirement

### Previous story intelligence

| Source | Carry forward into 2.4 |
|--------|------------------------|
| **2.3** | Issues `list_invite_token` (hash, TTL ≤7d recommended, invalidate outstanding per list+email); deep-link URLs in completion notes; membership **not** created on send; join vs signup templates; owner-only send |
| **2.2** | Soft-Ledger destination; `resolveAuthenticatedLanding({ inviteListId })`; membership ACL; forbid hardcoding “always `/lists` homepage” after signup |
| **2.1** | Owner/creator model; lists to invite into; as-built `ui/app/lists/` |
| **1.2** | `SignUpService`, `POST /auth/register`, BFF register, FR-5 personal list, argon2 + `fh_session`; invitee landing deferred here |
| **1.3** | `proxy.ts` public allowlist; sign-in `returnTo` / `safeReturnTo`; generic auth errors |
| **1.4** | Token hash/TTL/single-use discipline; fail-loud SMTP (send side already 2.3) |
| **1.5 / 1.5.3** | `EMAIL_VERIFICATION_REQUIRED`; Ensure service; locked ordering + partial success + AcceptListInvite retry |
| **1.5.1** | `claim_single_use_email_token` mandatory for invite consume |
| **1.5.6** | Register rate limits still apply to signup-with-invite |
| **1.6** | Inviter language already applied at send (2.3); invitee UI chrome uses viewer locale via `ui/lib/i18n` |

Use done-story File Lists / Completion Notes as SoT for seams. For 2.3, wait for its completion notes before locking final invite URL strings if they differ from `/signup?invite=` / `/invites/accept?token=`.

### Git intelligence summary

Recent history includes Epic 1.5 hardening, Story **2.1** lists, and Story **2.2** homepage/ACL/landing on main. Follow those Conventional Commit / File List patterns. Expect **2.3** implementation commits before this branch starts; consume their completion notes rather than re-opening stack forks.

### Latest tech information

- **Browser auth (2026):** httpOnly + Secure + SameSite cookies remain the right default for first-party apps; Bearer-in-`localStorage` remains an anti-pattern (matches AD-8).
- **Opaque sessions:** Prefer DB-backed opaque session ids when revocation matters — Stories 1.2/1.3 already ship this (`fh_session`).
- **Invite tokens:** High-entropy opaque value in email link; store only hash; single-use claim with `expires_at`; bind to email + list_id — fills architecture rubric gap.
- **aiosmtplib ≥5.1.2:** Irrelevant to accept path unless resending; do not add a second mail stack.

### Project context reference

Follow `_bmad-output/project-context.md`:

- Hex ports; UUID entities; generic auth errors; EN+ES chrome keyed by stable codes
- Never Bearer in `localStorage`; never `NEXT_PUBLIC_*` secrets
- Must-cover when auth/invite stories exist: generic auth errors; **unregistered invite → land on inviting list**
- Source-of-truth order: ARCHITECTURE-SPINE + project-context → SPEC → DESIGN/EXPERIENCE → PRD/epics → living invite/verify contracts

### References

- `_bmad-output/planning-artifacts/epics.md` — Story 2.4 ACs; FR-7; UX-DR16; Epic 2 demo gate
- `_bmad-output/specs/spec-finance-helper/SPEC.md` — CAP-3 post-signup redirect
- `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md` — AD-8, AD-19, capability map
- `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/reviews/review-rubric-walker.md` — token lifecycle gap
- `_bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/EXPERIENCE.md` — J4, Invitee lands
- `_bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/.working/journey-j4-invite.md` — Act B
- `_bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/mockups/list-settle.html` — landing visual reference
- `_bmad-output/planning-artifacts/prds/prd-finance-helper-2026-08-02/prd.md` — FR-7 narrative
- `_bmad-output/implementation-artifacts/2-3-invite-members-by-email.md` — token issue + link contracts
- `_bmad-output/implementation-artifacts/2-2-lists-homepage-membership-scoped-access.md` — `inviteListId` landing resolver
- `_bmad-output/implementation-artifacts/1-2-sign-up-with-email-password-and-personal-list.md` — signup + personal list
- `_bmad-output/implementation-artifacts/invite-verify-gate-contract.md` — accept gate (authoritative)
- `_bmad-output/implementation-artifacts/auth-email-token-claim-pattern.md` — claim helper
- `_bmad-output/project-context.md` — agent implementation rules

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

---

**Ultimate context engine analysis completed — comprehensive developer guide created.**
