---
project_name: finance-helper
user_name: Sebas
date: '2026-08-03'
sections_completed: ['technology_stack', 'language_rules']
existing_patterns_found: 0
status: generating
sources:
  - _bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/stack-options.md
  - _bmad-output/specs/spec-finance-helper/SPEC.md
  - _bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/EXPERIENCE.md
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

Source of truth: `ARCHITECTURE-SPINE.md` (wins over `stack-options.md` / README).
Do not re-open rejected stacks from research docs.
Pins: match majors; re-verify patches **only when creating lockfiles** (Story 1.1). After 1.1: lockfiles are pin truth — version bumps only via dedicated `chore/` PRs, not inside feature stories.

### Compose

- Services: `db` | `api` | `ui` only (+ host reverse proxy)
- **Do not** add Redis, workers, or a fourth app service in v1 unless a measured NFR-12 failure forces it (AD-2)
- Postgres **and** PDF volumes **outside** the repo; never commit real statements or PII (AD-3, AD-11)

### Versions

| Piece | Pin / floor |
|-------|-------------|
| PostgreSQL | 16.x (`postgres:16`) |
| Python | 3.12+ |
| FastAPI / Uvicorn / Pydantic | 0.141.x / 0.52.x / 2.13.x |
| SQLAlchemy / Alembic / psycopg | 2.0.x / 1.18.x / 3.3.x |
| pdfplumber | 0.11.x |
| aiosmtplib | ≥5.1.2 (floor) |
| pytest | 9.x |
| Next.js / React | 16.2.x standalone / 19.2.x |
| react-pdf | 10.4.x |
| @use-gesture/react | 10.3.x |

### UI authority

- Runtime: Next.js · Look: Warm Balance (`DESIGN.md`) — kits = unstyled primitives only

### Rejects

- Streamlit / Gradio / NiceGUI / Reflex as primary UI
- Node-primary API
- Pinning a second standalone `pdfjs-dist` alongside react-pdf
- Bearer in `localStorage`
- `float` money; mixed FX write-time vs read-time CRC
- Real bank PDFs / personal data in the repository

## Critical Implementation Rules

### Language-Specific Rules

#### Python (`api/`)

- Money: `Decimal` only — never `float` (AD-5). Persist `NUMERIC` + ISO 4217 beside amount
- JSON/API boundary: serialize money as **string** — never JSON numbers for amounts
- `api/domain`: **no** FastAPI / SQLAlchemy / pdfplumber imports (AD-1)
- Dedup identity: **domain at commit only** — adapters may hint `ref_quality`, never authoritative keys (AD-18)
- Schema changes: **Alembic only** — do not auto-create domain tables on startup
- Dates: ISO-8601 **calendar date strings**; posted/cycle boundaries in `America/Costa_Rica`
- Auth errors: generic — no email enumeration
- Fail loud: unknown/ambiguous detect and must-parse → structured JSON errors

#### TypeScript / React (`ui/`)

- Strict TS; no `any` on money, IDs, or API DTOs
- Map API DTOs at the HTTP edge; **domain/API wire names stay snake_case** (`posted_date`, `amount_crc`)
- Posted/cycle dates: keep as **date strings** from API — do not use JS `Date` for identity or cycle math
- Settle math and FX: **server-owned** — UI displays materialized CRC/originals; never recompute shares/FX in the browser
- Auth: httpOnly Secure cookie / same-origin BFF only — never Bearer in `localStorage` (AD-8)
- `ui` → HTTP only — no DB/parsers (AD-1)
- Secrets stay on `api` / env — never `NEXT_PUBLIC_*` for secrets
- i18n: EN+ES keys for all product chrome

#### Shared

- UUIDs for users, lists, cards, sessions, batches, rows
- Logs: no raw statement PII at info; correlate via session/statement/batch ids
- Code/fixtures: generic vocabulary only — no personal names, real IBANs, or owner nicknames hardcoded

