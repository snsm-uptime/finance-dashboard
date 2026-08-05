---
baseline_commit: e9898c1 docs(1): land membership ACL enforcement sketch for Story 1.5.4
---

# Story 1.5.5: Epic 1 spine smoke (auth, mail, personal list)

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As QA,
I want a smoke checklist run against the Compose stack after the claim fix,
so that the Epic 1 spine still holds before Epic 2 resumes.

## Acceptance Criteria

1. **Given** Stories 1.5.1 (and any blocking map/contract deps) are done  
   **When** the smoke checklist is executed on Compose (`db`/`api`/`ui`)  
   **Then** signup/sign-in/sign-out, personal list presence, password-reset path, and verify path (as configured) pass

2. **And** the checklist is saved under implementation artifacts for reuse

Supports readiness for **FR-1** (signup/session), **FR-4** (config-gated verify), **FR-5** (personal list) — no new FRs.

## Tasks / Subtasks

- [x] Task 0: Gate on prerequisites (AC: #1)
  - [x] Confirm Story **1.5.1** (`1-5-1-token-claim-rechecks-expires-at`) is **`done`** — shared claim helper re-checks `expires_at` atomically; `auth-email-token-claim-pattern.md` exists under implementation-artifacts
  - [x] Confirm Story **1.5.2** map exists: `…/architecture-finance-helper-2026-08-03/auth-mail-interaction-map.md` (orientation only — already `done`)
  - [x] Confirm **1.5.3** / **1.5.4** contracts exist (verify-gate + ACL sketch) — do **not** re-execute their ACs; optional one-line “map/contracts present” tick on the checklist is enough
  - [x] **HALT** if 1.5.1 is still `backlog` / `ready-for-dev` / `in-progress` / `review` — create/finish 1.5.1 first. Do **not** mark this story done against a pre-claim-fix stack
  - [x] Prefer branch `test/1/1-5-5-epic-1-spine-smoke` (or `docs/1/1-5-5-…` if checklist-only); one story per branch (AD-13)

- [x] Task 1: Author reusable smoke checklist (AC: #2)
  - [x] Create durable artifact: `_bmad-output/implementation-artifacts/epic-1-spine-smoke-checklist.md`
  - [x] Start from the **checklist skeleton** in Dev Notes (required sections + pass/fail table) — do not invent a thinner substitute
  - [x] Checklist MUST cover (pass/fail + notes columns):
    1. **Compose boot** — `.env` from `.env.example`; `docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build` (or prod-like `docker compose up --build`); `db`/`api`/`ui` healthy
    2. **Health** — `GET http://localhost:8000/health` and `GET http://localhost:3000/health` both OK
    3. **Signup** — new email/password via UI **`/signup`** (no hyphen) → httpOnly **`fh_session`** cookie set (api issuer; BFF forwards); lands usable (typically `/lists`). Alternate: curl cookie-jar against BFF (see Dev Notes)
    4. **Personal list presence** — after signup, `GET /api/lists` (BFF) or Lists UI shows a membership with **`name == "Personal"`** and **`role == "owner"`** (as-built `PERSONAL_LIST_NAME`; ordinary `List` + membership — not a separate type). “Any owned list” is **not** enough
    5. **Sign-out** — `fh_session` cleared; protected UI redirects to **`/sign-in`** (hyphen — not `/signup`)
    6. **Sign-in** — same credentials via **`/sign-in`** restore session; Lists reachable again
    7. **Password reset** — `/forgot-password` → mail received → `/reset-password?token=…` confirm → old session dead → sign-in with **new** password works; unknown email still gets generic ack (no oracle)
    8. **Verify path (as configured)** — see matrix below. Gate-**off** alone satisfies AC #1 when that is the configured run. Gate-**on** is a **strong reuse recommendation** (document skip reason if omitted). Never claim “verify covered” without stating which mode(s) ran
    9. **Post-1.5.1 claim** — expired reset **or** verify token fails via the **shared/atomic claim helper** (not merely an incidental application pre-check). Prefer steps from `auth-email-token-claim-pattern.md`; fallback SQL age method in Dev Notes
  - [x] Document SMTP catcher as **side-car only** (Mailpit via `docker run` / host) — **do not** add a fourth service to `docker-compose.yml` (AD-2: `db`|`api`|`ui` only)
  - [x] Document Mac **and** Linux reachability from `api` → Mailpit (see SMTP wiring below)
  - [x] Point operators at the living map for “why”: [`auth-mail-interaction-map.md`](../planning-artifacts/architecture/architecture-finance-helper-2026-08-03/auth-mail-interaction-map.md)
  - [x] Include env knobs table: `EMAIL_VERIFICATION_REQUIRED`, `PUBLIC_APP_URL`, `SMTP_*`, `SESSION_COOKIE_NAME` / `SESSION_COOKIE_*`
  - [x] Include “what not to break” invariants (AD-8 / map cheat sheet) so reuse stays honest

- [x] Task 2: Execute smoke on Compose and record results (AC: #1, #2)
  - [x] Bring up Compose with a filled `.env` (never commit `.env`)
  - [x] For mail paths: start Mailpit **before** any SMTP-sending step; wire api SMTP to it (**outside** permanent compose graph)
    - Suggested: `docker run --rm -d --name fh-mailpit -p 1025:1025 -p 8025:8025 axllent/mailpit`
    - Env on **api**: `SMTP_PORT=1025`, `SMTP_FROM=noreply@example.com`, `SMTP_USE_TLS=false`, `SMTP_STARTTLS=false`, `PUBLIC_APP_URL=http://localhost:3000`
    - **Mac (Docker Desktop):** `SMTP_HOST=host.docker.internal`
    - **Linux Compose:** `host.docker.internal` often missing — use host gateway IP, `network_mode: host` for Mailpit experiments, or add Compose `extra_hosts: ["host.docker.internal:host-gateway"]` on **api** for the smoke run only (do **not** permanently add a mail service). If SMTP connect fails, fix reachability before continuing — do not skip mail rows
    - Captured mail UI: `http://localhost:8025`
  - [x] Run every checklist row; mark pass/fail with date + executor initials
  - [x] **Verify off (default — AC-sufficient when this is the configured mode):** `EMAIL_VERIFICATION_REQUIRED=false` — signup usable without verify; BFF `POST /api/auth/verify/request|confirm` → `404` `verification_not_required`
  - [x] **Verify on (recommended second pass):**
    1. Ensure Mailpit is up and `SMTP_*` reach it
    2. Set `EMAIL_VERIFICATION_REQUIRED=true`, recreate/restart **api**
    3. Register (or signed-in verify request) — gate-on register **auto-sends** verify mail; misconfigured SMTP → fail-loud / registration rollback — do **not** flip the gate before SMTP works
    4. Open mail link → explicit confirm on `/verify` (**no auto-confirm on mount**)
    5. Probe invite stub (**api-only, no BFF**): with session cookie, `curl -X POST http://localhost:8000/auth/gated-flows/invite-accept-stub` — unverified → `403` `email_not_verified`; after verify (or gate off) → allowed
  - [x] **Expired-token claim probe (required):** follow `auth-email-token-claim-pattern.md` if it defines a smoke/probe. Else:
    1. Complete a reset **or** verify **request** so a hashed token row exists (`used_at` null)
    2. Age it in Postgres, e.g. `UPDATE password_reset_tokens SET expires_at = NOW() - INTERVAL '1 hour' WHERE used_at IS NULL;` (or `email_verification_tokens` — match actual table from 1.5.1/models)
    3. Confirm with the **raw** token from Mailpit — claim/confirm must fail closed; row must **not** be treated as successfully consumed for a state change
    4. Record that failure path exercised the **shared claim helper** (1.5.1), not only a pre-helper application `expires_at` guard
  - [x] Paste a short run summary into this story’s Completion Notes (date, Compose mode, gate on/off status, claim probe method, failures if any)
  - [x] If any required row fails: file/fix before marking this story `done` — do **not** greenwash

- [x] Task 3: Hygiene + handoff (AC: #1, #2)
  - [x] Link checklist path from Completion Notes / File List
  - [x] Mark sprint `action_items` entry “Epic 1 spine smoke checklist after claim fix…” → `done` when checklist exists **and** execution is green
  - [x] Do **not** mark sibling Epic 1.5 stories done; do **not** start Stories **2.2+** product work on this branch
  - [x] Do **not** delete the invite-accept stub solely because smoke passed — stub fate stays with 2.4 / contract guidance (`invite-verify-gate-contract.md`)
  - [x] Before marking this story `done`: paste story-close how/why overview per `story-close-overview-checklist.md`
  - [x] Prefer Conventional Commit on the story branch

## Dev Notes

### Epic context

Epic 1.5 = Auth spine hardening & Epic 2 prep (Correct Course / Epic 1 retro). Critical path **1.5.1 → 1.5.5** before Stories **2.2+**. This story is the **quality gate**: prove the Epic 1 auth/mail/personal-list spine still works on real Compose after the claim fix — not another contract doc and not a Playwright rewrite of CI.

| Sibling | Relationship to 1.5.5 |
|---------|----------------------|
| **1.5.1** | **Hard blocker** — smoke runs **after** claim/`expires_at` fix + pattern doc |
| 1.5.2 | Living auth/mail map — **orientation** for checklist authors / executors |
| 1.5.3 | Verify-gate contract — cite presence; do not re-litigate invite accept rules |
| 1.5.4 | ACL sketch — optional cite; ACL product impl stays in **2.2** |
| **1.5.5 (this)** | Compose spine smoke + reusable checklist |
| 1.5.6 / 1.5.7 | Parallel rate-limit / hex-pytest — out of scope |
| Epic 1 (1.1–1.6) | Source of as-built paths being smoked (1.6 theme/i18n **not** required by this AC) |
| 2.2+ | **Blocked** until this critical-path story is `done` |

### Locked decisions (do not re-ask)

| Topic | Decision |
|-------|----------|
| Primary deliverable | Reusable checklist markdown under **implementation-artifacts** + **executed** green run recorded |
| Checklist path | `_bmad-output/implementation-artifacts/epic-1-spine-smoke-checklist.md` |
| Runtime target | Compose `db`/`api`/`ui` — browser/UI + same-origin BFF (curl cookie-jar OK as alternate); not “pytest only” |
| Session cookie | Name default **`fh_session`** (`SESSION_COOKIE_NAME`); httpOnly; api sole issuer |
| Personal list pass | **`name == "Personal"`** and **`role == "owner"`** — not “any owned list” |
| URL footgun | Signup = **`/signup`**; sign-in = **`/sign-in`** (hyphenation differs) |
| SMTP catcher | Side-car Mailpit (or equivalent) — **never** a permanent 4th Compose service (AD-2) |
| Verify AC reading | Gate-**off** alone satisfies AC #1 when that is the configured run; gate-**on** = strong reuse recommendation (note skip reason if omitted) |
| Claim coverage | Must exercise **shared/atomic claim helper** expired rejection at least once (1.5.1) — app-layer-only soft checks are insufficient proof |
| Invite stub | **Api-only** `POST http://localhost:8000/auth/gated-flows/invite-accept-stub` with session cookie — no BFF route |
| Gate-on sequencing | Mailpit + working `SMTP_*` **before** flipping `EMAIL_VERIFICATION_REQUIRED=true` / gate-on register |
| Automated E2E | Optional thin scripts OK; **not** a substitute for the saved checklist AC |
| CI Compose health smoke | Deferred (`deferred-work.md`) — **not** this story’s job |
| Owner | Dana (QA) per Correct Course / Epic 1 retro AI #6 |
| Naming | Sprint key `1-5-5-…` = Epic **1.5** story 5 — **not** Epic 1 story 5 (`1-5-config-gated-…`) |
| Action item | Marks “Epic 1 spine smoke checklist after claim fix…” `done` when checklist + green run land |
| Stub deletion | Do **not** remove `invite-accept-stub` in this story |

### Deliverables (exact)

| Artifact | Path | Purpose |
|----------|------|---------|
| Spine smoke checklist | `_bmad-output/implementation-artifacts/epic-1-spine-smoke-checklist.md` | AC #2 + reusable runbook |
| Execution record | This story Completion Notes (and/or filled pass/fail table in checklist) | AC #1 evidence |

**Not deliverables:** Playwright suite as the sole proof; ACL port implementation; invite UI; rate limits; hex port polish; adding Mailpit to base compose; deleting verify-gate stub; finishing Stories 2.2+.

### Checklist skeleton (required shape for Task 1)

```markdown
# Epic 1 spine smoke checklist

**Orientation:** [auth-mail-interaction-map.md](../planning-artifacts/architecture/architecture-finance-helper-2026-08-03/auth-mail-interaction-map.md)
**Prerequisite:** Story 1.5.1 done + auth-email-token-claim-pattern.md present

## Run metadata
| Field | Value |
|-------|-------|
| Date | |
| Executor | |
| Compose mode | dev overlay / prod-like |
| EMAIL_VERIFICATION_REQUIRED | false / true (list each pass) |
| SMTP catcher | Mailpit … / none |
| Claim probe method | pattern-doc / SQL age + confirm |

## Env knobs
| Var | Smoke value |
|-----|-------------|
| SESSION_COOKIE_NAME | fh_session |
| PUBLIC_APP_URL | http://localhost:3000 |
| SMTP_HOST / PORT / FROM / TLS flags | … |
| EMAIL_VERIFICATION_REQUIRED | … |

## Results
| # | Check | Pass? | Notes |
|---|-------|-------|-------|
| 1 | Compose boot db/api/ui | | |
| 2 | /health api + ui | | |
| 3 | Signup → fh_session | | |
| 4 | Personal list name=Personal role=owner | | |
| 5 | Sign-out clears cookie → /sign-in | | |
| 6 | Sign-in restores session | | |
| 7 | Password reset happy + unknown-email ack | | |
| 8a | Verify gate OFF | | required if this is configured mode |
| 8b | Verify gate ON | | recommended; note if skipped |
| 9 | Expired token via shared claim helper | | |

## What not to break
- Api sole cookie issuer; BFF Set-Cookie forward; no Bearer in localStorage
- Persist-before-send + SMTP fail-loud
- Claim re-checks expires_at (shared helper)
- Personal list = ordinary List + owner membership
- AD-2: no permanent mail Compose service
```

### Curl / cookie-jar alternate (optional; complements browser)

```bash
# Cookie jar against same-origin BFF (ui :3000)
jar=$(mktemp)
curl -sS -c "$jar" -b "$jar" -X POST http://localhost:3000/api/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"smoke@example.com","password":"SmokePass1!"}'
# Expect Set-Cookie fh_session=… (httpOnly)
curl -sS -c "$jar" -b "$jar" http://localhost:3000/api/lists
# Expect lists[].name == "Personal" and role == "owner"
curl -sS -c "$jar" -b "$jar" -X POST http://localhost:3000/api/auth/sign-out
# Api-only stub (after sign-in again); no BFF:
curl -sS -c "$jar" -b "$jar" -X POST http://localhost:8000/auth/gated-flows/invite-accept-stub
```

### Verify path matrix (“as configured”)

| `EMAIL_VERIFICATION_REQUIRED` | Must observe | AC weight |
|-------------------------------|--------------|-----------|
| `false` / absent (default) | Signup → usable app with **no** verify step; verify request/confirm → `404` `verification_not_required`; ensure no-op (stub allowed) | **Satisfies AC #1** for a gate-off run |
| `true` (recommended pass) | Mailpit up first; session still issued at register (verify ≠ login wall); request mail → `PUBLIC_APP_URL/verify?token=…` → **explicit** confirm → `email_verified_at` set; stub blocks unverified then allows | Strong reuse; note if skipped |

### As-built paths to exercise (do not invent parallel stacks)

| Surface | How to hit |
|---------|------------|
| Health | `api` `:8000/health`, `ui` `:3000/health` |
| Signup | UI **`/signup`** → BFF `POST /api/auth/register` → api `POST /auth/register` |
| Lists / personal list | UI `/lists` or BFF `GET /api/lists` → api `GET /lists` — assert **`Personal` / `owner`** |
| Sign-in / out | UI **`/sign-in`** + BFF `/api/auth/sign-in`, `/api/auth/sign-out` |
| Reset | `/forgot-password`, `/reset-password`; BFF `password-reset/{request,confirm}` |
| Verify | `/verify`; BFF `verify/{request,confirm}`; gate via `.env` |
| Invite stub | **Api only:** `POST /auth/gated-flows/invite-accept-stub` on `:8000` with `fh_session` |
| Orientation | [`auth-mail-interaction-map.md`](../planning-artifacts/architecture/architecture-finance-helper-2026-08-03/auth-mail-interaction-map.md) |

### Architecture compliance

- **AD-8:** httpOnly `fh_session`; api sole issuer; BFF forwards Set-Cookie; no Bearer in `localStorage`; generic auth errors; SMTP fail-loud; email tokens hash + TTL; **claim re-checks `expires_at` via shared helper** (Epic 1.5 addendum — proven by 1.5.1, verified here)
- **AD-2:** Compose services remain `db`|`api`|`ui` only
- **AD-19 / ACL sketch:** personal list is membership on ordinary `List`; smoke does **not** implement ACL port
- **AD-22:** `/health` on api+ui; do not recreate PG volume to “fix” smoke
- **AD-15:** pytest/CI remain the merge gate; this story is **operator/Compose spine** confidence, not a replacement for unit/integration suites

### Previous story intelligence

From **1.5.4** (nearest prior Epic 1.5 story file; docs/contract pattern):
- Critical-path siblings document **exact deliverable paths** and “not deliverables” tables — mirror that discipline for the checklist path
- Naming trap: `1-5-N` under Epic 1.5 ≠ Epic 1 story 5
- Story-close overview required before `done`
- Do not start 2.2+ on the Epic 1.5 branch

From **1.5.2** (map):
- Map is the orientation doc for smoke — checklist skeleton already points at it
- Cookie hop / persist-before-send / verify gate-off semantics are already documented — checklist should **observe**, not re-decide
- Pre-1.5.1 claim was “row match only” risk; map describes **target** claim — smoke must run on post-1.5.1 code and prove the **helper**, not only legacy application `expires_at` guards

From **1.5.3** / invite contract:
- Stub may remain until after 1.5.5 (and later 2.4) — smoke may **probe** stub via api curl; do not delete it here

From **Epic 1 code** (1.2–1.5):
- Personal list name constant: `api/domain/signup.py` → `PERSONAL_LIST_NAME = "Personal"`
- Integration tests under `api/tests/test_*_{signup,signin,password_reset,email_verification}_*.py` prove pieces in CI — they do **not** replace Compose smoke
- Application-layer `expires_at` checks already exist in places; 1.5.1 still required for shared atomic claim helper + invite-copy pattern doc — **HALT without 1.5.1**

### Git intelligence summary

| Commit / artifact | Relevance |
|-------------------|-----------|
| `e9898c1` / `e03e10b` | 1.5.4 ACL sketch landed — critical path nearly closed except 1.5.1 + this smoke |
| `fafa493` / `688f4fd` | 1.5.3 verify-gate + 1.5.2 map merged |
| `732fc07` | Epic 1 retro + Correct Course — defined this smoke AI |
| Epic 1 auth merges (1.2–1.5) | As-built signup/session/reset/verify to smoke |

### Library / framework requirements

- **No new product runtime dependencies** required for the checklist itself
- Optional operator tool: **Mailpit** (`axllent/mailpit`) as side-car SMTP catcher — not pinned into app lockfiles
- Stack pins unchanged: Postgres 16, Python 3.12+, FastAPI, Next 16, aiosmtplib ≥5.1.2

### File structure requirements

```text
_bmad-output/implementation-artifacts/
  1-5-5-epic-1-spine-smoke.md          # this story
  epic-1-spine-smoke-checklist.md      # NEW — reusable checklist + run log
  auth-email-token-claim-pattern.md    # must already exist from 1.5.1 (prerequisite)
  story-close-overview-checklist.md    # process — fill overview before done
  sprint-status.yaml                   # UPDATE this story → done when finished; action item → done

# Do NOT modify for this story (unless fixing a smoke-found regression in a separate fix commit/PR):
api/   ui/   docker-compose.yml
```

### Testing requirements

- **Primary:** Manual (or scripted-but-recorded) Compose smoke per checklist — evidence in checklist + Completion Notes
- **Complement, don’t duplicate:** Existing pytest integration suites stay green in CI; re-run only if smoke finds a regression
- **Expired claim:** Prefer 1.5.1 pattern-doc probe; else SQL-age + confirm against shared helper (see Task 2)
- **Anti-patterns:** Claiming “done” because CI passed; Playwright without saved checklist; Mailpit in base compose; treating any owned list as personal; probing stub via a non-existent BFF; flipping verify gate before SMTP works; treating application-only `expires_at` as proof of 1.5.1; claiming verify covered without stating gate mode

### Project context reference

Follow `_bmad-output/project-context.md`: AD-8 cookie/BFF rules; AD-2 three-service Compose; no Bearer in `localStorage`; generic auth errors; story-close overview before `done`; one story per branch.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` — Epic 1.5 / Story 1.5.5]
- [Source: `_bmad-output/planning-artifacts/sprint-change-proposal-2026-08-04.md` — critical path + QA owns smoke]
- [Source: `_bmad-output/implementation-artifacts/epic-1-retro-2026-08-04.md` — AI #6]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md` — AD-8 addendum, AD-2, AD-22]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/auth-mail-interaction-map.md`]
- [Source: `_bmad-output/implementation-artifacts/invite-verify-gate-contract.md`]
- [Source: `_bmad-output/implementation-artifacts/story-close-overview-checklist.md`]
- [Source: `api/domain/signup.py` — `PERSONAL_LIST_NAME`]
- [Source: `README.md`, `docker-compose.yml`, `docker-compose.dev.yml`, `.env.example`]

## Dev Agent Record

### Agent Model Used

Composer (Cursor agent router)

### Debug Log References

- Compose smoke via BFF cookie-jar + Mailpit side-car (Mac `host.docker.internal`); api SMTP overridden for the run then restored to `.env`.
- Local `pytest`: 65 non-integration tests passed; integration suite needs Compose-network DB (host→`db` IP hung on Docker Desktop) — no product code changed in this story.

### Completion Notes List

- **Run summary (2026-08-04, AI):** Compose mode = dev overlay. Gate **off** then gate **on** both green. Claim probe = SQL age `password_reset_tokens` + BFF confirm → `400 invalid_reset_token`, `used_at` stayed null; adapter calls `claim_single_use_email_token`. Failures: none.
- Checklist artifact: `_bmad-output/implementation-artifacts/epic-1-spine-smoke-checklist.md` (all rows PASS).
- Sprint action item “Epic 1 spine smoke checklist after claim fix…” → `done`. Sibling Epic 1.5 stories untouched; invite stub retained; no 2.2+ work on this branch.

## Story-close overview — 1.5.5 / 1-5-5-epic-1-spine-smoke

**Request path:**  
browser/curl → ui BFF `/api/auth/*` + `/api/lists` → api auth/lists → application services → persistence + SMTP (Mailpit side-car) → `fh_session` cookie hop

**Key components:**  
`epic-1-spine-smoke-checklist.md`; Mailpit side-car; Compose `db`/`api`/`ui`; `adapters/persistence/token_claim.py` (exercised via reset confirm); api-only `POST /auth/gated-flows/invite-accept-stub`

**Why this shape:**  
Operator/Compose confidence after 1.5.1 claim fix (Correct Course AI #6) — reusable checklist under implementation-artifacts, not a Playwright substitute for CI (AD-15).

**What not to break:**  
httpOnly `fh_session` api-issued only; Personal = `name=="Personal"` + `role==owner`; claim must re-check `expires_at`; AD-2 no permanent mail Compose service; verify gate modes documented when claiming coverage.

### Change Log

- 2026-08-04: Authored checklist + executed green Compose smoke (gate off/on + expired claim probe); story → review.

### File List

- `_bmad-output/implementation-artifacts/epic-1-spine-smoke-checklist.md` (new)
- `_bmad-output/implementation-artifacts/1-5-5-epic-1-spine-smoke.md` (status/tasks/record)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (story → review; action item → done)

---

**Status:** review  
**Completion note:** Epic 1 spine smoke green; critical path 1.5.1→1.5.5 checklist complete
