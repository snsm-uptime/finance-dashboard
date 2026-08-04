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
  - [ ] **1.2** User + List + ListMembership; argon2; session cookie issuer; personal list at signup (FR-5)
  - [ ] **1.3** Sign-in / sign-out / `me`; protected routes; same-origin BFF/proxy; generic auth errors; public allowlist for invite deep links
  - [ ] **1.4** SMTP adapter + email port + `PUBLIC_APP_URL` + hashed single-use token discipline — **reuse patterns; do not create a second token crypto stack**
  - [ ] **1.5 Soft couple:** when `EMAIL_VERIFICATION_REQUIRED` is on, call the 1.5 `ensure_email_verified` / gated-flow port **before** creating membership on accept; when off/absent, accept proceeds without verify — authoritative: [`invite-verify-gate-contract.md`](./invite-verify-gate-contract.md)
  - [ ] **2.1** Owned lists + durable owner/creator
  - [ ] **2.2** Lists homepage + list detail shell + membership ACL + first-paint router with **invite deep-link hook** (must not force Lists homepage after invitee signup)
  - [ ] **2.3** Invite send + `list_invite_token` persistence + join/signup email templates + documented deep-link URLs — **this story consumes those tokens; does not re-issue send**
  - [ ] Read completion notes from 1.2–1.5 and 2.2–2.3 for: cookie name/issuer, BFF vs proxy, opaque vs JWT, invite table columns, link paths (`/invites/accept?token=…` and/or `/sign-up?invite=…`), token TTL — **reuse; never re-decide**
  - [ ] If any hard prerequisite is incomplete: **stop** — finish those stories first (one story per branch)

- [ ] Task 1: Domain — accept invite / signup-with-invite rules (AC: #1–#3) — TDD first
  - [ ] Domain owns: validate invite token (exists, unexpired, unused, hash matches); bind invitee email; create `ListMembership` on inviting list; consume token; reject invalid/expired/used
  - [ ] **Unregistered path:** signup (reuse 1.2 SignUp) **plus** membership on inviting list **in one atomic flow** — still create personal list (FR-5) **and** second membership on inviting list
  - [ ] **Registered path:** authenticated accept → membership on inviting list; consume token; idempotent calm handling if already a member (document choice: success no-op vs clear message — never duplicate membership rows)
  - [ ] Email bind (security — architecture gap close): signup/accept email **must match** invitee email on the token row (normalize case); pre-fill and/or lock email on invitee signup UI from token preview — do not allow arbitrary email to redeem a token
  - [ ] Token lifecycle (mirror 2.3 / 1.4 defaults): enforce TTL, single-use consume on success, never store raw token; invalid/expired/used → reject with clear structured error, **no membership**
  - [ ] Call 1.5 verification gate port when flag on before membership commit
  - [ ] Domain free of FastAPI / SQLAlchemy / aiosmtplib (AD-1)

- [ ] Task 2: Application + API — accept / signup-with-invite endpoints (AC: #1–#3)
  - [ ] Use-cases (names may vary): `SignUpWithInvite`, `AcceptListInvite` — orchestrate ports only
  - [ ] Recommended API shapes (align with 2.3 completion-note URLs):
    - `GET /api/invites/{token}` or `GET /api/invites/preview?token=` — public; returns safe preview `{ list_name, email_hint, path: "signup"|"join", expired: bool }` without leaking other users
    - `POST /api/auth/sign-up` extended with `{ email, password, invite_token }` **or** dedicated `POST /api/invites/accept-signup` — creates user + personal list + inviting membership + session cookie
    - `POST /api/invites/accept` `{ token }` — requires session; registered join path
  - [ ] On signup-with-invite success: set **same** httpOnly Secure session cookie as 1.2 (single issuer); return list id for redirect
  - [ ] Invalid/expired/used token → clear 4xx + calm error body; no membership; no session elevation from a bad token
  - [ ] Auth cookie / BFF: same-origin only; never Bearer in `localStorage`
  - [ ] Keep `/health` public; never log raw tokens or plaintext passwords

- [ ] Task 3: UI — invitee deep links + landing (AC: #1–#3) — J4 Act B
  - [ ] Wire deep-link routes documented by **2.3** (e.g. `/sign-up?invite=…` and `/invites/accept?token=…`) — public in `proxy.ts` allowlist
  - [ ] **Unregistered path:** open link → signup form (email pre-filled/locked from preview + password) → on success **navigate to inviting list detail** (`/lists/{listId}` or 2.2 detail route) — **not** Lists homepage, **not** blank home
  - [ ] Override 2.2 first-paint / post-signup default when invite context is present — use the hook/comment left in 2.2; after landing, set remembered last-opened to inviting list
  - [ ] **Registered path:** if signed out → sign-in with `returnTo` back to accept; if signed in → accept → open list detail (or Lists homepage with list visible — AC allows either; prefer deep link to list detail)
  - [ ] Invalid/expired token surface: clear calm error (what happened + what to do); no fake membership; EN+ES keys (UX-DR17/18)
  - [ ] Climax UX: list detail / shared-expenses **shell** with settle-up context slot visible — Soft-Ledger strip may be zero/empty until Epic 3 (same as 2.2); do **not** invent settle math in the browser
  - [ ] Warm Balance form chrome; moss primary CTA `{rounded.sm}`; kits unstyled only (AD-12); phone-first (J4)
  - [ ] Submit via same-origin BFF/proxy only

- [ ] Task 4: Tests (AC: #1–#3)
  - [ ] Domain TDD: signup-with-invite → personal list **and** inviting membership; token consumed; email mismatch rejected; expired/invalid/used → no membership; already-member idempotent
  - [ ] Domain/application: registered accept while authenticated → membership; verification-on blocks accept until verified (1.5 port); verification-off proceeds
  - [ ] Integration on **Postgres 16**: full unregistered path through API → membership row + session cookie; registered accept path; bad token leaves membership count unchanged
  - [ ] UI test-after: post-invite-signup redirect lands on list detail (not homepage); expired-token error page; keep 1.1 coverage floor (60%)
  - [ ] Fixtures: `owner@example.com`, `invitee@example.com` — no real PII / personal names
  - [ ] Assert project-context must-cover edge: **unregistered invite → land on inviting list**
  - [ ] Do **not** require full Playwright every PR; no live SMTP in CI

## Dev Notes

### Epic context

Epic 2 = Shared lists & household membership (FR-6…FR-10). **Demo gate = this story:** unregistered invite → signup → lands on inviting list.

| Sibling | Relationship to 2.4 |
|---------|---------------------|
| **2.1** Create/rename lists | Prerequisite — list exists to invite into |
| **2.2** Lists homepage / detail / first paint | Prerequisite — landing surface + invite deep-link exception hook |
| **2.3** Invite by email | Prerequisite — issues tokens + emails; 2.4 consumes/accepts |
| **2.5** Default split | Downstream — needs multi-member lists from accept |
| **2.6** Split overrides | Downstream — peer membership set |
| **1.2 / 1.3** Auth signup/session | Hard — reuse register + cookie issuer |
| **1.4** SMTP / tokens | Pattern reuse — hash/TTL/single-use |
| **1.5** Verification | Soft gate on accept when config on |
| **Epic 3** Soft-Ledger settle | Landing may show empty settle shell until then |

### Hard prerequisites / ordering

```text
1.1 → 1.2 → 1.3 → 1.4 (+ 1.5 optional gate, 1.6 for invite locale in 2.3)
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
| Email-bind + consume token + FR-5 personal list still created | Real settle-up balances / Adjust-split UI (**Epic 3**) |
| Override first-paint when invite deep link present | Lists homepage / ACL implementation (**2.2**) |
| Call 1.5 verified gate when config on | Global verify-to-login wall; Account settings product |
| EN+ES invitee error/signup chrome | New SMTP client; Redis/worker |

**Forbidden:** Bearer in `localStorage` · landing on blank Lists homepage after invitee signup · creating membership without valid token · skipping FR-5 personal list · second session issuer · domain importing FastAPI/SQLAlchemy · `NEXT_PUBLIC_*` secrets · inventing owner-vs-viewer product roles (AD-19 peers) · settle math in the browser · SQLite as integration stand-in.

### Architecture compliance

[Source: `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md`]

- **AD-1:** Hex — accept/signup-with-invite rules in `domain`/`application`; ORM in `adapters/persistence`; cookie edge in `api/api/`; `ui` → HTTP only
- **AD-2:** No Redis/worker for invite tokens — Postgres row only
- **AD-8:** httpOnly Secure cookie session after signup; invite links carry opaque tokens (not API Bearer tokens); same-origin BFF/proxy
- **AD-12:** EXPERIENCE J4 + DESIGN bind landing UX; Soft-Ledger shell OK empty until Epic 3
- **AD-13 / AD-15:** One story per branch; domain TDD; CI lint + pytest + ui typecheck — not full Playwright every PR
- **AD-19:** **Invite acceptance creates membership**; peers; personal list still auto-created at signup; membership ACL for subsequent R/W
- **AD-22:** Alembic only if schema gap vs 2.3; never wipe PG volume; secrets outside repo

**Known gaps (implementer closes with documented defaults — reviews flagged Missing):**
1. Invite token lifecycle — enforce 2.3 defaults (TTL, single-use, hash-at-rest)
2. Email-match on redeem — bind token ↔ invitee email (not spelled as an AD; treat as required)
3. Invite landing “Dropped” from spine ADs — still binding via EXPERIENCE (AD-12), SPEC CAP-3, epics, project-context tests

**Do not confuse:** Auth **session** (cookie) ≠ **Import Session** (AD-4) ≠ **invite token** ≠ **password-reset token** ≠ **verification token**.

### Library / framework requirements

| Piece | Pin / guidance | Notes |
|-------|----------------|-------|
| argon2-cffi / session cookie | From **1.2/1.3** lock + completion notes | Same hasher + single cookie issuer |
| aiosmtplib | ≥5.1.2 | Send already done in 2.3 — 2.4 typically does not send mail |
| FastAPI / Pydantic / SQLAlchemy / Alembic | From 1.1 lockfile | Accept/signup routes + persistence |
| Next.js / React | 16.2.x / 19.2.x | Deep-link signup/accept + list detail redirect |
| i18n | From 1.6 | Invitee UI chrome/errors EN+ES |

After lockfiles exist: do not bump unrelated majors inside this feature story.

**Latest auth practice (2026):** Prefer opaque DB-backed sessions + httpOnly Secure SameSite cookies for first-party apps; hash invite tokens at rest; single-use consume; never put tokens in `localStorage`. Aligns with AD-8 and Stories 1.2–1.4.

### Recommended API / UI shapes

```text
# Preview (public)
GET  /api/invites/preview?token=…  → { list_name, email, path: "signup"|"join" } | 410/404 expired/invalid

# Unregistered climax
POST /api/auth/sign-up  { email, password, invite_token }
  → Set-Cookie + { user, inviting_list_id }   # or dedicated accept-signup route

# Registered join
POST /api/invites/accept  { token }   # session required
  → { list_id } | 401 → UI routes to sign-in?returnTo=…

ui/app/sign-up/page.tsx              # UPDATE — support ?invite= token (prefill/lock email)
ui/app/invites/accept/page.tsx       # NEW — registered accept / sign-in returnTo
ui/…/lists/[listId]/…                # destination after success (2.2 shell)
ui/proxy.ts                          # UPDATE — public allowlist for invite paths
ui first-paint helper                # UPDATE — skip homepage when invite landing context
```

Wire snake_case on API DTOs; map at UI edge.

### File structure requirements

```text
api/
  domain/…                         # accept + signup-with-invite rules (pure) — NEW/UPDATE
  application/…                    # SignUpWithInvite, AcceptListInvite — NEW
  adapters/persistence/…           # UPDATE invite token consume; ListMembership insert
  api/routes/…                     # invite preview/accept + signup extension
  tests/…                          # domain TDD + Postgres integration
ui/
  app/sign-up/…                    # UPDATE — invite query param path
  app/invites/accept/…             # NEW — registered accept surface
  app/(auth)/lists/[listId]/…      # UPDATE — post-accept destination (existing 2.2)
  lib/… first-paint / invite landing helper
  proxy.ts                         # UPDATE — public invite routes
  messages/en.json, es.json        # UPDATE — invitee errors/chrome
  app/api/…                        # optional BFF forwarders
```

### Existing code being modified

| Path | Expected state entering 2.4 | This story | Preserve |
|------|----------------------------|------------|----------|
| Signup use-case / `POST …/sign-up` | From **1.2** — standalone signup → personal list + cookie | Extend with invite_token path OR compose SignUp + Accept | Same hasher, cookie issuer, FR-5 personal list |
| `list_invite_token` + email templates | From **2.3** — issued, hashed, emailed | Consume/validate only; do not re-send | TTL/hash/single-use rules; link URL shapes |
| First-paint / post-auth redirect | From **2.2** — remembered list else homepage | Invite deep-link **overrides** homepage | Membership re-check; ACL ports |
| List detail shell | From **2.2** | Landing climax surface | Empty settle OK until Epic 3 |
| `ensure_email_verified` port | From **1.5** | Call on accept when flag on | Flow-scoped gate; not global login wall |
| `proxy.ts` / BFF | From **1.3** | Allowlist invite public paths | Same-origin cookie; no Bearer storage |
| `api/adapters/email/` | From **1.4/2.3** | Usually untouched (send = 2.3) | Do not add second SMTP client |

**Greenfield note (as of story creation):** Working tree is still largely **1.1 scaffold** (health only; empty `adapters/email/`; no auth/lists). Auth, lists, invite send, and first-paint land in prerequisite stories before this one runs. Do not scaffold a parallel auth or membership stack.

### UX requirements

[Source: EXPERIENCE.md · DESIGN.md · journey-j4-invite.md · UX-DR9/16/17/18 · list-settle.html as visual climax reference]

- **J4 Act B (this story):** Open invite email → sign up (email + password) → land on inviting household list (**not blank home**) → climax: shared list with settle-up context visible
- **IA:** Invitee signup + Invitee lands states (UX-DR9)
- **UX-DR16:** Invitee signup lands on inviting list with settle-up context (email language already set by 2.3 from inviter Account EN/ES)
- First-paint remembered-list / homepage applies when there is **no** invite deep link (2.2 AC)
- Errors: what happened + what to do; clear + calm; no peer blame
- No dedicated invitee mock — use Warm Balance forms + `mockups/list-settle.html` composition for post-landing shell
- Registered join is required by FR-7 / AC #2 even though J4 narrates the unregistered path

**Unresolved in PRD/UX (document choice in completion notes):**
- Exact EN/ES strings for expired-token and email-mismatch
- Whether already-member accept is silent success or calm “you’re already on this list”
- Prefer redirect to list detail over homepage after registered accept (recommended)

### Testing requirements

- Domain: red→green TDD for accept / signup-with-invite / token reject / email bind (AD-15)
- Integration: Postgres 16 — membership created only on success; cookie set; bad token no membership
- Must-cover (project-context): **unregistered invite → land on inviting list**
- UI: redirect target after invite signup; expired token error — test-after OK; keep coverage floor
- When 1.5 on: accept blocked until verified; when off: accept works
- No live SMTP; no Playwright-every-PR requirement

### Previous story intelligence

| Source | Carry forward into 2.4 |
|--------|------------------------|
| **2.3** | Issues `list_invite_token` (hash, TTL ≤7d recommended, invalidate outstanding per list+email); deep-link URLs in completion notes; membership **not** created on send; join vs signup templates; owner-only send |
| **2.2** | List detail destination; first-paint hook/comment for invite exception; membership ACL; forbidden “always Lists homepage after every signup” |
| **2.1** | Owner/creator model; lists to invite into |
| **1.2** | Standalone signup **outside** invite flows until this story; FR-5 personal list; argon2 + cookie; explicit deferral: invitee landing = 2.4 |
| **1.3** | `proxy.ts` public allowlist; sign-in `returnTo` for registered accept; generic auth errors |
| **1.4** | Token hash/TTL/single-use discipline; fail-loud SMTP (send side already 2.3) |
| **1.5** | `EMAIL_VERIFICATION_REQUIRED`; flow-scoped gate; “do not implement full invitee landing here”; stable port for accept |
| **1.6** | Inviter language already applied at send (2.3); invitee UI chrome uses viewer locale |

Epic 1–2 File Lists / Completion Notes are empty while stories are ready-for-dev — treat story specs + scaffold as SoT until implementation lands.

### Git intelligence summary

Recent commits are BMAD story-context artifacts (`1.1`–`1.6`, Epic 2 story files appearing for 2.1–2.3). Application code on disk is still **1.1 scaffold**. Expect 1.2–2.3 implementation commits before this branch starts; follow their completion notes rather than re-opening stack forks.

### Latest tech information

- **Browser auth (2026):** httpOnly + Secure + SameSite cookies remain the right default for first-party apps; Bearer-in-`localStorage` remains an anti-pattern (matches AD-8).
- **Opaque sessions:** Prefer DB-backed opaque session ids when revocation matters (logout, password reset) — Stories 1.2/1.3 already bias this way.
- **Invite tokens:** High-entropy opaque value in email link; store only hash; single-use consume; TTL; bind to email + list_id — fills architecture rubric gap.
- **aiosmtplib ≥5.1.2:** Irrelevant to accept path unless resending; do not add a second mail stack.

### Project context reference

Follow `_bmad-output/project-context.md`:

- Hex ports; UUID entities; generic auth errors; EN+ES chrome
- Never Bearer in `localStorage`; never `NEXT_PUBLIC_*` secrets
- Must-cover when auth/invite stories exist: generic auth errors; **unregistered invite → land on inviting list**
- Source-of-truth order: ARCHITECTURE-SPINE + project-context → SPEC → DESIGN/EXPERIENCE → PRD/epics

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
- `_bmad-output/implementation-artifacts/2-2-lists-homepage-membership-scoped-access.md` — first-paint invite exception
- `_bmad-output/implementation-artifacts/1-2-sign-up-with-email-password-and-personal-list.md` — signup + personal list
- `_bmad-output/implementation-artifacts/1-5-config-gated-email-verification.md` — accept gate port
- `_bmad-output/project-context.md` — agent implementation rules

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

---

**Ultimate context engine analysis completed — comprehensive developer guide created.**
