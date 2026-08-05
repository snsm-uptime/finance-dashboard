# Epic 1 spine smoke checklist

**Orientation:** [auth-mail-interaction-map.md](../planning-artifacts/architecture/architecture-finance-helper-2026-08-03/auth-mail-interaction-map.md)  
**Prerequisite:** Story 1.5.1 `done` + [auth-email-token-claim-pattern.md](./auth-email-token-claim-pattern.md) present  
**Map/contracts tick:** 1.5.2 map + 1.5.3 invite-verify-gate + 1.5.4 ACL sketch present (orientation only)

## Run metadata

| Field | Value |
|-------|-------|
| Date | 2026-08-04 |
| Executor | Auto (Cursor) / initials: AI |
| Compose mode | dev overlay (`docker-compose.yml` + `docker-compose.dev.yml`) |
| EMAIL_VERIFICATION_REQUIRED | Pass A: `false` · Pass B: `true` |
| SMTP catcher | Mailpit side-car (`docker run --rm -d --name fh-mailpit -p 1025:1025 -p 8025:8025 axllent/mailpit`) — **not** in base Compose |
| Claim probe method | SQL age on `password_reset_tokens` + BFF confirm (shared helper `claim_single_use_email_token` via `password_reset` adapter) |

## Env knobs

| Var | Smoke value |
|-----|-------------|
| SESSION_COOKIE_NAME | `fh_session` |
| PUBLIC_APP_URL | `http://localhost:3000` |
| SMTP_HOST | `host.docker.internal` (Mac Docker Desktop) |
| SMTP_PORT | `1025` |
| SMTP_FROM | `noreply@example.com` |
| SMTP_USE_TLS | `false` |
| SMTP_STARTTLS | `false` |
| SMTP_USER / SMTP_PASSWORD | empty (Mailpit local) |
| EMAIL_VERIFICATION_REQUIRED | `false` then `true` (two passes) |

### SMTP reachability notes

- **Side-car only:** start Mailpit with `docker run` / host process. Do **not** add a fourth service to `docker-compose.yml` (AD-2: `db` \| `api` \| `ui` only).
- **Mac (Docker Desktop):** `SMTP_HOST=host.docker.internal` reaches host-published Mailpit ports.
- **Linux Compose:** `host.docker.internal` is often missing — use host gateway IP, `network_mode: host` for Mailpit experiments, or temporary Compose `extra_hosts: ["host.docker.internal:host-gateway"]` on **api** for the smoke run only. Fix reachability before continuing — do not skip mail rows.
- Captured mail UI: `http://localhost:8025`

### Operator boot (reference)

```bash
# From repo root — fill .env from .env.example first (never commit .env)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

# Mailpit (before any SMTP-sending step)
docker run --rm -d --name fh-mailpit -p 1025:1025 -p 8025:8025 axllent/mailpit

# Point api at Mailpit without permanently editing .env (override on recreate):
SMTP_HOST=host.docker.internal SMTP_PORT=1025 SMTP_FROM=noreply@example.com \
SMTP_USE_TLS=false SMTP_STARTTLS=false SMTP_USER= SMTP_PASSWORD= \
PUBLIC_APP_URL=http://localhost:3000 EMAIL_VERIFICATION_REQUIRED=false \
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --force-recreate api
```

### Curl / cookie-jar alternate

```bash
jar=$(mktemp)
curl -sS -c "$jar" -b "$jar" -X POST http://localhost:3000/api/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"smoke@example.com","password":"SmokePass1!"}'
curl -sS -c "$jar" -b "$jar" http://localhost:3000/api/lists
curl -sS -c "$jar" -b "$jar" -X POST http://localhost:3000/api/auth/sign-out
# Api-only invite stub (no BFF):
curl -sS -c "$jar" -b "$jar" -X POST http://localhost:8000/auth/gated-flows/invite-accept-stub
```

## Results

| # | Check | Pass? | Notes |
|---|-------|-------|-------|
| 0 | Prerequisites (1.5.1 done; claim pattern; map; 1.5.3/1.5.4 contracts) | **PASS** | 2026-08-04 AI — sprint `1-5-1` done; all three docs present |
| 1 | Compose boot db/api/ui | **PASS** | 2026-08-04 AI — dev overlay; all three healthy |
| 2 | /health api + ui | **PASS** | 2026-08-04 AI — both `200` `{"status":"ok"}` |
| 3 | Signup → fh_session | **PASS** | 2026-08-04 AI — BFF `POST /api/auth/register` → `201` + httpOnly `fh_session` |
| 4 | Personal list name=Personal role=owner | **PASS** | 2026-08-04 AI — `GET /api/lists` → Personal / owner |
| 5 | Sign-out clears cookie → /sign-in | **PASS** | 2026-08-04 AI — cookie Max-Age=0; lists `401`; `/lists` → `307` `/sign-in` |
| 6 | Sign-in restores session | **PASS** | 2026-08-04 AI — `POST /api/auth/sign-in` restores `fh_session`; lists reachable |
| 7 | Password reset happy + unknown-email ack | **PASS** | 2026-08-04 AI — generic unknown ack; Mailpit link → confirm; old password `401`; new password sign-in OK |
| 8a | Verify gate OFF | **PASS** | 2026-08-04 AI — `verify/request` + `confirm` → `404` `verification_not_required`; stub allowed |
| 8b | Verify gate ON | **PASS** | 2026-08-04 AI — Mailpit first; register auto-mail; stub `403 email_not_verified`; explicit confirm; stub allowed |
| 9 | Expired token via shared claim helper | **PASS** | 2026-08-04 AI — SQL-aged reset token → `400 invalid_reset_token`; row `used_at` remained null; adapter uses `claim_single_use_email_token` |

## What not to break

- Api sole cookie issuer; BFF Set-Cookie forward; no Bearer in `localStorage`
- Persist-before-send + SMTP fail-loud
- Claim re-checks `expires_at` (shared helper — Story 1.5.1)
- Personal list = ordinary List + owner membership (`PERSONAL_LIST_NAME == "Personal"`)
- AD-2: no permanent mail Compose service
- Signup path is `/signup` (no hyphen); sign-in is `/sign-in` (hyphen)
- Invite stub fate stays with 2.4 / contract — do not delete after smoke
