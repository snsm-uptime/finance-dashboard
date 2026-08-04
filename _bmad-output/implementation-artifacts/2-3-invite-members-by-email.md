# Story 2.3: Invite members by email

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a list owner,
I want to invite someone to my list by email,
so that household peers can share expenses with me.

## Acceptance Criteria

1. **Given** I own a list and SMTP is configured  
   **When** I invite a registered user's email  
   **Then** they receive a join-list invitation email (FR-7, NFR-10, UX-DR16)

2. **Given** I own a list and SMTP is configured  
   **When** I invite an unregistered email  
   **Then** they receive a signup-oriented invitation (create-account template) that links them to this list after signup

3. **Given** I am a member but not the owner  
   **When** I attempt to invite someone  
   **Then** the action is rejected

4. **Given** the invite is sent  
   **When** the UI confirms  
   **Then** I see confirmation the invite went out (invite-sent state)  
   **And** the invitation email is written in my current Account language (EN/ES) (UX-DR16)

5. **Given** SMTP is misconfigured or unavailable  
   **When** I attempt to invite someone  
   **Then** the invite fails with a clear error — no silent "sent" state (NFR-10)

## Tasks / Subtasks

- [ ] Task 0: Confirm hard prerequisites are implemented (do not invent parallel stacks)
  - [ ] **1.1** Compose `db`/`api`/`ui`, hex layout including `adapters/email/`, Alembic, `/health`, lockfiles, CI
  - [ ] **1.2** User + List + ListMembership (personal list at signup); argon2; session cookie issuer
  - [ ] **1.3** Sign-in / sign-out / `me`; protected routes; same-origin BFF/proxy; generic auth errors
  - [ ] **1.4** SMTP adapter (`aiosmtplib ≥5.1.2`) + email port + `PUBLIC_APP_URL` + fail-loud SMTP — **reuse; do not create a second mail client**
  - [ ] **1.6** `user.language` persisted on account (`en`|`es`) — **required for UX-DR16** invite email locale
  - [ ] **2.1** Create/rename owned lists — ownership model for owner-only invite ACL
  - [ ] **2.2** Lists homepage + list detail surface + membership ACL API — Invite UI lives on list detail / shared-expenses (EXPERIENCE IA)
  - [ ] Read completion notes from 1.2–1.4 and 1.6 for AD-8 forks (cookie name, BFF vs proxy, opaque vs JWT), email port method names, language column — **reuse; never re-decide**
  - [ ] **1.5 Soft couple:** verification gate applies at **invite acceptance** (Story 2.4), not at send. Do not block send on invitee verification status — see [`invite-verify-gate-contract.md`](./invite-verify-gate-contract.md)
  - [ ] If any hard prerequisite is incomplete: **stop** — finish those stories first (one story per branch)

- [ ] Task 1: Invite token persistence + domain rules (AC: #1–#3) — close architecture gap with secure defaults
  - [ ] Architecture review flagged **invite/reset token lifecycle as Missing** — document chosen rules in completion notes. **Required secure defaults unless a later AD contradicts** (mirror 1.4):
    - Time-limited token (recommend ≤7 days for invites — longer than reset; document chosen TTL)
    - Single-use (consumed on successful accept in **2.4**; 2.3 issues only)
    - Store **hash of token** at rest; raw token only in the email link
    - Invalidate outstanding unused invites for the same `(list_id, email)` when a new invite is sent
  - [ ] Alembic table under `adapters/persistence/` (e.g. `list_invite_token`): UUID PK; `list_id` FK; invitee email (normalized); `token_hash`; `inviter_user_id` FK; `locale` snapshot or derive from inviter at send; `expires_at`; `used_at`/consumed flag; `created_at`
  - [ ] Domain owns: owner-can-invite check, registered vs unregistered resolution, token issue rules — **no** FastAPI / SQLAlchemy / aiosmtplib in `domain/`
  - [ ] Owner = durable `owner_id` / `created_by` from **2.1** (same SoT as rename) — member-but-not-owner → reject (AC #3)
  - [ ] Extend existing domain ACL port (`authorize_list_access` / equivalent) with invite action — do not invent a parallel ownership check
  - [ ] Non-member → reject (membership ACL / AD-19 / NFR-3) — prefer **403** consistent with 2.1/2.2 (if 404 used for anti-enumeration, match that policy)

- [ ] Task 2: Extend email port + invite templates (AC: #1, #2, #4, #5)
  - [ ] Extend **1.4 email port** with invite methods (names may match existing port style), e.g.:
    - `send_list_invite_join(to, link, list_name, inviter_display, locale)` — registered path
    - `send_list_invite_signup(to, link, list_name, inviter_display, locale)` — unregistered / create-account path
  - [ ] Two templates × two locales (EN + ES) — **UX-DR18**. Locale = **inviter's** current Account language (`user.language` from 1.6), **not** invitee preference (UX-DR16)
  - [ ] Link = `PUBLIC_APP_URL` + opaque token (paths reserved for 2.4 accept/signup — e.g. `/invites/accept?token=…` and/or `/sign-up?invite=…`; document chosen URLs in completion notes so 2.4 can wire them)
  - [ ] Sync SMTP send via existing aiosmtplib adapter — **no** Redis/queue/worker (AD-2)
  - [ ] SMTP misconfig/unreachable → structured failure; **never** return invite-sent when send did not succeed (AC #5, NFR-10)
  - [ ] Never log raw invite tokens at info; correlate via list/invite/request ids only
  - [ ] Reject Nodemailer / UI-side SMTP / second SMTP client

- [ ] Task 3: Send-invite use-case + API (AC: #1–#5)
  - [ ] Application use-case `InviteMemberToList` (or equivalent): authenticate actor → assert list owner → normalize email → resolve registered vs unregistered user → issue invite token → send matching template → on SMTP failure fail loud (do not mark sent / do not leave orphan "sent" semantics)
  - [ ] Route under `api/api/` — recommended: `POST /api/lists/{list_id}/invites` with `{ email }` — snake_case DTOs; structured JSON errors
  - [ ] Responses: `200`/`201` invite-sent confirmation shape | `403` non-owner (or non-member) | SMTP/config failure as clear 4xx/5xx (never silent success)
  - [ ] Auth: session cookie from 1.3 — same issuer; same-origin only
  - [ ] Registered vs unregistered is **server-side product behavior** (two templates) — inviter intentionally supplies the address; do not invent an enumeration-hiding success for wrong owner ACL failures
  - [ ] Optional product edges (document choice if implemented): already-a-member → clear calm error; do not auto-create membership on send (membership = **2.4** accept)

- [ ] Task 4: Invite form UI on list detail (AC: #3, #4, #5) — J4 Act A
  - [ ] Surface: **Invite** on Shared-expenses / list detail (UX-DR9, EXPERIENCE IA) — email field → Send → invite-sent confirmation
  - [ ] Entry from list detail (2.2 shell); Warm Balance tokens; primary Send = moss accent / `{rounded.sm}` (UX-DR6); kits unstyled only (AD-12)
  - [ ] Form chrome + confirmation + errors: i18n EN+ES keys in `ui` (viewer's locale); email **body** language = inviter account language (server)
  - [ ] Non-owner: hide invite action and/or show rejected state if they hit the API — UI must not claim sent
  - [ ] SMTP failure: clear error — what happened + what to do (UX-DR17); no alarmist theatre; no fake success
  - [ ] Submit via same-origin BFF/proxy only — never Bearer in `localStorage`
  - [ ] Phone-first (J4); usable on desktop same IA (NFR-7 / UX-DR20)
  - [ ] Do **not** build invitee signup landing, accept page, or membership creation UI (Story **2.4**)

- [ ] Task 5: Tests (AC: #1–#5)
  - [ ] Domain TDD: owner-only invite; member-not-owner rejected; non-member rejected; registered → join template path; unregistered → signup template path; token hash stored (raw not in DB)
  - [ ] Integration on **Postgres 16**: owner invite → fake/captured SMTP receives correct template + locale; membership **not** created yet
  - [ ] Inviter `language=es` → Spanish invite email; `language=en` → English
  - [ ] SMTP misconfig → API does **not** report invite-sent
  - [ ] UI: critical/smoke for invite form send + invite-sent state + error path (test-after OK; keep 1.1 coverage floor)
  - [ ] Fixtures: `owner@example.com`, `member@example.com`, `invitee@example.com` — no real PII
  - [ ] Do **not** require full Playwright every PR; no live SMTP in CI

## Dev Notes

### Epic context

Epic 2 = Shared lists & household membership (FR-6…FR-10). Demo gate = **unregistered invite → signup → lands on inviting list** (needs **2.3 send + 2.4 accept**).

| Sibling | Relationship to 2.3 |
|---------|---------------------|
| **2.1** Create/rename lists | Hard prerequisite — ownership for owner-only invite |
| **2.2** Lists homepage / detail | Hard prerequisite — Invite UI host surface + membership ACL |
| **2.4** Invitee signup landing | Downstream — consumes tokens/links issued here; creates membership |
| **2.5** Default split | After membership changes; not in 2.3 |
| **1.4** Password reset / SMTP | Hard prerequisite — **reuse** email adapter + port |
| **1.6** Account language | Hard prerequisite — inviter locale for invite emails |
| **1.5** Email verification | Soft — gates **acceptance** in 2.4 when enabled |

### Hard prerequisites / ordering

```text
1.1 → 1.2 → 1.3 → 1.4 (+ 1.6) → 2.1 → 2.2 → 2.3 → 2.4
```

- Branch: `feat/2/2-3-invite-members-by-email` (AD-13) — **one story per branch**
- Do **not** implement 2.3 before 2.1/2.2 and 1.4/1.6 land
- Reuse 1.4 completion notes for SMTP env names, email port shape, `PUBLIC_APP_URL`
- Reuse 1.6 for `user.language` read path — never store invite-email locale only in UI localStorage

### Scope boundaries (anti-scope)

| In 2.3 | Out of 2.3 |
|--------|------------|
| Owner sends invite by email (two templates) | Invitee signup / accept / membership create (**2.4**) |
| Invite token **issue** + hash storage | Invalid/expired token UX on accept (**2.4**) |
| Invite-sent confirmation UI on list detail | Settle-up / balance strip content (**Epic 3**) |
| Owner-only ACL on send | Standing default split when members change (**2.5**) |
| EN/ES email from inviter Account language | Email verification gate at accept (**1.5 → 2.4**) |
| Fail loud on SMTP | Redis/mail worker; Nodemailer on `ui` |
| Extend 1.4 SMTP adapter | Second SMTP client or Node mail SoT |

**Forbidden:** Bearer in `localStorage` · silent "sent" when SMTP failed · storing raw invite tokens or plaintext secrets · creating membership on send · domain importing aiosmtplib/SQLAlchemy/FastAPI · `NEXT_PUBLIC_*` secrets · committing real SMTP credentials · inventing owner-vs-viewer product roles beyond owner-only invite (AD-19 peers for expenses).

### Architecture compliance

[Source: `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md`]

- **AD-1:** Email under `api/adapters/email/`; domain free of SMTP/ORM/framework; `ui` → HTTP only
- **AD-2:** No mail worker — sync send from `api`
- **AD-8:** Authenticated owner session via httpOnly Secure cookie; invite **links** carry opaque tokens (not API Bearer tokens)
- **AD-19:** Membership ACL for list R/W; **invite acceptance creates membership** (acceptance = 2.4); 2.3 only creates pending invite + sends mail
- **AD-22 / NFR-10:** Operator SMTP; secrets outside repo
- **AD-12 / UX-DR16 / UX-DR18:** EXPERIENCE + DESIGN binding; invite emails EN+ES; inviter locale
- **AD-13 / AD-15:** Branch naming; domain TDD for invite/owner rules; CI lint + pytest + ui typecheck — not full Playwright every PR
- **Capability map:** Invites email → SMTP adapter | governed by AD-8, AD-19

**Known gap (implementer closes with documented defaults):** invite token lifecycle (TTL, single-use, hash, invalidation) — apply Task 1 secure defaults; document in completion notes.

**Do not confuse:** Auth **session** (cookie) ≠ **Import Session** (AD-4) ≠ **invite token**.

### Library / framework requirements

| Piece | Pin / guidance | Notes |
|-------|----------------|-------|
| aiosmtplib | **≥5.1.2** (PyPI 5.1.2; CVE-2026-55558 STARTTLS) | Already required by 1.4 — do not pin below 5.1.2 |
| FastAPI / Pydantic / SQLAlchemy / Alembic | From 1.1 lockfile | Routes + persistence |
| argon2 / session cookie | From 1.2/1.3 | Auth edge only |
| Next.js / React | 16.2.x / 19.2.x | Invite form on list detail |
| i18n | From 1.6 (`next-intl` or equivalent) | UI chrome viewer locale; email templates server-side |

After lockfiles exist: do not bump unrelated majors inside this feature story.

### Recommended API / UI shapes

```text
# Extend lists router from 2.1/2.2 — do not invent a parallel lists stack
POST /api/lists/{list_id}/invites   { email }
  → 200/201 { status: "sent" } | 403 non-owner/non-member | 4xx/5xx SMTP/config fail-loud

# Existing (from 2.1/2.2) — reuse, do not fork:
POST   /api/lists
PATCH  /api/lists/{list_id}
GET    /api/lists
GET    /api/lists/{list_id}

# 2.4 will consume (do not implement accept here):
# invite accept + signup-with-invite deep links

ui/app/(authenticated)/lists/[listId]/page.tsx   # UPDATE — Invite entry + form (email → send → invite-sent)
ui i18n catalogs                                 # UPDATE — invite chrome EN/ES
api/adapters/email/…                             # UPDATE — join + signup templates × en/es
api/adapters/persistence/…                       # NEW — list_invite_token + Alembic
api/domain/… + application/…                     # NEW — invite rules; extend ACL port for invite action
```

Wire snake_case on API DTOs; map at UI edge. Money fields elsewhere stay string Decimal — N/A on invite body.

### File structure requirements

```text
api/
  domain/…                         # extend ACL port: invite action; token issue rules (pure)
  application/…                    # InviteMemberToList; extend email port
  adapters/email/…                 # UPDATE — invite templates (reuse 1.4 SMTP)
  adapters/persistence/…           # NEW invite token model + Alembic; reuse List/Membership models
  api/routes/lists.py (or equiv)   # UPDATE — POST /lists/{list_id}/invites
  tests/…                          # domain TDD + Postgres + mock SMTP
ui/
  app/(authenticated)/lists/[listId]/page.tsx  # UPDATE — invite form / sheet on detail shell
  components/…                     # optional InviteForm extract
  lib/i18n/…                       # UPDATE — invite chrome keys
  app/api/lists/[listId]/invites/  # optional BFF forwarder
.env.example                       # ensure PUBLIC_APP_URL + SMTP_* (from 1.4)
docker-compose*.yml                # SMTP + PUBLIC_APP_URL into api if not already
```

### Existing code being modified

| Path | Expected state entering 2.3 | This story | Preserve |
|------|----------------------------|------------|----------|
| `api/adapters/email/` | SMTP + reset (and maybe verify) from **1.4/1.5** | Add invite templates/methods | Same port + aiosmtplib client; fail-loud |
| List / ListMembership / User | From **1.2 + 2.1** — durable `owner_id`/`created_by` | Read owner + inviter language; **no** membership insert on send | Same List entity; AD-19 peers; Alembic only |
| Domain ACL port | From **2.1/2.2** (`authorize_list_access`) | Add invite/owner-only action | Repos still require `acting_user_id` |
| `ui/app/(authenticated)/lists/[listId]/page.tsx` | Shared-expenses shell from **2.2** | Invite form + invite-sent state | Empty settle until Epic 3; first-paint invite deep-link hook for **2.4** |
| Auth cookie / BFF | From **1.3** | Authenticate invite POST | Same issuer; no Bearer in storage |
| `.env.example` / Compose | SMTP + `PUBLIC_APP_URL` from 1.4 | Confirm invite links use public URL | No real secrets committed |

**Greenfield note (as of story creation):** Working tree has 1.1 scaffold only (`adapters/email/` empty docstring). Auth, lists, and SMTP land in prerequisite stories before this one runs. Do not scaffold a parallel layout or mail stack.

### UX requirements

[Source: EXPERIENCE.md · DESIGN.md · journey-j4-invite.md · UX-DR9/16/17/18]

- **J4 Act A (this story):** Shared-expenses → invite by email → confirmation invite went out
- **J4 Act B (2.4):** Invitee opens email → signup → lands on inviting list with settle-up context
- Invite form component pattern: Email address → send; unregistered path uses create-account email template
- Invite-sent state pattern: confirmation invite went out
- Errors: what happened + what to do; clear + calm; no peer blame / bank jargon
- No invite mock — apply Warm Balance form/button tokens; Send = primary moss button
- Registered-path email is required by FR-7/AC #1 even though J4 narrates only the unregistered path

### Testing requirements

- Domain: red→green TDD for owner ACL + template path selection + token hash rules (AD-15)
- Integration: Postgres 16 + fake SMTP capture (no live BCCR/SMTP in CI)
- Assert membership row **absent** after successful send (created only in 2.4)
- Assert locale of email content matches inviter language
- UI critical: invite-sent vs SMTP error; non-owner cannot succeed
- Coverage floor: obey 1.1 floor; test-after for UI OK

### Previous story intelligence

#### From Story 2.1 (create/rename owned lists)

[Source: `_bmad-output/implementation-artifacts/2-1-create-and-rename-owned-lists.md`]

- **Owner SoT:** Durable `owner_id` / `created_by` on List at create — **same field** for rename ACL and invite ACL. No ownership transfer in v1.
- Create is atomic: list → owner membership → even-split seed. Creator is both owner and member.
- Owner-only admin actions: rename, **invite**, default-split (2.5). Membership alone is insufficient. FR-8 peer equality = expense participation, not admin.
- ACL responses: unauthenticated **401**; non-member or member-not-owner **403** (structured; consistent anti-enumeration policy if using 404 — document and match 2.1/2.2).
- Extend domain ACL port — do not invent a second ownership check.

#### From Story 2.2 (lists homepage / membership-scoped access)

[Source: `_bmad-output/implementation-artifacts/2-2-lists-homepage-membership-scoped-access.md`]

- Host Invite UI on `ui/app/(authenticated)/lists/[listId]/page.tsx` (shared-expenses shell) — **not** Lists homepage, not Account/Settings.
- Reuse `authorize_list_access(acting_user_id, list_id, action)` + repo choke requiring `acting_user_id` (no bare `list_id`).
- First-paint / last-opened must **leave the invite deep-link exception hook for 2.4** — never force Lists homepage after invitee signup.
- Read endpoints stay member-readable; invite is a **new owner-only write** on the lists router.
- Do **not** auto-create membership on send.

#### From Epic 1 email/auth stories

| Source | Carry forward into 2.3 |
|--------|------------------------|
| **1.4** | SMTP adapter, email port, fail-loud NFR-10, token hash/TTL/single-use defaults, `PUBLIC_APP_URL`, sync send, no Redis worker; *"Invite emails / join-list tokens (Epic 2 — reuse this adapter)"* |
| **1.5** | Verification gate is for **accept** paths (2.4); reuse same adapter; no second mail client |
| **1.6** | `user.language` on account is SoT for invite email locale — never device-only prefs |
| **1.2** | Same List entity for personal + shared; invitee still gets personal list at signup (2.4) **and** inviting-list membership |
| **1.3** | Session protection; invite **send** authenticated; accept links may be public in 2.4 |

Epic 1/2 story File Lists / Completion Notes are empty (ready-for-dev only) until implementation lands — treat story specs + scaffold as SoT.

### Git intelligence summary

Recent commits are planning/BMAD story context (`1.1`–`1.6` ready-for-dev). Application code present locally is **1.1 scaffold** (health, empty `adapters/email/`, SMTP placeholders in `.env.example` without `PUBLIC_APP_URL` yet). Expect 1.4 to add `PUBLIC_APP_URL` before 2.3.

### Latest tech information

- **aiosmtplib 5.1.2** (2026-06-20): patches CVE-2026-55558 STARTTLS response injection (GHSA-vxj7-4xrp-5vr4). Floor remains **≥5.1.2**; prefer implicit TLS (`use_tls=True`, port 465) when operator SMTP supports it.
- Typical send: `aiosmtplib.send(message, hostname=…, port=…)` or `SMTP` client — config from env, not hardcoded.
- No new UI mail libraries — Next stays HTTP client to `api`.

### Project context reference

Follow `_bmad-output/project-context.md`:

- Hex ports; generic auth errors where applicable; UUID entities
- EN+ES product chrome; invite emails in i18n scope
- Never float money (N/A here); never Bearer in `localStorage`
- Source-of-truth order: ARCHITECTURE-SPINE + project-context → SPEC → DESIGN/EXPERIENCE → PRD/epics

### References

- `_bmad-output/planning-artifacts/epics.md` — Story 2.3 ACs; FR-7; NFR-10; UX-DR16/18; Stories 2.1/2.2/2.4
- `_bmad-output/specs/spec-finance-helper/SPEC.md` — CAP-3
- `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md` — AD-1, AD-2, AD-8, AD-19, AD-22; capability map
- `_bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/EXPERIENCE.md` — Invite IA, J4, invite-sent state
- `_bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/.working/journey-j4-invite.md` — Act A/B
- `_bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/DESIGN.md` — Warm Balance tokens / primary button
- `_bmad-output/implementation-artifacts/1-4-password-reset-via-email.md` — SMTP + token defaults to reuse
- `_bmad-output/implementation-artifacts/1-6-account-menu-language-en-es-and-theme.md` — inviter language SoT
- `_bmad-output/project-context.md` — agent implementation rules

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

---

**Ultimate context engine analysis completed — comprehensive developer guide created.**
