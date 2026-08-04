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
- Incomplete hexagonal ports for session create/resolve and hasher (routes import concrete adapters) — polish later
- `Argon2PasswordHasher.verify` only caught `VerifyMismatchError` in the 1.2 merge (unused on signup; sign-in path owns hardening)
- CASCADE `ondelete` from users→lists/memberships/sessions untested — no user-delete API yet

## Deferred from: code review of 1-4-password-reset-via-email.md (2026-08-03)

- Request-reset timing oracle (known email blocks on SMTP while unknown returns immediately) — client ack is identical; full constant-time padding is hardening beyond AC
- Expired/used `password_reset_tokens` table retention/cleanup — no AC for pruning; ops housekeeping
- `revoke_all_sessions_for_user` loads and deletes session rows one-by-one — fine for v1 peer households; bulk DELETE later
- DATABASE_URL default-fallback removal bundled on this branch — Story 1.1 review fix, not introduced by password-reset logic
