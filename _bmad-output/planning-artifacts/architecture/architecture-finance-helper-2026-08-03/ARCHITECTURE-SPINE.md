---
name: 'finance-helper'
type: architecture-spine
purpose: build-substrate
altitude: feature
paradigm: 'hexagonal / ports-and-adapters'
scope: 'finance-helper v1 thin vertical slice (upload → parse → store → shared-expenses) and bank-adapter extension surface'
status: final
created: '2026-08-03'
updated: '2026-08-03'
binds:
  - auth
  - lists
  - ingest
  - review
  - settle-up
  - adapters
sources:
  - '_bmad-output/planning-artifacts/prds/prd-finance-helper-2026-08-02/prd.md'
  - '_bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/EXPERIENCE.md'
  - '_bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/DESIGN.md'
  - '_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/stack-options.md'
companions:
  - '_bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/EXPERIENCE.md'
  - '_bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/DESIGN.md'
---

# Architecture Spine — finance-helper

## Design Paradigm

**Hexagonal / ports-and-adapters.** Domain (users, lists, membership, cards, dedup identity, import-session/batch commit, settle math, FX application) has no imports from Next.js, FastAPI routing, SQLAlchemy sessions, or PDF libraries. Driving adapters: bank parsers (`pdfplumber`), BCCR client, SMTP, Postgres repositories. Driven adapters: HTTP API (FastAPI), browser UI (Next.js).

Ingest is a **pipeline inside the application ring**, not the top-level paradigm: detect → split → parse → normalize → stage (Import Session) → review → commit (Import Batch).

```text
api/
  domain/           # pure rules; no framework/PDF imports
  application/      # use-cases / ports
  adapters/
    bank/           # one package per bank/product (+ Promerica stub)
    persistence/    # SQLAlchemy repos, Alembic
    fx/             # BCCR
    email/          # SMTP
  api/              # FastAPI routes, Pydantic DTOs, auth cookie edge
ui/                 # Next.js App Router standalone — Warm Balance; calls HTTP only
```

## Invariants & Rules

### AD-1 — Dependency shortlist [ADOPTED]

- **Binds:** all modules in `api/`, `ui/`
- **Prevents:** Second truth for dedup/ACL (Next→DB); parser/UI tangles; bank adapters calling each other or skipping review
- **Rule:**
  - **Allowed:** `ui` → HTTP API only; application → domain; bank adapters → return normalized rows to application; persistence adapters → Postgres; FX/email adapters → external systems
  - **Forbidden:** `ui` → Postgres/SQLAlchemy/parsers; bank adapter → commit/lists/membership; adapter ↔ adapter; domain → FastAPI/Next/pdfplumber/SQLAlchemy

```mermaid
flowchart LR
  UI[Next.js ui]
  HTTP[FastAPI routes]
  APP[application]
  DOM[domain]
  BANK[bank adapters]
  PG[(Postgres)]
  DISK[PDF volume]
  UI --> HTTP --> APP
  APP --> DOM
  APP --> BANK
  APP --> PG
  APP --> DISK
  BANK -.->|normalized rows only| APP
```

### AD-2 — Process topology [ADOPTED]

- **Binds:** deploy, ingest, NFR interactive review
- **Prevents:** Unnecessary Redis/worker in v1; overnight-batch mental model
- **Rule:** Compose services are exactly **`db`**, **`api`**, **`ui`** (+ host Traefik/Caddy-class reverse proxy). Detect/split/parse run **in-process** on `api` during the upload path. No job broker until measured NFR-12 pressure forces a worker.

### AD-3 — Durable state ownership [ADOPTED]

- **Binds:** persistence, uploads, quarantine, import sessions
- **Prevents:** Split brains (S3 + DB + files with unclear owners); PDF bytes in git
- **Rule:** PostgreSQL is the only durable store for users, lists, cards, import sessions/batches, candidate/committed rows, quarantine, FX snapshots/flags, aliases. Statement PDF bytes live on an **operator volume outside the repo**; Postgres stores path references only (not `bytea`, not object storage in v1).

### AD-4 — Import Session and Batch [ADOPTED]

- **Binds:** FR upload/review/commit/discard/rollback
- **Prevents:** Ad-hoc staging; unclear atomic rollback; partial-commit vs batch fights
- **Rule:**
  - **Import Session** = staging aggregate for one upload (statements + candidate rows). Review mutates the session. Discard drops only **uncommitted** session state.
  - **Import Batch** = journaled commit unit. v1 batch boundary = **one Statement’s accept/commit** (stable `batch_id` per statement). Multi-statement uploads may produce multiple batches under one session.
  - Rollback (FR-30) targets a `batch_id` atomically. Nothing reaches settle math until its batch commits.

### AD-5 — Money representation [ADOPTED]

- **Binds:** all amount fields, settle math, FX outputs
- **Prevents:** Float drift across TS/Python
- **Rule:** Postgres `NUMERIC` is source of truth; Python domain uses `Decimal`. Never `float` for money. Currency is an explicit ISO 4217 code beside the amount.

### AD-6 — Split remainder [ADOPTED]

- **Binds:** percentage splits that sum to 100%
- **Prevents:** Non-deterministic leftover subunit; per-user preference forks
- **Rule:** After floor-division of shares, any leftover minor unit goes to the **list creator**.

### AD-7 — FX conversion [ADOPTED]

- **Binds:** FR-40 CRC conversion for settle views
- **Prevents:** Silent wrong rates; per-builder BCCR vs other sources; mixed write-time/read-time CRC
- **Rule:** Authoritative source is **BCCR** daily rate for the purchase/statement date. If missing, use the **nearest prior** published BCCR date and **flag** rate-fallback. **No FX override in v1.** At commit of a non-CRC line, domain **materializes** `amount_crc`, `fx_rate`, `fx_rate_date`, `fx_fallback` beside the original `(amount, currency)`. Settle-up reads materialized CRC — it does not re-call BCCR per view.

### AD-8 — Auth session delivery [ADOPTED]

- **Binds:** FR-1–4, NFR auth; `ui`↔`api` cookies
- **Prevents:** XSS-exfiltratable Bearer tokens in `localStorage`
- **Rule:** Email+password with password reset via SMTP. Browser session is an **httpOnly Secure** cookie (JWT or opaque session id). Traffic is **same-origin** via reverse proxy and/or Next Route Handler BFF (`/api` → `api`). Bearer-in-client-storage is forbidden. Library may be fastapi-users or custom argon2 + signed cookies.

### AD-9 — Individual review gestures [ADOPTED]

- **Binds:** FR-17–18; EXPERIENCE J1 (supersedes soft PRD swipe OPEN)
- **Prevents:** Desktop-only button apps that skip phone swipe; swipe theatre on desktop; divergent L/R/D mappings across stories
- **Rule:** Phone Individual review **must** implement true swipe commits; desktop **must** use buttons as primary. Vectors: **right → chosen list** (after list picker), **left → configurable default list**, **down → skip**. Same three outcomes on desktop as labeled buttons. List picker precedes high-intent accept. Accessible non-gesture equivalents required (WCAG 2.2 AA product floor).

### AD-10 — Conflict match window and resolution [ADOPTED]

- **Binds:** FR-22 same-price; FR-28 hand-fixed↔re-parse
- **Prevents:** UI inventing match candidates; inconsistent windows; easy double-count via peer keep-both; divergent rules between conflict kinds
- **Rule:** Server computes candidates against **durable unresolved manual ledger entries** (not session-only buffers). Equal amount+currency on related lists. Window is **list-configurable**; product default **±3 calendar days** from the parsed row’s posted date. Resolution UI is shared: default **pick Manual or Parsed** (one survivor); escape **“Not the same expense”** keeps both only after confirm that warns of double-count / overpay risk; escape must be harder than the survivor pick (not an equal third peer action).

### AD-11 — CI fixtures [ADOPTED]

- **Binds:** adapter contract tests; release gate
- **Prevents:** Real PII in repo; CI that requires the operator machine
- **Rule:** CI uses **synthetic PDFs with known geometry** + golden expected rows. Real statements stay at a configured path outside the repo (operator-only tier).

### AD-12 — Visual / UX companion authority [ADOPTED]

- **Binds:** `ui` styling, IA, interaction choreography
- **Prevents:** shadcn/template defaults becoming brand; inventing IA that contradicts UX spines
- **Rule:** `DESIGN.md` + `EXPERIENCE.md` are **binding companions**. Warm Balance tokens / Soft-Ledger / IA / interaction primitives own product behavior and look. Architecture chooses stack only. Component kits may supply unstyled primitives only.

### AD-13 — Story branch naming [ADOPTED]

- **Binds:** all implementation work toward main
- **Prevents:** Shared long-lived branches; unclear epic/story ownership in git history
- **Rule:** One user story per branch named `<type>/<epic>/<us-id>` where `type` ∈ `feat` | `fix` | `chore` | `docs` | `refactor` | `test` | `ci`. Merge to `main` only via PR after CI (AD-15).

### AD-14 — Semantic versioning [ADOPTED]

- **Binds:** releases of the self-hosted Compose app
- **Prevents:** Independent drifting version numbers for `api` vs `ui` as the product version
- **Rule:** The deployable app is versioned as **one** SemVer (`vMAJOR.MINOR.PATCH`). Tags mark releases of the whole Compose system, not separate package lines.

### AD-15 — TDD and CI merge gate [ADOPTED]

- **Binds:** development process; PRs into `main`
- **Prevents:** Untested parser/domain landings; merge without automated checks
- **Rule:**
  - **Parsers and domain:** red → green TDD (failing test first, then implementation).
  - **UI:** test-after allowed, with an explicit coverage floor set at scaffold (must not go to zero).
  - **CI required before merge to `main`:** lint; `api` pytest including synthetic fixture goldens (AD-11); `ui` typecheck + lint; critical `ui` tests. Full Playwright e2e on every PR is **not** a v1 merge requirement.

### AD-16 — CanonicalLine contract [ADOPTED]

- **Binds:** adapters, staging, commit, ledger
- **Prevents:** JSON-blob staging vs typed commit mismatch
- **Rule:** Staging and ledger share one **CanonicalLine** field set: at least `posted_date` (ISO-8601), signed `amount`, ISO 4217 `currency`, `product_id`, `line_type`, `external_ref` when provided, `normalized_description`, `provenance` (`parser` | `hand`). `CANDIDATE_ROW` = CanonicalLine + session review fields only. Adapters MUST emit CanonicalLine; persistence MUST NOT store adapter-private shapes as the row body.

### AD-17 — Quarantine ownership [ADOPTED]

- **Binds:** FR-25–27, FR-43 incomplete disclosure
- **Prevents:** Session-only quarantine that vanish after commit while settle needs them
- **Rule:** Pre-commit unresolved rows live on the Import Session. After **accept-with-quarantine**, unresolved rows become **durable** entities owned by the committed **Statement** (statement marked incomplete). Hand-fix (FR-27) mutates those durable rows. Balance views MUST disclose incompleteness when any statement in the period has unresolved quarantine.

### AD-18 — Dedup identity authority [ADOPTED]

- **Binds:** FR-20, FR-34; adapter normalize; commit
- **Prevents:** Adapter-hashed keys vs domain fallback tuple divergence
- **Rule:** **Domain alone** computes canonical identity at commit. Primary: stable bank `external_ref` when adapter marks ref quality stable. Fallback: `(product_id, posted_date, currency, amount, normalized_description, line_type, statement_period_id)`. Adapters MUST NOT emit authoritative dedup keys (optional `ref_quality` hint only).

### AD-19 — List authorization [ADOPTED]

- **Binds:** all list-scoped reads/writes; invites
- **Prevents:** Implicit global read; two ACL schemes
- **Rule:** Users are peers. A user may read/write a list’s ledger and import into it only if they hold **membership** on that list (personal list auto-created at signup). Invite acceptance creates membership. No privileged product admin role in v1.

### AD-20 — Card registration [ADOPTED]

- **Binds:** FR-11, FR-16, FR-37 IBAN/card label
- **Prevents:** Orphan product_ids; competing card tables in UI vs API
- **Rule:** Cards are first-class durable entities owned by a user (label + routing identifiers such as IBAN). Parsed IBANs match existing cards; unknown IBANs block import progress via registration (label chosen by user) before commit of that statement. Card labels are the human import identifiers.

### AD-21 — v1 settle vs settlement payments [ADOPTED]

- **Binds:** FR-39–45; PRD v2 settlement OPEN
- **Prevents:** Double-counting statement transfers vs recorded payments; inventing a payment ledger in v1
- **Rule:** v1 settle-up is **computed shares only** (no recording of actual payments). Taxonomy MUST include a line type for inter-member transfers so such rows can be stored without feeding settle allocations. Recording/reconciling settlement payments is **out of v1**.

### AD-22 — Operational envelope [ADOPTED]

- **Binds:** deploy, environments, ops
- **Prevents:** Silent drift on backup/migrate/health
- **Rule:** Environments = **local** and **homelab prod** via Compose overlays sharing the same service graph. Alembic migrations run on `api` startup (or explicit one-shot) against the external PG volume — never recreate volume for schema. `api` and `ui` expose `/health`. Postgres + PDF volumes backed up by operator filesystem/volume snapshot. Secrets via Compose secrets/env outside repo. Observability floor: structured app logs + healthchecks (no third-party APM required in v1).

## Consistency Conventions

| Concern | Convention |
| --- | --- |
| Naming | Generic product vocabulary — no personal names in code/schema/fixtures; banks/products are adapter ids |
| Dates | Posted/cycle dates normalized to ISO-8601 calendar dates in `America/Costa_Rica` |
| IDs | Stable UUIDs for users, lists, cards, sessions, batches, committed rows |
| Money | `NUMERIC` + currency code; domain `Decimal`; see AD-5 |
| Canonical rows | AD-16 field set everywhere staging/ledger touch |
| Errors | Fail-loud on unknown/ambiguous detect and must-parse failure; structured JSON API errors; generic auth failures |
| Config | Secrets/SMTP/paths outside repo |
| Auth cookies | Same-site first-party; Secure in HTTPS |
| i18n | EN + ES from v1; keys in `ui`; preference remembered on account (Account menu); first visit from browser |
| Appearance | Light / Dark / System from Account menu; remembered on account; default System (OS/browser); Warm Balance token sets from DESIGN.md |
| Logging | No raw statement PII at info; correlate by session/statement/batch ids |
| Branches | `<type>/<epic>/<us-id>` — AD-13 |
| Versioning | Single app SemVer tag — AD-14 |
| Commits | Prefer Conventional Commits aligned with branch `type` |
| UX | EXPERIENCE/DESIGN bind IA/visual — AD-12 |

## Stack

Versions verified 2026-08-03 (`stack-options.md` + gate re-check). Code owns exact pins once scaffolding exists.

| Name | Version |
| --- | --- |
| Python (`api`) | 3.12+ |
| FastAPI | 0.141.x |
| Uvicorn | 0.52.x |
| Pydantic | 2.13.x |
| SQLAlchemy | 2.0.x |
| Alembic | 1.18.x |
| psycopg | 3.3.x |
| pdfplumber | 0.11.x |
| aiosmtplib | ≥5.1.2 (CVE-2026-55558 floor) |
| pytest | 9.x |
| Next.js (`ui`) | 16.2.x (`output: 'standalone'`) |
| React (via Next) | 19.2.x |
| react-pdf | 10.4.x (owns bundled `pdfjs-dist` — do not pin a conflicting standalone pdfjs) |
| @use-gesture/react | 10.3.x |
| PostgreSQL | 16.x (`postgres:16`) |
| Docker Compose | `db` + `api` + `ui` (+ host reverse proxy) |

Explicit rejects: Streamlit/Gradio/NiceGUI/Reflex as primary UI; Node-primary API for v1; SQLModel-as-HTTP-shape; PyMuPDF default without license decision; Bearer tokens in `localStorage`; mixed FX write-time/read-time CRC.

## Structural Seed

```text
repo/
  api/
    domain/
    application/
    adapters/bank/
    adapters/persistence/
    adapters/fx/
    adapters/email/
    api/
    tests/fixtures/pdf/   # synthetic only
  ui/                     # Next.js standalone
  docker-compose.yml
  docker-compose.prod.yml
  .env.example
  .github/workflows/ci.yml
```

```mermaid
flowchart TB
  browser[Browser]
  proxy[Host reverse proxy]
  ui[ui Next.js]
  api[api FastAPI]
  db[(db Postgres)]
  vol[PDF + PG volumes outside repo]
  browser --> proxy
  proxy --> ui
  proxy -->|"/api/*"| api
  ui -->|BFF or same-origin| api
  api --> db
  api --> vol
```

### Core entities (names + relationships only)

```mermaid
erDiagram
  USER ||--o{ LIST_MEMBERSHIP : has
  LIST ||--o{ LIST_MEMBERSHIP : has
  USER ||--o{ CARD : owns
  LIST ||--o{ IMPORT_SESSION : receives
  USER ||--o{ IMPORT_SESSION : uploads
  IMPORT_SESSION ||--|{ STATEMENT : contains
  STATEMENT ||--|{ CANDIDATE_ROW : stages
  STATEMENT ||--o|{ IMPORT_BATCH : commits_as
  IMPORT_BATCH ||--o{ LEDGER_ENTRY : writes
  STATEMENT ||--o{ QUARANTINE_ROW : incomplete
  LIST ||--o{ LEDGER_ENTRY : holds
  CARD ||--o{ STATEMENT : identifies
```

## Capability → Architecture Map

| Capability / Area | Lives in | Governed by |
| --- | --- | --- |
| Auth signup/signin/reset | `api` auth + SMTP; `ui` account | AD-8, AD-1, AD-22 |
| Lists, membership, splits, ACL | `domain` + persistence | AD-19, AD-5, AD-6 |
| Cards / IBAN registration | `domain` + persistence; `ui` interrupt | AD-20, AD-12 |
| Detect / split / parse / normalize | `adapters/bank/*` | Paradigm, AD-2, AD-11, AD-16 |
| Import Session review | `application` + `ui` | AD-4, AD-9, AD-12 |
| Commit / dedup / batch rollback | `domain` + persistence | AD-4, AD-16, AD-18 |
| Quarantine + incomplete disclosure | `domain` + settle views | AD-17 |
| PDF failure comparison | `ui` react-pdf + PDF path | AD-3, AD-12 |
| Same-price conflicts | `application` match | AD-10 |
| Settle-up / simplify CRC | `domain` + materialized FX | AD-5, AD-6, AD-7, AD-21 |
| Invites email | SMTP adapter | AD-8, AD-19 |
| CI / branches / SemVer | repo tooling | AD-11, AD-13, AD-14, AD-15 |
| Operator deploy | Compose + volumes/proxy | AD-2, AD-3, AD-22 |

## Deferred

| Item | Why it can wait |
| --- | --- |
| fastapi-users vs custom cookie sessions | Both satisfy AD-8 |
| Redis / background worker | Only if in-process parse misses NFR-12 |
| Traefik vs Caddy vs other proxy | Same-origin cookie contract matters; brand does not |
| Operator real-PDF harness UX | Policy locked (AD-11) |
| Settlement payment recording / double-count flows | AD-21: out of v1; taxonomy stub only |
| User FX override | Out of v1 (AD-7) |
| CSV/HTML format adapters | Contract allows; v1 PDF only |
| ML categorization / trends | PRD out of v1 |
| Exact UI coverage floor % | Set at `ui` scaffold (AD-15) |
| Playwright e2e every PR | Optional later |
| SemVer bump automation tooling | Policy locked; tool at scaffold |
| BCCR API transport details (token/endpoint codes) | Source/behavior locked in AD-7; wire format is implementation spike |
| Payer field / absolute sub-amount split UX edge cases | Product rules in PRD; implement under AD-5/6/19 without new paradigm |
