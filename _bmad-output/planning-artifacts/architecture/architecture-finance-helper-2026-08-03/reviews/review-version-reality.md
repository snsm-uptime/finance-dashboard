# Version & Reality Review — ARCHITECTURE-SPINE.md

**Reviewer lens:** Independent version/reality check — verify committed stack and technology decisions were web-researched or cross-checked against live registries, starters, and the existing repo (greenfield: no application code yet).

**Documents reviewed:**
- `ARCHITECTURE-SPINE.md` (draft, 2026-08-03)
- Cross-check: `stack-options.md` (versions claimed verified 2026-08-03)

**Review date:** 2026-08-03 (independent re-verification same day)

**Repo state:** Greenfield — no `api/` or `ui/` scaffold in repo; only planning artifacts and BMAD skills.

---

## Verdict

**CONDITIONAL PASS — stack table is largely accurate for 2026-08-03, but several committed decisions rely on asserted fit rather than cited verification, and one cross-check citation is wrong.**

The spine correctly delegates version pins to `stack-options.md` and most named packages exist at the cited minor lines on PyPI/npm/Docker Hub. Independent registry checks confirm the core triad (FastAPI + Next.js 16 + PostgreSQL 16) is current and viable. Gaps cluster around: (1) an incorrect `pdfjs-dist` version in stack-options citations, (2) AD-7 BCCR FX committed in the spine without integration research in stack-options, (3) greenfield Next.js starter defaults (Tailwind v4, Turbopack) not reconciled with AD-12 Warm Balance authority, and (4) maintenance/staleness signals on auth and gesture libraries not surfaced to implementers.

---

## Method

For each technology in the spine `## Stack` table and each named library in adopted decisions (AD-7–AD-12), this review:

1. Checked whether `stack-options.md` cites a registry source dated 2026-08-03.
2. Independently queried PyPI, npm, Docker Hub, and official docs (Aug 2026 context).
3. Checked greenfield starter defaults (`create-next-app@latest` / `--yes`) against structural seed assumptions.
4. Confirmed no existing project pins contradict the spine (repo is planning-only).

---

## Stack table — line-by-line verification

| Spine entry | Claimed | Independent check (2026-08-03) | Evidence | Status |
|---|---|---|---|---|
| Python (`api`) | 3.12+ | 3.14.6 latest stable; 3.13.14 maintained; 3.12 still supported | [python.org 3.14.6](https://www.python.org/downloads/release/python-3146/) | **OK** — floor valid; greenfield could justify 3.13+ but 3.12+ is conservative |
| FastAPI | 0.141.x | 0.141.1 on PyPI (2026-07-29) | [pypi.org/project/fastapi](https://pypi.org/project/fastapi/) | **OK** — cited in stack-options |
| Uvicorn | 0.52.x | 0.52.1 on PyPI | [pypi.org/project/uvicorn](https://pypi.org/project/uvicorn/) | **OK** — **not** in stack-options External citations list |
| Pydantic | 2.13.x | 2.13.4 on PyPI (2.14.0a1 exists) | [pypi.org/project/pydantic](https://pypi.org/project/pydantic/) | **OK** — **not** in stack-options citations |
| SQLAlchemy | 2.0.x | 2.0.51 on PyPI (2026-06-15) | [pypi.org/project/SQLAlchemy/2.0.51](https://pypi.org/project/SQLAlchemy/2.0.51/) | **OK** — cited |
| Alembic | 1.18.x | 1.18.5 on PyPI | [pypi.org/project/alembic/1.18.5](https://pypi.org/project/alembic/1.18.5/) | **OK** — cited |
| psycopg | 3.3.x | 3.3.4 on PyPI | [pypi.org/project/psycopg/3.3.4](https://pypi.org/project/psycopg/3.3.4/) | **OK** — **not** in stack-options citations |
| pdfplumber | 0.11.x | 0.11.10 on PyPI (2026-06-15) | [pypi.org/project/pdfplumber](https://pypi.org/project/pdfplumber/) | **OK** — cited; actively maintained |
| aiosmtplib | 5.x | 5.1.2 on PyPI (2026-06-20); patches CVE-2026-55558 | [pypi.org/project/aiosmtplib](https://pypi.org/project/aiosmtplib/) | **WARN** — pin should be **≥5.1.2**, not open `5.x` |
| pytest | 9.x | 9.1.1 on PyPI (2026-06-19) | [pypi.org/project/pytest](https://pypi.org/project/pytest/) | **OK** — **not** in stack-options citations |
| Next.js (`ui`) | 16.2.x | 16.2.12 on npm (2026-07-25) | [npmjs.com/package/next](https://www.npmjs.com/package/next) | **OK** — cited |
| React (via Next) | 19.2.x | 19.2.8 on npm (2026-07-21) | [github.com/react/react/releases](https://github.com/react/react/releases) | **OK** — cited |
| react-pdf (+ pdfjs-dist) | 10.4.x | react-pdf 10.4.1 on npm; **bundles pdfjs-dist 5.4.296** | [npmjs.com/package/react-pdf](https://www.npmjs.com/package/react-pdf), [github wojtekmaj/react-pdf package.json](https://github.com/wojtekmaj/react-pdf/blob/main/packages/react-pdf/package.json) | **FAIL citation** — stack-options cites `pdfjs-dist@6.2.108` which does **not** match react-pdf 10.4.1's dependency |
| @use-gesture/react | 10.3.x | 10.3.1 on npm; **last release 2024-03-21** | [npmjs.com/package/@use-gesture/react](https://www.npmjs.com/package/@use-gesture/react) | **WARN** — version accurate; library stale ~2+ years |
| PostgreSQL | 16.x (`postgres:16`) | `postgres:16.14` on Docker Hub; PG 18 is `latest` | [hub.docker.com/_/postgres](https://hub.docker.com/_/postgres) | **OK** — intentional pin; note PG 18 PGDATA breaking change avoided |
| Docker Compose | db + api + ui | Standard Compose v2 pattern; Next `output: 'standalone'` still documented | [next.js examples/with-docker](https://github.com/vercel/next.js/blob/canary/examples/with-docker/README.md) | **OK** |

### Auth libraries (deferred at scaffold, referenced in stack-options)

| Entry | Claimed | Check | Status |
|---|---|---|---|
| fastapi-users | 15.x | 15.0.5 on PyPI; **maintenance mode** — no new features, successor planned | [pypi.org/project/fastapi-users](https://pypi.org/project/fastapi-users/) | **WARN** — viable but sunset trajectory |
| argon2-cffi | 25.x | 25.1.0 on PyPI | [pypi.org/project/argon2-cffi/25.1.0](https://pypi.org/project/argon2-cffi/25.1.0/) | **OK** — not in stack-options citations |

---

## Adopted decisions — technology reality

### AD-7 — BCCR authoritative FX (committed in spine, open in stack-options)

**Spine:** BCCR daily rate; nearest prior + flag on missing date; no user override v1.

**stack-options.md:** Listed "Authoritative FX rate source" under **Still open** and "FX rate source and missing-date behavior still architecture-owned" under Open risks — **not** resolved in stack research.

**Web reality (verified):**
- BCCR is the correct official source for CRC exchange rates ([BCCR SDDE API standard](https://gee.bccr.fi.cr/indicadoreseconomicos/Documentos/DocumentosMetodologiasNotasTecnicas/Estandar_API_SDDE.pdf)).
- Access requires **subscription registration** and bearer token ([BCCR subscription page](https://www.bccr.fi.cr/indicadores-economicos/suscripci%C3%B3n-a-indicadores)).
- Legacy SOAP web service still documented; SDDE REST API is the modern path.
- Third-party wrappers exist (e.g. TicoRates, bccr-exchange-rates npm) but spine commits to BCCR directly.

**Finding:** AD-7 is **architecturally sound** but **not web-researched in stack-options** before spine adoption. Scaffold must account for operator BCCR token provisioning, indicator codes (USD buy/sell), and weekend/holiday fallback behavior — none documented.

**Severity:** Medium — functional commitment without integration spec.

---

### AD-8 — Auth session delivery

**Technologies:** httpOnly Secure cookies; fastapi-users **or** custom argon2 + signed cookies.

**Reality:**
- Pattern is current best practice for self-hosted browser apps.
- fastapi-users 15.0.5 exists but PyPI README states **maintenance mode** (2026).
- Custom argon2-cffi 25.1.0 is actively maintained.

**Finding:** Cookie model verified; **fastapi-users maintenance status not reflected** in spine or stack-options decision matrix. Recommend biasing scaffold toward custom sessions unless fastapi-users coverage is required immediately.

**Severity:** Low–Medium — not wrong, but choice may age poorly.

---

### AD-9 — Individual review gestures (@use-gesture/react)

**Reality:** 10.3.1 is latest; no releases since March 2024. React 19 peer compatibility via broad peer range (`>=16.8`). Library is widely used (5M+ weekly downloads) but **low maintenance velocity** for a v1 hard requirement (true swipe on phone).

**Finding:** Version pin accurate; **maintenance risk not assessed** in stack-options. Desktop buttons fallback reduces blast radius.

**Severity:** Low — monitor; consider `@use-gesture/vanilla` or native Pointer Events if issues arise.

---

### AD-11 / AD-12 — CI fixtures & UI kit authority

**pdfplumber:** Active (0.11.10, June 2026). Fit for BAC text-layer PDFs confirmed; PyMuPDF AGPL reject remains valid.

**react-pdf:** 10.4.1 current. Worker/cMaps/Docker asset paths flagged as open risk in stack-options — **still valid**; spine references react-pdf but doesn't cite worker bundling constraints ([react-pdf docs](https://www.npmjs.com/package/react-pdf)).

**AD-12 vs create-next-app defaults:** Next.js 16 `create-next-app --yes` enables **TypeScript, ESLint, Tailwind CSS (v4), App Router, Turbopack**, import alias `@/*`, and **AGENTS.md** ([Next.js installation docs v16.2](https://nextjs.org/docs/app/getting-started/installation)). Spine structural seed shows bare `ui/` with no mention of:
- Stripping/replacing default Tailwind v4 theme with Warm Balance tokens
- Choosing Webpack vs Turbopack for Docker production build
- Node **20.9+** minimum for Next 16 ([version-16 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16))

**Finding:** Greenfield starter defaults **not reality-checked** against AD-12. Implementers will inherit Tailwind-heavy scaffold unless explicitly overridden at init.

**Severity:** Medium — cosmetic/structural drift risk, not a version error.

---

### AD-2 / AD-3 — Compose topology & Postgres

**Verified:**
- Three-service Compose (`db`, `api`, `ui`) matches current self-hosting patterns.
- `postgres:16` → 16.14 tag exists; volume-outside-repo aligns with NFR-9.
- PostgreSQL 18 is Docker Hub `latest` with **PGDATA path change** — pinning 16 avoids unplanned migration ([Docker Hub postgres notes](https://hub.docker.com/_/postgres)).

**Finding:** **OK** — deliberate conservative DB major.

---

### Explicit rejects — spot check

| Reject | Still valid? | Notes |
|---|---|---|
| Streamlit/Gradio/NiceGUI/Reflex as primary UI | Yes | Next.js 16 covers gestures + PDF pane |
| Lucia auth | Yes | Deprecated ([lucia-auth.com](https://lucia-auth.com/)) — cited in stack-options |
| Bearer in localStorage | Yes | Still discouraged |
| PyMuPDF default without license | Yes | pdfplumber MIT default reasonable |
| Node-primary API | Yes | Research record only |

---

## stack-options.md citation audit

**Cited with specific versions (2026-08-03):**
- npm: next@16.2.12, react@19.2.8, react-pdf@10.4.1, **pdfjs-dist@6.2.108** ❌, @use-gesture/react@10.3.1
- PyPI: fastapi@0.141.1, sqlalchemy@2.0.51, alembic@1.18.5, pdfplumber@0.11.10, fastapi-users@15.0.5, aiosmtplib@5.1.2
- Docker Hub: postgres:16 / 16.14

**In stack table but NOT in External citations:**
- Uvicorn 0.52.x
- Pydantic 2.13.x
- psycopg 3.3.x
- pytest 9.x
- argon2-cffi 25.x

**Incorrect citation:**
- `pdfjs-dist@6.2.108` — react-pdf 10.4.1 depends on **pdfjs-dist@5.4.296**. Pinning 6.x independently would risk worker API mismatch. Spine should say "via react-pdf (pdfjs-dist 5.4.x)" or omit separate pdfjs-dist pin.

---

## Greenfield starter reality — Next.js `ui` service

When scaffold lands, `create-next-app@16` with recommended defaults will produce:

| Default | Spine expectation | Gap |
|---|---|---|
| App Router | App Router ✓ | None |
| TypeScript | Implied ✓ | None |
| Tailwind CSS v4 | Warm Balance custom tokens (AD-12) | **Must replace `@import "tailwindcss"` theme**, not inherit template palette |
| Turbopack dev | Not specified | Acceptable; confirm prod Docker build uses intended bundler |
| ESLint | AD-15 CI lint ✓ | None |
| `output: 'standalone'` | Required for Docker | **Not a create-next-app default** — must add to `next.config` manually (stack-options mentions it; spine structural seed does not) |
| Node 20.9+ | Not in spine stack table | **Add to ui Docker base image constraint** |

**Python `api` starter:** No FastAPI scaffold exists. stack-options mentions `uv` lockfiles as preference but spine stack table omits `uv` — tooling choice deferred; not a version error.

---

## Items asserted without 2026-08-03 verification

These appear in the spine as policy or fit statements without registry/starter cross-check in stack-options:

1. **WCAG 2.2 AA** — still the applicable W3C recommendation (published 2023); not re-cited but not obsolete.
2. **America/Costa_Rica timezone** — domain convention; no library version involved.
3. **Traefik/Caddy-class reverse proxy** — generic; no version pin required v1.
4. **SemVer single app tag** — process policy.
5. **BCCR nearest-prior fallback semantics** — reasonable for central banks; **not validated against BCCR publication calendar** (weekends/holidays).
6. **In-process parse sufficient for NFR-12** — performance assertion; no benchmark cited (acceptable deferral).

---

## Recommendations (for spine / scaffold handoff)

1. **Fix pdfjs-dist citation** in stack-options and spine: `react-pdf 10.4.x` → bundled `pdfjs-dist 5.4.x`; do not pin 6.x separately.
2. **Tighten aiosmtplib pin** to `>=5.1.2` (STARTTLS CVE-2026-55558).
3. **Document BCCR integration** in spine or a companion adapter note: subscription token env, indicator code(s), SDDE REST endpoint, fallback rules — close the AD-7 vs stack-options open-item gap.
4. **Add greenfield scaffold checklist** to structural seed: `output: 'standalone'`, Node 20.9+, strip Tailwind defaults per AD-12, react-pdf worker copy in Dockerfile.
5. **Note fastapi-users maintenance mode** in Deferred section; bias custom argon2 unless speed-to-auth wins.
6. **Complete stack-options External citations** for Uvicorn, Pydantic, psycopg, pytest (or spine should not claim blanket "verified" for uncited lines).
7. **Flag @use-gesture/react staleness** as low-risk watch item for AD-9.

---

## Summary table

| Category | Count |
|---|---|
| Verified OK | 14 stack lines |
| WARN (accurate but incomplete/stale) | 5 |
| FAIL (wrong cited version) | 1 (pdfjs-dist) |
| Adopted decision without prior research | 1 (AD-7 BCCR integration) |
| Greenfield starter gaps | 2 (Tailwind defaults, standalone config) |

---

*Review performed independently of stack-options authorship. Registry checks used PyPI, npm, Docker Hub, and official project documentation as of 2026-08-03.*
