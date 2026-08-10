# Sprint Change Proposal — Tailwind + SCSS styling stack

**Date:** 2026-08-10  
**Project:** finance-dashboard (finance-helper)  
**Trigger:** Mid-Epic 3 stakeholder preference — simplify UI styling with Tailwind in components; SCSS only for custom styles  
**Mode:** Batch  
**Status:** Approved 2026-08-10 (Sebas)

---

## 1. Issue summary

Soft-Ledger / Warm Balance shipped in Story **3.1** on **CSS Modules** + `ui/app/globals.css` custom properties. The codebase now has **19** `*.module.css` files (including `lists.module.css` ~955 lines) consumed across list, auth, account, and Soft-Ledger surfaces. Continuing Epic 4–5 UI on that pattern will multiply file-splitting and make component styles harder to keep co-located.

**Desired change:** Prefer **Tailwind CSS utility classes in components** for routine layout/chrome; use **SCSS** only when custom styles are needed (complex selectors, animations, non-utility patterns). Preserve **AD-12**: Warm Balance / Soft-Ledger still own look; no kit/purple theme inheritance.

**Evidence:**
- `ui/package.json` has no `tailwindcss` / `sass` deps today (Next was scaffolded without Tailwind)
- Architecture review already flagged: if Tailwind is used, **must replace** starter theme with Warm Balance tokens — not inherit template palette (`review-version-reality.md`)
- Story 3.1 done; 3.5–3.6 `ready-for-dev`; Epic 4 backlog is UI-heavy (upload, review, comparison)

**Not a product-requirement failure** — tooling/DX convention change mid-sprint.

---

## 2. Impact analysis

### Checklist status (batch)

| Section | Item | Status |
|---------|------|--------|
| 1.1 Trigger story | Revealed during Epic 3 Soft-Ledger work (post 3.1–3.4), not a single AC failure | [x] Done |
| 1.2 Core problem | Strategic DX pivot: CSS Modules sprawl → Tailwind-in-component + SCSS for custom | [x] Done |
| 1.3 Evidence | 19 modules; large `lists.module.css`; no Tailwind installed; AD-12 + review notes | [x] Done |
| 2.1 Current epic (3) | Product stories remain completable; styling work must be tracked separately | [x] Done |
| 2.2 Epic-level changes | **Add Epic 3.5** (styling migration); do not redefine Epic 3 product scope | [x] Done — applied |
| 2.3 Remaining epics | Epic 4–5 UI stories inherit new convention; no FR text change | [x] Done |
| 2.4 Obsolete / new | No epic obsolete; Epic 3.5 required to avoid dual-stack forever | [x] Done |
| 2.5 Resequence | Finish Epic 3 product (3.5–3.6) → Epic 3.5 styling → Epic 4 | [x] Done — applied |
| 3.1 PRD | No FR/MVP conflict | [N/A] Skip |
| 3.2 Architecture | Stack + AD-23 for Tailwind/SCSS; update `project-context` | [x] Done — applied |
| 3.3 UX spines | Visual tokens unchanged; UX-DR1 still CSS variables (mapped into Tailwind theme) | [N/A] Skip visual rewrite |
| 3.4 Other | `package.json`/PostCSS; Vitest Soft-Ledger CSS assertions; project-context UI rules | [x] Done — rules applied; code in Epic 3.5 stories |
| 4.1 Direct adjustment | Viable — new epic + stories | Viable |
| 4.2 Rollback | Not viable — do not revert Soft-Ledger | Not viable |
| 4.3 MVP review | Not needed — MVP unchanged | Not viable as primary |
| 4.4 Selected | **Option 1 / Direct Adjustment** (+ light architecture amend) | [x] Done |

### Epic impact

| Epic | Impact |
|------|--------|
| Epic 1–2 | Done — no reopen; auth/list CSS Modules migrated in Epic 3.5 stories |
| Epic 3 | Product stories **3.5–3.6 unchanged**; complete before styling epic |
| **Epic 3.5 (new)** | Install Tailwind+Sass; map Warm Balance `@theme`; migrate Soft-Ledger → lists/auth; remove CSS Modules convention |
| Epic 4–5 | Implementation convention only — write new UI in Tailwind (+ SCSS when needed); no story text FR changes |

### Story impact

| Stories | Change |
|---------|--------|
| 3.1–3.4 | Remain `done` — no rollback |
| 3.5–3.6 | Stay product stories; complete before Epic 3.5 |
| **3.5.1–3.5.4 (new)** | Scaffold + token bridge; Soft-Ledger migrate; feature surfaces migrate; convention cleanup |
| 4.x–5.x | No AC rewrites; Dev Story guidance follows new stack after 3.5 done |

### Artifact conflicts

| Artifact | Change |
|----------|--------|
| PRD | **None** |
| `epics.md` | **Applied** — Epic 3.5 + Epic List + Epic 4 sequencing |
| `ARCHITECTURE-SPINE.md` | **Applied** — AD-12 addendum, AD-23, stack rows, consistency row |
| UX DESIGN/EXPERIENCE | **None** (visual contracts unchanged) |
| `project-context.md` | **Applied** — UI styling rules + gate note (Story 3.5.4 may deepen) |
| `sprint-status.yaml` | **Applied** — `epic-3-5` + four stories `backlog` |

### Technical impact

- Add `tailwindcss` (v4), `@tailwindcss/postcss`, `sass` to `ui/` (Story 3.5.1)
- Bridge Warm Balance / Soft-Ledger tokens into Tailwind theme
- Migrate ~19 CSS Modules → Tailwind and/or `*.module.scss`
- Update Soft-Ledger / form tests that assert module class names
- CI unchanged in shape once deps lock
- **Do not** ship shadcn default theme or purple kit palette

---

## 3. Recommended approach

**Selected:** Option 1 — **Direct Adjustment** (approved and applied).

| Option | Verdict |
|--------|---------|
| Direct Adjustment | **Selected** |
| Rollback | Rejected |
| MVP Review | Rejected |

**Effort:** Medium–High · **Risk:** Medium · **Timeline:** Epic 3 product → Epic 3.5 → Epic 4

**Migration policy:**
1. **Default:** Tailwind utilities co-located in the component
2. **Custom only:** SCSS modules (`*.module.scss`)
3. **Tokens:** Warm Balance + Soft-Ledger single source — no hex re-picks
4. **Forbidden:** New `*.module.css`; kit themes; pill primary CTAs

---

## 4. Detailed change proposals (approved & applied)

### 4.1 `epics.md` — applied

- Epic List: Epic 3.5 + Epic 4 sequencing note  
- Full section: Stories 3.5.1–3.5.4 with AC  
- Epic 4 body: sequencing paragraph  

### 4.2 PRD — skipped (no conflict)

### 4.3 `ARCHITECTURE-SPINE.md` — applied

- AD-12 addendum (Tailwind+SCSS delivery; AD-12 still owns look)  
- AD-23 UI styling delivery  
- Stack: Tailwind CSS 4.x + Sass 1.x  
- Consistency: UI styling row  

### 4.4 UX — skipped (no visual rewrite)

### 4.5 `project-context.md` — applied (light)

- `ui/` styling rules (Tailwind-first, SCSS custom, no new CSS Modules)  
- UI footguns + story gate note for Epic 3.5  

### 4.6 `sprint-status.yaml` — applied

```text
epic-3-5: backlog
3-5-1-install-tailwind-sass-warm-balance-theme: backlog
3-5-2-migrate-soft-ledger-primitives-tailwind: backlog
3-5-3-migrate-lists-auth-account-surfaces: backlog
3-5-4-convention-lock-project-context-architecture: backlog
epic-3-5-retrospective: optional
# Do not start Epic 4 until epic-3-5 demo gate done
```

**Key naming:** `3-5-N-…` = Epic **3.5** story N (distinct from Epic 3 story 3.5: `3-5-materialize-…`).

---

## 5. Implementation handoff

**Scope classification:** **Moderate** — backlog reorganization applied; Developer executes Epic 3 product then Epic 3.5 story cycle.

### Handoff

| Role | Responsibility |
|------|----------------|
| Product Owner / Sebas | Approved this proposal; keep Epic 4 gated on Epic 3.5 |
| Developer | Finish Epic 3 stories **3.5–3.6** first → then `[CS]` create-story for **3.5.1** → validate → `[DS]` → `[CR]` through 3.5.4 |
| Architect | AD-23 / stack already landed; support theme-bridge questions in 3.5.1 |

### Success criteria

1. Epic 3 product (3.5–3.6) `done`  
2. Epic 3.5 demo gate: Soft-Ledger + migrated surfaces parity; **zero** `*.module.css` in `ui/`  
3. AD-23 + project-context enforce Tailwind-first + SCSS-custom  
4. Epic 4 starts only after Epic 3.5 done  
5. CI ui gates green; Warm Balance light/dark/System intact  

### Next workflow

1. Continue / finish Epic 3 product: Story **3.5** (`3-5-materialize-fx-to-crc-bccr-for-non-crc-lines`) then **3.6**  
2. Fresh chat: **`bmad-create-story`** for Story **3.5.1** (`3-5-1-install-tailwind-sass-warm-balance-theme`)  
3. Do **not** start Epic 4 until Epic 3.5 demo gate passes  

---

## Checklist completion

| Section | Status |
|---------|--------|
| 1 Trigger & context | Done |
| 2 Epic impact | Done (Epic 3.5 inserted) |
| 3 Artifacts | Done (spine + project-context; no PRD/UX rewrite) |
| 4 Path forward | Direct Adjustment |
| 5 Proposal components | This document |
| 6 Final review | Approved (yes) 2026-08-10 |

## Approval

- [x] Approved as written  
- [ ] Approved with revisions  
- [ ] Rejected  

**Approver:** Sebas  
**Date:** 2026-08-10  
**Notes:** Applied epics, sprint-status, AD-23, project-context light rules.
