# Invite verify-gate contract

**Story:** 1.5.3 · **Status:** authoritative for Stories **2.3** / **2.4**  
**Seam:** `EnsureEmailVerifiedService` / domain `ensure_email_verified`  
**Date:** 2026-08-04

This document is the agreed behavior for how email verification gates **invite acceptance**. Implementers of 2.3/2.4 must follow it — do not re-decide or invent route-only checks.

Living orientation (stub naming only): [`auth-mail-interaction-map.md`](../planning-artifacts/architecture/architecture-finance-helper-2026-08-03/auth-mail-interaction-map.md) §3.

---

## 1. Purpose

When `EMAIL_VERIFICATION_REQUIRED` is on, an accepting user must have `email_verified_at` set **before** inviting-list membership is created. When the flag is off (default), accept proceeds without a verification check.

This is **flow-scoped** (FR-4 readiness for invite accept). It is **not** a second login wall and **not** a Lists homepage wall.

---

## 2. Truth table

| `EMAIL_VERIFICATION_REQUIRED` | Accepting user `email_verified_at` | Invite **send** (2.3) | Invite **accept** / membership (2.4) | Stub today `POST /auth/gated-flows/invite-accept-stub` |
|-------------------------------|------------------------------------|------------------------|--------------------------------------|--------------------------------------------------------|
| false / absent | any | **Allowed** — do **not** check invitee verification | **Allowed** — Ensure no-op / skip | **200** |
| true | `NULL` | **Allowed** — do **not** check invitee verification | **Blocked** before membership | **403** `email_not_verified` |
| true | set | **Allowed** | **Allowed** — then invite-token claim + ACL | **200** |

**Flag load:** `absent` = unset env → `api/api/settings.py` `_env_bool(..., default=False)` loads **`false`**. Only an explicit true-ish value (`1` / `true` / `yes` / `on`) enables the gate. After settings load there is no separate “absent” runtime state.

**Who is gated:** the **accepting user** (session principal after signup or sign-in) — **not** the inviter, and **not** the invitee email string at send time.

---

## 3. Call-site rules

### Must call

Application use-cases (names may vary):

- `AcceptListInvite` — registered path (authenticated)
- `SignUpWithInvite` — unregistered path (creates user then accepts)

Call **`EnsureEmailVerifiedService.execute(EnsureEmailVerifiedCommand(user_id, email_verification_required))`** in the application layer **before** creating `ListMembership` on the inviting list.

**Flag source:** `email_verification_required` MUST come from loaded `AuthSettings` / `EMAIL_VERIFICATION_REQUIRED` (same as the stub). Never hard-code, never accept a client-supplied flag that could bypass the gate.

### Must not

- Ad-hoc `email_verified_at` checks only in HTTP routes
- Calling Ensure on invite **send** (2.3)
- Gating the inviter
- Using a second session cookie / Bearer / parallel “verified session”
- Re-implementing Ensure logic inside 2.4 “for clarity”
- Claiming / consuming the invite token if Ensure raises (or if email-bind fails)

### Ordering

```text
# Registered accept
AcceptListInvite(token):
  require authenticated user
  → email-bind: session email must match invitee email on token (2.4)  # before Ensure
  → EnsureEmailVerifiedService.execute(
        EnsureEmailVerifiedCommand(
            user_id,
            email_verification_required=settings.email_verification_required,
        )
    )
  # If Ensure raises: do NOT claim token; do NOT create membership
  → claim invite token (separate list_invite_token table; 1.5.1 claim helper pattern)
  → create ListMembership
  → land on inviting list

# Signup-with-invite
SignUpWithInvite(email, password, token):
  → email-bind: signup email must match invitee email on token (2.4)  # before Ensure
  → create user + personal list + session (FR-1 / 1.2)  # session cookie MUST be set
  → EnsureEmailVerifiedService.execute(
        EnsureEmailVerifiedCommand(
            new_user_id,
            email_verification_required=settings.email_verification_required,
        )
    )
  # If Ensure raises (expected when flag on — new user is always unverified):
  #   keep user + personal list + session; return 403 email_not_verified;
  #   do NOT claim token; do NOT create inviting-list membership
  → claim invite token
  → create ListMembership on inviting list
  → land on inviting list (not blank Lists home)
```

**Email-bind before Ensure (locked):** identity/security check first so a mismatched email fails closed without sending the user through a verify loop for an invite that is not theirs. Both must still pass before membership.

When the flag is **off**, skip or rely on Ensure no-op; membership still requires a valid invite token and ACL rules.

**SignUpWithInvite + flag on (intentional partial success):** a brand-new user always has `email_verified_at = NULL`, so Ensure **always** blocks after user/session/personal-list creation. That is expected — not a bug. Keep the AD-8 session so `/auth/verify/request` works. Story 2.4’s “one atomic flow” means the **success** path (flag off, or already verified) creates personal list **and** inviting membership together; when the gate blocks, inviting membership is deferred until after verify + `AcceptListInvite`.

**Do not gate:** invite email send, list create/rename, sign-in, `/auth/me`, Lists homepage browse.

---

## 4. Error contract

| Condition | Domain | HTTP | Body |
|-----------|--------|------|------|
| Flag on + `email_verified_at` is `NULL` | `EmailNotVerifiedError` | **403 Forbidden** | `{"detail": "<EmailNotVerifiedError message>", "code": "email_not_verified"}` |
| Missing/invalid session | (auth deps) | **401** | Existing session error shape — **do not** reuse `email_not_verified` |
| Flag off | Ensure no-op | continue | — |

Stable API `detail` (do not invent a second copy — match the stub):

> Verify your email before continuing with this action. Check your inbox for a verification link, or open /verify to resend one.

**UI i18n:** EN+ES product chrome MUST key off `code: "email_not_verified"` and localize. Do **not** treat the English `detail` string as the UX contract.

Match the stub in `api/api/routes/auth.py` (`invite_accept_stub`). Prefer **403** (authenticated, policy-blocked) — never **401** for unverified email, and never **404** on accept when the flag is off (`404` `verification_not_required` is only for verify request/confirm when the gate is off).

---

## 5. Unlock path

Blocked acceptors use the **existing** verification product:

1. `POST /auth/verify/request` (auth required — session from signup/sign-in must already be set) → email link  
2. UI `/verify` → confirm (must **not** auto-confirm on mount)  
3. Sets `users.email_verified_at`  
4. Retry via **`AcceptListInvite(token)`** — **not** a second `SignUpWithInvite` (email already taken)  
5. Ensure allows → claim token → membership proceeds  

**Client must retain the invite token** across the `/verify` flow (deep-link query, `returnTo`, or equivalent) so step 4 does not require hunting for the original invite link.

No invite-specific verification product. No Account “verification settings” surface required for this contract.

---

## 6. Stub → real

| Phase | Behavior |
|-------|----------|
| **Now (Story 1.5)** | `POST /auth/gated-flows/invite-accept-stub` proves Ensure; **no** membership side effects |
| **1.5.5** | Spine smoke may call the stub as an Ensure probe — **before** 2.2+; stub does **not** cover real accept |
| **2.3** | Send invites; **do not** call Ensure; do not invent a parallel gate |
| **2.4** | Real accept / signup-with-invite call the **same** `EnsureEmailVerifiedService` before membership; map `EmailNotVerifiedError` like the stub |
| **After 2.4** | **Recommendation:** keep the stub through **1.5.5** as a thin Ensure probe; **delete after 2.4** (or in a small follow-up once real accept + smoke cover the gate). Do **not** assume 1.5.5 can retire the stub by covering real accept — critical path places 1.5.5 before Epic 2 invite product. Do not leave two divergent gate implementations. |

---

## 7. As-built seam (reuse — do not reinvent)

| Layer | Path | Role |
|-------|------|------|
| Domain | `api/domain/email_verification.py` → `ensure_email_verified(...)` | Flag off → return; on + unverified → `EmailNotVerifiedError` |
| Application | `api/application/email_verification.py` → `EnsureEmailVerifiedService` + `EnsureEmailVerifiedCommand` | Loads `email_verified_at`; calls domain |
| Persistence | `api/adapters/persistence/email_verification.py` | `get_user_verified_at` / mark verified / tokens |
| Error | `api/domain/errors.py` → `EmailNotVerifiedError` | Stable client message |
| Config | `api/api/settings.py`, `.env.example` | `EMAIL_VERIFICATION_REQUIRED` default **false** |
| Stub | `api/api/routes/auth.py` → `POST /auth/gated-flows/invite-accept-stub` | Auth required; same Ensure; 403 on block |
| Schema | `api/api/schemas/auth.py` → `GatedFlowStubResponse` | Stub success body |
| Domain tests | `api/tests/test_email_verification_domain.py` | Flag matrix |
| Integration | `api/tests/test_email_verification_integration.py` | Stub 200/403 + confirm unlocks |

**Preserve:** session is still issued at register when the flag is on; verification is an attribute, not a login wall.

---

## 8. 2.3 vs 2.4 (one-liner)

| Story | Gate? |
|-------|-------|
| **2.3** Invite send | **No** — never block send on invitee verification status |
| **2.4** Invite accept / signup-with-invite | **Yes** — email-bind then Ensure before membership when flag on |

Story soft-couple tasks point here:  
[`2-3-invite-members-by-email.md`](./2-3-invite-members-by-email.md) · [`2-4-invitee-signup-lands-on-inviting-list.md`](./2-4-invitee-signup-lands-on-inviting-list.md)

---

## 9. Orthogonal (out of this contract)

| Concern | Owner |
|---------|-------|
| Invite token hash / TTL / claim (`expires_at`) | 2.3 issue / 2.4 consume — separate table; reuse 1.5.1 claim helper — **not** Ensure |
| Invite email-bind (match token invitee email) | **2.4** — runs **before** Ensure (see §3) |
| Membership ACL | 1.5.4 sketch → 2.2 impl (AD-19) — gate ≠ ACL |
| Rate limits | 1.5.6 |
| Verify mail UX / SMTP | Story 1.5 (already shipped) |

---

## 10. Explicit negatives

1. Not a login wall / Lists homepage wall  
2. Not applied at invite **send**  
3. Not a second session cookie  
4. Not ad-hoc route-only `email_verified_at` checks  
5. Not **401** for unverified email  
6. Not gating the **inviter**  
7. Not overloading reset/verify token tables for invite tokens  
8. Not claiming the invite token when Ensure (or email-bind) fails  
9. Not re-running `SignUpWithInvite` after a blocked signup — use `AcceptListInvite`  

---

## 11. Acceptance check for 2.4 implementers

From this doc alone, answer:

1. When does accept block? → Flag **on** and accepting user’s `email_verified_at` is `NULL`, **before** membership (after email-bind).  
2. Does send check verification? → **No.**  
3. Which service / error / code? → `EnsureEmailVerifiedService` / `EmailNotVerifiedError` / **403** `email_not_verified`.  
4. Flag off? → Ensure no-op; accept proceeds (token + ACL still apply).  
5. SignUpWithInvite + flag on? → User/session/personal list kept; 403; retry `AcceptListInvite` after verify with retained token.  

---

## Related

| Doc | Role |
|-----|------|
| [`auth-mail-interaction-map.md`](../planning-artifacts/architecture/architecture-finance-helper-2026-08-03/auth-mail-interaction-map.md) | Living auth/mail map |
| [`1-5-config-gated-email-verification.md`](./1-5-config-gated-email-verification.md) | Original gate + stub story |
| [`1-5-3-invite-verify-gate-contract.md`](./1-5-3-invite-verify-gate-contract.md) | This story’s implementation guide |
| [`story-close-overview-checklist.md`](./story-close-overview-checklist.md) | How/why before `done` |
| `auth-email-token-claim-pattern.md` | Invite **token** claim — **pending 1.5.1** (not in tree yet); orthogonal to Ensure |
