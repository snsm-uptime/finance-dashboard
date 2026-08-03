# Stack options — finance-helper

Greenfield stack research for architecture spine fill-in. Versions verified against npm/PyPI/Docker Hub on **2026-08-03**. No application code assumed.

**Selected topology (operator decision):** Docker Compose with three parallel services — `db` (PostgreSQL), `api` (Python FastAPI), `ui` (Next.js) — with the Postgres data volume on a **local host path outside the repository**.

## Capability inventory

| ID | Source | Constraint | Hard must-haves |
| --- | --- | --- | --- |
| `web-api` | PRD Overview; Scope — In (web upload + shared-expenses); NFR-3, NFR-9 | committed | Authenticated HTTP API serving browser clients; list-membership ACL; self-hosted container |
| `auth` | PRD Users and roles; Account surface; FR-1–FR-4; NFR-1, NFR-10 | committed | Email/password signup, sign-in, sign-out, password reset; adaptive password hashing; email verification only if required for invites/recovery; no profile/settings product surface |
| `db` | PRD NFR-9, NFR-13; Scope — PostgreSQL; Brief Operational model (migrations — retained via reconcile) | committed | PostgreSQL in Docker; volume **outside** repo; schema migrations without discarding volume |
| `pdf-pipeline` | PRD Statement ingestion; Parsing contract; FR-14–15, FR-31–36; research-landscape §3; addendum BAC credit map | committed | Pluggable adapters: **detect → split → parse → normalize → import batch**; BAC text-layer PDF first; Spanish dates; dual-column CRC/USD collapse; fail-loud detect/must-parse; Promerica stub; walmart fixture acceptance bar |
| `pdf-ui` | PRD FR-25, FR-27; Form factor; EXPERIENCE J3 / Parse comparison pane; NFR-7 | committed | Render original PDF beside extracted rows on failure; phone: PDF in **lower half**; editable quarantine resolution on phone viewport |
| `review-ui` | PRD FR-17–18; Review modes; EXPERIENCE Interaction Primitives / J1; NFR-7; Open: swipe vs pattern | committed | Individual one-at-a-time review; phone directional commit (swipe preferred); desktop **buttons** primary; accessible non-gesture equivalents (WCAG 2.2 AA); list picker before high-intent accept |
| `async` | PRD NFR-12 Interactive import review | preference / soft | Review stays interactive (not overnight batch); async worker only if detect/split/parse risks blocking UX — not mandated as separate Compose service for v1 |
| `import-tx` | PRD FR-20, FR-26, FR-29–30; NFR-4–5; Parsing identity/dedup | committed | Journaled import batches; quarantine accept; idempotent dedup; reassignment; full batch rollback |
| `email` | PRD FR-3, FR-7; NFR-10; Account surface | committed | SMTP (or equivalent) for invites + password reset only |
| `containers` | PRD NFR-9; Operator role; Scope; operator decision | committed | Compose: `db` + `api` + `ui` as parallel services; Postgres volume on server-local path outside repo |
| `testing` | PRD Acceptance; Constraints (fixtures, two-tier); FR-35–36; research-landscape beangulp pattern | committed | Adapter contract tests; anonymized/synthetic repo fixtures as release gate; real statements only on operator machine; Promerica stub covers multi-statement |
| `non-goals` | PRD Scope — Out; EXPERIENCE Out of v1 UI; brief deferred items retained | out-of-v1 | No charts/trends dashboards; no ML categorization product; no FX product UI beyond purchase/statement-date CRC conversion; no settlement ledger; no CSV/HTML format impl (contract must allow later); no Plaid/Belvo; no CLI |

## Current preferences map

### Committed

- Self-hosted **web** app (not CLI): upload, review, shared-expenses, invites.
- **PostgreSQL** in Docker with data volume outside the repo; migrations required (NFR-13).
- **Email/password** auth + transactional email (invites, password reset).
- Adapter pipeline **detect → split → parse → normalize → import batch**; Promerica stub; walmart acceptance bar.
- Phone + desktop review; failure comparison with PDF; quarantine/human override.
- CRC settle-up with purchase/statement-date FX conversion (supersedes brief “no FX”).
- List membership model (supersedes per-product shared boolean).
- EN + ES UI strings; WCAG 2.2 AA; Warm Balance tokens / Soft-Ledger hybrid behavior (DESIGN/EXPERIENCE) — **not** a UI-kit brand.
- **Deploy shape:** Compose services `db` \| `api` \| `ui` in parallel (operator decision, 2026-08-03).

### Preference-only

- **Streamlit** named in PRD Form factor as preference explicitly **not** a commitment; PRD lists its gaps (rerun model, no native gestures, no first-class PDF viewer, weak responsive).
- Brief: Python / `uv` / SQLAlchemy preferred for CLI-era tool — informational only after web supersession; still informative for `api` tooling (`uv` lockfiles inside the API image/build).
- Literal **swipe** for individual review: preferred presentation where client supports it; review-one-at-a-time pattern is the hard requirement (`[OPEN — UX/architecture]`).
- Research-landscape: **pdfplumber** as default for new Python statement work; `bac_tools` (pdfplumber) as Costa Rican BAC credit prior art.

### Superseded

- CLI surface (`import`, `shared-total`, `detect`) and pip/pipx/uv tool packaging as the product (PRD § Relationship to the product brief; reconcile-brief).
- Local single-file DB + filesystem-copy backup → Postgres container + external volume.
- Multi-user excluded / Monse as passive beneficiary → peer accounts.
- Per-product shared boolean → named lists + membership + splits.
- Separate CRC/USD shared totals with no FX → CRC settlement with FX (FR-40).
- Calendar-month period → statement/billing-cycle period (FR-39).
- Vite SPA as preferred UI shell → **Next.js** container as the `ui` service (operator decision).
- Node-primary API (Hono/Fastify) as equals-weight option → FastAPI `api` service locked; Node stack remains research record only.

### Still open

- Auth session model across `ui`↔`api` (cookie on shared reverse-proxy host vs Bearer JWT) — cookie sessions preferred for self-hosted peers; exact BFF vs direct-browser-to-api boundary undecided.
- Whether `api` needs a fourth Compose service (Redis + ARQ worker) for NFR-12 on typical BAC PDFs — default: no, parse in `api` process first.
- Ingress: Traefik / Caddy / nginx as optional fourth service vs host reverse-proxy in front of Compose-published ports.
- How anonymized fixtures preserve positional layout fidelity (PRD Constraints — highest technical risk).
- Authoritative FX rate source (architecture-owned).
- ORM auth package choice inside FastAPI (`fastapi-users` vs small custom argon2 sessions).

## Node backend candidates

| Candidate | Role | Scores (capability IDs) | Notes |
| --- | --- | --- | --- |
| **Hono** | `web-api` | `web-api`: fit; `containers`: fit; `async`: partial | Viable alternate if API were Node; **not selected** — FastAPI owns `api`. |
| **Fastify** | `web-api` | `web-api`: fit; `containers`: fit | Same as Hono — research only. |
| **NestJS** | `web-api` | `web-api`: fit; `async`: fit | Overweight for v1; not selected. |
| **Express** | `web-api` | `web-api`: partial | Not selected. |
| **Drizzle ORM + drizzle-kit** | `db` | `db`: fit; `import-tx`: fit | Would pair with Node API; superseded by SQLAlchemy on `api`. |
| **Prisma** | `db` | `db`: fit; `import-tx`: partial | Not selected. |
| **Better Auth** | `auth` | `auth`: fit; `email`: fit | Node auth; not selected with FastAPI `api`. |
| **Lucia** | `auth` | `auth`: poor | Deprecated — do not use. |
| **pdf.js (`pdfjs-dist`)** | `pdf-pipeline` | `pdf-pipeline`: partial | Server-side parse not selected; **client** PDF viewing still uses pdfjs via `react-pdf` in `ui`. |
| **pdf-parse** | `pdf-pipeline` | `pdf-pipeline`: poor | Reject for BAC adapter. |
| **BullMQ (+ Redis)** | `async` | `async`: fit; `containers`: partial | Node-only path; Python equivalent is ARQ if ever needed. |
| **Nodemailer** | `email` | `email`: fit | Not selected — `aiosmtplib` on `api`. |

## Python backend candidates

| Candidate | Role | Scores (capability IDs) | Notes |
| --- | --- | --- | --- |
| **FastAPI (+ Uvicorn)** | `web-api` | `web-api`: fit; `async`: fit; `containers`: fit | **Selected** as Compose `api` service. |
| **Django (+ Django Ninja or DRF)** | `web-api` | `web-api`: fit; `auth`: fit; `db`: fit | Fit but heavier; not selected. |
| **SQLAlchemy 2 + Alembic + psycopg** | `db` | `db`: fit; `import-tx`: fit | **Selected** for `api` ↔ `db`. |
| **Django ORM + migrations** | `db` | `db`: fit | Only with Django — not selected. |
| **fastapi-users** or custom sessions (**argon2-cffi** + signed cookies) | `auth` | `auth`: fit; `email`: fit | Leading auth options for `api`. |
| **pdfplumber** | `pdf-pipeline` | `pdf-pipeline`: fit | **Selected** for BAC adapters inside `api`. |
| **PyMuPDF** | `pdf-pipeline` | `pdf-pipeline`: partial | AGPL risk — fallback only with license decision. |
| **Camelot / tabula-py** | `pdf-pipeline` | `pdf-pipeline`: poor | Rejected as default. |
| **ARQ (+ Redis)** | `async` | `async`: fit; `containers`: partial | Optional fourth service later — not in v1 Compose baseline. |
| **Celery** | `async` | `async`: fit; `containers`: partial | Heavier than needed for v1. |
| **aiosmtplib** | `email` | `email`: fit | **Selected** for invites/reset from `api`. |
| **pytest + golden fixtures** | `testing` | `testing`: fit | Adapter contract tests run in CI / `api` image. |

## Node UI candidates

| Candidate | Role | Scores (capability IDs) | Notes |
| --- | --- | --- | --- |
| **Next.js (React)** | `review-ui`, `pdf-ui` | `review-ui`: fit; `pdf-ui`: fit; `containers`: fit | **Selected** as Compose `ui` service. App Router + optional Route Handlers as BFF to `api`; `output: 'standalone'` for Docker. Warm Balance tokens — no kit brand. |
| **React + Vite (SPA)** | `review-ui`, `pdf-ui` | `review-ui`: fit; `pdf-ui`: fit; `containers`: fit | Fit alternate; superseded by Next.js operator choice. |
| **Vue + Vite / Nuxt** | `review-ui`, `pdf-ui` | `review-ui`: fit; `pdf-ui`: fit | Not selected. |
| **SvelteKit** | `review-ui`, `pdf-ui` | `review-ui`: fit; `pdf-ui`: partial | Not selected. |
| **react-pdf (`pdfjs-dist`)** | `pdf-ui` | `pdf-ui`: fit | **Selected** inside Next.js for failure comparison pane. |
| **shadcn/ui (optional primitives only)** | design system | preference | Usable only as unstyled primitives under Warm Balance tokens. |
| **@use-gesture/react** | `review-ui` | `review-ui`: fit | Phone directional commits; desktop buttons primary. |

## Python UI candidates

| Candidate | Role | Scores (capability IDs) | Notes |
| --- | --- | --- | --- |
| **Streamlit** | `review-ui`, `pdf-ui` | `review-ui`: poor; `pdf-ui`: poor; `web-api`: partial | **Reject for v1 primary UI.** |
| **Gradio** | `review-ui`, `pdf-ui` | `review-ui`: poor; `pdf-ui`: poor | Reject. |
| **NiceGUI** | `review-ui`, `pdf-ui` | `review-ui`: partial; `pdf-ui`: partial | Reject vs Next.js `ui` service. |
| **Reflex** | `review-ui`, `pdf-ui` | `review-ui`: partial; `pdf-ui`: partial | Reject vs Next.js `ui` service. |
| **FastHTML / htmy-style** | `review-ui`, `pdf-ui` | `review-ui`: partial; `pdf-ui`: poor | Reject. |
| **Python API + separate JS UI** | `review-ui`, `pdf-ui` | `review-ui`: fit; `pdf-ui`: fit | **Selected shape:** FastAPI `api` + Next.js `ui` (not a Python UI kit). |

## Docker Compose baseline — `db` + `api` + `ui`

Parallel services only for v1. No Redis/worker service until NFR-12 evidence requires it.

| Service | Image / build | Role | Speaks to | Persist |
| --- | --- | --- | --- | --- |
| `db` | `postgres:16` | PostgreSQL | only `api` on internal network | **Bind/named volume on server local path outside repo** (e.g. `/var/lib/finance-helper/pgdata` or `$HOME/finance-helper/pgdata`) |
| `api` | Build from repo `api/` (Python 3.12+, FastAPI/Uvicorn) | Auth, lists, upload, detect→split→parse→normalize→import, settle-up APIs, SMTP | `db`; receives calls from `ui` (and/or edge proxy) | Ephemeral; statements/uploads in DB or tmp inside container, never in git |
| `ui` | Build from repo `ui/` (Next.js standalone) | Phone/desktop Warm Balance UI; gestures; `react-pdf` comparison | Browser ↔ `ui`; `ui` → `api` (server-side and/or browser via public API URL) | Ephemeral |

### Compose contracts (implementation-ready)

- **Networks:** one user-defined bridge; `db` not published to host unless operator debug needs it; publish `ui` (and optionally `api`) behind host TLS reverse-proxy.
- **Depends-on:** `api` waits for `db` healthy (`pg_isready`); `ui` waits for `api` healthy (HTTP `/health`).
- **Env:** `DATABASE_URL=postgresql+psycopg://…@db:5432/…` only in `api`; `API_INTERNAL_URL=http://api:8000` for Next server-side fetches; `NEXT_PUBLIC_API_URL` only if browser calls `api` directly (prefer same-origin proxy via Next Route Handlers or edge reverse-proxy `/api` → `api` to keep cookies simple).
- **Migrations:** run Alembic as `api` entrypoint step (or one-shot Compose `api` command) against external volume — never recreate volume for schema changes (NFR-13).
- **Secrets:** SMTP + session secret via Compose `secrets` or env files **outside** repo; never commit (NFR-2).
- **Resources:** typical BAC PDFs stay in-process on `api` (NFR-12); raise `api` memory limits before adding a worker service.

```text
[browser] → [host TLS / optional caddy] → ui:3000
                                      └→ /api/* → api:8000 → db:5432
                                                      ▲
                                              volume: host path outside repo
```

## Recommended stack — selected (Compose: Postgres + FastAPI + Next.js)

- **Web/API (`api`):** **Python 3.12+** + **FastAPI** `0.141.x` + **Uvicorn** `0.52.x` (+ **Pydantic** `2.13.x`)
- **UI (`ui`):** **Next.js** `16.2.x` (React `19.2.x`); Warm Balance CSS variables / Manrope+Petrona per DESIGN (no kit brand); App Router; Docker `output: 'standalone'`
- **Auth:** Session cookies on `api` (e.g. **fastapi-users** `15.x` or custom **argon2-cffi** `25.x` + secure cookies); password reset + SMTP; prefer same-origin cookie path via proxy/BFF
- **DB/ORM/migrations (`db` + `api`):** **PostgreSQL 16** + **SQLAlchemy** `2.0.x` + **Alembic** `1.18.x` + **psycopg** `3.3.x`
- **PDF pipeline (`api`):** **pdfplumber** `0.11.x` primary (MIT); `bac_tools` as reference only
- **PDF/UI review (`ui`):** **`react-pdf`** `10.4.x` + **`@use-gesture/react`** `10.3.x`; desktop review buttons; accessible action alternatives
- **Async:** in-process on `api` first; add Compose `worker` + Redis only if proven necessary
- **Email:** **aiosmtplib** `5.x` from `api`
- **Containers:** Compose services **`db`**, **`api`**, **`ui`** in parallel; Postgres volume on server-local path **outside** repository
- **Testing:** **pytest** on `api` (adapter golden fixtures); Next/Vitest for UI behaviors as needed; operator-local real `bank_data/` suite
- **Rationale:** FastAPI + pdfplumber own BAC multi-statement parse risk; Next.js owns gesture + PDF split-pane + phone settle-up; Compose three-service topology matches NFR-9 and operator host-volume preference without a Python UI kit.

## Recommended stack — alternate (Node-primary — not selected)

Retained for contrast only. Would replace `api` with Hono + Drizzle + Better Auth and keep a Node UI — loses pdfplumber/`bac_tools` prior art for BAC adapters.

- **Web/API:** Node.js 22/24 LTS + Hono `4.12.x`
- **UI:** Next.js `16.2.x` or React+Vite
- **Auth:** Better Auth `1.6.x`
- **DB:** PostgreSQL 16 + Drizzle `0.45.x` / drizzle-kit `0.31.x`
- **PDF pipeline:** pdfjs-dist server-side (higher FR-35 risk)
- **Containers:** same three-service Compose shape (`db` / `api` / `ui`) with host volume outside repo
- **Rationale (why not chosen):** weaker positional PDF ecosystem for Costa Rican BAC credit layouts.

## Hybrid

**Separate Node API + Python PDF worker + Next UI not recommended for v1.** Selected stack already splits languages by concern (`api` Python parse/domain, `ui` Next presentation). A fourth language boundary (Node API + Python worker) adds auth/upload hop cost without benefit while FastAPI remains the API. Revisit only if `api` must become Node for non-parse reasons.

## Explicit rejects

| Option | Why rejected (cite PRD/UX) |
| --- | --- |
| **Streamlit / Gradio / NiceGUI / Reflex as `ui`** | PRD Form factor + EXPERIENCE J1/J3: gestures, PDF lower half, desktop buttons, responsive Soft-Ledger — Next.js `ui` service selected instead. |
| **Vite SPA as selected `ui`** | Fit, but operator chose Next.js for Compose `ui` (middleware/BFF/standalone image). |
| **Lucia auth package** | Deprecated. |
| **pdf-parse / text-only extractors as BAC adapter** | Dual-column positional BAC layouts (research-landscape + fixtures). |
| **Plaid / Belvo / cloud statement converters** | No CR BAC/Promerica coverage; conflicts NFR-2. |
| **Camelot/tabula as default** | Ruled-table/JVM assumptions unsuitable as default. |
| **PyMuPDF as default without license decision** | AGPL vs later open-source posture; prefer pdfplumber. |
| **Charts/trends/ML/settlement ledger/CSV-HTML impl / CLI** | PRD Scope — Out. |
| **SQLite / single-file DB** | Superseded by NFR-9 PostgreSQL. |
| **Postgres volume inside the repo** | NFR-9 / NFR-2 — volume must live on operator server path outside git. |
| **shadcn (or any kit) as brand** | DESIGN/EXPERIENCE: Warm Balance owns identity. |

## Architecture handoff

Paste-ready content for ARCHITECTURE-SPINE.md `## Stack`.

### Preferred recommendation (Compose: `db` + FastAPI `api` + Next.js `ui`)

| Name | Version |
| --- | --- |
| Python (`api`) | 3.12+ (container image; latest stable as of 2026-08-03) |
| FastAPI | 0.141.x |
| Uvicorn | 0.52.x |
| Next.js (`ui`) | 16.2.x |
| React (via Next) | 19.2.x |
| SQLAlchemy | 2.0.x |
| Alembic | 1.18.x |
| psycopg | 3.3.x |
| Auth (email/password sessions) | fastapi-users 15.x **or** custom argon2-cffi 25.x + secure cookies |
| pdfplumber | 0.11.x |
| react-pdf (+ pdfjs-dist) | 10.4.x |
| @use-gesture/react | 10.3.x |
| aiosmtplib | 5.x |
| pytest | 9.x |
| postgresql | 16.x (Docker Hub `postgres:16`) |
| docker-compose / container layout | Parallel services: `db`, `api`, `ui`. Postgres bind/named volume on **server-local path outside repository**. Internal bridge network; publish `ui` (and API via reverse-proxy or Next BFF). Optional Redis/worker **not** in v1 baseline. |

### Alternate recommendation (Node-primary — not selected)

| Name | Version |
| --- | --- |
| Node.js | 22 LTS (or 24 LTS) |
| Hono | 4.12.x |
| Next.js | 16.2.x |
| Drizzle ORM | 0.45.x |
| drizzle-kit | 0.31.x |
| Better Auth | 1.6.x |
| pdfjs-dist (server-side parse) | 5.x / 6.x (latest stable as of 2026-08-03) |
| react-pdf | 10.4.x |
| @use-gesture/react | 10.3.x |
| Nodemailer | 7.x |
| postgresql | 16.x |
| docker-compose / container layout | Same three-service shape; Postgres volume outside repo |

### Open risks for architecture coaching

- Positional PDF fixture fidelity after anonymization (PRD Constraints — release gate vs real layout).
- Cookie session Domain/Path/SameSite across `ui`↔`api` when both are separate Compose services — mitigate with same-origin reverse-proxy or Next Route Handler BFF.
- Mono-process `api` parse vs future `worker` service for multi-statement BAC uploads under NFR-12.
- Next.js `standalone` image size / pdfjs worker asset paths in Docker.
- Streamlit (and pure-Python UI kits) already rejected — do not reopen without new evidence.
- PyMuPDF AGPL if substituted for speed without a license decision.
- FX rate source and missing-date behavior still architecture-owned (FR-40 `[OPEN]`).

## Citations

- PRD: `_bmad-output/planning-artifacts/prds/prd-finance-helper-2026-08-02/prd.md` (Form factor/Streamlit; Parsing contract; FR-1–45; NFR-1–13; Scope In/Out; Constraints fixtures)
- UX: `_bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/EXPERIENCE.md` (IA, J1/J3, Interaction Primitives, Accessibility); `DESIGN.md` (Warm Balance; UI kit unspecified)
- Brief/reconcile: `briefs/brief-finance-helper-2026-08-01/brief.md`, `addendum.md`; `prds/.../reconcile-brief.md`; `research-landscape.md` (pdfplumber, bac_tools, beangulp, no Plaid/Belvo for CR)
- Architecture open slots: `architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md` (`## Stack` pending)
- Operator decision (2026-08-03): Docker Compose parallel services `db` (Postgres, host-local volume outside repo) + `api` (FastAPI) + `ui` (Next.js)
- External (2026-08-03):
  - npm: `next@16.2.12`, `react@19.2.8`, `react-pdf@10.4.1`, `pdfjs-dist@6.2.108`, `@use-gesture/react@10.3.1`
  - PyPI: `fastapi@0.141.1`, `sqlalchemy@2.0.51`, `alembic@1.18.5`, `pdfplumber@0.11.10`, `fastapi-users@15.0.5`, `aiosmtplib@5.1.2`
  - Docker Hub: `postgres:16` / `16.14`
  - Lucia deprecation: https://lucia-auth.com/
  - BAC prior art: https://git.posixlycorrect.com/fabian/bac_tools (pdfplumber)
  - Local fixture smoke: `bank_data/BAC_CRED_WALMART_jun.pdf` — text-layer BAC credit statement, dual CRC/USD columns, Spanish dates (`pdftotext -layout`)
