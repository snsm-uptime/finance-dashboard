# Story 1.1: Scaffold Compose app with health checks

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an operator,
I want to run finance-helper locally via Docker Compose with `db`, `api`, and `ui`,
so that the self-hosted stack is ready for feature work without inventing deploy shape later.

## Acceptance Criteria

1. **Given** a clean checkout with `.env` filled from `.env.example`  
   **When** I start Compose (`db`, `api`, `ui`)  
   **Then** Postgres is reachable, and `api` and `ui` each expose `/health` returning success

2. **And** the repo layout matches the architecture seed (`api/domain|application|adapters|api`, `ui/` Next standalone, Alembic ready for migrations)

3. **And** CI workflow skeleton runs lint gates for `api` and `ui` (even if feature tests are still thin)

4. **And** no personal/statement data paths are committed; volumes for Postgres (and future PDFs) are outside the repo per NFR-9 / AD-3

## Tasks / Subtasks

- [ ] Task 1: Compose topology + env (AC: #1, #4)
  - [ ] Add `docker-compose.yml` (local) and `docker-compose.prod.yml` overlay sharing the same `db` / `api` / `ui` graph — no Redis, no worker (AD-2)
  - [ ] `db`: `postgres:16` with healthcheck `pg_isready`; bind/named volume on a **host path outside the repo** (e.g. `${FINANCE_HELPER_DATA:-$HOME/finance-helper}/pgdata`)
  - [ ] `api`: build from `api/`; depends_on `db` healthy; expose `/health`; healthcheck HTTP `/health`
  - [ ] `ui`: build from `ui/` with `output: 'standalone'`; depends_on `api` healthy; expose `/health`; set `HOSTNAME=0.0.0.0`
  - [ ] Ship `.env.example` with placeholders only (`DATABASE_URL`, `API_INTERNAL_URL`, session/SMTP placeholders, volume path vars); gitignore `.env`
  - [ ] Expand `.gitignore` for `.env`, secrets, operator PDF/`bank_data` paths, node_modules, `__pycache__`, `.venv`, `.next`, lockfile build junk — never commit real statements/PII

- [ ] Task 2: Hexagonal `api` seed + Alembic ready (AC: #1, #2)
  - [ ] Create layout: `api/domain/`, `api/application/`, `api/adapters/{bank,persistence,fx,email}/`, `api/api/`, `api/tests/fixtures/pdf/` (synthetic only; can be empty + `.gitkeep`)
  - [ ] FastAPI app with `/health` → 200 JSON success; structured logging floor (no PII at info)
  - [ ] Wire SQLAlchemy 2 + Alembic under `adapters/persistence`; migrations run on `api` startup **or** explicit one-shot — **no domain tables yet** (users/lists land in 1.2)
  - [ ] Pin lockfile with `uv` (preferred) or equivalent; Python 3.12+ image
  - [ ] Lock **one** api lint/format toolchain: **ruff** (lint + format) — freeze after this story

- [ ] Task 3: Next.js `ui` seed + health (AC: #1, #2)
  - [ ] App Router Next.js 16.2.x / React 19.2.x; `output: 'standalone'` in `next.config`
  - [ ] `/health` route returning success (App Router route handler or equivalent)
  - [ ] Prefer same-origin path for future cookies: `API_INTERNAL_URL=http://api:8000` for server-side; **do not** default to browser→`NEXT_PUBLIC_API_URL` for auth (AD-8 prep)
  - [ ] Strip create-next-app purple/kit brand defaults (AD-12) — minimal neutral shell OK; full Warm Balance tokens = Story 3.1
  - [ ] Lock **one** ui toolchain: ESLint + `tsc --noEmit` (TypeScript strict)
  - [ ] Set **non-zero UI coverage floor = 60%** statements (Vitest/Jest coverage config) — must not be zero (AD-15); thin smoke tests OK

- [ ] Task 4: CI + SemVer + docs touch (AC: #3)
  - [ ] `.github/workflows/ci.yml`: api ruff; ui eslint + typecheck; optional thin pytest/health smoke — feature goldens deferred
  - [ ] Single-app SemVer: root `VERSION` file `0.1.0` (or equivalent) — AD-14; bump tooling can be minimal
  - [ ] Update root `README.md` Status from “Planning” to runnable Compose instructions (copy `.env.example` → `.env`, set volume path, `docker compose up --build`)
  - [ ] After lockfiles exist: note exact pins in completion notes; update `_bmad-output/project-context.md` only if toolchain/pin patterns differ from planning pins

- [ ] Task 5: Verify operator path end-to-end (AC: #1–#4)
  - [ ] From clean checkout: fill `.env`, `docker compose up --build`, hit `api` and `ui` `/health`, confirm Postgres reachable
  - [ ] Confirm CI lint jobs pass locally or in Actions
  - [ ] Confirm no real PDFs/PII/secrets staged; volumes resolve outside repo

## Dev Notes

### Epic context

Epic 1 = Accounts & personal workspace (FR-1…FR-5). Demo gate needs authenticated user + personal list — **not** this story. 1.1 only delivers the greenfield Compose seed so 1.2+ can land auth/lists without inventing deploy shape.

Sibling stories (do **not** implement here): 1.2 signup+personal list · 1.3 sign-in/out · 1.4 password reset · 1.5 email verification · 1.6 Account EN/ES + theme.

### Scope boundaries (anti-scope)

| In 1.1 | Out of 1.1 |
|--------|------------|
| `db`/`api`/`ui` Compose + health | Auth, sessions, signup UI/API |
| Hex folder tree + empty adapter packages | Domain tables, CanonicalLine, parsers |
| Alembic **ready** (empty/baseline revision OK) | Full schema / users/lists migrations |
| CI lint skeleton | Full pytest goldens, Playwright every PR |
| `.env.example`, external volumes, gitignore | Real SMTP flows, invite email |
| SemVer + lockfiles + toolchain lock | Warm Balance full design system (3.1) |
| Neutral ui shell + coverage floor number | Account menu / i18n product chrome (1.6) |

**Forbidden:** Redis/worker/fourth app service · Streamlit/Gradio/NiceGUI/Reflex UI · Node-primary API · Bearer in `localStorage` · float money patterns · committing `.env` or real statements · Nx/Turborepo · recreating PG volume for schema · dual-pin standalone `pdfjs-dist` (omit react-pdf until Epic 4/5).

### Architecture compliance

[Source: `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md`]

- **AD-1:** Hex layout; `ui` → HTTP only; `domain` imports no FastAPI/SQLAlchemy/pdfplumber
- **AD-2:** Exactly `db` | `api` | `ui` (+ optional **host** reverse proxy — not a Compose app service)
- **AD-3 / NFR-9:** PG + future PDF volumes outside repo; path refs in DB later — not `bytea`
- **AD-8 (prep only):** httpOnly Secure cookie sessions later; same-origin via proxy and/or Next BFF; document choices in README/dev notes:
  - Prefer **Next Route Handler BFF or reverse-proxy `/api` → api** over browser-direct API
  - **Single session issuer** when auth lands (1.2/1.3) — no dual independent cookies
  - Auth library choice deferred to 1.2 (custom argon2 preferred over fastapi-users maintenance risk unless speed wins) — do not install auth stack in 1.1 unless needed for health
- **AD-11:** `api/tests/fixtures/pdf/` exists for synthetic fixtures; no real PDFs in repo
- **AD-12:** Kits = unstyled primitives only; no shadcn purple brand as product look
- **AD-13:** Branch `feat/1/1-1-scaffold-compose-app-with-health-checks` (or `feat/1/1.1`); one story per branch; PR + CI to `main`
- **AD-14:** One SemVer for whole Compose deployable
- **AD-15:** Lock UI coverage floor at scaffold (60%); CI lint + typecheck now; goldens grow later
- **AD-22:** local + prod Compose overlays; Alembic against external volume; `/health` on api+ui; secrets outside repo; structured logs + healthchecks

### Library / version requirements

Pins: match majors below; **re-verify exact patches when creating lockfiles** (this story). After 1.1, lockfiles are pin truth — bumps only via `chore/` PRs.

| Piece | Pin / floor | Notes (verified ~2026-08-03 / re-check at lock) |
|-------|-------------|--------------------------------------------------|
| PostgreSQL | `postgres:16` | e.g. 16.x latest patch |
| Python | 3.12+ | Pin concrete 3.12.x in Dockerfile/CI |
| FastAPI | 0.141.x | Latest line includes **0.141.1** (2026-07-29) |
| Uvicorn | 0.52.x | |
| Pydantic | 2.13.x | |
| SQLAlchemy | 2.0.x | Models **only** under `adapters/persistence` |
| Alembic | 1.18.x | |
| psycopg | 3.3.x | `DATABASE_URL=postgresql+psycopg://…@db:5432/…` |
| pytest | 9.x | Thin/empty OK in 1.1 |
| Next.js | 16.2.x standalone | Docs show 16.2.12 line; `HOSTNAME=0.0.0.0` in container |
| React | 19.2.x | Via Next |
| Node image | 20.9+ LTS (or current LTS) | Multi-stage standalone Docker |
| pdfplumber / aiosmtplib / react-pdf / @use-gesture | Pin ranges exist | **Defer install** until stories need them (optional early pin OK) |

Prefer `uv` for `api` lockfiles. Install FastAPI via project deps (e.g. `fastapi` + `uvicorn`); avoid inventing a second package manager mid-epic.

### Env contract (scaffold)

| Variable | Service | Rule |
|----------|---------|------|
| `DATABASE_URL` | `api` only | psycopg URL to `db` |
| `API_INTERNAL_URL` | `ui` server | `http://api:8000` |
| `NEXT_PUBLIC_API_URL` | avoid for auth | Only if unavoidable; prefer BFF/proxy |
| Session / SMTP secrets | Compose env/secrets | Placeholders in `.env.example` only |
| Volume path vars | Compose | Resolve **outside** repo |

### File structure requirements

**All NEW** (greenfield — no `api/` or `ui/` today). **UPDATE** `.gitignore` (currently only `.DS_Store`) and `README.md` status/run section.

```text
repo/
  VERSION                          # e.g. 0.1.0
  docker-compose.yml
  docker-compose.prod.yml
  .env.example
  .github/workflows/ci.yml
  api/
    domain/
    application/
    adapters/bank/
    adapters/persistence/          # SQLAlchemy + Alembic live here
    adapters/fx/
    adapters/email/
    api/                           # FastAPI routes (health only for now)
    tests/fixtures/pdf/
    pyproject.toml / uv.lock
    Dockerfile
  ui/
    app/…                          # App Router incl. /health
    next.config.*                  # output: 'standalone'
    package.json / lockfile
    Dockerfile
```

### Existing code being modified

| Path | Current state | This story | Preserve |
|------|---------------|------------|----------|
| `.gitignore` | `.DS_Store` only | Expand for secrets, deps, operator data | Keep ignoring `.DS_Store` |
| `README.md` | “Planning…” | Document Compose run path | Keep product overview accurate; don’t claim FRs done |
| `bank_data/` | Present at repo root | Ensure gitignored / not treated as fixtures | Do not commit statement contents |
| Planning under `_bmad-output/` | Specs only | Do not rewrite spines for scaffold | Spines remain SoT |

### Testing requirements

- **AC verification:** Compose up → Postgres up → `GET /health` on api and ui succeed
- **CI:** api lint (ruff) + ui lint + ui typecheck must be green; pytest may be empty or one health/unit smoke
- **Coverage:** configure Vitest/Jest with **60%** statements floor on `ui` source; add minimal test so config is real
- **Do not:** use SQLite as prod stand-in; put PII in fixtures; require full Playwright on this PR
- Integration tests against Postgres come with later stories — ensure Compose `db` is the path they will use

### Project context reference

Follow `_bmad-output/project-context.md` entirely. Highest-risk misses for this story:

- Volumes outside repo; never commit real PDFs/PII
- No Redis/worker “just in case”
- Alembic ready ≠ create all tables
- Lock lint toolchains once — no bikeshed in 1.2+
- After lockfiles: patches only via `chore/` PRs
- Source-of-truth order: ARCHITECTURE-SPINE + project-context → SPEC/DESIGN/EXPERIENCE → PRD/epics → README/research

### Latest tech notes (lock day)

- FastAPI **0.141.1** is current on the 0.141.x line; prefer `uv add` / lock within major pins from spine
- Next standalone Docker: multi-stage build; copy `.next/standalone`, `.next/static`, `public`; `ENV HOSTNAME=0.0.0.0`; run `node server.js` (not only `next start` in prod image)
- Node 20+ still valid; upstream examples may float newer LTS — pick one LTS and pin in Dockerfile

### Git intelligence

Repo is planning-only on `main` (ahead of origin). Recent commits are BMAD artifacts (epics, project-context, sprint-status) — **no application patterns yet**. This story establishes all conventions.

### Previous story intelligence

None — first implementation story.

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

## Story completion status

Status: ready-for-dev  
Completion note: Ultimate context engine analysis completed — comprehensive developer guide created.
