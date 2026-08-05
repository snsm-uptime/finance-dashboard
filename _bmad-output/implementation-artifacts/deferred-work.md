- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-scaffold-compose-app-with-health-checks.md`
  summary: Real statement PDFs remain reachable in git history despite untracking `bank_data/`
  evidence: Review noted prior commits still contain `bank_data/*.pdf` blobs; history rewrite was Ask First / out of this story

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-scaffold-compose-app-with-health-checks.md`
  summary: Pin Compose/base image digests for reproducible rebuilds
  evidence: Floating `postgres:16` / `python:3.12-slim` / `node:20-bookworm-slim` tags can drift silently

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-scaffold-compose-app-with-health-checks.md`
  summary: Harden docker-compose.prod.yml (secret assertions, docs off, bind localhost)
  evidence: Prod overlay currently only adds restart policies and NODE_ENV/ENVIRONMENT labels

## Deferred from: code review of spec-1-1-scaffold-compose-app-with-health-checks.md (2026-08-03)

- Enforce `FINANCE_HELPER_DATA` is outside the git repository root (operator policy / compose validation)
- Add CI Compose config + image build / health smoke (AC3 only required lint/typecheck)
- Pin base image digests and stop floating `pip install uv` in API Dockerfile
- Harden `docker-compose.prod.yml` (localhost binds, reject placeholder secrets, docs off)
- Rewrite git history to purge previously committed `bank_data/*.pdf` blobs (Ask First)

## Deferred from: code review of 1-3-sign-in-sign-out-and-protect-routes.md (2026-08-03)

- Application-layer rate limiting / lockout on `POST /auth/sign-in` — not in Story 1.3 scope; defer to a dedicated hardening story
- Delete expired opaque session rows inside `resolve_session_user_id` — expired tokens already fail auth; cleanup is housekeeping
- Strengthen “password never logged” tests beyond INFO-level `caplog` (access logs / DEBUG / exception paths)

## Deferred from: code review of 1-2-sign-up-with-email-password-and-personal-list.md (2026-08-03)

- No rate limiting on `POST /auth/register` — Argon2 CPU burn possible; defer to dedicated hardening story
- Opaque session tokens stored plaintext in `sessions.token` — consider hashing at rest in a later hardening pass
- ~~Incomplete hexagonal ports for session create/resolve and hasher (routes import concrete adapters)~~ — **Resolved by 1.5.7:** `PreferencesRepository`/`UserPreferencesRecord` live in `ports.py`; `/me` Depends on Protocol. `SqlAlchemyAuthUserRepository` remains dual-purpose adapter. Optional physical class split still residual debt (not claimed). Incomplete session/hasher route imports resolved via `SessionStore` + Protocol-typed hasher Depends; free functions retained for password-reset adapter.
- `Argon2PasswordHasher.verify` only caught `VerifyMismatchError` in the 1.2 merge (unused on signup; sign-in path owns hardening)
- CASCADE `ondelete` from users→lists/memberships/sessions untested — no user-delete API yet
- HMAC/sign opaque session cookies with `SESSION_SECRET` — Story 1.2 kept secret as config presence gate only (decision B); signing deferred to hardening

## Deferred from: code review of 1-4-password-reset-via-email.md (2026-08-03)

- Request-reset timing oracle (known email blocks on SMTP while unknown returns immediately) — client ack is identical; full constant-time padding is hardening beyond AC
- Expired/used `password_reset_tokens` table retention/cleanup — no AC for pruning; ops housekeeping
- `revoke_all_sessions_for_user` loads and deletes session rows one-by-one — fine for v1 peer households; bulk DELETE later
- DATABASE_URL default-fallback removal bundled on this branch — Story 1.1 review fix, not introduced by password-reset logic

## Deferred from: code review of 1-5-config-gated-email-verification.md (2026-08-04)

- No per-user throttle on `POST /auth/verify/request` SMTP send — same hardening class as register/reset rate limits
- Request/send vs concurrent confirm can email a dead (already-invalidated) link — rare race; persist-then-send family shared with 1.4

<!-- Resolved in Story 1.5.1: claim_token re-checks expires_at via shared helper
     (api/adapters/persistence/token_claim.py). Pattern for Epic 2 invites:
     _bmad-output/implementation-artifacts/auth-email-token-claim-pattern.md -->

## Deferred from: code review of 1-6-account-menu-language-en-es-and-theme.md (2026-08-03)

- DB CHECK constraints on `users.language`/`theme` — API validates allowed values; defense-in-depth beyond story AC
- AbortSignal / fetch timeouts on BFF and client prefs requests — hardening beyond story scope; same class as other BFF routes

## Deferred from: code review of 1-6-account-menu-language-en-es-and-theme.md API chunk re-review (2026-08-03)

- Dead API Accept-Language helpers on HTTP path after UI-owned defaults — retained for domain unit tests / possible future consumers
- Unauthenticated `/me` 401 shape mismatch (HTTPException string detail vs JSON `code`) — pre-existing `require_authenticated_user` pattern
- Application-layer unit tests for GetMe/UpdatePreferences services — domain + Postgres integration cover the path when DATABASE_URL is set
- ~~Split PreferencesRepository port from SqlAlchemyAuthUserRepository concrete~~ — **Resolved by 1.5.7:** `PreferencesRepository`/`UserPreferencesRecord` live in `ports.py`; `/me` Depends on Protocol. `SqlAlchemyAuthUserRepository` remains dual-purpose adapter. Optional physical class split still residual debt (not claimed). Incomplete session/hasher route imports resolved via `SessionStore` + Protocol-typed hasher Depends; free functions retained for password-reset adapter.

## Deferred from: code review of 2-1-create-and-rename-owned-lists.md (2026-08-04)

- Invisible/ZWSP-only list names accepted by strip-only `validate_list_name` — polish beyond Story 2.1 AC
- No per-user owned-list creation cap — product limit not in v1 / FR-6 scope
- BFF `/api/lists` Route Handlers lack Vitest coverage (client helper tested; cookie-forward hop untested)

## Deferred from: code review of 1-5-2-auth-mail-interaction-map-and-story-close-overview.md (2026-08-04)

- Known-user SMTP failure returns 503 while unknown email returns identical 200 ack — timing/oracle class already deferred from Story 1.4; map may reference but not “fix” here

## Deferred from: code review of 1-5-4-membership-acl-enforcement-sketch.md (2026-08-04)

- Optional `require_authenticated_user` docstring still says “membership ACL = Epic 2” — optional docs-only; Story 2.2 can update when implementing the port
- First-paint client clearing stale `last_opened_list_id` on membership deny — Story 2.2 UX, not contract sketch scope
- Malformed non-UUID `list_id` FastAPI validation (422) vs forcing 404 for anti-enumeration — pre-existing framework path validation
- Rename (`RenameListService`) migration exit criteria / when 2.1 pays AD-24 bare-`list_id` debt — intentional grandfather until an implement story migrates it
