<!-- Executable research prompt. When run, write the report to:
     _bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/stack-options.md -->

# Stack options research — finance-helper

You are a technical researcher selecting an implementation stack for **finance-helper**, a planning-only greenfield project. There is no application code yet. Do not invent implemented packages or assume a stack is already chosen.

## Goal

1. Inventory the **types** of tools, libraries, and capabilities the product requires.
2. Map **current / inherited preferences** from planning artifacts (committed vs preference-only vs superseded).
3. Find concrete **Node** and **Python** options for **backend** and **UI**.
4. Recommend two complete stacks (Node-primary and Python-primary) ready to fill the architecture spine stack table.

Optimize for Costa Rican bank-statement **PDF ingest**, shared expense lists, phone-friendly review (gestures + PDF side-by-side), and self-hosted Postgres — not generic fintech aggregators (no Plaid/Belvo coverage for BAC/Promerica).

## Required inputs

Read these before concluding. Prefer primary paths; use supersession notes when brief and PRD disagree.

| Priority | Path |
| --- | --- |
| Binding | `_bmad-output/planning-artifacts/prds/prd-finance-helper-2026-08-02/prd.md` |
| Context | `_bmad-output/planning-artifacts/prds/prd-finance-helper-2026-08-02/research-landscape.md` |
| Superseded ops | `_bmad-output/planning-artifacts/briefs/brief-finance-helper-2026-08-01/brief.md` |
| Superseded ops | `_bmad-output/planning-artifacts/briefs/brief-finance-helper-2026-08-01/addendum.md` |
| Reconciliation | `_bmad-output/planning-artifacts/prds/prd-finance-helper-2026-08-02/reconcile-brief.md` |
| UX experience | `_bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/EXPERIENCE.md` |
| UX design | `_bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/DESIGN.md` |
| Open stack slots | `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md` |

Optional fixtures for PDF reality checks: `bank_data/` (local BAC samples; do not commit real statements).

When web search is available, verify that recommended libraries are still maintained and suitable for self-hosted Docker deployment. Cite sources.

## Constraints

- Greenfield selection against planning artifacts only — no fictional existing codebase.
- Streamlit is a **preference, not a commitment** (PRD). Architecture must deliver gestures, PDF rendering, and responsive phone/desktop review; reject options that cannot.
- UI kit is **unspecified** in DESIGN/EXPERIENCE; do not treat shadcn or any kit as brand. Warm Balance / Soft-Ledger constrain visual/behavior outcomes, not framework.
- v1 non-goals: charts/trends, ML categorization, FX CRC↔USD product, settlement ledgers, CSV/HTML formats (adapter contract must allow later), Plaid/Belvo.
- PostgreSQL in Docker with data volume **outside** the repository is required.
- Email/password auth: signup, sign-in, password reset; email verification only if required for invites or recovery.
- Adapter contract: **detect → split → parse → normalize** (+ import batch). Promerica is a stub/extension surface.
- Recommendations must be **implementation-ready** for ARCHITECTURE-SPINE `## Stack` rows (name + version when known, or “latest stable as of \<date\>”).

---

## Capability taxonomy

Fill every row. Use these exact capability IDs.

| ID | Capability type |
| --- | --- |
| `web-api` | Web API / app server |
| `auth` | Auth (email/password, session or token model, password reset) |
| `db` | PostgreSQL access + schema migrations |
| `pdf-pipeline` | PDF detect → split → parse → normalize (pluggable bank adapters) |
| `pdf-ui` | PDF rendering in UI (phone split-pane: source vs extracted) |
| `review-ui` | Gestural / responsive review UI (phone swipe + desktop buttons) |
| `async` | Background/async jobs for parse if interactive upload must not block forever |
| `import-tx` | Transactional import, quarantine, rollback, reassignment |
| `email` | Outbound email (invites, password reset) |
| `containers` | Containerized self-host (app + Postgres volume outside repo) |
| `testing` | Adapter contract tests, fixtures, anonymization constraints |
| `non-goals` | Explicit v1 non-goals (charts, Plaid, FX product, ML, CSV/HTML impl) |

---

## Analysis phases

Execute in order. Do not skip phases.

### Phase A — Capability map

For each taxonomy ID, produce:

- **Requirement source** (PRD FR/NFR, UX journey, brief — with section/heading citations)
- **Constraint** (hard must-have vs soft preference vs out of v1)
- **Hard must-haves** (concrete: e.g. “phone lower-half PDF”, “fail-loud parse”, “migrations without discarding volume”)

### Phase B — Current / inherited preferences

Separate into three lists:

1. **Committed** by PRD/NFR (must satisfy)
2. **Preference-only** (e.g. Streamlit mention; Python/`uv`/SQLAlchemy from brief if still informative)
3. **Superseded** (CLI + single-file DB → authenticated web + Postgres; cite reconciliation)

State clearly what is **not** chosen: web framework, ORM, PDF library, UI kit, process topology (mono vs worker).

### Phase C — Options matrix

For **backend** and **UI** separately, propose concrete frameworks/libraries in **Node** and **Python**.

Score each candidate against relevant capability IDs using:

| Score | Meaning |
| --- | --- |
| `fit` | Strong match for finance-helper constraints |
| `partial` | Usable with gaps or extra work |
| `poor` | Conflicts with PRD/UX hard requirements |

Minimum candidates to evaluate (expand if research finds stronger peers):

**Backend (Node):** Express/Fastify/Hono or Nest; Prisma or Drizzle; Passport/Lucia/Auth.js pattern or equivalent; PDF libs (pdf-parse, pdfjs, pdf-lib, etc.); job runner if needed.

**Backend (Python):** FastAPI or Django/Django Ninja; SQLAlchemy or Django ORM + Alembic/Django migrations; auth library appropriate to framework; PDF libs (pdfplumber, PyMuPDF, Camelot/tabula where table layout needs it); Celery/ARQ/RQ if needed.

**UI (Node):** React/Next, Vue/Nuxt, Svelte/SvelteKit, or solid SPA + Vite — prioritize PDF viewer libraries, touch gestures, responsive layout, and ability to implement Warm Balance without inheriting a kit’s brand.

**UI (Python):** Streamlit, Gradio, NiceGUI, Reflex, FastHTML, or “Python API + separate JS UI” — score honestly against gestures + PDF side-by-side + phone layout.

### Phase D — Recommended stacks

Produce exactly two complete stacks:

1. **Node-primary** — backend + UI + shared infra (Postgres, auth, PDF pipeline, email, containers, test approach)
2. **Python-primary** — same coverage

Each stack must list concrete package names and intended roles.

Add a **hybrid note** only if evidence shows Node-UI + Python-PDF-worker (or the reverse) is clearly superior for BAC multi-statement PDF work; otherwise state “hybrid not recommended for v1” with a one-line reason.

### Phase E — Decision handoff

Fill architecture candidates and risks (see Output → Architecture handoff). Do not edit ARCHITECTURE-SPINE.md unless the user explicitly asks; prepare the table content for paste-in.

---

## Output format

Write the report to:

`_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/stack-options.md`

Use this structure exactly:

```markdown
# Stack options — finance-helper

## Capability inventory

| ID | Source | Constraint | Hard must-haves |
| --- | --- | --- | --- |
| ... | ... | committed / preference / out-of-v1 | ... |

## Current preferences map

### Committed
- ...

### Preference-only
- ...

### Superseded
- ...

### Still open
- ...

## Node backend candidates

| Candidate | Role | Scores (capability IDs) | Notes |
| --- | --- | --- | --- |
| ... | ... | ... | ... |

## Python backend candidates

| Candidate | Role | Scores (capability IDs) | Notes |
| --- | --- | --- | --- |
| ... | ... | ... | ... |

## Node UI candidates

| Candidate | Role | Scores (capability IDs) | Notes |
| --- | --- | --- | --- |
| ... | ... | ... | ... |

## Python UI candidates

| Candidate | Role | Scores (capability IDs) | Notes |
| --- | --- | --- | --- |
| ... | ... | ... | ... |

## Recommended stack — Node-primary

- Web/API: ...
- UI: ...
- Auth: ...
- DB/ORM/migrations: ...
- PDF pipeline: ...
- PDF/UI review: ...
- Async (if any): ...
- Email: ...
- Containers: ...
- Testing: ...
- Rationale: ...

## Recommended stack — Python-primary

(same fields as Node-primary)

## Hybrid

...

## Explicit rejects

| Option | Why rejected (cite PRD/UX) |
| --- | --- |
| ... | ... |

## Architecture handoff

Paste-ready content for ARCHITECTURE-SPINE.md `## Stack`.

### Preferred recommendation (state Node-primary or Python-primary)

| Name | Version |
| --- | --- |
| <runtime> | <version> |
| <web-framework> | <version> |
| <ui> | <version> |
| <orm-or-query> | <version> |
| <migration-tool> | <version> |
| <auth> | <version> |
| <pdf-parse-library> | <version> |
| <pdf-ui-viewer> | <version> |
| <email> | <version> |
| postgresql | <version> |
| docker-compose / container layout | <note> |

### Alternate recommendation (the other primary stack)

| Name | Version |
| --- | --- |
| ... | ... |

### Open risks for architecture coaching

- Positional PDF fixture fidelity after anonymization
- Streamlit (or other rejected UI) gaps for gestures / PDF viewer / responsive review
- Mono-process vs parse worker topology
- Auth session model (cookie session vs JWT) for self-hosted peers
- Any other risks discovered during research

## Citations

- PRD: ...
- UX: ...
- Brief/reconcile: ...
- External (if web search used): ...
```

---

## Quality bar

- Every taxonomy ID appears in the capability inventory.
- At least two Node and two Python candidates appear for backend; at least two each for UI.
- Scores reference capability IDs, not vague “good/bad”.
- Rejects include Streamlit assessment against PRD phone PDF + gesture requirements — accept or reject with evidence.
- Handoff tables use stack **Name | Version** rows suitable for direct paste into ARCHITECTURE-SPINE.
- No fintech-aggregator-first recommendations that ignore Costa Rican PDF reality.
