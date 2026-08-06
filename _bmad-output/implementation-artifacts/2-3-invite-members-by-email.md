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
   **Then** the action is rejected (**403** `not_list_owner` — match rename ACL)

4. **Given** the invite is sent  
   **When** the UI confirms  
   **Then** I see confirmation the invite went out (invite-sent state)  
   **And** the invitation email is written in my current Account language (EN/ES) (UX-DR16)

5. **Given** SMTP is misconfigured or unavailable  
   **When** I attempt to invite someone  
   **Then** the invite fails with a clear error — no silent "sent" state (NFR-10); API returns **503** `smtp_config_error` / `smtp_send_error` after `db.rollback()` (copy password-reset path)

6. **Given** `EMAIL_VERIFICATION_REQUIRED=true` and the invitee is unverified (or unknown)  
   **When** I send an invite  
   **Then** send **succeeds** — never call `EnsureEmailVerifiedService` on send (verify gate = **2.4 accept only**; see [`invite-verify-gate-contract.md`](./invite-verify-gate-contract.md))

## Tasks / Subtasks

- [ ] Task 0: Confirm prerequisites + as-built reuse (do not invent parallel stacks)
  - [ ] **Done facts (reuse — not todos):** Epic **1**, **1.5**, and Story **2.1** are **done** on `main`. Collapse former Epic 1 soft checkboxes into the **As-built reuse table** below — do not re-scaffold SMTP, auth, or lists.
  - [ ] **2.2 gate (explicit):** Story **2.2** is still `ready-for-dev` (list detail shell + `authorize_list_access`). Choose **one** and document in completion notes:
    1. **Preferred:** finish **2.2** first — Invite UI on list detail; extend ACL port with `invite_member` (or equivalent owner action).
    2. **Allowed interim:** API-first + Invite UI bolted onto live `ui/app/lists/` (`ListsPanel` / homepage) with **ad-hoc owner ACL mirroring `RenameListService`** until 2.2 lands — then migrate onto `authorize_list_access` + detail shell without changing HTTP error codes.
  - [ ] **Mandatory living docs** (read before coding):
    - [`invite-verify-gate-contract.md`](./invite-verify-gate-contract.md) — send must **not** call Ensure; accept (2.4) must
    - [`auth-email-token-claim-pattern.md`](./auth-email-token-claim-pattern.md) — hash + TTL + `claim_single_use_email_token` for **2.4** consume
    - [`membership-acl-enforcement-sketch.md`](../planning-artifacts/architecture/architecture-finance-helper-2026-08-03/membership-acl-enforcement-sketch.md) — owner action / error disclosure
    - [`auth-mail-interaction-map.md`](../planning-artifacts/architecture/architecture-finance-helper-2026-08-03/auth-mail-interaction-map.md) — SMTP / token orientation
  - [ ] Branch: `feat/2/2-3-invite-members-by-email` (AD-13) — **one story per branch**
  - [ ] If Epic 1 / 1.5 / 2.1 code is missing from the tree: **stop** — do not invent parallel mail/auth/list stacks

- [ ] Task 1: Invite token persistence + domain rules (AC: #1–#3, #6) — close architecture gap with secure defaults
  - [ ] Architecture review flagged **invite/reset token lifecycle as Missing** at story birth — as-built reset/verify already set the pattern. **Required secure defaults** (document TTL in completion notes):
    - Time-limited token (recommend ≤7 days for invites — longer than reset; document chosen TTL)
    - Single-use (consumed on successful accept in **2.4**; 2.3 issues only)
    - Store **hash of token** at rest (mirror `hash_reset_token` / `hash_verification_token`); raw token only in the email link
    - Invalidate outstanding unused invites for the same `(list_id, email)` when a new invite is sent
    - **Separate table** for invites — reuse `claim_single_use_email_token` (`api/adapters/persistence/token_claim.py`) for **2.4** consume, not the reset/verify tables ([`auth-email-token-claim-pattern.md`](./auth-email-token-claim-pattern.md))
  - [ ] Alembic table under `api/adapters/persistence/` (e.g. `list_invite_token` / `ListInviteTokenModel`): UUID PK; `list_id` FK; invitee email (normalized); `token_hash`; `inviter_user_id` FK; locale snapshot **or** derive from inviter at send; `expires_at`; `used_at`/consumed; `created_at`
  - [ ] Domain owns: owner-can-invite check, registered vs unregistered resolution, token issue rules — **no** FastAPI / SQLAlchemy / aiosmtplib in `domain/`
  - [ ] Owner SoT = durable **`owner_id` only** on `ListModel` (same as rename) — there is **no** `created_by` column. Member-but-not-owner → `NotListOwnerError` → **403** `not_list_owner` (AC #3)
  - [ ] ACL: if **2.2** landed `authorize_list_access`, extend with owner invite action. If not, **mirror** `RenameListService` in `api/application/lists.py` (membership miss → `NotListMemberError`; `owner_id != actor` → `NotListOwnerError`) — do **not** invent a third ownership check
  - [ ] Non-member → reject — prefer **403** `not_list_member` consistent with 2.1 rename (grandfather). If 2.2 changed disclosure for some mutations, match that policy and document

- [ ] Task 2: Invite email templates via existing mail port (AC: #1, #2, #4, #5) — **extend application, not the port**
  - [ ] **Reuse** `EmailSender.send(EmailMessage)` in `api/application/ports.py` + `SmtpEmailSender` in `api/adapters/email/smtp.py`. **Do not** add `send_list_invite_*` methods on the email port
  - [ ] Build join + signup templates in the **application** layer (same shape as `RequestPasswordResetService` / `RequestEmailVerificationService`): construct `EmailMessage(to_address, subject, body_text, body_html)` then `mailer.send(...)`
  - [ ] Two templates × two locales (EN + ES) — **UX-DR18**. Locale = inviter's Account language via `PreferencesRepository` / `coerce_stored_language` — when stored language is **null**, default **`en`** (`DEFAULT_LANGUAGE`). **Not** invitee preference (UX-DR16)
  - [ ] Link = `PUBLIC_APP_URL` (already in `.env.example` + `AuthSettings.public_app_url`) + opaque token. Paths reserved for **2.4** accept/signup — e.g. `/invites/accept?token=…` and/or `/sign-up?invite=…`; **document chosen URLs** in completion notes so 2.4 can wire them
  - [ ] Sync SMTP via existing aiosmtplib adapter — **no** Redis/queue/worker (AD-2)
  - [ ] **SMTP fail path (locked — copy `auth.py`):** persist invite token row → send mail → on `SmtpConfigurationError` / `SmtpSendError` → **`db.rollback()`** → **503** via `_smtp_error_response` (`smtp_config_error` / `smtp_send_error`). Never return invite-sent when send did not succeed (AC #5, NFR-10)
  - [ ] Never log raw invite tokens at info; correlate via list/invite/request ids only
  - [ ] Reject Nodemailer / UI-side SMTP / second SMTP client

- [ ] Task 3: Send-invite use-case + API (AC: #1–#6)
  - [ ] Application use-case `InviteMemberToList` (or equivalent): authenticate actor → assert list owner → normalize email → resolve registered vs unregistered → issue invite token (hash at rest) → build `EmailMessage` → `mailer.send` → on SMTP failure fail loud (rollback; do not leave "sent" semantics)
  - [ ] **Verify-gate soft couple (negative):** do **not** call `EnsureEmailVerifiedService` / `ensure_email_verified` on send — even when `EMAIL_VERIFICATION_REQUIRED=true` and invitee is unverified/unknown. Gate lives at **2.4 accept** only ([`invite-verify-gate-contract.md`](./invite-verify-gate-contract.md))
  - [ ] Route — extend live `api/api/routes/lists.py`: `POST /lists/{list_id}/invites` with `{ email }` — snake_case DTOs; structured JSON errors. UI BFF: add `ui/app/api/lists/[listId]/invites/` (or equivalent) forwarding — keep PATCH rename
  - [ ] **Error / success matrix (locked — assert `code` in tests):**

    | Case | HTTP | Body / notes |
    |------|------|----------------|
    | Invite sent | 200/201 | `{ "status": "sent" }` (or equivalent confirmed shape) |
    | Unauthenticated | 401 | Existing session gate |
    | Member not owner | **403** | `not_list_owner` (match rename) |
    | Non-member / missing list (match 2.1 rename grandfather unless 2.2 changed it) | **403** | `not_list_member` |
    | SMTP config / send failure | **503** | `smtp_config_error` / `smtp_send_error` after `db.rollback()` |

  - [ ] Auth: session cookie from 1.3 (`fh_session`) — same issuer; same-origin only
  - [ ] Registered vs unregistered is **server-side product behavior** (two templates) — inviter supplies the address; do not invent enumeration-hiding success for wrong owner ACL failures
  - [ ] Optional product edges (document if implemented): already-a-member → clear calm error; **never** auto-create membership on send (membership = **2.4** accept)

- [ ] Task 4: Invite form UI (AC: #3, #4, #5) — J4 Act A
  - [ ] **Host surface depends on 2.2 gate:**
    - After 2.2: Invite on list detail `ui/app/lists/[listId]/page.tsx` (shared-expenses / Soft-Ledger shell) — UX-DR9 EXPERIENCE IA
    - Interim without 2.2: Invite entry on live `ui/app/lists/page.tsx` / `ListsPanel.tsx` (owner-only) — document and migrate when detail lands
  - [ ] Do **not** invent `ui/app/(authenticated)/lists/…` — extend live `ui/app/lists/`
  - [ ] Email field → Send → invite-sent confirmation; Warm Balance tokens; primary Send = moss accent / `{rounded.sm}` (UX-DR6); kits unstyled only (AD-12)
  - [ ] Form chrome + confirmation + errors: i18n EN+ES keys in `ui` (viewer's locale); email **body** language = inviter account language (server)
  - [ ] Non-owner: hide invite action and/or show rejected state if they hit the API — UI must not claim sent (`ListsPanel` already compares `list.owner_id === currentUserId` for rename)
  - [ ] SMTP failure: clear error — what happened + what to do (UX-DR17); no alarmist theatre; no fake success
  - [ ] Submit via same-origin BFF/proxy only — never Bearer in `localStorage`
  - [ ] Phone-first (J4); usable on desktop same IA (NFR-7 / UX-DR20)
  - [ ] Do **not** build invitee signup landing, accept page, or membership creation UI (Story **2.4**)

- [ ] Task 5: Tests (AC: #1–#6)
  - [ ] Domain TDD: owner-only invite; member-not-owner rejected; non-member rejected; registered → join template path; unregistered → signup template path; token hash stored (raw not in DB)
  - [ ] Integration on **Postgres 16**: owner invite → captured SMTP receives correct template + locale; **membership row not created**; send succeeds with `EMAIL_VERIFICATION_REQUIRED=true` + unverified invitee; **`EnsureEmailVerifiedService` not invoked** on send
  - [ ] Reuse fake SMTP from password-reset / verify integration tests (`CapturingMailer` + monkeypatch `SmtpEmailSender` / `load_smtp_settings` in `api/tests/test_password_reset_integration.py` / `test_email_verification_integration.py`)
  - [ ] Inviter `language=es` → Spanish invite email; `language=en` or **null** → English
  - [ ] SMTP misconfig → API does **not** report invite-sent; **503** + rollback (no lingering invite token row)
  - [ ] Assert wire `code` fields, not HTTP status alone
  - [ ] UI: critical/smoke for invite form send + invite-sent state + error path (test-after OK; keep 1.1 coverage floor)
  - [ ] Fixtures: `owner@example.com`, `member@example.com`, `invitee@example.com` — no real PII
  - [ ] Do **not** require full Playwright every PR; no live SMTP in CI

- [ ] Task 6: Story-close overview (before marking done)
  - [ ] Per [`story-close-overview-checklist.md`](./story-close-overview-checklist.md): paste the four-section template into Completion Notes (request path, key components, why this shape, what not to break)
  - [ ] If auth/mail paths change, update [`auth-mail-interaction-map.md`](../planning-artifacts/architecture/architecture-finance-helper-2026-08-03/auth-mail-interaction-map.md) in the **same PR**
  - [ ] If new list-scoped owner action lands via `authorize_list_access`, update the ACL sketch in the same PR

## Dev Notes

### As-built reuse table (Epic 1 + 1.5 + 2.1 — done facts)

| Area | Live path / symbol | Reuse rule for 2.3 |
|------|--------------------|--------------------|
| Email port | `api/application/ports.py` → `EmailMessage`, `EmailSender.send` | Generic send only — templates in application |
| SMTP adapter | `api/adapters/email/smtp.py` → `SmtpEmailSender` | Fail-loud; no second client |
| SMTP settings | `api/adapters/email/settings.py` → `load_smtp_settings` | `SMTP_*` already in `.env.example` |
| Public URL | `PUBLIC_APP_URL` / `AuthSettings.public_app_url` | Invite links |
| Persist→send→rollback | `api/application/password_reset.py`, `email_verification.py` + `api/api/routes/auth.py` (`_smtp_error_response`, `db.rollback()`) | Copy exactly for invite route |
| Token claim helper | `api/adapters/persistence/token_claim.py` → `claim_single_use_email_token` | Issue in 2.3; **consume in 2.4** |
| Hash-at-rest pattern | `api/domain/password_reset.py` (`hash_reset_token`), `api/domain/email_verification.py` (`hash_verification_token`) | Mirror for invite hash helper |
| Verify gate | `EnsureEmailVerifiedService` in `api/application/email_verification.py` | **Do not call on send** |
| Inviter locale | `PreferencesRepository` / `SqlAlchemyAuthUserRepository.get_preferences`; `coerce_stored_language` + `DEFAULT_LANGUAGE="en"` in `api/domain/preferences.py` | Null language → `en` |
| Owner ACL pattern | `RenameListService` in `api/application/lists.py`; `NotListOwnerError` in `api/domain/errors.py` | Mirror or extend 2.2 port |
| List entity | `ListModel.owner_id` only — **no `created_by`** | Owner-only invite |
| Lists API / UI | `api/api/routes/lists.py`; `ui/app/lists/page.tsx`, `ListsPanel.tsx`, BFF PATCH | Extend; no parallel tree |
| Fake SMTP tests | `api/tests/test_password_reset_integration.py` (`CapturingMailer`) | Reuse for invite integration |

### Epic context

Epic 2 = Shared lists & household membership (FR-6…FR-10). Demo gate = **unregistered invite → signup → lands on inviting list** (needs **2.3 send + 2.4 accept**).

| Sibling | Relationship to 2.3 |
|---------|---------------------|
| **2.1** Create/rename lists | **Done** — `owner_id` ACL pattern to reuse |
| **2.2** Lists homepage / detail | Soft/hard ambiguous — preferred host for Invite UI + `authorize_list_access`; see Task 0 gate |
| **2.4** Invitee signup landing | Downstream — consumes tokens/links; creates membership; **calls** Ensure |
| **2.5** Default split | After membership changes; not in 2.3 |
| **1.4** Password reset / SMTP | **Done** — reuse `EmailSender` + persist/rollback |
| **1.5** Email verification + contracts | **Done** — soft couple: gate at accept only |
| **1.6** Account language | **Done** — inviter locale SoT |

### Hard prerequisites / ordering

```text
Epic 1 (done) → Epic 1.5 (done) → 2.1 (done) → [2.2 preferred] → 2.3 → 2.4
```

- Branch: `feat/2/2-3-invite-members-by-email` (AD-13) — **one story per branch**
- Do **not** re-implement SMTP, sessions, or create/rename inside this story
- Without 2.2: API-first + interim `/lists` UI is allowed (Task 0); do not invent `(authenticated)/lists/[listId]` while claiming 2.2 already shipped it

### Scope boundaries (anti-scope)

| In 2.3 | Out of 2.3 |
|--------|------------|
| Owner sends invite by email (two templates) | Invitee signup / accept / membership create (**2.4**) |
| Invite token **issue** + hash storage | Token **claim/consume** + invalid/expired UX (**2.4** — reuse `claim_single_use_email_token`) |
| Invite-sent confirmation UI (detail or interim `/lists`) | Settle-up / balance strip content (**Epic 3**) |
| Owner-only ACL on send | Standing default split when members change (**2.5**) |
| EN/ES email from inviter Account language | Email verification gate at accept (**2.4** + contract) |
| Fail loud on SMTP (rollback + 503) | Redis/mail worker; Nodemailer on `ui` |
| Application-layer invite templates via `EmailSender.send` | New email port methods; second SMTP client |

**Forbidden:** Bearer in `localStorage` · silent "sent" when SMTP failed · storing raw invite tokens · creating membership on send · calling `EnsureEmailVerifiedService` on send · domain importing aiosmtplib/SQLAlchemy/FastAPI · `NEXT_PUBLIC_*` secrets · committing real SMTP credentials · inventing `created_by` · inventing owner-vs-viewer product roles beyond owner-only invite (AD-19 peers for expenses).

### Architecture compliance

[Source: `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md`]

- **AD-1:** Email under `api/adapters/email/`; domain free of SMTP/ORM/framework; `ui` → HTTP only
- **AD-2:** No mail worker — sync send from `api`
- **AD-8:** Authenticated owner session via httpOnly Secure cookie (`fh_session`); invite **links** carry opaque tokens (not API Bearer tokens); claim pattern addendum in [`auth-email-token-claim-pattern.md`](./auth-email-token-claim-pattern.md)
- **AD-19:** Membership ACL for list R/W; **invite acceptance creates membership** (2.4); 2.3 only creates pending invite + sends mail. Sketch: [`membership-acl-enforcement-sketch.md`](../planning-artifacts/architecture/architecture-finance-helper-2026-08-03/membership-acl-enforcement-sketch.md)
- **AD-22 / NFR-10:** Operator SMTP; secrets outside repo; Alembic only
- **AD-12 / UX-DR16 / UX-DR18:** EXPERIENCE + DESIGN binding; invite emails EN+ES; inviter locale
- **AD-13 / AD-15:** Branch naming; domain TDD for invite/owner rules; CI lint + pytest + ui typecheck — not full Playwright every PR
- **Capability map:** Invites email → SMTP adapter | governed by AD-8, AD-19

**Known gap (implementer closes with documented defaults):** invite token TTL / invalidation table design — apply Task 1 secure defaults; document in completion notes. Reset/verify already prove hash + claim patterns.

**Do not confuse:** Auth **session** (cookie) ≠ **Import Session** (AD-4) ≠ **invite token**.

### Library / framework requirements

| Piece | Pin / guidance | Notes |
|-------|----------------|-------|
| aiosmtplib | **≥5.1.2** (CVE-2026-55558 STARTTLS) | Already required — do not pin below 5.1.2 |
| FastAPI / Pydantic / SQLAlchemy / Alembic | From lockfile | Extend live lists router + persistence |
| argon2 / session cookie | From 1.2/1.3 | Auth edge only — `fh_session` |
| Next.js / React | 16.2.x / 19.2.x | Invite form on list detail (2.2) or interim `/lists` |
| i18n | From 1.6 (`next-intl` / account language) | UI chrome viewer locale; email templates server-side |

After lockfiles exist: do not bump unrelated majors inside this feature story.

### Recommended API / UI shapes

```text
# Extend live lists router — do not invent a parallel lists stack
POST /lists/{list_id}/invites   { email }
  → 200/201 { status: "sent" }
  | 403 not_list_owner / not_list_member
  | 503 smtp_config_error / smtp_send_error  (after db.rollback())

# Existing (2.1 — reuse):
GET    /lists
POST   /lists
PATCH  /lists/{list_id}

# 2.2 may add (preferred host before polish):
GET    /lists/{list_id}
# + ui/app/lists/[listId]/page.tsx detail shell

# 2.4 will consume (do not implement accept here):
# invite accept + signup-with-invite deep links + claim_single_use_email_token

ui/app/lists/[listId]/page.tsx          # PREFERRED host after 2.2 — Invite form
ui/app/lists/page.tsx + ListsPanel.tsx # INTERIM host if API-first without 2.2
ui i18n catalogs                       # UPDATE — invite chrome EN/ES
api/application/…                      # NEW — InviteMemberToList + EmailMessage templates
api/adapters/email/smtp.py             # REUSE — do not add invite methods
api/adapters/persistence/…             # NEW — ListInviteTokenModel + Alembic
api/adapters/persistence/token_claim.py # REUSE in 2.4 consume
api/domain/… + NotListOwnerError        # REUSE / extend owner rules
```

Wire snake_case on API DTOs; map at UI edge. Money fields elsewhere stay string Decimal — N/A on invite body.

### File structure requirements

```text
api/
  application/ports.py                 # REUSE EmailSender / EmailMessage / PreferencesRepository
  application/invite_member.py (name)  # NEW — InviteMemberToList; build EmailMessage templates
  application/lists.py                 # REUSE RenameListService ACL pattern (or call authorize_list_access if 2.2)
  domain/…                             # NEW invite token hash/rules; REUSE NotListOwnerError
  adapters/email/smtp.py               # REUSE SmtpEmailSender — no invite-specific methods
  adapters/persistence/token_claim.py  # REUSE helper (consume in 2.4)
  adapters/persistence/…               # NEW invite token model + Alembic; reuse List/Membership
  api/routes/lists.py                  # UPDATE — POST /lists/{list_id}/invites
  api/routes/auth.py                   # PATTERN ONLY — copy _smtp_error_response + rollback
  tests/test_password_reset_integration.py  # REUSE CapturingMailer pattern
  tests/…                              # NEW domain TDD + Postgres invite + verify-gate negative
ui/
  app/lists/[listId]/page.tsx         # PREFERRED — Invite form (after 2.2)
  app/lists/ListsPanel.tsx             # INTERIM — owner invite entry if 2.2 not merged
  app/api/lists/[listId]/invites/     # NEW BFF forwarder
  lib/i18n/…                           # UPDATE — invite chrome keys
.env.example                           # CONFIRM PUBLIC_APP_URL + SMTP_* (already present)
docker-compose*.yml                    # CONFIRM SMTP + PUBLIC_APP_URL into api (already present)
```

### Existing code being modified

| Path | Expected state entering 2.3 | This story | Preserve |
|------|----------------------------|------------|----------|
| `api/application/ports.py` | `EmailSender.send(EmailMessage)` shipped | Use as-is for invite mail | No `send_list_invite_*` methods |
| `api/adapters/email/` | `SmtpEmailSender` + settings from **1.4/1.5** | Reuse only | Same aiosmtplib client; fail-loud |
| `ListModel` / memberships / User | From **1.2 + 2.1** — durable **`owner_id` only** | Read owner + inviter language; **no** membership insert on send | Same List entity; AD-19 peers; Alembic only |
| Owner ACL | `RenameListService` + `NotListOwnerError` live; `authorize_list_access` arrives with **2.2** | Mirror rename **or** extend ACL port | 403 codes grandfathered unless sketch says otherwise |
| `ui/app/lists/*` | Homepage + `ListsPanel` create/rename (**2.1**). **No** `[listId]/page.tsx` until **2.2** | Invite form on detail (preferred) or interim panel | Do not invent `(authenticated)/` tree |
| Auth cookie / BFF | From **1.3** | Authenticate invite POST | Same issuer; no Bearer in storage |
| `.env.example` / Compose | `PUBLIC_APP_URL` + `SMTP_*` + `EMAIL_VERIFICATION_REQUIRED` shipped | Confirm invite links use public URL | No real secrets committed |

### UX requirements

[Source: EXPERIENCE.md · DESIGN.md · journey-j4-invite.md · UX-DR9/16/17/18]

- **J4 Act A (this story):** Shared-expenses (or interim Lists) → invite by email → confirmation invite went out
- **J4 Act B (2.4):** Invitee opens email → signup → lands on inviting list with settle-up context
- Invite form: Email address → send; unregistered path uses create-account email template
- Invite-sent state: confirmation invite went out
- Errors: what happened + what to do; clear + calm; no peer blame / bank jargon
- No invite mock — apply Warm Balance form/button tokens; Send = primary moss button
- Registered-path email is required by FR-7/AC #1 even though J4 narrates only the unregistered path

### Testing requirements

- Domain: red→green TDD for owner ACL + template path selection + token hash rules (AD-15)
- Integration: Postgres 16 + `CapturingMailer` (no live BCCR/SMTP in CI)
- Assert membership row **absent** after successful send (created only in 2.4)
- Assert verify gate **not** invoked on send; send OK under `EMAIL_VERIFICATION_REQUIRED=true`
- Assert locale of email content matches inviter language (`null` → `en`)
- Assert SMTP failure → 503 + rollback (no leftover redeemable "sent" token)
- UI critical: invite-sent vs SMTP error; non-owner cannot succeed
- Coverage floor: obey 1.1 floor; test-after for UI OK

### Previous story intelligence

#### From Story 2.1 (create/rename owned lists) — done

[Source: `_bmad-output/implementation-artifacts/2-1-create-and-rename-owned-lists.md`]

- **Owner SoT:** Durable **`owner_id`** on List at create — **same field** for rename ACL and invite ACL. No `created_by`. No ownership transfer in v1.
- Create is atomic: list → owner membership → even-split seed. Creator is both owner and member.
- Owner-only admin actions: rename, **invite**, default-split (2.5). Membership alone is insufficient. FR-8 peer equality = expense participation, not admin.
- ACL responses (as-built rename): unauthenticated **401**; missing ≡ non-member **403** `not_list_member`; member-not-owner **403** `not_list_owner`.
- Mirror `RenameListService` until/unless 2.2 ships `authorize_list_access`.

#### From Story 2.2 (lists homepage / membership-scoped access) — ready-for-dev

[Source: `_bmad-output/implementation-artifacts/2-2-lists-homepage-membership-scoped-access.md`]

- Preferred Invite UI host: `ui/app/lists/[listId]/page.tsx` under live `ui/app/lists/` — **not** invented `(authenticated)/` trees, not Account/Settings.
- Preferred ACL: `authorize_list_access(acting_user_id, list_id, action)` with owner invite action — if absent, use interim ad-hoc owner check (Task 0).
- First-paint / last-opened must **leave the invite deep-link exception hook for 2.4**.
- Do **not** auto-create membership on send.

#### From Epic 1 / 1.5 email + contracts — done

| Source | Carry forward into 2.3 |
|--------|------------------------|
| **1.4** | `SmtpEmailSender`, `EmailSender.send`, fail-loud NFR-10, token hash/TTL/single-use, `PUBLIC_APP_URL`, sync send, no Redis worker |
| **1.5.1** | [`auth-email-token-claim-pattern.md`](./auth-email-token-claim-pattern.md) + `claim_single_use_email_token` for **2.4** |
| **1.5.2** | [`auth-mail-interaction-map.md`](../planning-artifacts/architecture/architecture-finance-helper-2026-08-03/auth-mail-interaction-map.md) + story-close overview checklist |
| **1.5.3** | [`invite-verify-gate-contract.md`](./invite-verify-gate-contract.md) — send allowed without verification; accept gated |
| **1.5.4** | [`membership-acl-enforcement-sketch.md`](../planning-artifacts/architecture/architecture-finance-helper-2026-08-03/membership-acl-enforcement-sketch.md) |
| **1.6** | `user.language` / prefs ports — SoT for invite email locale; null → `en` |
| **1.2/1.3** | Same List entity; session protection on send |

### Git intelligence summary

`main` is **post–Epic 1 / 1.5 / 2.1** (not a health-only scaffold). Recent history includes Epic 1.5 closeout (`docs(1.5): mark Epic 1.5 complete…`), SMTP rate limits, hex port polish, token claim fixes, and merged Story 2.1 create/rename (`owner_id`, live `GET|POST /lists`, `PATCH /lists/{id}`, `ui/app/lists/*`).

**Still pending for ideal 2.3 UX:** Story **2.2** detail shell + `authorize_list_access`. SMTP, `PUBLIC_APP_URL`, verify gate, prefs language, and owner rename ACL are **shipped** — reuse them.

### Latest tech information

- **aiosmtplib 5.1.2** (2026-06-20): patches CVE-2026-55558 STARTTLS response injection (GHSA-vxj7-4xrp-5vr4). Floor remains **≥5.1.2**; prefer implicit TLS (`use_tls=True`, port 465) when operator SMTP supports it.
- No new UI mail libraries — Next stays HTTP client to `api`.

### Project context reference

Follow `_bmad-output/project-context.md`:

- Hex ports; generic auth errors where applicable; UUID entities
- EN+ES product chrome; invite emails in i18n scope
- Never float money (N/A here); never Bearer in `localStorage`
- Source-of-truth order: ARCHITECTURE-SPINE + project-context → SPEC → DESIGN/EXPERIENCE → PRD/epics
- Story not `done` without story-close overview ([`story-close-overview-checklist.md`](./story-close-overview-checklist.md))

### References

- `_bmad-output/planning-artifacts/epics.md` — Story 2.3 ACs; FR-7; NFR-10; UX-DR16/18; Stories 2.1/2.2/2.4
- `_bmad-output/specs/spec-finance-helper/SPEC.md` — CAP-3
- `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md` — AD-1, AD-2, AD-8, AD-19, AD-22
- `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/membership-acl-enforcement-sketch.md`
- `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/auth-mail-interaction-map.md`
- `_bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/EXPERIENCE.md` — Invite IA, J4, invite-sent state
- `_bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/.working/journey-j4-invite.md` — Act A/B
- `_bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/DESIGN.md` — Warm Balance tokens / primary button
- `_bmad-output/implementation-artifacts/invite-verify-gate-contract.md`
- `_bmad-output/implementation-artifacts/auth-email-token-claim-pattern.md`
- `_bmad-output/implementation-artifacts/story-close-overview-checklist.md`
- `_bmad-output/implementation-artifacts/1-4-password-reset-via-email.md` — SMTP + token defaults to reuse
- `_bmad-output/implementation-artifacts/1-6-account-menu-language-en-es-and-theme.md` — inviter language SoT
- `_bmad-output/implementation-artifacts/2-1-create-and-rename-owned-lists.md` — owner ACL
- `_bmad-output/implementation-artifacts/2-2-lists-homepage-membership-scoped-access.md` — detail host + ACL port
- `_bmad-output/project-context.md` — agent implementation rules

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

---

**Story context refreshed against as-built Epic 1 / 1.5 / 2.1 — ready for validate-create-story or dev-story.**
