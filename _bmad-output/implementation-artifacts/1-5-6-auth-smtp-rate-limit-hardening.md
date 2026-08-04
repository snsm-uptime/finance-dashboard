---
baseline_commit: e9898c1f2524ac24ff45bbccaf0d8c7863948276
---

# Story 1.5.6: Auth and SMTP rate-limit hardening

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an operator,
I want rate limits on register, sign-in, reset, and verify request paths,
so that invite-era abuse surfaces are reduced (parallel hardening).

## Acceptance Criteria

1. **Given** repeated requests to register, sign-in, password-reset request, and verify request  
   **When** configured limits are exceeded  
   **Then** the API rejects further attempts with a clear client-safe error without breaking legitimate single-user flows

2. **And** this story may proceed in parallel after 1.5.1 or after critical path 1.5.1–1.5.5

## Tasks / Subtasks

- [ ] Task 0: Confirm scope and as-built surfaces (AC: #1, #2)
  - [ ] Read Epic 1.5 / Story 1.5.6 in `epics.md`, Correct Course proposal, Epic 1 retro AI #7, and `deferred-work.md` entries for register / sign-in / verify-request
  - [ ] Confirm living map defers rate limits to this story: `auth-mail-interaction-map.md` (“Known deferred”)
  - [ ] Confirm **no** rate-limit code exists today (`slowapi` / Redis / 429 / throttle — empty)
  - [ ] Confirm AD-2: Compose stays `db` | `api` | `ui` — **do not add Redis/worker**
  - [ ] Confirm as-built hop: Browser → `ui` BFF → `fetch(API_INTERNAL_URL + /auth/…)` → `api`; entrypoint sets `proxy_headers=False` (`api/scripts/entrypoint.py`) — raw `request.client.host` on api is the **ui container**, not the household browser
  - [ ] Confirm out of scope: claim/`expires_at` (1.5.1), spine smoke (1.5.5), hex ports (1.5.7), session HMAC/token cleanup (later), reset **timing oracle** (1.4 deferred — do not claim to fix), dual-key IP∧email dimensions, confirm-path throttling
  - [ ] Naming trap: sprint key `1-5-6-…` = Epic **1.5** story 6 — **not** Epic 1 story 5 (`1-5-config-gated-…`)

- [ ] Task 1: Rate-limit policy + store (AC: #1)
  - [ ] Implement an in-repo **sliding window of timestamps** (stdlib only — no new PyPI deps; do not add `slowapi`/Redis)
  - [ ] Place policy free of FastAPI/SQLAlchemy in `api/application/rate_limit.py`; add `RateLimitedError` to `api/domain/errors.py` with locked `MESSAGE` / `CODE` (see Locked decisions)
  - [ ] In-memory process-local store with `threading.Lock` (sync + async routes coexist — `sign_in` is `async def`, others sync)
  - [ ] Lazy prune of expired windows on access **and** a hard max-key cap (evict oldest idle keys) — do not leak forever per identity
  - [ ] Document single-worker assumption in story-close (multi-worker multiplies allowance — acceptable for v1 Compose)
  - [ ] Extend `AuthSettings` (or sibling dataclass on `app.state`) with env-tunable max + window_seconds for each path; load in `create_app()` like existing auth settings
  - [ ] Exact env knobs (placeholders in `.env.example` + wire in `docker-compose.yml` / `.prod.yml` `api.environment`):

    | Env | Default |
    |-----|---------|
    | `AUTH_RATE_LIMIT_REGISTER_MAX` | `5` |
    | `AUTH_RATE_LIMIT_REGISTER_WINDOW_SECONDS` | `3600` |
    | `AUTH_RATE_LIMIT_SIGN_IN_MAX` | `20` |
    | `AUTH_RATE_LIMIT_SIGN_IN_WINDOW_SECONDS` | `900` |
    | `AUTH_RATE_LIMIT_PASSWORD_RESET_REQUEST_MAX` | `5` |
    | `AUTH_RATE_LIMIT_PASSWORD_RESET_REQUEST_WINDOW_SECONDS` | `3600` |
    | `AUTH_RATE_LIMIT_VERIFY_REQUEST_MAX` | `5` |
    | `AUTH_RATE_LIMIT_VERIFY_REQUEST_WINDOW_SECONDS` | `3600` |
    | `AUTH_CLIENT_IP_HEADER` | `X-FH-Client-IP` |
    | `TRUSTED_PROXY_IPS` | compose/default: peer addresses that may set the client-IP header (document chosen default: ui service / Docker internal peers — **not** the open internet) |

  - [ ] Locked path keys (single key per path — **no** dual-dimension “optional email”):

    | Path | Key | Default |
    |------|-----|---------|
    | `POST /auth/register` | trusted client IP (see identity lock) | 5 / 1h |
    | `POST /auth/sign-in` | trusted client IP | 20 / 15m |
    | `POST /auth/password-reset/request` | trusted client IP | 5 / 1h |
    | `POST /auth/verify/request` | authenticated `user_id` | 5 / 1h |

- [ ] Task 2: Client identity + wire the four routes (AC: #1)
  - [ ] **Identity lock (required):** Do **not** use bare `request.client.host` as the only key for Compose BFF traffic.
    1. On the four BFF POSTs, set `AUTH_CLIENT_IP_HEADER` (default `X-FH-Client-IP`) from `NextRequest` remote address (the browser-facing peer of `ui`)
    2. On api, trust that header **only** when `request.client.host` is in `TRUSTED_PROXY_IPS` (ui / internal Docker peers). Otherwise fall back to `request.client.host` (direct api hits / TestClient)
    3. Do **not** enable uvicorn `proxy_headers=True` globally; do **not** blindly honor public `X-Forwarded-For` / `X-Real-IP`
  - [ ] Enforce **before** Argon2 / SMTP / token persist / signup persist on:
    - `POST /auth/register` — **add `request: Request`** (missing today)
    - `POST /auth/sign-in`
    - `POST /auth/password-reset/request` — **add `request: Request`**
    - `POST /auth/verify/request`
  - [ ] **Counting rule (locked):** After body validation succeeds (Pydantic / accepted JSON), **atomically check+consume one unit before** hasher / SMTP / token/user persist. Over limit → 429 with **no** side effects. Invalid JSON on sign-in that already maps to generic 401 may remain uncounted (preserve `_credentials_error_response`). Gate-off `verify/request` → 404 may still consume that user’s verify quota — document; acceptable
  - [ ] Prefer FastAPI `Depends` / shared helper — **not** global middleware that also throttles `/health`
  - [ ] Exceeded → `_rate_limited_response(retry_after: int)` mirroring `_smtp_error_response` / `_credentials_error_response`: **429** + locked body + `Retry-After` (int seconds). Same `detail`/`code` on all four paths — no remaining-quota / which-dimension text in `detail`
  - [ ] Depends order for verify: `require_authenticated_user` then rate-limit by `user_id`
  - [ ] Register with gate on still sends verify mail inside register — keep that behind the **register** bucket only (do not invent a cross-path verify-request consume unless documented — do not)
  - [ ] Do **not** rate-limit: `password-reset/confirm`, `verify/confirm`, sign-out, `/session`, `/me`, `/health`, invite stub
  - [ ] Preserve fail-loud SMTP under the limit (503 `smtp_*`); preserve generic sign-in / reset 200 ack behaviors under the limit

- [ ] Task 3: UI/BFF pass-through (AC: #1 — required for contract)
  - [ ] Four BFF routes: forward upstream status, JSON body, **and `Retry-After`** (plus `Content-Type`; keep existing `Set-Cookie` forward on register/sign-in)
  - [ ] Set `X-FH-Client-IP` (or configured header) on those four BFF → api fetches (Task 2)
  - [ ] Extend existing `route.test.ts` files to assert 429 body + `Retry-After` passthrough
  - [ ] Optional (test-after): map `code === "rate_limited"` in existing client error switches (`signupClient.ts`, `signInClient`, forgot-password / `VerifyForm`) — do not rebuild error plumbing or invent a second limiter in `ui` / `proxy.ts`

- [ ] Task 4: Tests (AC: #1)
  - [ ] Unit (TDD): sliding window allows under threshold; rejects when exceeded; resets after window; key isolation; lock-safe under concurrent calls
  - [ ] Integration: hammer each of the four endpoints past limit → 429 + `code=rate_limited` + `Retry-After`; early requests still succeed
  - [ ] Identity isolation: two different trusted client-IP headers do **not** share a bucket (TestClient default host alone is insufficient for this assertion)
  - [ ] Anti-oracle: rate-limited reset/sign-in responses use the same status/`code`/`detail` regardless of whether the email exists
  - [ ] Verify hammer: flip gate on via `dataclasses.replace` on `client.app.state.auth_settings` (see `_set_verification_required` in `test_email_verification_integration.py`) — gate-off 404 never proves the limiter
  - [ ] Health guard: after auth paths are exhausted to 429, `GET /health` remains 200
  - [ ] Fake SMTP (`CapturingMailer` / monkeypatch `SmtpEmailSender`) — never live SMTP; under-limit SMTP fail still 503
  - [ ] Test wiring: `monkeypatch.setenv(...)` **before** `create_app()`, **or** `replace` on `app.state.auth_settings`; **reset/clear in-memory limiter store per test** (fixture). Copy existing per-file integration fixture pattern — there is **no** shared `conftest.py`; do not invent one unless intentionally extracting
  - [ ] Existing suites must stay green (raise limits via settings replace / env-before-create_app when a suite is chatty)

- [ ] Task 5: Hygiene + handoff (AC: #1, #2)
  - [ ] Update `auth-mail-interaction-map.md`: rate limits shipped (four paths, identity header trust, 429 `rate_limited`, BFF `Retry-After` forward); remove from “Known deferred”
  - [ ] Resolve absorbed bullets in `deferred-work.md` exactly:
    - 1.2 — No rate limiting on `POST /auth/register`
    - 1.3 — Application-layer rate limiting / lockout on `POST /auth/sign-in`
    - 1.5 — No per-user throttle on `POST /auth/verify/request` SMTP send  
    Leave untouched: 1.4 timing oracle; session HMAC / token cleanup
  - [ ] Mark sprint `action_items` “Auth/SMTP rate-limit hardening…” → `done` when story is marked done
  - [ ] Branch: `feat/1/1-5-6-auth-smtp-rate-limit-hardening` (AD-13 one story per branch)
  - [ ] Before `done`: paste story-close how/why overview per `story-close-overview-checklist.md`

## Dev Notes

### Do not get wrong (read first)

1. **BFF IP collapse:** bare `request.client.host` on api is the `ui` container under Compose — useless as the only key.
2. **`proxy_headers=False`:** do not “fix” by enabling uvicorn trust of arbitrary `X-Forwarded-*`.
3. **Forward `Retry-After`** on BFF 429 — api-only headers do not reach the browser.
4. **Locked 429 body** via `_rate_limited_response` — same `detail`/`code` everywhere; no quota leaks.
5. **Tests:** env before `create_app()` or `replace(app.state.auth_settings)`; clear limiter store per test; verify tests need gate on.

### Highest-risk misses

| Miss | Failure mode |
|------|----------------|
| Key only by `request.client.host` | Household-wide lockout + zero real abuse protection behind BFF |
| Skip BFF `Retry-After` / client-IP header | Contract incomplete; fake-done |
| Count after Argon2/SMTP | CPU/SMTP burn still free under the limit |
| Dual IP∧email “optional” keys | Timing/enumeration oracle (same class as deferred 1.4) |
| Redis / `slowapi` / new Compose service | Violates AD-2 |
| Global middleware | `/health` false downs |
| Claiming to fix timing oracle | Out of scope — leave deferred |
| Throttle confirm paths | Not in AC; can lock out legit token use |

### Epic context

Epic 1.5 = Auth spine hardening & Epic 2 prep (Correct Course / Epic 1 retro). Critical path **1.5.1 → 1.5.5** blocks Stories **2.2+**. This story is **parallel hardening** — may start after 1.5.1 **or** after the full critical path. Motive: invite-era (2.3+) grows SMTP/token abuse surface; Epic 1 reviews deferred limiter work as a class.

| Sibling | Relationship to 1.5.6 |
|---------|----------------------|
| 1.2 / 1.3 / 1.4 / 1.5 | Deferred source: register Argon2 burn, sign-in stuffing, reset/verify SMTP flood |
| 1.5.1 | Soft sequencing gate; claim fix **orthogonal** (no story file yet) |
| 1.5.2 | Living map + story-close — **update the map when limits ship** |
| 1.5.3 / 1.5.4 | Contracts only; both mark rate limits → 1.5.6 |
| 1.5.5 | Spine smoke — defaults must not brick a human smoke pass |
| **1.5.6 (this)** | Application-layer rate limits on four request paths + BFF identity/`Retry-After` |
| 1.5.7 | Parallel twin (hex ports + Compose pytest) — out of scope |

### Locked decisions (do not re-ask)

| Topic | Decision |
|-------|----------|
| **Client identity** | BFF sets `X-FH-Client-IP` (configurable); api trusts only from `TRUSTED_PROXY_IPS`; else peer host. Never bare peer-host-only for Compose BFF |
| **Algorithm** | Sliding window of timestamps (stdlib) |
| **Keys** | register/sign-in/reset-request → trusted client IP; verify-request → `user_id`. **Single key per path** — no dual-dimension |
| Authority | **api** enforces; ui BFF forwards 429 + `Retry-After` + identity header; `proxy.ts` is not the limiter |
| Topology | **No Redis / no new Compose service** (AD-2). In-process memory store |
| Library | In-repo stdlib only — no `slowapi` |
| In-scope paths | register, sign-in, password-reset **request**, verify **request** |
| Out-of-scope paths | confirm tokens, sign-out, session/me, health, invite stub |
| Error type | `RateLimitedError` with `MESSAGE = "Too many attempts. Please try again later."` and `CODE = "rate_limited"` |
| HTTP | **429** + `{detail: MESSAGE, code: CODE}` + `Retry-After` via `_rate_limited_response` — do **not** use bare `HTTPException` string detail (mismatches `{detail,code}` shape) |
| Counting | Atomic check+consume after body validation, **before** Argon2/SMTP/persist |
| Timing oracle | **Still deferred** — do not pad SMTP / claim constant-time |
| Session HMAC / cleanup | Later — not this story |
| Hex session ports | 1.5.7 — do not refactor session/hasher DI unless required to wire Depends |
| Enumeration | Same 429 body/code on all four paths; no existence leaks |
| Multi-worker | Document allowance × workers; fine for single-api Compose v1 |
| Naming | `1-5-6-…` = Epic **1.5** story 6 ≠ `1-5-config-gated-…` |
| Action item | Marks “Auth/SMTP rate-limit hardening…” done when story done |

### Anti-scope (explicit deny)

- Timing-oracle padding / constant-time reset SMTP
- Redis, `slowapi`, workers, fourth Compose service
- uvicorn `proxy_headers=True` without a trust model
- Blindly honoring public `X-Forwarded-For` / `X-Real-IP`
- Dual-key (IP ∧ email) dimensions
- Rate-limiting confirm / sign-out / session / me / health
- Limiter authority in `ui` or `proxy.ts`
- Claiming register auto-verify SMTP as a separate verify-request consume
- Session HMAC / plaintext session hardening
- Hex port polish (1.5.7)

### Recommended shapes

**429 body (all four paths):**

```json
{ "detail": "Too many attempts. Please try again later.", "code": "rate_limited" }
```

Headers: `Retry-After: <int seconds>`

**BFF → api (four POSTs):** forward browser JSON; add `X-FH-Client-IP: <ui-peer>`; on 429 return upstream status + body + `Retry-After`.

**Settings:** live on `app.state.auth_settings` (extend dataclass); tests use `replace(...)` or env-before-`create_app()`.

### Current state (must read before coding)

| Surface | Path | Today |
|---------|------|-------|
| Auth router | `api/api/routes/auth.py` | No throttle; `_credentials_error_response` / `_smtp_error_response`; `register` / `request_password_reset` lack `Request` |
| Entrypoint | `api/scripts/entrypoint.py` | `proxy_headers=False` — intentional |
| Settings | `api/api/settings.py` + `create_app()` → `app.state.auth_settings` | No rate-limit knobs; cached at app create |
| Errors | `api/domain/errors.py` | Pattern: class + `MESSAGE`; add `RateLimitedError` |
| Mail | `api/adapters/email/smtp.py` | `SmtpEmailSender`; persist-before-send + rollback |
| Deps | `api/api/deps.py` | `require_authenticated_user` — do not copy its bare `HTTPException` string style for 429 |
| BFF | `ui/app/api/auth/{register,sign-in,password-reset/request,verify/request}/route.ts` | Forwards status/body (+ cookies); **drops `Retry-After`**; no client-IP header today |
| Tests | `api/tests/test_*_integration.py` | Per-file fixtures; local `CapturingMailer`; `_set_verification_required` via `replace` — **no** shared `conftest.py` |

**Preserve:** cookie session (AD-8); generic credentials; reset 200 ack; SMTP 503 fail-loud; verify 404 when gate off; no Bearer in `localStorage`.

### Architecture compliance

- **AD-1:** Policy in `application/`; domain free of FastAPI/SQLAlchemy; do **not** invent `adapters/rate_limit/` unless introducing a real port swap (unnecessary for in-process memory)
- **AD-2:** No Redis/worker
- **AD-8:** httpOnly cookie; api sole issuer; SMTP fail-loud unchanged
- **AD-15:** Red→green for limiter; integration on four routes; no full Playwright required
- **AD-22:** Env placeholders only — no secrets committed

### Recommended file touch list

**Likely NEW**

```text
api/application/rate_limit.py
api/tests/test_rate_limit.py
api/tests/test_rate_limit_integration.py
```

**Likely UPDATE**

```text
api/api/routes/auth.py
api/api/deps.py
api/api/settings.py
api/domain/errors.py
api/scripts/entrypoint.py              # only if documenting trust; do NOT flip proxy_headers=True
.env.example
docker-compose.yml
docker-compose.prod.yml                # if present / mirrors api env
ui/app/api/auth/register/route.ts
ui/app/api/auth/sign-in/route.ts
ui/app/api/auth/password-reset/request/route.ts
ui/app/api/auth/verify/request/route.ts
ui/app/api/auth/**/route.test.ts
_bmad-output/.../auth-mail-interaction-map.md
_bmad-output/implementation-artifacts/deferred-work.md
_bmad-output/implementation-artifacts/sprint-status.yaml
```

**Optional UI (test-after)**

```text
ui/app/signup/signupClient.ts
ui/app/sign-in/** (signInClient)
ui/app/forgot-password/**
ui/app/verify/** (VerifyForm)
```

**Do NOT touch (unless spillover)**

- Claim/`expires_at` SQL (1.5.1)
- ACL / verify-gate contract docs
- SMTP adapter internals (reuse as-is)
- Session HMAC / plaintext session tokens
- New Compose service / Redis

### Testing requirements

| Layer | What |
|-------|------|
| Unit | Window exceed/allow/reset; key isolation; concurrent lock safety |
| Integration | Four endpoints → 429 after N+1; identity header isolation; health still 200 |
| Oracle | Limited reset/sign-in: identical status/code/detail whether email exists |
| Verify | Gate **on** before hammer; CapturingMailer |
| SMTP | Under-limit fail still 503 |
| BFF | `route.test.ts`: 429 + `Retry-After` (+ identity header set on fetch mock) |
| UI forms | Only if mapping `rate_limited`; vitest test-after |
| CI | lint · api pytest · ui typecheck/lint — AD-15 merge gate |

### Previous story intelligence

- **1.5.2–1.5.4:** living-doc updates, story-close overview, sprint action-item hygiene — mirror on this **code** story.
- **1.5 / 1.4 reviews:** Persist-before-send + rollback; Argon2 dummy verify on unknown sign-in — limiter must not re-open an oracle via asymmetric 429.
- **1.5.1 / 1.5.5 story files missing** — do not block; rate limits do not depend on claim SQL.
- Reuse: `JSONResponse` `{detail, code}` helpers; TestClient + mailer monkeypatch; `replace(app.state.auth_settings)`.

### Git intelligence summary

Branch: **`feat/1/1-5-6-auth-smtp-rate-limit-hardening`**. Recent history is docs-heavy Epic 1.5 + auth verify/prefs features — match Conventional Commits `feat(1): …`.

### Project context reference

Follow `_bmad-output/project-context.md`: no Redis; generic auth errors; hex layout; aiosmtplib pin; pytest 9.x; story-close overview before `done`. Source-of-truth order: Spine + project-context → SPEC/UX → PRD/epics.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` — Epic 1.5 / Story 1.5.6]
- [Source: `_bmad-output/planning-artifacts/sprint-change-proposal-2026-08-04.md`]
- [Source: `_bmad-output/implementation-artifacts/epic-1-retro-2026-08-04.md` — AI #7]
- [Source: `_bmad-output/implementation-artifacts/deferred-work.md` — 1.2/1.3/1.5 deferrals]
- [Source: `_bmad-output/planning-artifacts/architecture/.../ARCHITECTURE-SPINE.md` — AD-1, AD-2, AD-8, AD-15]
- [Source: `_bmad-output/planning-artifacts/architecture/.../auth-mail-interaction-map.md`]
- [Source: `_bmad-output/project-context.md`]
- [Source: `api/api/routes/auth.py`, `api/api/settings.py`, `api/domain/errors.py`, `api/scripts/entrypoint.py`]
- [Source: `ui/app/api/auth/*/route.ts`]
- [Source: `_bmad-output/implementation-artifacts/story-close-overview-checklist.md`]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

---

**Status:** ready-for-dev  
**Completion note:** Ultimate context engine analysis completed - comprehensive developer guide created
