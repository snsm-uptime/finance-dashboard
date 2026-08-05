---
baseline_commit: 0825512595127e6e8dc6215ad187d96f44643ce0
validated: 2026-08-04
---

# Story 1.5.7: Hex port polish and Compose pytest ergonomics

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want clearer hex ports for session/hasher/prefs and a workable Compose pytest path,
so that Epic 2 application services do not pile onto incomplete boundaries (parallel).

## Acceptance Criteria

1. **Given** routes that today import concrete session/hasher/prefs adapters  
   **When** this story completes  
   **Then** ports/interfaces are introduced or tightened for those seams without changing product behavior

2. **And** a documented, working way to run API pytest against the Compose Postgres (host or in-image) exists so CI/local parity is clearer

3. **And** this story may proceed in parallel after 1.5.1 or after critical path 1.5.1–1.5.5

## Anti-goals (do not get wrong)

1. Do **not** put `SessionStore` on `POST /auth/password-reset/confirm` — revoke already happens inside `CompletePasswordResetService` → token adapter → sessions free function.
2. Do **not** delete sessions module free functions — password-reset adapter imports `revoke_all_sessions_for_user` by name.
3. Do **not** drop `SESSION_COOKIE_MAX_AGE` or change the 30d TTL (cookie max-age must stay `int(DEFAULT_SESSION_TTL.total_seconds())`).
4. Do **not** remove `SqlAlchemyAuthUserRepository` from `auth.py` for sign-in / reset / verify / register-verify — only `/auth/me` switches to `PreferencesRepository` Depends.
5. Do **not** make `ports.py` import `application.preferences` (circular import).
6. Do **not** use `uv run pytest` as `appuser` against a root-owned `.venv`.
7. Do **not** undo 1.5.6 rate-limit Depends / helpers when rebasing.
8. Do **not** relocate `AuthUserRepository` from `signin.py` into `ports.py` in this story.

## Tasks / Subtasks

- [x] Task 0: Confirm scope and as-built surfaces (AC: #1–#3)
  - [x] Read Epic 1.5 / Story 1.5.7 in `epics.md`, Correct Course proposal, Epic 1 retro AIs #8–#9, and `deferred-work.md` entries for session/hasher ports + PreferencesRepository split
  - [x] Confirm living map lists hex port polish under “Known deferred” → this story
  - [x] Confirm failure modes: prod API image is `uv sync --frozen --no-dev` + `USER appuser` → `docker compose run … uv run pytest` hits EACCES on `/app/.venv` and has no pytest; Host `.venv` + Compose DB works awkwardly (socat / container IP)
  - [x] Confirm out of scope: rate limits (1.5.6), claim/`expires_at` (1.5.1), spine smoke (1.5.5), session HMAC / token cleanup (later), ACL port impl (2.2 / 1.5.4 sketch), lists/email/signup/`AuthUserRepository` DI polish beyond prefs seam
  - [x] Naming trap: sprint key `1-5-7-…` = Epic **1.5** story 7 — **not** Epic 1 story 5 (`1-5-config-gated-…`)

- [x] Task 1: Session port (AC: #1)
  - [x] Add `SessionStore` Protocol to `api/application/ports.py` with exact signatures:

    ```python
    class SessionStore(Protocol):
        def create(self, user_id: UUID, *, ttl: timedelta = ...) -> str: ...
        def resolve_user_id(self, token: str | None) -> UUID | None: ...
        def revoke(self, token: str | None) -> bool: ...
        def revoke_all_for_user(self, user_id: UUID) -> int: ...
    ```

    Default `ttl` = existing `DEFAULT_SESSION_TTL` (`timedelta(days=30)`). Adapter `__init__(self, db: Session)`; methods must **not** take `db`.

  - [x] Implement `SqlAlchemySessionStore` in `api/adapters/persistence/sessions.py` that **delegates** to the existing free functions. Keep module-level `create_session` / `resolve_session_user_id` / `revoke_session` / `revoke_all_sessions_for_user` — do **not** delete or rename them (`password_reset.py` still calls `revoke_all_sessions_for_user` directly; mapping: Protocol `revoke_all_for_user` → free function `revoke_all_sessions_for_user`)
  - [x] Wire `get_session_store(db) → SessionStore` in `api/api/deps.py`; use it in `require_authenticated_user` instead of calling `resolve_session_user_id` directly
  - [x] Update **register / sign-in / sign-out / `/session`** to Depend on `SessionStore`. Route-level `revoke_all` + `create` callers today are **register** and **sign-in** only (before issuing the new cookie)
  - [x] **Do NOT** wire `SessionStore` into `POST /auth/password-reset/confirm`. Reset confirm already revokes via `CompletePasswordResetService` → `PasswordResetTokenRepository.revoke_all_sessions_for_user` (`adapters/persistence/password_reset.py` → sessions free function). Leave that path alone — do not touch `password_reset.py` application or adapter for this story
  - [x] Cookie set/clear helpers stay in routes. After dropping session **function** imports, **still** bind cookie max-age: keep `from adapters.persistence.sessions import SESSION_COOKIE_MAX_AGE` (constant-only import is allowed), or re-export the same int from deps. Do **not** hardcode a different value
  - [x] FastAPI note: `get_session_store(db=Depends(get_db))` + route `db=Depends(get_db)` is fine (request-scoped cache). Do not “simplify” by dropping `db` from routes that still construct concrete signup/auth repos

- [x] Task 2: Hasher Depends typed to port (AC: #1)
  - [x] `PasswordHasher` Protocol already exists in `ports.py` — **reuse**; do not invent a second hasher interface
  - [x] Change `get_password_hasher() → PasswordHasher` (return type Protocol); keep constructing `Argon2PasswordHasher()` only inside `deps.py`
  - [x] Annotate route params as `PasswordHasher`, not `Argon2PasswordHasher`; drop concrete hasher import from `auth.py` (register, sign-in, password-reset confirm still take hasher Depends)

- [x] Task 3: Preferences port in `ports.py` (AC: #1)

  **AuthUserRepository vs PreferencesRepository (read first)**
  - `AuthUserRepository` + `AuthUserRecord` stay in `application/signin.py` — **out of scope** to move/DI
  - `SqlAlchemyAuthUserRepository` **remains** the concrete for `SignInService`, password-reset, email-verify, register auto-verify
  - This story only swaps **`/auth/me` GET+PATCH** to `Depends(get_preferences_repository)` typed as `PreferencesRepository`
  - Do **not** remove the `SqlAlchemyAuthUserRepository` import from `auth.py` (other call sites remain)

  - [x] Define `UserPreferencesRecord` + `PreferencesRepository` **in** `ports.py` (canonical home)
  - [x] `preferences.py` imports them from `ports` (services stay in `preferences.py`)
  - [x] Update `repositories.py` to `from application.ports import UserPreferencesRecord`
  - [x] Optional thin re-export from `preferences.py` for tests is OK **only if** `ports.py` never imports `preferences`
  - [x] **Forbidden:** `ports.py` importing from `application.preferences`
  - [x] Keep `SqlAlchemyAuthUserRepository` as the structural adapter (dual-purpose; Protocol satisfaction is the bar) — **no** DB schema change, **no** mandatory second SQLAlchemy prefs class
  - [x] Add `get_preferences_repository(db) → PreferencesRepository` in `deps.py`

- [x] Task 4: Composition hygiene (AC: #1 — preserve behavior)
  - [x] `auth.py` import before/after checklist:

    **Remove (session/hasher/prefs seams only):**
    - `Argon2PasswordHasher` type annotation (use `PasswordHasher` from ports)
    - `create_session`, `resolve_session_user_id`, `revoke_session`, `revoke_all_sessions_for_user` function imports

    **KEEP:**
    - `SqlAlchemyAuthUserRepository` (sign-in / reset / verify / register-verify)
    - `SqlAlchemySignupRepository`, email adapters
    - `SESSION_COOKIE_MAX_AGE` (constant-only) or equivalent re-export
    - `application.preferences` command/service imports

    **ADD Depends:**
    - `SessionStore` on register, sign-in, sign-out, `/session`
    - `PasswordHasher` on register, sign-in, password-reset/confirm
    - `PreferencesRepository` on GET+PATCH `/me` only

  - [x] Leave `SqlAlchemySignupRepository` / email / verify / lists concrete imports as **known remaining debt** — document in story-close; do not expand into full DI cleanup
  - [x] Prefer matching existing `Depends(get_*)` style; `Annotated[..., Depends(...)]` is welcome if you touch signatures — do not mass-migrate every route param
  - [x] Prove no product behavior change: existing signup / sign-in / sign-out / session / me / reset-confirm integration tests still green

- [x] Task 5: Compose pytest ergonomics (AC: #2)
  - [x] Add thin overlay `docker-compose.test.yml` (mirror `dev`/`prod` — **no** fourth app service; AD-2 stays `db|api|ui`)
  - [x] Dockerfile build-arg so default prod image stays `--no-dev`. **Shell-form RUN required** so `"--group dev"` word-splits:

    ```dockerfile
    ARG UV_SYNC_ARGS=--no-dev
    # shell form — do NOT use exec-form RUN with unexpanded/unsplit args
    RUN uv sync --frozen ${UV_SYNC_ARGS}
    ```

    After all `COPY`s: `RUN chown -R appuser:appuser /app` so `appuser` can write `.pytest_cache` under `/app` (not only `.venv`). Prefer chown over `user: "0:0"` as the permanent test path.
  - [x] Test overlay builds with `args: { UV_SYNC_ARGS: "--group dev" }`, mounts `./api/tests:/app/tests`, and **replaces CMD** (Dockerfile has `CMD` entrypoint script, not `ENTRYPOINT`):

    ```yaml
    services:
      api:
        build:
          context: ./api
          args:
            UV_SYNC_ARGS: "--group dev"
        volumes:
          - ./api/tests:/app/tests
        # replaces CMD — do not invoke scripts.entrypoint / uvicorn
        command: ["pytest", "-q"]
        # DATABASE_URL already @db:5432 from base compose
    ```

    Prefer `command: ["pytest", …]` — `PATH` already includes `/app/.venv/bin`. Avoid `uv run` in-container.
  - [x] Document in `README.md` **API tests** section:
    1. **Canonical Compose path:** `docker compose -f docker-compose.yml -f docker-compose.test.yml run --rm --build api` (exact flags you ship)
    2. **Host path (CI parity):** `cd api && uv sync --group dev && DATABASE_URL=… uv run pytest` — match `.github/workflows/ci.yml` (service Postgres on `localhost:5432`). Base compose **does not** publish `db:5432`; do **not** document a broken host URL against unpublished Compose `db`. Optional footnote: personal port-publish overlay / socat — not primary
  - [x] Prove the Compose path once: suite exits 0 (pytest, not a silent uvicorn boot)
  - [x] Do **not** bake pytest into the default prod image; do **not** make root the permanent api user; do **not** add Redis/Makefile monolith

- [x] Task 6: Shared test fixtures (AC: #2 — recommended)

  **Conflict with 1.5.6 (conftest):** 1.5.6 told developers not to invent `conftest.py` unless intentionally extracting. This story **does** extract one.
  - If 1.5.6 merges first: rebase fixtures into conftest **and** preserve its limiter-store reset + env-raised limits for chatty suites
  - If this story merges first: 1.5.6 must extend conftest (supersedes its anti-conftest note)
  - Do not flatten password-reset / email-verification `client` fixtures that monkeypatch `SmtpEmailSender` / `CapturingMailer` — keep mailer-aware client fixtures (module-local or conftest factories)

  - [x] Add `api/tests/conftest.py` extracting duplicated Postgres engine / alembic upgrade / rollback `db_session` / base `client` pattern
  - [x] Migrate at least auth-related integration suites (signup, signin, preferences, password_reset, email_verification)
  - [x] Keep `skipif` when `DATABASE_URL` unset so host unit runs stay fast

- [x] Task 7: Hygiene + handoff (AC: #1–#3)
  - [x] Update `auth-mail-interaction-map.md`: move hex port polish off “Known deferred”; note `SessionStore` / `PasswordHasher` Depends / `PreferencesRepository` in `ports.py`
  - [x] Resolve absorbed deferrals in `deferred-work.md` using this wording:
    > Resolved by 1.5.7: `PreferencesRepository`/`UserPreferencesRecord` live in `ports.py`; `/me` Depends on Protocol. `SqlAlchemyAuthUserRepository` remains dual-purpose adapter. Optional physical class split still residual debt (not claimed). Incomplete session/hasher route imports resolved via `SessionStore` + Protocol-typed hasher Depends; free functions retained for password-reset adapter.
    Leave HMAC / session cleanup deferred.
  - [x] Mark sprint `action_items` “Hex port polish…” and “Compose pytest ergonomics…” → `done` when story is marked done
  - [x] Branch: `refactor/1/1-5-7-hex-port-polish-and-compose-pytest-ergonomics` (AD-13; `feat`/`chore` OK if preferred)
  - [x] Before `done`: paste story-close how/why overview per `story-close-overview-checklist.md`

### Review Findings

- [x] [Review][Patch] Revert sprint action_items to `open` until story is `done` [`_bmad-output/implementation-artifacts/sprint-status.yaml`] — resolved by promoting story → `done` (Task 7 gate satisfied; action_items remain `done`)
- [x] [Review][Patch] Fix stale `DEFAULT_SESSION_TTL` sync comment [`api/application/ports.py:10`] — comment now states ports owns the canonical TTL
- [x] [Review][Defer] Shared `make_client` omits per-request rollback on mid-handler DB errors [`api/tests/integration_db.py:41-46`] — deferred, intentional preferences-style override for 422; residual within-test aborted-tx risk
- [x] [Review][Defer] Latent 1.5.6 conftest merge (rate-limiter reset) [`api/tests/conftest.py`] — deferred, pre-existing parallel-story conflict documented in Task 6

## Dev Notes

### Epic context

Epic 1.5 = Auth spine hardening & Epic 2 prep (Correct Course / Epic 1 retro). Critical path **1.5.1 → 1.5.5** blocks Stories **2.2+**. This story is **parallel technical debt** — may start after 1.5.1 **or** after the full critical path. Motive: Epic 2 application services must Depend on clear ports; routes currently construct concretes; Compose pytest is undocumented and fails on the prod image.

| Sibling | Relationship to 1.5.7 |
|---------|----------------------|
| 1.2 / 1.3 | Deferred: session create/resolve + hasher imported in routes |
| 1.6 | Deferred: PreferencesRepository vs fat AuthUserRepository |
| 1.5.1 | Soft sequencing gate for parallel start; claim fix **orthogonal** |
| 1.5.2 | Living map — **update when ports ship** |
| 1.5.4 | ACL sketch expects `authorize_list_access` in `ports.py` later (2.2) — **do not implement ACL here** |
| 1.5.6 | Parallel twin (rate limits) — conflict zones below |
| **1.5.7 (this)** | Session + hasher + prefs ports + Compose pytest DX |

### Parallel 1.5.6 merge map

| File | 1.5.6 touch | 1.5.7 touch | Rebase rule |
|------|-------------|-------------|-------------|
| `api/api/routes/auth.py` | Rate-limit Depends on register / sign-in / reset-request / verify-request; `Request` + 429 helpers | SessionStore / PasswordHasher / `/me` Preferences Depends; drop session function imports | Keep both; never delete `_rate_limited_response` / limiter Depends |
| `api/api/deps.py` | Optional rate-limit Depends helpers | `get_session_store`, Protocol hasher return, `get_preferences_repository` | Additive merge |
| `api/api/settings.py` | Rate-limit env knobs | Untouched (unless needed) | Prefer leave alone |
| `api/tests/*` | New rate-limit tests; no conftest (unless 1.5.7 landed) | `conftest.py` extraction | See Task 6 conflict note |

### Locked decisions (do not re-ask)

| Topic | Decision |
|-------|----------|
| In-scope seams | **session store**, **password hasher**, **preferences repository** only |
| Product behavior | **No change** — same cookies, same status codes, same Argon2, same prefs wire shape |
| Session model | Opaque DB token; ~30d TTL; plaintext at rest (**HMAC still deferred**); free functions retained |
| Reset revoke | Stays inside password-reset token adapter — **not** a route SessionStore call |
| Hasher | Existing `PasswordHasher` Protocol + `Argon2PasswordHasher` adapter |
| Prefs | Protocol + record in `ports.py`; dual-purpose `SqlAlchemyAuthUserRepository`; no required class split |
| Auth user repo | Stays in `signin.py` / concrete in routes for non-`/me` flows |
| Composition | Concretes for the three seams constructed in `deps.py` / adapters only |
| Cookie max-age | Keep `SESSION_COOKIE_MAX_AGE` (constant import OK) |
| ACL / ListAccessGrant | Story **2.2** |
| Compose | Overlay + Dockerfile build-arg (shell-form); **no** Redis/worker/fourth service |
| Prod image | Stays lean (`--no-dev`); test overlay gets `--group dev` + chown |
| Canonical pytest path | Compose overlay first-class; host `uv` = CI path; no fake `localhost:5432` against unpublished `db` |
| Naming | `1-5-7-…` = Epic **1.5** story 7 ≠ `1-5-config-gated-…` |
| Action items | Marks both hex-port and Compose-pytest rows done when story done |

### Current state (must read before coding)

| Surface | Path | Today |
|---------|------|-------|
| Ports | `api/application/ports.py` | `PasswordHasher`, `SignupRepository`, `EmailSender` — **no** session port; prefs Protocol in `preferences.py` |
| Prefs use-case | `api/application/preferences.py` | Local `PreferencesRepository` + `UserPreferencesRecord` |
| Sign-in repo Protocol | `api/application/signin.py` | `AuthUserRepository` — **leave here** |
| Hasher adapter | `api/adapters/persistence/password_hasher.py` | `Argon2PasswordHasher` |
| Session adapter | `api/adapters/persistence/sessions.py` | Free functions only; `SESSION_COOKIE_MAX_AGE` |
| Reset adapter | `api/adapters/persistence/password_reset.py` | Calls `revoke_all_sessions_for_user` free function |
| Auth user repo | `api/adapters/persistence/repositories.py` | Implements prefs methods + auth lookups; imports `UserPreferencesRecord` from `preferences` |
| Deps | `api/api/deps.py` | Hasher return = concrete; auth gate calls `resolve_session_user_id` |
| Auth routes | `api/api/routes/auth.py` | Session free fns + Argon2 type + `SqlAlchemyAuthUserRepository` for `/me` **and** sign-in/reset/verify; register/sign-in call `revoke_all` then `create_session` |
| API Dockerfile | `api/Dockerfile` | `uv sync --frozen --no-dev`; `USER appuser`; `CMD` = `scripts.entrypoint`; no `tests/` COPY |
| Dev overlay | `docker-compose.dev.yml` | Mounts `tests/`; `user: "0:0"` (accidental pytest workaround) |
| Base compose `db` | `docker-compose.yml` | **No** host port publish for 5432 |
| CI | `.github/workflows/ci.yml` | Host `uv sync --group dev` + Postgres **service** |
| Tests | `api/tests/*_integration.py` | Duplicated fixtures; no `conftest.py` |
| README | `README.md` | No API tests section |

**UPDATE files — preserve:**

- **Session:** Opaque `token_urlsafe`; reject expired rows; `SESSION_COOKIE_MAX_AGE` from `DEFAULT_SESSION_TTL`; revoke on sign-out; revoke-all on register/sign-in (route) **and** password-reset confirm (adapter path)
- **Hasher:** Argon2; `InvalidHashError` → False
- **Prefs:** EN/ES + light/dark/system; corrupt coerce + warning logs; `/me` wire models unchanged
- **Auth gate:** 401; cookie attributes from `AuthSettings` (AD-8)
- **CI:** Host-uv + service Postgres stays green — Compose path is additive

### Architecture compliance

- **AD-1 / paradigm:** Domain free of FastAPI/SQLAlchemy; application owns ports; adapters implement; routes are delivery
- **AD-2:** Overlay only — no Redis/worker/test microservice
- **AD-8:** httpOnly Secure cookie / same-origin BFF; api sole issuer; no Bearer/JWT/`localStorage`
- **AD-13:** One story per branch `refactor/1/1-5-7-…`
- **AD-15:** pytest 9.x; Postgres 16 when `DATABASE_URL` set
- **AD-19:** Do not implement membership ACL here
- **AD-22:** No secrets in repo; compose overlays share graph
- **project-context:** Hex layout; no SQLite stand-in for integration

### Recommended file touch list

**Likely NEW**

```text
docker-compose.test.yml
api/tests/conftest.py
```

**Likely UPDATE**

```text
api/application/ports.py                 # SessionStore + PreferencesRepository + UserPreferencesRecord
api/application/preferences.py           # Import Protocol/record from ports (ports never imports preferences)
api/adapters/persistence/sessions.py     # SqlAlchemySessionStore + keep free functions
api/adapters/persistence/repositories.py # Import UserPreferencesRecord from ports
api/api/deps.py                          # Protocol return types + get_session_store / get_preferences_repository
api/api/routes/auth.py                   # Session/hasher/prefs Depends per checklist; KEEP AuthUser concrete imports
api/Dockerfile                           # UV_SYNC_ARGS (shell RUN) + chown after COPY
README.md                                # API tests section (honest DATABASE_URL guidance)
_bmad-output/.../auth-mail-interaction-map.md
_bmad-output/implementation-artifacts/deferred-work.md
_bmad-output/implementation-artifacts/sprint-status.yaml
api/tests/test_*_integration.py          # Shared conftest; preserve mailer-aware clients
```

**Do NOT touch (unless spillover)**

- `api/adapters/persistence/password_reset.py` / `api/application/password_reset.py` (session revoke path stays)
- Rate-limit policy (1.5.6)
- Claim/`expires_at` SQL (1.5.1)
- ACL / verify-gate implementation
- Session HMAC / hashing tokens at rest
- UI Account menu / BFF prefs
- Domain preference validation rules
- Alembic migrations
- Relocating `AuthUserRepository` into `ports.py`
- Adding pytest to default prod image permanently

### Testing requirements

| Layer | What |
|-------|------|
| Regression | signup/signin/session/me/prefs/reset/verify suites pass (behavior unchanged) |
| Reset security | After password-reset confirm, old sessions die (existing integration assertion — must stay green without SessionStore on that route) |
| Unit (optional) | Fake `SessionStore` / `PreferencesRepository` if useful; prefs application tests import paths updated |
| Compose proof | Documented overlay one-liner runs **pytest** to exit 0 (not uvicorn) |
| Host/CI | `uv run pytest` with CI-style `DATABASE_URL` still works |
| Anti-regression | Cookie `fh_session`; `/me` null language/theme when unset; generic credentials |

### Previous story intelligence

- **1.5.6 (parallel twin):** Rate limits + soft anti-conftest note — see merge map and Task 6. Do not undo limiter wiring.
- **1.5.4:** Next ports consumer is ACL in 2.2 — keep `ports.py` small; no ACL stubs here.
- **1.6 / 1.2 reviews:** Exact deferrals this story absorbs — incomplete session/hasher ports; PreferencesRepository “split” = port + Depends, not mandatory second SQLAlchemy class.
- **Story 1.6 debug log:** Compose `uv run pytest` → `.venv` EACCES; also plan for `.pytest_cache` under `/app` via chown.
- Integration tests override `get_db` — new providers must remain overridable the same way.

### Git intelligence summary

Recent history is docs-heavy Epic 1.5 plus earlier auth feature commits on `auth.py` / sessions. Branch: **`refactor/1/1-5-7-hex-port-polish-and-compose-pytest-ergonomics`**.

### Latest tech information

- FastAPI: Protocol-typed `Depends` + `dependency_overrides`; optional `Annotated` aliases — prefer Protocol over concrete adapter types on route signatures.
- Docker: shell-form `RUN` for multi-token build-args; chown after COPY for non-root pytest cache; invoke venv `pytest` directly (image already puts `.venv/bin` on `PATH`).
- pytest 9.x (project pin) — no bump required.

### Project context reference

Follow `_bmad-output/project-context.md`: hexagonal layout; no Redis; AD-8 cookies; pytest + Postgres 16; story-close overview before `done`. Source-of-truth order: Spine + project-context → SPEC/UX → PRD/epics.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` — Epic 1.5 / Story 1.5.7]
- [Source: `_bmad-output/planning-artifacts/sprint-change-proposal-2026-08-04.md`]
- [Source: `_bmad-output/implementation-artifacts/epic-1-retro-2026-08-04.md` — AI #8–#9]
- [Source: `_bmad-output/implementation-artifacts/deferred-work.md` — 1.2 session/hasher; 1.6 PreferencesRepository]
- [Source: `_bmad-output/implementation-artifacts/1-5-6-auth-smtp-rate-limit-hardening.md` — parallel twin / conftest conflict]
- [Source: `_bmad-output/implementation-artifacts/1-5-4-membership-acl-enforcement-sketch.md`]
- [Source: `_bmad-output/planning-artifacts/architecture/.../ARCHITECTURE-SPINE.md` — paradigm, AD-1/2/8/13/15/19]
- [Source: `_bmad-output/planning-artifacts/architecture/.../auth-mail-interaction-map.md`]
- [Source: `_bmad-output/project-context.md`]
- [Source: `api/application/ports.py`, `api/api/deps.py`, `api/api/routes/auth.py`, `api/adapters/persistence/sessions.py`, `api/adapters/persistence/password_reset.py`, `api/Dockerfile`, `docker-compose.yml`, `docker-compose.dev.yml`]
- [Source: `_bmad-output/implementation-artifacts/story-close-overview-checklist.md`]

## Dev Agent Record

### Agent Model Used

Composer (Cursor Agent)

### Debug Log References

- Compose proof (worktree stack): `docker compose -f docker-compose.yml -f docker-compose.worktree.yml -f docker-compose.test.yml run --rm --build api` → **110 passed** (pytest, not uvicorn)
- Host unit path: `cd api && uv run pytest -q` → 65 passed, 45 skipped (no DATABASE_URL)

### Completion Notes List

- Introduced `SessionStore`, moved `PreferencesRepository`/`UserPreferencesRecord` into `ports.py`, Protocol-typed hasher Depends; routes no longer import session free functions or concrete hasher.
- `SqlAlchemySessionStore` delegates to retained free functions; password-reset confirm still revokes via adapter path (no route SessionStore).
- `/me` GET+PATCH Depends on `PreferencesRepository`; `SqlAlchemyAuthUserRepository` remains dual-purpose for sign-in/reset/verify.
- Compose pytest: `docker-compose.test.yml` + `UV_SYNC_ARGS` shell-form sync + post-COPY chown; README documents Compose + CI host paths.
- Shared `api/tests/conftest.py` + `integration_db.py`; mailer-aware clients preserved in reset/verify suites.
- Known remaining debt: signup/email/verify repo concretes still constructed in routes (not expanded this story).

## Story-close overview — 1.5.7

**Request path:**
browser → ui BFF cookie → api auth routes → `SessionStore` / `PasswordHasher` / `PreferencesRepository` Depends → adapters (`SqlAlchemySessionStore`, `Argon2PasswordHasher`, `SqlAlchemyAuthUserRepository`) → Postgres

**Key components:**
`api/application/ports.py`, `api/api/deps.py`, `api/api/routes/auth.py`, `api/adapters/persistence/sessions.py`, `docker-compose.test.yml`, `api/Dockerfile`, `api/tests/conftest.py`

**Why this shape:**
AD-1 hex ports at the composition root without reshaping password-reset revoke (stays inside token adapter) or forcing a second prefs SQLAlchemy class.

**What not to break:**
`SESSION_COOKIE_MAX_AGE` = 30d; free functions for reset revoke; `/me` wire nulls; no `SessionStore` on password-reset confirm; prod image stays `--no-dev`.

### File List

- `api/application/ports.py`
- `api/application/preferences.py`
- `api/adapters/persistence/sessions.py`
- `api/adapters/persistence/repositories.py`
- `api/api/deps.py`
- `api/api/routes/auth.py`
- `api/Dockerfile`
- `docker-compose.test.yml`
- `README.md`
- `api/tests/conftest.py`
- `api/tests/integration_db.py`
- `api/tests/test_signup_integration.py`
- `api/tests/test_signin_integration.py`
- `api/tests/test_preferences_integration.py`
- `api/tests/test_password_reset_integration.py`
- `api/tests/test_email_verification_integration.py`
- `api/tests/test_lists_integration.py`
- `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/auth-mail-interaction-map.md`
- `_bmad-output/implementation-artifacts/deferred-work.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/1-5-7-hex-port-polish-and-compose-pytest-ergonomics.md`

### Change Log

- 2026-08-04: Implemented hex SessionStore / PasswordHasher / PreferencesRepository ports + Compose pytest overlay and shared fixtures; status → review

---

**Status:** done  
**Completion note:** Code review complete — patches applied; deferred items logged
