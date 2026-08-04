---
baseline_commit: 24bf63c Merge pull request #8 from snsm-uptime/feat/2/2-1-create-and-rename-owned-lists
---

# Story 1.5.3: Invite verify-gate contract

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want a written contract for how EnsureEmailVerifiedService gates invite acceptance,
so that Stories 2.3/2.4 implement one agreed behavior when verification is required.

## Acceptance Criteria

1. **Given** `EMAIL_VERIFICATION_REQUIRED` is on or off  
   **When** an invite accept (or gated invite) path is specified  
   **Then** the contract states when the gate blocks, when it allows, and how the stub becomes real in 2.3/2.4

2. **And** no invite UI is required in this story — contract/docs (and minimal stub alignment only if needed)

## Tasks / Subtasks

- [x] Task 0: Confirm scope and as-built seam (AC: #1, #2)
  - [x] Read Epic 1.5 / Story 1.5.3 in `epics.md`, sprint change proposal, Epic 1 retro AI #4
  - [x] Read living map §3 (Email verification) — map **names** the stub; this story owns **contract text**
  - [x] Confirm as-built: `ensure_email_verified` → `EnsureEmailVerifiedService` → `POST /auth/gated-flows/invite-accept-stub` → `403` `email_not_verified`
  - [x] Confirm this is **documentation / contract only** — no invite UI, invite tokens, membership create, or ACL impl
  - [x] Prefer **docs-only**; touch code **only** if the contract discovers a stub mismatch (unlikely — stub already matches Epic 2 intent)

- [x] Task 1: Write the invite verify-gate contract artifact (AC: #1)
  - [x] Create durable artifact: `_bmad-output/implementation-artifacts/invite-verify-gate-contract.md`
  - [x] Include the **truth table** (flag × verified × send vs accept) — exact matrix in Dev Notes below
  - [x] Specify **call-site rules**: application use-case (`AcceptListInvite` / `SignUpWithInvite` or equivalent), **before** membership commit — not route-only ad-hoc checks
  - [x] Specify **2.3 vs 2.4**: gate at **accept only**; send must **not** check invitee verification
  - [x] Specify **error contract**: `EmailNotVerifiedError` → HTTP **403** + `code: "email_not_verified"` + existing message (match stub)
  - [x] Specify **unlock path**: existing `/verify` request + confirm → sets `email_verified_at` — no invite-specific verify product
  - [x] Specify **stub → real**: 2.4 accept routes call the same `EnsureEmailVerifiedService`; retire or leave stub as probe after 2.4 (document choice)
  - [x] Cover both accept paths: **registered accept** (session required) and **signup-with-invite** (create user/session, then gate before inviting membership)
  - [x] Explicit negatives: not a login wall; not a Lists homepage wall; not applied at invite send; not a second session cookie
  - [x] Cross-link: living map §3, Story 1.5 + stub tests, claim pattern (1.5.1) for invite **token** consume (orthogonal to Ensure), story-close checklist, soft-couple notes in 2.3/2.4

- [x] Task 2: Wire discoverability (AC: #1)
  - [x] Update `auth-mail-interaction-map.md` §3: replace “contract text = 1.5.3” deferral with a link to `invite-verify-gate-contract.md`
  - [x] Optional one-line pointer from `ARCHITECTURE-SPINE.md` (AD-8 living-map area or Capability Map) — do not rewrite AD-8
  - [x] Optional: add a one-liner in `2-3-…md` / `2-4-…md` Dev Notes pointing at the contract (replace vague “1.5 soft couple” with the artifact path) — do **not** re-open 2.3/2.4 scope

- [x] Task 3: Hygiene + handoff (AC: #1, #2)
  - [x] Link contract from this story’s Completion Notes / File List
  - [x] Mark sprint `action_items` done: “Invite verify-gate contract for EnsureEmailVerifiedService”
  - [x] Include story-close how/why overview per `story-close-overview-checklist.md` before marking done
  - [x] Do **not** mark sibling Epic 1.5 stories done; do **not** start 2.2+; do **not** implement invite product code
  - [x] Prefer Conventional Commit on branch `docs/1/1-5-3-invite-verify-gate-contract` (use `feat/` only if stub alignment code changes)

## Dev Notes

### Epic context

Epic 1.5 = Auth spine hardening & Epic 2 prep (Correct Course / Epic 1 retro). Critical path **1.5.1 → 1.5.5** before Stories **2.2+**. This story closes the **verify-gate agreement** gap so 2.3/2.4 do not re-decide when/where to call `EnsureEmailVerifiedService`.

| Sibling | Relationship to 1.5.3 |
|---------|----------------------|
| **1.5** (Epic 1) | Shipped gate + stub — **as-built source of truth** |
| **1.5.1** | Claim/`expires_at` for invite **tokens** — orthogonal; reference only |
| **1.5.2** | Living map names stub; **defers contract text here** |
| **1.5.3 (this)** | Written invite accept gate contract |
| 1.5.4 | Membership ACL sketch — out of scope |
| 1.5.5 | Spine smoke — out of scope |
| 1.5.6 / 1.5.7 | Parallel — out of scope |
| **2.3** | Invite **send** — must **not** call Ensure on invitee |
| **2.4** | Invite **accept** / signup-with-invite — **must** call Ensure before membership when flag on |

**Naming trap:** Sprint key `1-5-3-…` = Epic **1.5** story 3 — **not** Epic 1 story 5 (`1-5-config-gated-email-verification`).

### Locked decisions (do not re-ask)

| Topic | Decision |
|-------|----------|
| Contract path | `_bmad-output/implementation-artifacts/invite-verify-gate-contract.md` |
| Seam | `EnsureEmailVerifiedService` / domain `ensure_email_verified` — **the** gate; no ad-hoc route-only checks |
| Gate placement | **Accept / membership commit (2.4)** — never invite **send (2.3)** |
| Scope of gate | Flow-scoped — **not** login wall / Lists wall |
| HTTP on block | **403** + `code: "email_not_verified"` (authenticated but policy-blocked; do not use 401) |
| Flag off | Ensure is **no-op**; accept proceeds; stub returns 200 |
| Flag on + unverified | Block **before** membership; do not create membership |
| Flag on + verified | Allow accept to continue (invite token + ACL still apply) |
| Stub fate | Same service; 2.4 becomes the real call site; stub may remain as probe or be removed in 2.4 — document choice in contract |
| Code changes | Prefer **none**; stub already correct |
| Action item | Mark “Invite verify-gate contract…” `done` when this story completes |
| FR support | FR-4 readiness + FR-7 accept path; no new FRs |

### Contract truth table (MUST appear in the deliverable)

| `EMAIL_VERIFICATION_REQUIRED` | Actor `email_verified_at` | Invite **send** (2.3) | Invite **accept** / membership (2.4) | Stub today |
|-------------------------------|---------------------------|------------------------|--------------------------------------|------------|
| false / absent | any | **Allowed** (do not check invitee verify) | **Allowed** (Ensure no-op / skip) | 200 |
| true | `NULL` | **Allowed** (do not check invitee verify) | **Blocked** before membership | 403 `email_not_verified` |
| true | set | **Allowed** | **Allowed** (then token claim + ACL) | 200 |

**Who is gated:** the **accepting user** (session principal after signup/sign-in), not the inviter, and not “the invitee email string” at send time.

### Call-site ordering (MUST document)

```text
# Registered accept (already has account + session)
AcceptListInvite(token):
  require authenticated user
  → EnsureEmailVerifiedService.execute(user_id, flag)   # when flag on: may raise EmailNotVerifiedError
  → claim invite token (1.5.1 helper pattern; separate list_invite_token table)
  → create ListMembership
  → land on inviting list

# Signup-with-invite (unregistered path)
SignUpWithInvite(email, password, token):
  create user + personal list + session (FR-1 / 1.2 patterns)
  → EnsureEmailVerifiedService.execute(new_user_id, flag)  # BEFORE inviting-list membership
  → claim invite token
  → create ListMembership on inviting list
  → land on inviting list (not blank Lists home)
```

When flag is **off**, skip or no-op the Ensure step; membership still requires valid invite token + ACL rules.

**Do not** gate: invite email send, list create/rename, sign-in, `/auth/me`, or Lists homepage browse.

### As-built seam inventory (MUST document — do not reinvent)

| Layer | Path | Role |
|-------|------|------|
| Domain rule | `api/domain/email_verification.py` → `ensure_email_verified(...)` | Pure: flag off → return; on + `verified_at is None` → `EmailNotVerifiedError` |
| Application port | `api/application/email_verification.py` → `EnsureEmailVerifiedService` + `EnsureEmailVerifiedCommand(user_id, email_verification_required)` | Loads `email_verified_at` via repo; calls domain |
| Persistence | `api/adapters/persistence/email_verification.py` | `get_user_verified_at` / mark verified / tokens |
| Error | `api/domain/errors.py` → `EmailNotVerifiedError` | Stable message pointing at `/verify` |
| Config | `api/api/settings.py` / `.env.example` | `EMAIL_VERIFICATION_REQUIRED` default **false** |
| Stub probe | `api/api/routes/auth.py` → `POST /auth/gated-flows/invite-accept-stub` | Auth required; same Ensure service; 403 on block |
| Schema | `api/api/schemas/auth.py` → `GatedFlowStubResponse` | Stub success body |
| Domain tests | `api/tests/test_email_verification_domain.py` | Flag matrix |
| Integration | `api/tests/test_email_verification_integration.py` | Stub 200/403 + confirm unlocks |

**Preserve:** session still issued at register when flag on; verification is an attribute, not a second login wall (`api/application/signup.py` comment + Story 1.5 ACs).

### Stub → real (MUST document)

| Phase | Behavior |
|-------|----------|
| **Now (1.5)** | Stub proves Ensure port; no membership side effects |
| **2.3** | Send invites; **do not** call Ensure; do not invent a parallel gate |
| **2.4** | Real accept / signup-with-invite call Ensure **before** membership; map `EmailNotVerifiedError` like the stub (403 + code) |
| **After 2.4** | Stub optional: keep for smoke/probe or delete in the 2.4 PR — document choice in contract |

### Orthogonal concerns (reference, do not implement here)

| Concern | Owner | Note |
|---------|-------|------|
| Invite token hash/TTL/claim | 2.3 issue / 2.4 consume | Separate `list_invite_token` table; reuse **claim helper** from 1.5.1 — not Ensure |
| Membership ACL | 1.5.4 sketch → 2.2 impl | AD-19; gate ≠ ACL |
| Verify mail UX | Story 1.5 | `/verify` already ships; unlock path for blocked accept |
| Rate limits | 1.5.6 | Out of scope |
| Claim `expires_at` | 1.5.1 | Required for invite tokens; not part of Ensure |

### Project structure notes

- Docs live under `_bmad-output/` (implementation-artifacts for the contract; architecture folder for map updates)
- Hex layout: gate rules stay in `domain/` + `application/`; routes only map errors — **2.4 must not put verify checks only in HTTP handlers**
- No new Compose services, Redis, or Alembic for this story
- UI: no invite pages; no Account “verification settings”

### Previous story intelligence

**From 1.5 (config-gated verification — preserve):**
- Flow-scoped FR-4 gate; default flag off
- Stable Ensure port + stub already ship
- `404 verification_not_required` is for **verify request/confirm when flag off** — stub does **not** 404 when off (it allows)
- Review: no VerifyForm auto-confirm; idempotent confirm; clear error copy

**From 1.5.1 (link only):**
- Shared `claim_single_use_email_token` + `auth-email-token-claim-pattern.md` for invite tokens
- Do not overload reset/verify tables for invites
- Claim fix may still be `review` / on branch — contract references **target** claim pattern, not pre-fix SQL

**From 1.5.2 (immediate prior):**
- Map already documents stub + defers contract text here
- Docs/process branch type `docs/1/…`; story-close checklist required before `done`
- Anti-pattern: expanding into ACL / smoke / rate limits while documenting

**From 2.3 / 2.4 story files (consumers):**
- 2.3: “verification gate applies at invite acceptance (2.4), not at send”
- 2.4: “call ensure… **before** creating membership on accept”
- Soft-couple tasks already exist — this contract makes them unambiguous

**Anti-patterns (prevent):**
1. Building invite UI / membership / send in this story
2. Blocking **invite send** on invitee verification
3. Turning gate into login / Lists wall
4. Ad-hoc `email_verified_at` checks in routes instead of `EnsureEmailVerifiedService`
5. Using **401** for unverified email (session is valid; use **403**)
6. Using **404** on accept when flag off (that’s verify-endpoint-only behavior)
7. Second session / Bearer / second SMTP for “verified”
8. Overloading reset/verify token tables for invites
9. Gating the **inviter** instead of the accepting user
10. Expanding into 1.5.4–1.5.7 scope
11. Marking done without story-close overview
12. Re-implementing Ensure in 2.4 “for clarity”

### Git intelligence summary

| Commit / artifact | Relevance |
|-------------------|-----------|
| `9faaf85` / Story 1.5 | Gate + stub + Ensure service as-built |
| `88cd2e6` / 1.5.1 branch | Claim helper + invite pattern doc (orthogonal) |
| 1.5.2 map + checklist | Living map defers contract; close habit |
| Sprint change proposal 2026-08-04 | Epic 1.5 critical path includes this story |
| Epic 1 retro AI #4 | Origin action item |

Branch for this story: `docs/1/1-5-3-invite-verify-gate-contract` (AD-13 / project-context: one story per branch; `docs` type fits unless stub code changes).

### Library / framework requirements

- **No new runtime dependencies**
- Preserve existing FastAPI error mapping pattern from stub
- HTTP semantics: **403** = authenticated but not authorized for this action (email verify policy); **401** = missing/invalid session — do not conflate
- aiosmtplib / SMTP stays as-is (unlock mail already exists)

### Testing requirements

- **No new product tests required** for a docs/contract story if stub unchanged
- Acceptance check = a 2.4 implementer can answer from the contract alone:
  1. When does accept block?
  2. Does send check verification?
  3. Which service/error/code to use?
  4. What happens when flag is off?
- If stub alignment code changes: extend existing `test_email_verification_*` only — do not invent invite membership tests here (those belong in **2.4**)
- Real gate-at-accept coverage = Story **2.4** (flag on blocks until verified; flag off proceeds)

### Latest tech notes

- Prefer **403 Forbidden** (not 401) when identity is known but a policy blocks the action — matches Auth0 / common API guidance and the existing stub
- Do not introduce OAuth “email_verified” claim gymnastics; this product uses DB `email_verified_at` + config flag
- No library upgrades in this story

### Project context reference

Follow `_bmad-output/project-context.md`: AD-8 cookies/tokens, hex boundaries, generic auth errors, flow-scoped verification, one story per branch, no secrets in repo, story-close overview before `done`.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` — Epic 1.5 / Story 1.5.3]
- [Source: `_bmad-output/planning-artifacts/sprint-change-proposal-2026-08-04.md`]
- [Source: `_bmad-output/implementation-artifacts/epic-1-retro-2026-08-04.md`]
- [Source: `_bmad-output/planning-artifacts/architecture/.../auth-mail-interaction-map.md` — §3]
- [Source: `_bmad-output/planning-artifacts/architecture/.../ARCHITECTURE-SPINE.md` — AD-8]
- [Source: `_bmad-output/implementation-artifacts/1-5-config-gated-email-verification.md`]
- [Source: `_bmad-output/implementation-artifacts/1-5-2-auth-mail-interaction-map-and-story-close-overview.md`]
- [Source: `_bmad-output/implementation-artifacts/2-3-invite-members-by-email.md`]
- [Source: `_bmad-output/implementation-artifacts/2-4-invitee-signup-lands-on-inviting-list.md`]
- [Source: `_bmad-output/implementation-artifacts/story-close-overview-checklist.md`]
- [Source: `api/domain/email_verification.py`]
- [Source: `api/application/email_verification.py`]
- [Source: `api/api/routes/auth.py` — `invite_accept_stub`]
- [Source: `_bmad-output/project-context.md`]

## Dev Agent Record

### Agent Model Used

Cursor Grok 4.5

### Debug Log References

- Task 0: Confirmed as-built Ensure + stub; no stub mismatch → docs-only
- Restored living map + story-close checklist from stash (not yet on main after 1.5.2 merge) so Task 2/3 links resolve

### Implementation Plan

1. Confirm as-built seam; no product code changes.
2. Write `invite-verify-gate-contract.md` (truth table, call sites, errors, stub→real).
3. Link from map §3, AD-8 spine pointers, 2.3/2.4 soft-couple tasks.
4. Mark action item done; story-close overview; status → review.

### Completion Notes List

- Delivered authoritative contract at `_bmad-output/implementation-artifacts/invite-verify-gate-contract.md`
- No API/UI/schema changes — stub already matches Epic 2 intent
- Sprint action item “Invite verify-gate contract for EnsureEmailVerifiedService” → `done`
- Stub fate recommendation: keep until 1.5.5 smoke can cover real accept, then remove

## Story-close overview — 1.5.3 / 1-5-3-invite-verify-gate-contract

**Request path:**
(N/A product path) Docs: story tasks → `invite-verify-gate-contract.md` → linked from living map §3, AD-8, Stories 2.3/2.4 soft-couple. Runtime seam already: authenticated caller → `EnsureEmailVerifiedService` → domain `ensure_email_verified` → 403 `email_not_verified` or allow (stub / future 2.4 accept).

**Key components:**
- NEW `invite-verify-gate-contract.md`
- UPDATE `auth-mail-interaction-map.md` §3 + Related docs + Epic 2 reuse row
- UPDATE `ARCHITECTURE-SPINE.md` AD-8 (map + contract pointers)
- UPDATE `2-3-…md` / `2-4-…md` soft-couple pointers
- UPDATE `sprint-status.yaml` (story + action item)

**Why this shape:**
FR-4 flow-scoped gate at accept only (not send, not login wall). Single application seam so 2.3/2.4 do not invent ad-hoc checks; 403 matches authenticated-but-blocked policy.

**What not to break:**
- Gate at **accept (2.4)** only — never invite **send (2.3)**
- `EnsureEmailVerifiedService` is the only gate; error remains **403** `email_not_verified`
- Flag off → Ensure no-op; verification ≠ login wall
- Stub stays aligned until real accept lands; no second verify product

### File List

- `_bmad-output/implementation-artifacts/invite-verify-gate-contract.md` (NEW)
- `_bmad-output/implementation-artifacts/1-5-3-invite-verify-gate-contract.md` (UPDATE — status/tasks/record)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (UPDATE)
- `_bmad-output/implementation-artifacts/story-close-overview-checklist.md` (NEW on branch — restored for close habit / map link)
- `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/auth-mail-interaction-map.md` (NEW on branch + UPDATE links)
- `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md` (UPDATE AD-8 pointers)
- `_bmad-output/implementation-artifacts/2-3-invite-members-by-email.md` (UPDATE soft-couple pointer)
- `_bmad-output/implementation-artifacts/2-4-invitee-signup-lands-on-inviting-list.md` (UPDATE soft-couple pointer)

### Change Log

- 2026-08-04: Implemented Story 1.5.3 — invite verify-gate contract + discoverability links; status → review

## Story completion status

Status: **review**
