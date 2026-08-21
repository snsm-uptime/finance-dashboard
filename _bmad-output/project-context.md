---
project_name: finance-helper
user_name: Sebas
date: '2026-08-03'
sections_completed:
  - technology_stack
  - language_rules
  - framework_rules
  - testing_rules
  - code_quality
  - workflow_rules
  - dont_miss_rules
existing_patterns_found: 5
status: complete
rule_count: 119
optimized_for_llm: true
sources:
  - _bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/stack-options.md
  - _bmad-output/specs/spec-finance-helper/SPEC.md
  - _bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/EXPERIENCE.md
  - "verified against live code in ui/ (Stories 3.1, 3.3, 3.4, 3.6) — 2026-08-14"
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
- i18n: EN+ES keys for all product chrome — implemented as **per-domain TS message objects** (`ui/lib/i18n/<domain>.ts`, e.g. `listsMessages = { en: {...}, es: {...} } as const`), **not** JSON files or a translate-hook. Add new copy as a new key on both `en` and `es` in the matching domain file (create a new domain file only if no existing one fits)
- Styling (AD-23 / Epic 3.5): **Tailwind utilities co-located** by default; `*.module.scss` only for custom styles; **no new `*.module.css`**
- Tokens: Warm Balance + Soft-Ledger via CSS vars / Tailwind theme bridge — do not re-pick DESIGN.md hexes; no kit/purple default themes; no pill primary CTAs

#### Shared

- UUIDs for users, lists, cards, sessions, batches, rows
- Logs: no raw statement PII at info; correlate via session/statement/batch ids
- Code/fixtures: generic vocabulary only — no personal names, real IBANs, or owner nicknames hardcoded

### Framework-Specific Rules

#### Hexagonal layout (`api/`)

- Layout: `domain/` | `application/` | `adapters/{bank,persistence,fx,email}` | `api/` (routes)
- ORM/SQLAlchemy models live under **`adapters/persistence` only** — not in `domain/`
- Bank adapters: emit `CanonicalLine` only — never commit, touch lists/membership, or call other adapters (AD-1, AD-16)

#### Import pipeline — commit semantics

- **Import Session** = staging for one upload (review mutates; discard drops uncommitted only)
- **Import Batch** = one **commit action** (bulk: one statement; individual: one candidate row). Partial commit is normal; `ledger_entries.import_candidate_row_id UNIQUE` is the double-commit backstop (amended AD-4)
- **Delete** (up, Individual UI in 4.13) = no ledger for that row · **Dismiss file** = abandon remaining uncommitted in the session
- **Rollback** = undo a committed `batch_id` (not “delete some rows”)
- Individual review unit = transaction; up → delete; undo is button-only (AD-9) — **UI lands in 4.13**
- Flow: detect → split → parse → normalize → Session → review → Batch
- Quarantine: on Session pre-commit; after accept-with-quarantine → **durable on Statement** (incomplete) (AD-17)
- Unknown IBAN: **block review** until label + IBAN registered (AD-20)
- Fixed-list vs review-routing attaches to the **registered card** (not a global account default)
- Clean commit + no unresolved quarantine → **delete PDF + clear path**; else retain (AD-3). Individual review: retain through ImportReviewSheet until **Save** (not last pending assign)

#### FastAPI / domain — settle invariants

- Membership ACL only (AD-19); `/health`; Alembic on external volume — never recreate volume for schema (AD-22)
- FX at commit (BCCR) → materialize CRC fields; **no FX override**; settle reads materialized CRC (AD-7)
- Split remainder after floor-division → **list creator** (AD-6)
- Settle-up = computed shares only — no payment ledger writes (AD-21)

#### Next.js (`ui/`)

- App Router + `output: 'standalone'`
- `DESIGN.md` + `EXPERIENCE.md` **win over mocks** (ignore “Mark settled”)
- Individual: phone swipe R/L/D; desktop buttons; **list picker before** high-intent accept; a11y equivalents (AD-9)
- Bulk = whole upload → one list; Individual = per statement
- PDF comparison: `react-pdf`; phone PDF lower half; **only on failure**
- Warm Balance / Soft-Ledger — kits unstyled only (AD-12)
- Incomplete disclosure **below** strip — never over hero amount
- Account: EN/ES + Light/Dark/System — not Settings; Simplify never says “paid”

#### Verified Soft-Ledger UI conventions (live in repo since Story 3.1 — grep before inventing new names)

- **Tokens:** all Warm Balance / Soft-Ledger CSS custom properties are defined once in `ui/app/globals.css`: `--muted`, `--surface`, `--border`, `--background`, `--accent`, `--owe`, `--owed`, `--strip-inset`, `--space-1`…`--space-6`, `--page-gutter`, `--nav-x`, `--row-y`, `--rounded-sm/md/lg/full`, `--type-<role>-face/size/weight/tracking/lh` (roles: `brand`, `list-title`, `strip-who`, `strip-amount`, `section-label`, `body`, `meta`, `amount-inline`, `button`, `tab`). These are the real names — **not** `--color-muted`, `--spacing-4`, or other guessed `--color-*`/`--spacing-*` forms that have shown up in draft story text.
- **Dark mode:** a `html.dark` class (toggled by `PreferencesProvider`, Story 1.6) redefines the same variable names; a `@media (prefers-color-scheme: dark)` block only covers the pre-hydration flash. Components reference the token once (e.g. `color: var(--muted)`) and get both themes for free — never write a second dark-mode-specific rule block.
- **Component location:** Soft-Ledger primitives live at `ui/components/soft-ledger/<Name>.tsx` + a co-located `<Name>.module.css` (e.g. `BalanceStrip.tsx`, `Hint.tsx`). There is **no** `ui/components/index.ts` barrel — every component is imported by its direct path (`@/components/soft-ledger/<Name>`).
- **Component tests:** all Soft-Ledger primitives share one file, `ui/components/soft-ledger/soft-ledger.test.tsx` (jsdom env, `react-dom/client` `createRoot`/`act`, `.module.css` mocked via a `Proxy`-based `vi.mock`). Add new component tests there — don't create a new per-component `__tests__/` file.
- **List-detail / shared-expenses view:** it's `ui/app/lists/[listId]/page.tsx` (App Router; async Server Component using `cookies()`/`fetch`), not a `pages/` directory path. It is never rendered directly in tests — pure, testable logic is extracted into a plain exported function (see `balanceStripPropsFrom` in that file) and unit-tested in a sibling `page.<feature>.test.ts`.

#### Conflicts

- Server candidates; Manual|Parsed survivor; “Not the same expense” after harder confirm (AD-10); not swipe

### Testing Rules

#### Discipline (AD-15)

- Parsers/domain: red → green TDD. UI: test-after; coverage floor set in Story 1.1 (never invent % earlier; never zero once set)
- Merge to `main`: lint · api pytest + synthetic goldens · ui typecheck/lint · critical ui tests — not full Playwright every PR

#### Fixtures — two-tier (AD-11)

- CI/release gate: synthetic PDFs in `api/tests/fixtures/pdf/` + goldens. Operator real PDFs: never in repo/CI; don’t block merge on them
- BAC credit synthetic = exit bar; re-import twice → no dupes + imported N / skipped M
- Promerica stub covers multi-statement; ≥1 parse-failure fixture with **extracted rows + visible gap** (not an empty PDF)
- Don’t treat text-extract→rebuild PDF as layout-faithful unless geometry is controlled

#### Must-cover edges

- Dual-column: prefer nonzero; both nonzero → **CRC**
- Split remainder → **list creator**; money asserts use `Decimal` — never float
- FX port: cover **missing date → nearest prior + `fx_fallback`**; never live BCCR in CI
- Same-price: default ±3 days; different currency ≠ match
- Multi-statement: one fail/skip doesn’t discard siblings
- Quarantine accept with zero good rows allowed; PDF retained until resolved / deleted on clean commit
- ACL: non-member denied on **read and write** (expenses, import, settle)
- When auth/invite stories exist: generic auth errors; unregistered invite → land on inviting list

#### Layers

- Unit: domain Decimal + fake FX
- Contract: CanonicalLine + fail-loud detect
- Integration: Session → Batch on **Postgres 16** (not SQLite stand-in)
- UI critical minimum: Individual review outcomes (incl. non-gesture) · Manual|Parsed conflict · incomplete disclosure under strip — expand in later stories, don’t replace with a single smoke test

#### Anti-patterns

- PII in goldens · settle math only in browser · UI without adapter tests · float money asserts · SQLite-as-prod-stand-in · empty failure fixtures · FX tests that never set `fx_fallback`

### Code Quality & Style Rules

#### Structure

- Seed: `api/` (hex) · `ui/` (Next standalone) · compose files · `.env.example` · `.github/workflows/ci.yml`
- New bank = adapter + fixtures — not core forks
- **v1:** no Nx/Turborepo (or similar) — keep three-service Compose

#### Naming & secrets

- Branches: `<type>/<epic>/<us-id>` (feat|fix|chore|docs|refactor|test|ci)
- Generic vocabulary in code/schema/fixtures — no personal names / real account ids; card labels are user data, not enums
- API wire snake_case; map at UI edge
- Never commit `.env` or secrets — `.env.example` placeholders only; runtime secrets via Compose env/secrets **outside** the repo

#### Lint / format

- Lock **one** api linter/formatter and **one** ui lint+typecheck toolchain in Story 1.1 — then obey (don’t bikeshed tool choice mid-feature)
- Prefer Conventional Commits aligned with branch `type` (not a substitute for CI)
- Single app **SemVer** for the Compose deployable (AD-14)

#### Docs

- Comments = non-obvious invariants only; ACs own FR/UX-DR traceability
- On conflict: Spine / SPEC / PRD / this file win over README or research notes

#### UI footguns (spines win)

- `DESIGN.md` + `EXPERIENCE.md` own look/behavior — kits = unstyled primitives only
- Don’t ship: kit default/purple theme · pill primary CTAs · “Mark settled” / Simplify “paid” framing
- After Epic 3.5: do not reintroduce CSS Modules; prefer Tailwind; SCSS modules for custom only (AD-23)

### Development Workflow Rules

#### Story execution

- Path: sprint planning → create story → validate → dev-story. **Start at Story 1.1** — no freestyle features first
- **One story per branch:** `<type>/<epic>/<us-id>` — no stacking stories
- Order & independence: follow `epics.md` (Epic N must not need Epic N+1)
- Gates: Epic 5 **5.9/5.10 after 5.1–5.8 (J3+J7)** · **3.2–3.4** as J5→J2 slice · FR-10 done only with UI (3.2) · **FR-43 done only at 5.4** (3.6 = slot only) · **Epic 3.5 (Tailwind/SCSS) after Epic 3 product 3.5–3.6; before Epic 4**
- Language/theme still required (Epic 1 / UX-DR10) even without FR ids
- **Before `done`:** short how/why overview (request path, key components, why, what not to break) — see `_bmad-output/implementation-artifacts/story-close-overview-checklist.md`

#### Git / PR / version

- PR-only merge to `main` after CI green; no force-push to `main`; don’t normalize `--no-verify`
- Conventional Commits preferred (align with branch `type`)
- One Compose **SemVer**; dependency bumps via `chore/` PRs after lockfiles exist
- Never commit real statements/PII/`bank_data` — gitignore operator data/PDF paths at scaffold

#### While coding

- EXPERIENCE/DESIGN spines win over mocks — no settlement CTAs; phone swipe + desktop buttons (AD-9)

#### Deploy

- Shared `db`/`api`/`ui` graph; local/homelab **overlays** only — don’t fork base compose per env
- Alembic on external volume (never recreate for schema); `/health` on api+ui; volumes outside repo

### Critical Don't-Miss Rules

#### Never

- `float` for money · JSON number amounts · client-side FX/share math
- Bearer tokens in `localStorage` · `ui` → DB/parsers · domain → FastAPI/SQLAlchemy/pdfplumber
- Commit real PDFs/PII · dual-pin standalone `pdfjs-dist` · add Redis/worker “just in case”
- Silent detect/mis-associate bank · auto-merge same-price/manual-vs-parsed · equal-status keep-both conflict button
- Record payments / “Mark settled” / Simplify saying “paid”
- Recreate Postgres volume to “fix” migrations · SQLite as prod stand-in in integration tests

#### Always

- Hex ports: adapters emit CanonicalLine; **domain** owns dedup identity at commit
- `batch_id` = one **commit action** (bulk: one statement; individual: one candidate row); Session ≠ Batch; rollback = batch undo
- Quarantine durable on Statement after accept-with-quarantine; disclose incomplete **under** strip
- Unknown IBAN blocks until registration; card routing on registered card
- Clean commit + no quarantine → delete PDF + clear path
- BCCR FX materialized at commit (`fx_fallback` when nearest-prior); remainder → list creator
- Individual review unit = transaction; phone swipe R/L/U (up → delete) + list picker first; undo is button-only; desktop buttons; a11y non-gesture path (AD-9 — UI in 4.13)
- Warm Balance / Soft-Ledger from spines — kits unstyled only
- Synthetic CI goldens gate release; operator real PDFs never block merge

#### Source of truth order

1. `ARCHITECTURE-SPINE.md` + this `project-context.md`
2. `SPEC.md` + `DESIGN.md` / `EXPERIENCE.md`
3. `prd.md` / `epics.md`
4. Research notes / README / mocks (lose on conflict)

---

## Usage Guidelines

**For AI Agents:**

- Read this file before implementing any code
- Follow ALL rules exactly as documented
- When in doubt, prefer the more restrictive option
- Update this file if new patterns emerge after scaffold (especially lockfile pins and lint toolchain)

**For Humans:**

- Keep this file lean and focused on agent needs
- Update when technology stack or ADs change
- Review after Epic 1 scaffold and quarterly thereafter
- Remove rules that become obvious once living code encodes them

Last Updated: 2026-08-14 (added "Verified Soft-Ledger UI conventions" — real CSS token names, i18n mechanism, component/test locations — after Story 3.6 found the original scaffold-time doc still described planned-but-superseded names)
