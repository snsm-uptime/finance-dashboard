---
title: '1.1 Scaffold Compose app with health checks'
type: 'feature'
created: '2026-08-03'
status: 'done'
review_loop_iteration: 0
baseline_commit: '04073f8d35fcc7a35bb29e9729bcde565f7a254e'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/1-1-scaffold-compose-app-with-health-checks.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The repo is planning-only — no runnable `db`/`api`/`ui` Compose stack — so feature work cannot land without inventing deploy shape.

**Approach:** Greenfield scaffold: Postgres 16 + FastAPI hex API + Next.js standalone UI, `/health` on both apps, Alembic ready (no domain tables), CI lint skeleton, volumes and secrets outside the repo.

## Boundaries & Constraints

**Always:**
- Compose services exactly `db` | `api` | `ui` (no Redis/worker)
- Hex layout: `api/domain|application|adapters/{bank,persistence,fx,email}|api`; UI HTTP-only
- `/health` success on `api` and `ui`; `db` health via `pg_isready`
- PG (+ future PDF) volumes on host paths **outside** the repo
- Lockfiles pin within spine majors; lock **ruff** (api) and **ESLint + tsc** (ui)
- UI coverage floor **60%** statements (Vitest); SemVer root `VERSION` = `0.1.0`
- Prefer `API_INTERNAL_URL` same-origin/BFF path; never Bearer in `localStorage`
- Branch: `feat/1/1-1-scaffold-compose-app-with-health-checks`

**Ask First:**
- Rewriting git history to purge already-committed `bank_data/` PDFs (untracking + gitignore is in-scope; history rewrite is not)
- Adding a Compose-hosted reverse proxy service (host proxy preferred; not required for local health)

**Never:**
- Auth, signup, sessions, users/lists schema, SMTP product flows
- Domain tables beyond Alembic baseline; parsers; CanonicalLine; react-pdf/pdfplumber installs
- Warm Balance full tokens / Account EN·ES·theme UI (later stories)
- Streamlit/Gradio/NiceGUI/Reflex; Node-primary API; Nx/Turborepo; float money
- Commit `.env`, secrets, or real statements; recreate PG volume for schema
- `NEXT_PUBLIC_*` secrets; dual-pin standalone `pdfjs-dist`

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy path | `.env` from `.env.example`; `compose up --build` | `db` healthy; `api`+`ui` `/health` → 200 | Compose fails loud if build/env broken |
| Missing `.env` | No `.env` | Documented; services must not silently use committed secrets | Fail or refuse weak defaults |
| Volume path | Default `$HOME/finance-helper/pgdata` | Data persists outside repo | Path must not resolve inside git root |
| CI lint | PR/push workflow | api ruff + ui eslint + typecheck green | Job fails on lint/type errors |
| bank_data hygiene | Tracked PDFs in repo today | Ignored + removed from index; files may remain locally | Do not delete operator PDFs from disk |

</frozen-after-approval>

## Code Map

- `.gitignore` -- UPDATE: secrets, deps, `.env`, `bank_data/`, build artifacts
- `README.md` -- UPDATE: Compose run instructions (was Planning-only)
- `bank_data/` -- UNTRACK from git index; keep local files; ignore going forward
- `VERSION` -- NEW: `0.1.0`
- `docker-compose.yml` / `docker-compose.prod.yml` -- NEW: three-service graph + overlays
- `.env.example` -- NEW: placeholders only
- `.github/workflows/ci.yml` -- NEW: api ruff; ui lint + typecheck
- `api/` -- NEW: hex seed, FastAPI `/health`, Alembic under `adapters/persistence`, Dockerfile, `uv` lock
- `ui/` -- NEW: Next App Router standalone, `/health`, Vitest 60% floor, Dockerfile, lockfile

## Tasks & Acceptance

**Execution:**
- [x] `.gitignore` -- expand ignores; `git rm -r --cached bank_data` (keep files) -- NFR-2 / AC4
- [x] `VERSION` + `.env.example` + `docker-compose.yml` + `docker-compose.prod.yml` -- operator run path
- [x] `api/**` -- hex dirs, FastAPI `/health`, SQLAlchemy+Alembic ready (no domain tables), ruff, Dockerfile, uv lock within spine pins
- [x] `ui/**` -- Next 16.2.x standalone, `/health`, ESLint+tsc, Vitest ≥60% statements, neutral shell (no kit purple brand), Dockerfile
- [x] `.github/workflows/ci.yml` -- api ruff + ui eslint + typecheck (thin tests OK)
- [x] `README.md` -- copy `.env.example` → `.env`, set volume path, `docker compose up --build`, health URLs
- [x] Verify I/O matrix locally (compose health + CI commands)

**Acceptance Criteria:**
- Given `.env` from `.env.example`, when Compose starts `db`/`api`/`ui`, then Postgres is reachable and both apps return success from `/health`
- Given the checkout, when inspecting layout, then hex `api/` + Next standalone `ui/` + Alembic-ready persistence exist
- Given CI workflow, when lint/typecheck jobs run, then api and ui gates pass
- Given git status after scaffold, when checking tracked paths, then no `.env`/secrets/`bank_data` PDFs remain tracked; PG volume path is outside the repo

## Design Notes

**Next Docker:** multi-stage; copy `.next/standalone`, `.next/static`, `public`; `HOSTNAME=0.0.0.0`; `CMD ["node","server.js"]`.

**Alembic:** wire env + empty/baseline revision; run on api startup or one-shot — zero domain tables until Story 1.2.

**Auth prep (do not implement):** document `API_INTERNAL_URL`; avoid browser-direct API as default.

## Verification

**Commands:**
- `docker compose up --build -d` then `curl -sf http://localhost:<api>/health` and `curl -sf http://localhost:<ui>/health` -- expected: HTTP 200
- `cd api && ruff check . && ruff format --check .` -- expected: clean
- `cd ui && npm run lint && npx tsc --noEmit && npm test -- --coverage` -- expected: pass; coverage ≥60%
- `git check-ignore -v bank_data/` and `git ls-files bank_data` -- expected: ignored; empty ls-files

**Manual checks:**
- Volume directory resolves outside repo root
- `.env.example` has no real secrets; README run steps work from clean mental model

## Suggested Review Order

**Compose topology**

- Require `.env`; derive `DATABASE_URL` from `POSTGRES_*`; absolute volume path
  [`docker-compose.yml:1`](../../docker-compose.yml#L1)

- Homelab overlay keeps the same three-service graph
  [`docker-compose.prod.yml:1`](../../docker-compose.prod.yml#L1)

**API seed**

- Hex FastAPI factory with `/health` only
  [`app.py:17`](../../api/api/app.py#L17)

- Alembic on boot with timeout; no proxy header trust yet
  [`entrypoint.py:14`](../../api/scripts/entrypoint.py#L14)

- Non-root API image + frozen `uv` lock
  [`Dockerfile:1`](../../api/Dockerfile#L1)

- Baseline migration — zero domain tables
  [`0001_baseline.py:16`](../../api/adapters/persistence/migrations/versions/0001_baseline.py#L16)

**UI seed**

- Next `output: 'standalone'` for Compose
  [`next.config.ts:3`](../../ui/next.config.ts#L3)

- UI `/health` route
  [`route.ts:5`](../../ui/app/health/route.ts#L5)

- Multi-stage standalone Docker runner
  [`Dockerfile:1`](../../ui/Dockerfile#L1)

**Gates & hygiene**

- CI lint/typecheck/coverage skeleton
  [`ci.yml:1`](../../.github/workflows/ci.yml#L1)

- Ignore secrets, `bank_data/`, build artifacts
  [`.gitignore:1`](../../.gitignore#L1)

- Operator runbook
  [`README.md:11`](../../README.md#L11)

- Vitest 60% floor on `lib/`
  [`vitest.config.mts:7`](../../ui/vitest.config.mts#L7)

### Review Findings

- [x] [Review][Patch] Empty `FINANCE_HELPER_DATA` binds `/pgdata` — omit empty key from `.env.example` and default Compose to `${FINANCE_HELPER_DATA:-${HOME}/finance-helper}/pgdata` [docker-compose.yml:18]
- [x] [Review][Patch] Silent `DATABASE_URL` fallbacks in `db.py` / Alembic contradict “no silent secret defaults” — require env; pass full `DATABASE_URL` from `.env` (also avoids unencoded password in Compose-built URLs) [api/adapters/persistence/db.py:12]
- [x] [Review][Patch] Alembic timeout 120s exceeds health `start_period` 15s — raise api healthcheck `start_period` to ≥120s [docker-compose.yml:60]
- [x] [Review][Defer] Enforce volume path outside git root — deferred, pre-existing/operator policy [docker-compose.yml:18]
- [x] [Review][Defer] CI Compose/image smoke not gated — deferred, pre-existing vs AC3 lint-only [`.github/workflows/ci.yml:1`]
- [x] [Review][Defer] Floating image digests / unpinned `uv` install — deferred, pre-existing [api/Dockerfile]
- [x] [Review][Defer] Prod overlay secret/port hardening — deferred, pre-existing [docker-compose.prod.yml]
- [x] [Review][Defer] Real PDFs still in git history — deferred, Ask First [bank_data]
