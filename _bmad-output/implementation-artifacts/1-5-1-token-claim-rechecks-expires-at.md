---
baseline_commit: b8c4d71c4984ea519cfcad70a3fd165b361b1ebe
---

# Story 1.5.1: Token claim re-checks expires_at

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an operator,
I want password-reset and email-verify token claims to reject expired tokens,
so that invite tokens can copy a correct claim pattern instead of a known gap.

## Acceptance Criteria

1. **Given** a password-reset or email-verify token whose `expires_at` is in the past  
   **When** the claim/confirm path runs  
   **Then** the claim is rejected and the token is not treated as successfully consumed for a state change

2. **Given** a still-valid token  
   **When** the claim/confirm path runs  
   **Then** existing successful behavior is preserved

3. **And** the corrected claim pattern is documented so Epic 2 invite tokens can reuse it

## Tasks / Subtasks

- [x] Task 0: Confirm bug + touchpoints before coding
  - [x] Read both SQL claim sites and confirm WHERE is only `id` + `used_at IS NULL` (no `expires_at`):
    - `api/adapters/persistence/password_reset.py` → `SqlAlchemyPasswordResetTokenRepository.claim_token`
    - `api/adapters/persistence/email_verification.py` → `SqlAlchemyEmailVerificationRepository.claim_token`
  - [x] Note application pre-checks already exist but are insufficient alone (TOCTOU):
    - `CompletePasswordResetService.execute` in `api/application/password_reset.py` (~188–194)
    - `ConfirmEmailVerificationService.execute` in `api/application/email_verification.py` (~212–218)
  - [x] Confirm domain fakes also ignore expiry today (`FakeTokenRepo.claim_token` / `FakeVerificationRepo.claim_token` in domain test files) — they must match the corrected port contract
  - [x] If claim sites already re-check `expires_at` in SQL: stop and report — do not invent parallel work

- [x] Task 1: Shared claim helper + fix both repositories (AC: #1, #2) — TDD first
  - [x] Red: write failing tests that prove **`claim_token` itself** rejects when `expires_at` is past (not only the application Python pre-check). Prefer:
    - Direct repo/fake `claim_token` calls with an unused but expired row → returns `False`
    - Optional Postgres integration: insert expired unused token, call confirm path / claim → no password change / no `email_verified_at` success
  - [x] Prefer **one shared claim helper** under `api/adapters/persistence/` (AD-8 Epic 1.5 addendum) used by both reset and verify repos — do **not** merge token tables
  - [x] Atomic UPDATE must require all of: matching `id`, `used_at IS NULL`, and `expires_at > now` (timezone-aware UTC). Success = `rowcount > 0`. Failure returns `False` and must **not** set `used_at` on an expired row as a successful claim
  - [x] Keep application-layer expiry checks as defense-in-depth — do not remove them
  - [x] Update Protocol / fake docs: claim returns `False` if missing, already used, **or expired**
  - [x] Green: both SQL repos + domain fakes pass; valid-token happy paths unchanged (reset password + verify confirm / idempotent verify success)

- [x] Task 2: Document invite-ready claim pattern (AC: #3)
  - [x] Add a short, copy-pasteable note (implementation artifact or Dev Agent Record / completion note + pointer from deferred-work) describing:
    - Hash at rest; TTL on create; **atomic claim WHERE includes `expires_at > now` + `used_at IS NULL`**
    - Prefer shared helper; separate table per token type (reset / verify / future invite)
    - Application pre-check optional defense-in-depth; claim must not succeed on row match alone
  - [x] Do **not** implement invite tokens, invite mail, or Story 2.3/2.4 here — documentation only

- [x] Task 3: Tests + hygiene (AC: #1–#3)
  - [x] Domain unit: expired claim false; valid claim true; existing complete/confirm expired tests still pass
  - [x] Postgres 16 integration when `DATABASE_URL` set (Compose `db`, not SQLite): expired reset/verify confirm rejects without state change; valid path still works
  - [x] Generic auth errors preserved (no email enumeration); no raw tokens in logs
  - [x] Fixtures: `user@example.com` style only
  - [x] Clear deferred item for this gap when done (`deferred-work.md` claim_token/`expires_at` lines) and leave other deferred items untouched

## Dev Notes

### Epic context

Epic 1.5 = Auth spine hardening & Epic 2 prep. Critical path **1.5.1 → 1.5.5** before Stories **2.2+**. This story closes the known claim/`expires_at` hole so Epic 2 invite tokens do not copy a broken pattern.

| Sibling | Relationship to 1.5.1 |
|---------|----------------------|
| 1.4 Password reset | Introduced atomic claim (`used_at IS NULL`) **without** `expires_at` in WHERE — source of the gap |
| 1.5 Email verification | Mirrored the same claim bug; deferred in review to this story |
| **1.5.1 (this)** | Fix claim for reset + verify; document for invites |
| 1.5.2 | Auth/mail map + story-close habit — **out of scope** |
| 1.5.3 | Invite verify-gate contract — **out of scope** |
| 1.5.4 | Membership ACL sketch — **out of scope** |
| 1.5.5 | Spine smoke after claim fix — runs **after** this |
| 1.5.6 / 1.5.7 | Parallel later (rate limits / hex-pytest) — **out of scope** |
| Epic 2 invites (2.3/2.4) | **Consumers** of the documented pattern — do not build here |

### Bug (current vs required)

**Today:** Application services reject expired tokens in Python, then call `claim_token`. SQL claim:

```python
.where(Model.id == token_id, Model.used_at.is_(None))
```

So claim can still succeed after expiry (TOCTOU / defense-in-depth failure). AD-8 addendum: *a successful claim MUST NOT succeed solely because a row matched.*

**Required:** Atomic claim also requires `expires_at > now(UTC)`. Expired → `claim_token` returns `False` → confirm path raises generic invalid-token error → **no** password hash update / **no** successful verify state change from that claim.

### Architecture compliance (MUST follow)

- **AD-8 addendum:** Hash at rest; TTL; re-check `expires_at` on claim; prefer **one shared claim helper**; SMTP fail-loud (do not regress 1.4/1.5 send paths)
- **AD-1:** ORM / SQLAlchemy only under `adapters/persistence/` — shared claim helper with SQLAlchemy stays in persistence (not `domain/`)
- **Errors:** Structured JSON; **generic** auth failures (no email enumeration)
- **AD-22:** No schema churn required for this fix unless tests prove otherwise — prefer WHERE-clause fix only; never recreate PG volume
- **Do not** reopen AD-8 cookie issuer, add Bearer-in-`localStorage`, Nodemailer, or a second SMTP client

[Source: `_bmad-output/planning-artifacts/architecture/.../ARCHITECTURE-SPINE.md` — AD-8 + Consistency → Auth email tokens]  
[Source: `_bmad-output/project-context.md` — Hex layout, auth errors, Postgres-not-SQLite]

### Project structure notes

| Touch | Path |
|-------|------|
| UPDATE claim (reset) | `api/adapters/persistence/password_reset.py` |
| UPDATE claim (verify) | `api/adapters/persistence/email_verification.py` |
| NEW shared helper (preferred) | e.g. `api/adapters/persistence/token_claim.py` (name flexible) |
| KEEP app pre-checks | `api/application/password_reset.py`, `api/application/email_verification.py` |
| UPDATE fakes + tests | `api/tests/test_password_reset_domain.py`, `api/tests/test_email_verification_domain.py` |
| UPDATE/ADD integration | `api/tests/test_password_reset_integration.py`, `api/tests/test_email_verification_integration.py` |
| OPTIONAL protocol docstring | application port `claim_token` signatures in same application modules |
| DO NOT TOUCH (unless required for docs) | invite stories, UI verify/reset forms, SMTP adapter, session cookie code, list ACL |

Separate tables stay: `password_reset_tokens`, `email_verification_tokens`. Shared **helper**, not shared **table**.

### Previous story intelligence

**From 1.4 (preserve):**
- Atomic single-use claim via UPDATE + `rowcount` — **extend** WHERE with `expires_at`, do not remove `used_at IS NULL`
- Persist-before-send + rollback on SMTP failure
- SHA-256 hash at rest; TTL ≤1h reset; generic `InvalidResetTokenError`
- Password max length 256; SMTP port/timeout fail-loud

**From 1.5 (preserve):**
- Separate verify table; `EMAIL_VERIFICATION_REQUIRED` gate semantics
- Confirm idempotent when already verified; `mark_email_verified` raises if user missing
- VerifyForm must not auto-confirm on mount
- Deferred finding that **this story closes:** `claim_token` UPDATE does not re-check `expires_at`

**Anti-patterns:**
- Claiming success on row match alone
- Copying broken claim into invite code later
- Merging reset/verify/invite into one table “for convenience”
- Removing application expiry checks “because SQL has it”
- Expanding into rate limits (1.5.6), session HMAC, token cleanup jobs, or smoke checklist (1.5.5)

### Git intelligence summary

| Commit | Relevance |
|--------|-----------|
| `d2ca1c6` fix(1): harden password-reset after code review | Introduced atomic claim **without** `expires_at` |
| `eb306ba` / PR #4 | Initial reset tokens |
| `9faaf85` / PR #6 | Verify tokens; deferred claim expiry gap |
| Current HEAD | Story 2.1 list work — orthogonal; do not mix list changes into this branch |

Suggested branch: `feat/1/1-5-1-token-claim-rechecks-expires-at` (or epic `1.5` naming consistent with AD-13 / sprint key).

### Library / framework requirements

- No new dependencies expected
- SQLAlchemy 2.0.x `update()` / `where()` only
- pytest 9.x; Postgres 16 for integration; `uv run pytest`
- Time: `datetime.now(UTC)`; compare aware datetimes (normalize naive DB values if needed — app already does this)

### Testing requirements

1. **Red→green** on claim semantics (AD-15 domain/persistence discipline)
2. Prove expiry rejection at **claim** layer (fakes + SQL), not only service pre-check
3. Happy path: valid reset confirm + valid verify confirm still succeed
4. Expired confirm: no password change; verify does not set `email_verified_at` via a successful expired claim
5. Integration: Compose Postgres when available; skip cleanly if `DATABASE_URL` unset (existing pattern)
6. Do not add Playwright/e2e unless a UI regression is introduced (none expected)

### Latest tech notes

- Prefer comparing `expires_at` inside the DB UPDATE (`expires_at > :now`) with a single `now` bound parameter from `datetime.now(UTC)` for consistency with existing code style
- SQLAlchemy 2.0 style already used in both repos — match it; no legacy Query API
- No library upgrade in this story

### Project context reference

Follow `_bmad-output/project-context.md`: hex boundaries, generic auth errors, Postgres-not-SQLite, no Bearer in `localStorage`, no secrets in repo.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` — Epic 1.5 / Story 1.5.1]
- [Source: `_bmad-output/planning-artifacts/architecture/.../ARCHITECTURE-SPINE.md` — AD-8 addendum]
- [Source: `_bmad-output/planning-artifacts/sprint-change-proposal-2026-08-04.md`]
- [Source: `_bmad-output/implementation-artifacts/deferred-work.md` — claim_token expires_at]
- [Source: `_bmad-output/implementation-artifacts/1-4-password-reset-via-email.md`]
- [Source: `_bmad-output/implementation-artifacts/1-5-config-gated-email-verification.md` — Review Defer]
- [Source: `_bmad-output/implementation-artifacts/epic-1-retro-2026-08-04.md` — AI #3]

## Dev Agent Record

### Agent Model Used

Cursor Grok 4.5

### Debug Log References

- Red: `test_claim_token_rejects_expired_unused_token` failed on both fakes (returned True for expired)
- Green: shared `claim_single_use_email_token` + fake expiry checks; Compose api container 110 passed

### Implementation Plan

1. Confirm both SQL claims omitted `expires_at` (Task 0).
2. Add claim-layer domain + Postgres tests (red).
3. Introduce `adapters/persistence/token_claim.py` and wire reset/verify repos.
4. Align fakes + protocol docstrings; keep application pre-checks.
5. Document invite-ready pattern; clear deferred-work item.

### Completion Notes List

- Shared helper `claim_single_use_email_token` enforces `id` + `used_at IS NULL` + `expires_at > now` atomically; expired rows are not marked used.
- Password-reset and email-verify SQL repos both call the helper; domain fakes match the port contract.
- Pattern doc for Epic 2 invites: `_bmad-output/implementation-artifacts/auth-email-token-claim-pattern.md`.
- Deferred claim/`expires_at` item removed from `deferred-work.md` with pointer to the pattern doc.
- Tests: domain claim reject/success + tightened expired confirm assertions; Postgres claim reject/success on both repos. Full Compose api pytest: **110 passed**.

### File List

- api/adapters/persistence/token_claim.py
- api/adapters/persistence/password_reset.py
- api/adapters/persistence/email_verification.py
- api/application/password_reset.py
- api/application/email_verification.py
- api/tests/test_password_reset_domain.py
- api/tests/test_email_verification_domain.py
- api/tests/test_password_reset_integration.py
- api/tests/test_email_verification_integration.py
- _bmad-output/implementation-artifacts/auth-email-token-claim-pattern.md
- _bmad-output/implementation-artifacts/deferred-work.md
- _bmad-output/implementation-artifacts/1-5-1-token-claim-rechecks-expires-at.md
- _bmad-output/implementation-artifacts/sprint-status.yaml

## Change Log

- 2026-08-04: Story context created (ready-for-dev)
- 2026-08-04: Implemented shared claim helper with expires_at re-check; tests + invite pattern doc; status → review
- 2026-08-04: Code review complete — status → done
