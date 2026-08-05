# finance-helper

A self-hosted web app that turns bank statement PDFs into a queryable, shared financial record.

Costa Rican banks aren't covered by aggregation services — neither Plaid nor Belvo reaches BAC or Promerica — so statements are the only data source. This project uploads those PDFs, detects which bank and product they came from, parses them into canonical transactions, and stores them in a database that several people can share.

## Status

Epic 1 in progress. Compose services `db`, `api`, and `ui` boot with `/health`. Signup creates an account + personal list (Story 1.2).

## Run locally

Prerequisites: Docker Compose, and enough disk for a Postgres volume **outside** this repository.

```bash
cp .env.example .env
# Optional: set FINANCE_HELPER_DATA to an absolute path outside the repo.
# If omitted, Compose defaults to $HOME/finance-helper.
mkdir -p "${FINANCE_HELPER_DATA:-$HOME/finance-helper}/pgdata"
```

### Hot reload (day-to-day development)

Bind-mounts source and runs `uvicorn --reload` + `next dev`:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

Edit files under `api/` or `ui/` and refresh — no image rebuild needed for most code changes. After dependency changes (`api/pyproject.toml` / `ui/package.json`), rebuild that service.

### Production-like images (no hot reload)

```bash
docker compose up --build
```

Compose reads `.env` via `env_file` (no silent secret defaults). `DATABASE_URL` for `api` is built from `POSTGRES_*` (URL-encode special characters in the password).

Health checks:

- API: http://localhost:8000/health
- UI: http://localhost:3000/health
- Signup: http://localhost:3000/signup

Homelab overlay (same service graph, Secure cookies default on):

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

## API tests

### Canonical Compose path

Runs pytest inside the `api` service against Compose Postgres (`db:5432`). The test overlay installs the `dev` group and replaces the API CMD — default prod images stay `--no-dev`.

```bash
docker compose -f docker-compose.yml -f docker-compose.test.yml run --rm --build api
```

### Host path (CI parity)

Matches `.github/workflows/ci.yml`: host `uv` + a Postgres reachable on `localhost:5432` (CI service container). Base Compose does **not** publish `db:5432`, so do not point `DATABASE_URL` at unpublished Compose `db`.

```bash
cd api
uv sync --group dev
DATABASE_URL=postgresql+psycopg://finance:finance_ci@localhost:5432/finance_helper \
  SESSION_SECRET=ci-session-secret-not-for-prod \
  SESSION_COOKIE_SECURE=false \
  EMAIL_VERIFICATION_REQUIRED=false \
  uv run pytest -q
```

Optional footnote: a personal port-publish overlay or `socat` can expose Compose `db` for host pytest — not the documented primary path.

## Layout

```text
api/     FastAPI hexagonal seed (domain | application | adapters | api)
ui/      Next.js App Router (output: standalone)
```

Postgres data and future statement PDFs live under `FINANCE_HELPER_DATA` on the host — never commit real statements or `.env`. Operator samples may live in a local `bank_data/` folder (gitignored).

## How it works

**Lists** are the organizing concept. A list is a named container of spending that transactions land in. Every user gets a personal list on signup and can create more, then share any of them by email. Splits are defined per member, so a list can be divided unevenly among more than two people.

**Ingestion** decomposes an upload into statements — one BAC PDF can carry several cards — and each statement is reviewed before anything is committed, either in bulk to a single list or one at a time. Re-uploading is safe: canonical identity dedup absorbs duplicates silently and reports what was added versus skipped.

**Parsing fails loudly.** A statement that can't be parsed cleanly is never stored automatically. Instead the source PDF is rendered beside the extracted items so you can see what was missed, then either accept it with the unparsed rows quarantined or discard it. Quarantined rows can be typed in by hand, and every row records whether it came from the parser or a person. Any balance computed over an incomplete statement says so.

## Scope for v1

Upload, parse, store, and one shared-expenses view per list — a thin vertical slice that proves the whole architecture end to end.

In: BAC PDF parsing for walmart, eco, dolares, and colones; email-and-password auth with list invitations; PostgreSQL persistence; a mobile-usable layout; batch rollback and statement reassignment; a Promerica stub proving the adapter contract extends.

Out: settlement ledgers, ML categorization, trends dashboards, FX conversion between CRC and USD, CSV/HTML statement formats, and the open-source release itself.

## Constraints

Nothing personal is committed. Real statements live outside the repository at a configured path, and no personal names, account identifiers, or transaction data appear in code, schema, or fixtures — the product is built with generic vocabulary so open-sourcing later needs no retrofit.
