---
baseline_commit: 24bf63c Merge pull request #8 from snsm-uptime/feat/2/2-1-create-and-rename-owned-lists
---

# Story 1.5.2: Auth/mail interaction map and story-close overview process

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the project lead,
I want a living auth/mail interaction map and a story-close how/why overview habit,
so that I understand how pieces interact before a story is marked done.

## Acceptance Criteria

1. **Given** the Epic 1 auth and mail flows (session/BFF, reset, verify, SMTP)  
   **When** the interaction map is delivered  
   **Then** it shows request path, key components, and why that shape — usable without reverse-engineering diffs

2. **And** the team agreement is recorded: before marking a story done, deliver a short how/why overview (what not to break included)

## Tasks / Subtasks

- [x] Task 0: Confirm scope and sources (AC: #1, #2)
  - [x] Read Epic 1.5 / Story 1.5.2 in `epics.md`, sprint change proposal, and Epic 1 retro AI #1 + #2
  - [x] Skim AD-8 (+ addendum) and Consistency → Auth cookies / Auth email tokens in `ARCHITECTURE-SPINE.md`
  - [x] Confirm this is **documentation + process only** — no auth/SMTP/product code changes
  - [x] If a living map + recorded close habit already exist and satisfy ACs: stop and report — do not invent parallel docs

- [x] Task 1: Auth/mail living interaction map (AC: #1)
  - [x] Create durable artifact next to the spine: `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/auth-mail-interaction-map.md`
  - [x] Add a one-line pointer from `ARCHITECTURE-SPINE.md` (AD-8 or Capability Map) to that file — do not rewrite AD-8
  - [x] Cover **all four** surfaces with the same structure each:
    1. **Session / BFF** — register, sign-in, sign-out, `/auth/session`, `/auth/me`, `proxy.ts` coarse gate, `fetchSession`
    2. **Password reset** — request + confirm (persist-before-send, claim, revoke sessions)
    3. **Email verification** — config gate `EMAIL_VERIFICATION_REQUIRED`, request + confirm, `EnsureEmailVerifiedService` + `POST /auth/gated-flows/invite-accept-stub`
    4. **SMTP** — `SmtpEmailSender`, fail-loud config/send errors, env bindings
  - [x] For each surface document: **request path** (browser → ui BFF → api → adapters), **key components** (concrete file paths), **why this shape** (AD-8 / review decisions), **what not to break**
  - [x] Include one scannable mermaid (or ASCII) overview of cookie + mail token flows — not a novel
  - [x] Point at `auth-email-token-claim-pattern.md` for claim/`expires_at` (Story 1.5.1) — do not re-implement claim SQL
  - [x] Document **target claim truth** (shared helper + `expires_at` in WHERE). If `token_claim.py` is not on the branch yet, note “lands with 1.5.1 merge” — do **not** wait to finish this story, and do **not** document the pre-1.5.1 gap as current truth
  - [x] Reflect **as-built** code (opaque DB session, **api** cookie issuer, BFF forwards `Set-Cookie`) — no redesign

- [x] Task 2: Story-close how/why overview habit (AC: #2)
  - [x] Create durable artifact: `_bmad-output/implementation-artifacts/story-close-overview-checklist.md`
  - [x] Record the **team agreement**: a story is not `done` until a short how/why overview exists in that story’s Dev Agent Record / Completion Notes (or a linked artifact)
  - [x] Provide a **copy-paste template** with required sections: Request path · Key components · Why this shape · What not to break
  - [x] Keep template ≤1 screen — green tests alone do not satisfy close
  - [x] Add one workflow one-liner under Development Workflow Rules in `_bmad-output/project-context.md` pointing at the checklist (do not dump the full template there)
  - [x] Cross-link map ↔ checklist

- [x] Task 3: Hygiene + handoff (AC: #1, #2)
  - [x] Link both artifacts from this story’s Completion Notes / File List
  - [x] Mark both sprint `action_items` done: “Auth/mail living interaction map” and “Story-close interaction overview…”
  - [x] Do **not** mark sibling Epic 1.5 stories done; do **not** start 2.2+; do **not** edit product UI/API beyond docs + the spine pointer + project-context one-liner
  - [x] Prefer Conventional Commit on branch `docs/1/1-5-2-auth-mail-interaction-map-and-story-close-overview`

### Review Findings

- [x] [Review][Decision] Spine Correct Course addenda co-landed beyond Living-map pointer — **resolved: keep all CC addenda** (AD-8 + AD-19 + Consistency + Living-map / Capability Map links)
- [x] [Review][Patch] Claim-pattern links 404 on this branch — mark pending until 1.5.1 merges [`auth-mail-interaction-map.md`]
- [x] [Review][Patch] “As-built” invariants table lists claim/`expires_at` helper as present while `token_claim.py` is absent — separate target vs as-built [`auth-mail-interaction-map.md`]
- [x] [Review][Patch] Reset “what not to break” asserts atomic `expires_at` claim as current — align with 1.5.1 target footnote [`auth-mail-interaction-map.md`]
- [x] [Review][Patch] Sibling sprint `1-5-3`/`1-5-4` — left `ready-for-dev` (story files present); no backlog revert [`sprint-status.yaml`]
- [x] [Review][Patch] Add register request-path step (session issue, personal list, gated auto-verify) [`auth-mail-interaction-map.md`]
- [x] [Review][Patch] Document stale/revoked cookie: presence passes proxy but `fetchSession` fails → redirect / clear [`auth-mail-interaction-map.md`]
- [x] [Review][Patch] Document BFF `getSetCookie` fallback to single `Set-Cookie` header [`auth-mail-interaction-map.md`]
- [x] [Review][Patch] Document verify confirm / invite-stub when `EMAIL_VERIFICATION_REQUIRED` is off (404 / ensure no-op success) [`auth-mail-interaction-map.md`]
- [x] [Review][Patch] Clarify mermaid: `/api/auth/*` still passes `proxy.ts` (public allowlist) [`auth-mail-interaction-map.md`]
- [x] [Review][Patch] Note opaque session token plaintext at rest (HMAC deferred) under session what-not-to-break [`auth-mail-interaction-map.md`]
- [x] [Review][Patch] Document `PUBLIC_APP_URL` default (`http://localhost:3000`) and broken-link risk if mis-set [`auth-mail-interaction-map.md`]
- [x] [Review][Patch] Document empty/missing confirm token failure mode [`auth-mail-interaction-map.md`]
- [x] [Review][Patch] Strengthen this story’s story-close “what not to break” with process invariants; File List may note CC spine addenda retained [`1-5-2-….md`]
- [x] [Review][Defer] Known-user SMTP fail → 503 vs unknown-email 200 timing/oracle — deferred, pre-existing [`deferred-work.md` / Story 1.4]

## Dev Notes

### Epic context

Epic 1.5 = Auth spine hardening & Epic 2 prep (Correct Course / Epic 1 retro). Critical path **1.5.1 → 1.5.5** before Stories **2.2+**. This story closes the **comprehension** gap: Sebas could not see how auth/mail pieces interact from tests alone.

| Sibling | Relationship to 1.5.2 |
|---------|----------------------|
| 1.2–1.6 | Source of as-built auth/mail/session/BFF/SMTP behavior to document |
| **1.5.1** | Claim/`expires_at` fix + `auth-email-token-claim-pattern.md` — **map must reference**, not redo |
| **1.5.2 (this)** | Living map + story-close habit |
| 1.5.3 | Verify-gate **contract** for invites — out of scope (map only names the stub) |
| 1.5.4 | Membership ACL sketch — out of scope |
| 1.5.5 | Spine smoke — uses map as orientation; out of scope here |
| 1.5.6 / 1.5.7 | Parallel rate-limit / hex-pytest — out of scope |
| Epic 2 invites | Future consumers of the mental model — do not build invites here |

### Locked decisions (do not re-ask)

| Topic | Decision |
|-------|----------|
| Map path | Architecture companion next to spine (Winston-owned living doc) |
| Close habit path | Implementation-artifacts checklist + project-context one-liner |
| Diagrams | One mermaid/ASCII overview + per-surface component tables — enough |
| 1.5.1 merge | Write map now using **post-claim-fix** semantics; footnote if helper not on branch yet |
| Living ownership | Story assignee updates the map when auth/mail paths change; spine keeps a link only |
| Action items | This story marks **both** map + story-close sprint action items `done` |
| Naming | Sprint key `1-5-2-…` = Epic **1.5** story 2 — **not** Epic 1 story 5 (`1-5-config-gated-…`) |

### Deliverables (exact)

| Artifact | Path | Purpose |
|----------|------|---------|
| Living interaction map | `…/architecture-finance-helper-2026-08-03/auth-mail-interaction-map.md` | AC #1 |
| Spine pointer | `ARCHITECTURE-SPINE.md` (one link) | Discoverability |
| Story-close checklist | `_bmad-output/implementation-artifacts/story-close-overview-checklist.md` | AC #2 agreement + template |
| Workflow one-liner | `_bmad-output/project-context.md` | Point at checklist |

**Not deliverables:** new endpoints, rate limits, schema changes, invite tokens, ACL / verify-gate **contracts** (1.5.3/1.5.4), cookie redesign, Playwright suites.

### As-built path inventory (MUST document — do not invent)

#### Session / BFF / cookies (AD-8)

| Layer | Path | Role |
|-------|------|------|
| Coarse UI gate | `ui/proxy.ts` | Cookie **presence** only; public: `/`, `/sign-in`, `/signup`, `/forgot-password`, `/reset-password`, `/verify`, `/health`, `/api/auth`, **`/api/lists`** (lists BFF path is public; **api still 401s** without session) |
| Session fetch | `ui/lib/session.ts` | Forwards cookies → `GET {api}/auth/session` |
| Auth page helper | `ui/components/RedirectIfAuthenticated.tsx` | Signed-in users bounced off auth pages |
| BFF auth routes | `ui/app/api/auth/{register,sign-in,sign-out,session,me,password-reset/*,verify/*}/route.ts` | Forward `Set-Cookie` / `Cookie`; never Bearer in `localStorage` |
| API auth edge | `api/api/routes/auth.py` | Sole cookie issuer; register/sign-in/sign-out/session/me; reset + verify |
| Opaque sessions | `api/adapters/persistence/sessions.py` | TTL ~30d; plaintext token at rest (HMAC deferred) |
| Deps | `api/api/deps.py` | `require_authenticated_user` |
| Settings | `api/api/settings.py`, `.env.example` | `SESSION_COOKIE_*`, `SESSION_SECRET` (presence gate only), `PUBLIC_APP_URL` (mail links) |

**Why:** AD-8 httpOnly Secure first-party cookie; api issues; BFF forwards; proxy ≠ security boundary.

**Do not confuse** auth `sessions` / `fh_session` with Import Session (AD-4 staging) — different concepts; name them explicitly in the map.

#### Password reset

| Layer | Path | Role |
|-------|------|------|
| UI / BFF | `ui/app/forgot-password/*`, `reset-password/*`; BFF `password-reset/{request,confirm}` | Forms + hop |
| Application | `api/application/password_reset.py` | Generic ack; confirm + revoke all sessions |
| Persistence | `api/adapters/persistence/password_reset.py` | SHA-256 at rest; **TTL 1h** |
| Claim helper | `api/adapters/persistence/token_claim.py` (1.5.1) | Atomic claim includes `expires_at > now` |
| Pattern doc | `_bmad-output/implementation-artifacts/auth-email-token-claim-pattern.md` | Invite reuse |

**Why:** Persist-before-send; SMTP fail → rollback; no email enumeration on request.

#### Email verification

| Layer | Path | Role |
|-------|------|------|
| Config | `EMAIL_VERIFICATION_REQUIRED` | Gate on/off (default off) |
| UI / BFF | `ui/app/verify/*` (no auto-confirm on mount); BFF `verify/{request,confirm}` | Explicit submit |
| Application | `api/application/email_verification.py` | Request / Confirm / **`EnsureEmailVerifiedService`** |
| Persistence | `api/adapters/persistence/email_verification.py` | Separate table; **TTL 24h**; claim via shared helper |
| Gated stub | `POST /auth/gated-flows/invite-accept-stub` in `auth.py` | Probe for ensure-gate; contract detail = **1.5.3** |

**Why:** Verification is an orthogonal user attribute (`email_verified_at`), **not** a second session / login wall. Map names the stub; does not write the invite contract.

#### SMTP

| Layer | Path | Role |
|-------|------|------|
| Adapter / settings | `api/adapters/email/smtp.py`, `settings.py` | aiosmtplib; `SMTP_HOST`+`SMTP_FROM` required or config error |
| Port | `api/application/ports.py` | `EmailMessage` / `EmailSender` |
| Errors | `503` `smtp_config_error` / `smtp_send_error` | Fail loud; log domain not full address |

**Why:** Mail only from `api`; no Nodemailer / UI SMTP.

### Suggested map outline (for the deliverable)

```markdown
# Auth/mail interaction map (living)
## Overview (mermaid)
## Invariants (AD-8 cheat sheet)
## 1. Session / BFF
## 2. Password reset
## 3. Email verification
## 4. SMTP
## Related docs (claim pattern, story-close template)
## What Epic 2 must not break / must reuse
```

Each numbered section: Request path → Components → Why → What not to break.

### Suggested story-close template (for the deliverable)

```markdown
## Story-close overview — {story id}
**Request path:** …
**Key components:** …
**Why this shape:** …
**What not to break:** …
```

Agreement text must state: mark `done` only after this overview exists for Sebas (tests/AC alone are insufficient).

### Architecture compliance (MUST follow)

- **AD-8:** httpOnly Secure cookie; same-origin BFF; no Bearer in `localStorage`; api cookie issuer
- **AD-8 addendum:** hash/TTL/`expires_at` on claim; shared helper; fail-loud SMTP — **document**, do not re-code here
- **AD-1:** hex boundaries in the map (domain ≠ FastAPI/SQLAlchemy; ORM under persistence; SMTP under `adapters/email`)
- **Errors:** generic auth failures; no email enumeration — call this out under “what not to break”
- **AD-22:** no schema/deploy work in this story
- **Do not** reopen rejected stacks (NextAuth, Redis session store, Nodemailer, dual cookies)

[Source: `_bmad-output/planning-artifacts/architecture/.../ARCHITECTURE-SPINE.md` — AD-8 + Consistency]  
[Source: `_bmad-output/project-context.md` — Auth, hex, workflow]  
[Source: `_bmad-output/planning-artifacts/epics.md` — Epic 1.5 / Story 1.5.2]  
[Source: `_bmad-output/planning-artifacts/sprint-change-proposal-2026-08-04.md`]  
[Source: `_bmad-output/implementation-artifacts/epic-1-retro-2026-08-04.md` — AI #1, #2]

### Project structure notes

| Touch | Path |
|-------|------|
| NEW map | `…/architecture-finance-helper-2026-08-03/auth-mail-interaction-map.md` |
| UPDATE spine link | same folder `ARCHITECTURE-SPINE.md` (pointer only) |
| NEW close checklist | `_bmad-output/implementation-artifacts/story-close-overview-checklist.md` |
| UPDATE one-liner | `_bmad-output/project-context.md` (workflow) |
| UPDATE status | `sprint-status.yaml` (story + both action_items → done when implemented) |
| REFERENCE only | claim pattern doc, Epic 1 stories 1.2–1.6, `api/api/routes/auth.py`, `ui/proxy.ts`, SMTP adapter |
| DO NOT TOUCH | Auth/SMTP product code, invite contracts, list ACL, rate limits, session HMAC |

### Previous story intelligence

**From 1.5.1 (preserve / link):**
- Shared `claim_single_use_email_token` + pattern doc for invites
- Application pre-check kept as defense-in-depth
- Separate tables per token type

**From 1.3 / 1.4 / 1.5 (encode in map):**
- Opaque sessions; single-session on sign-in (`revoke_all_sessions_for_user` before new cookie)
- BFF always clears cookie on sign-out even if upstream fetch throws
- Persist-before-send + SMTP rollback/fail-loud
- VerifyForm must not auto-confirm on mount
- Proxy is presence-only; real auth is session resolve
- Verification ≠ login wall when gate on

**Anti-patterns:**
- Rewriting auth “while documenting”
- Map that is only a file list without request path / why / what not to break
- Documenting pre-1.5.1 claim (`id` + `used_at IS NULL` only) as current truth
- Putting the only overview in chat — must be repo artifacts
- Expanding into 1.5.3–1.5.7 (verify-gate contract, ACL, smoke, rate limits, hex ports)
- Confusing **Import Session** (AD-4) with auth cookie sessions
- Merging reset/verify/invite into one table in diagrams “for simplicity”

### Git intelligence summary

| Commit / artifact | Relevance |
|-------------------|-----------|
| Epic 1 stories 1.2–1.6 | As-built auth/mail behavior |
| `88cd2e6` / Story 1.5.1 (branch) | Claim helper + pattern doc to reference |
| Sprint change proposal 2026-08-04 | Epic 1.5 insertion; this story’s critical-path role |
| Epic 1 retro | AI #1 process close; AI #2 living map |

Branch for this story: `docs/1/1-5-2-auth-mail-interaction-map-and-story-close-overview` (AD-13 / project-context: one story per branch; `docs` type fits).

### Library / framework requirements

- **No new runtime dependencies**
- Document Next.js **16 `proxy.ts`** (not legacy `middleware.ts` name) as the coarse gate
- Document FastAPI cookie flags as implemented in `_set_session_cookie`
- aiosmtplib remains the SMTP client (floor ≥5.1.2 per project-context) — mention only

### Testing requirements

- **No code tests required** for docs/process deliverables
- Acceptance check = Sebas (or reviewer) can answer “how does reset mail get sent?” and “who sets the cookie?” from the map alone
- Optional: add a one-line checklist item in 1.5.5 smoke story later pointing at the map — **not required in this story**

### Latest tech notes

- Next.js 16 renamed the middleware convention to **`proxy.ts`** / `export function proxy` (codemod: `middleware-to-proxy`). A leftover `middleware.ts` can be ignored at build — map must name **`ui/proxy.ts`** so agents do not recreate the old file
- Official guidance: proxy is a **network-boundary UX gate**, not the security boundary — matches this repo (presence redirect only; real auth = opaque session resolve on api)
- Proxy runs on the **Node.js** runtime in Next 16 (not Edge) — no need to document Edge auth tricks
- Cookie forwarding across BFF: prefer `headers.getSetCookie()` when available (already used in sign-in BFF) — document as the hop pattern
- No library upgrades in this story

### Project context reference

Follow `_bmad-output/project-context.md`: AD-8 cookies, hex boundaries, generic auth errors, one story per branch, no secrets in repo, docs stay under `_bmad-output/` unless a code comment is truly needed (prefer artifacts).

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` — Epic 1.5 / Story 1.5.2]
- [Source: `_bmad-output/planning-artifacts/sprint-change-proposal-2026-08-04.md`]
- [Source: `_bmad-output/implementation-artifacts/epic-1-retro-2026-08-04.md`]
- [Source: `_bmad-output/planning-artifacts/architecture/.../ARCHITECTURE-SPINE.md` — AD-8]
- [Source: `_bmad-output/implementation-artifacts/1-5-1-token-claim-rechecks-expires-at.md`]
- [Source: `_bmad-output/implementation-artifacts/auth-email-token-claim-pattern.md`]
- [Source: `_bmad-output/implementation-artifacts/1-3-sign-in-sign-out-and-protect-routes.md`]
- [Source: `_bmad-output/implementation-artifacts/1-4-password-reset-via-email.md`]
- [Source: `_bmad-output/implementation-artifacts/1-5-config-gated-email-verification.md`]
- [Source: `_bmad-output/project-context.md`]

## Dev Agent Record

### Agent Model Used

Cursor Grok 4.5

### Debug Log References

- Task 0: confirmed no pre-existing `auth-mail-interaction-map.md` or `story-close-overview*.md`
- Docs-only story — no pytest/lint suite required (story Testing requirements)

### Implementation Plan

1. Confirm sources + absence of parallel docs.
2. Write living map next to spine (four surfaces + mermaid + claim footnote).
3. Pointer from AD-8 + Capability Map row; checklist + project-context one-liner; cross-links.
4. Close both sprint action items; mark story review.

### Completion Notes List

- Delivered living auth/mail map covering session/BFF, password reset, email verification, and SMTP with request path / components / why / what not to break.
- Recorded story-close agreement + copy-paste template; project-context workflow one-liner; map ↔ checklist cross-links.
- Spine AD-8 + Capability Map point at the map; sprint action items for map + story-close marked `done`.
- No product/auth/SMTP code changes.
- Review patches applied: claim as-built vs target, register path, stale cookie, getSetCookie fallback, gate-off paths, PUBLIC_APP_URL, empty token, mermaid/proxy, process close invariants.

## Story-close overview — 1.5.2

**Request path:** epic/retro + Correct Course sources → architecture companion map + implementation checklist → spine/project-context pointers → sprint `action_items` (map + close) → story Status `review`/`done`.

**Key components:** `auth-mail-interaction-map.md`, `story-close-overview-checklist.md`, `ARCHITECTURE-SPINE.md` (Living-map links + retained Epic 1.5 CC addenda on AD-8/AD-19/Consistency), `project-context.md` (workflow one-liner), `sprint-status.yaml`.

**Why this shape:** Living map next to the spine (Winston-owned); close habit under implementation-artifacts so every story can copy the template without opening the spine; CC spine addenda kept on this branch by review decision.

**What not to break (process):** Overview must live in Dev Agent Record / Completion Notes (or linked artifact) before `done`; update the living map in the same PR when auth/mail paths change; do not close map/story-close `action_items` without the artifacts existing; do not strip Epic 1.5 spine addenda casually. **(product pointers):** api cookie issuer + BFF forward; persist-before-send + fail-loud SMTP; claim/`expires_at` target via 1.5.1; verification ≠ login wall; auth session ≠ Import Session.

### File List

- `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/auth-mail-interaction-map.md` (new; review patches applied)
- `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md` (Living-map links + retained Epic 1.5 CC addenda per review decision)
- `_bmad-output/implementation-artifacts/story-close-overview-checklist.md` (new)
- `_bmad-output/project-context.md` (workflow one-liner)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (story + action_items)
- `_bmad-output/implementation-artifacts/deferred-work.md` (review defer note)
- `_bmad-output/implementation-artifacts/1-5-2-auth-mail-interaction-map-and-story-close-overview.md` (this story)

## Change Log

- 2026-08-04: Story context created (ready-for-dev) — Ultimate context engine analysis completed
- 2026-08-04: Follow-up from source + code-path explorers — map path moved next to spine; checklist naming; locked decisions; inventory gaps (stub, TTLs, `/api/lists` public nuance, Import Session anti-pattern)
- 2026-08-04: Implemented map + story-close checklist + spine/project-context pointers; status → review
- 2026-08-04: Applied code-review patches (map accuracy + process close); status → done
