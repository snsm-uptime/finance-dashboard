---
title: Inefficiencies Audit — Rendering, Processing, Design
author: Winston (System Architect)
date: 2026-09-22
status: draft
scope: ui/ (Next.js rendering), api/ (import/processing pipeline), design system (Warm Balance / Soft-Ledger)
---

# Inefficiencies Audit — Rendering, Processing & Design

## Method

Direct static-code survey of the live repo (no external research) against three lenses: UI rendering cost, API processing cost, and design-system consistency/reuse. Findings are trade-offs to weigh, not mandates — several intersect with documented architecture decisions (`project-context.md`) that were made deliberately and shouldn't be silently reversed.

---

## 1. UI / Rendering

### 1.1 Client-component ratio is high (~38%)
79 of 208 `.tsx` files under `ui/app` + `ui/components` carry `'use client'`. In an App Router project this isn't automatically wrong, but it's worth knowing the baseline: every one of those subtrees opts out of RSC streaming and ships its JS to the browser.

- **Trade-off:** Interactive primitives (buttons, sheets, pickers, gesture-driven Individual review) *need* to be client components — that's inherent to Story 4.13's swipe/desktop-button requirements (AD-9). The risk is client-ness leaking upward into layout/page-level components that don't themselves need interactivity, dragging their entire subtree client-side.
- **Where to look:** `ui/app/lists/[listId]/page.tsx` is confirmed server (uses `cookies()`), which is the right shape per `project-context.md`. Worth spot-checking the newer `ui/app/lists/[listId]/layout.tsx` (uncommitted, per git status) and `ui/app/budgets/[budgetId]/` — layouts/pages that wrap client children don't need `'use client'` themselves as long as the boundary is drawn at the leaf.
- **Not a verdict:** no evidence here of unnecessary top-level client boundaries — this is a "measure before assuming" flag, not a confirmed defect.

### 1.2 Only 4 of ~57 API routes are consumed from true server components (`cookies()`-based fetches)
Most data-fetching appears to happen client-side (through `ui/app/api/*` BFF routes) rather than during server render. That's consistent with the mandated httpOnly-cookie / same-origin BFF pattern (AD-8) and isn't wrong, but it means most pages pay a client-side fetch waterfall (mount → fetch → render) instead of arriving with data already in the HTML.

- **Trade-off:** Moving more reads to server components would cut time-to-first-useful-paint, but the BFF-route architecture exists specifically to keep secrets off `NEXT_PUBLIC_*` and centralize auth — collapsing that into server-component `fetch()` calls needs the same cookie-forwarding discipline, or you lose the isolation the BFF gives you. Not a free win.

### 1.3 CSS Modules migration (Epic 3.5) is incomplete
20 `*.module.scss` files remain (`AccountMenu`, `TemporalNavigation`, `Sheet`, `PercentageSplitTrack`, `ManualExpenseForm`, `ListDetailMobileActions`, `lists`, `signup`, `UploadButton`, `BaseButton`, `ReceiptRowMenu`, `IconButton`, `FormIconSubmit`, `BudgetUpdateForm`, `UnassignButton`, `MenuSurface`, `Tooltip`, `TriSwitch`, `ButtonGroup`, `IconButtonPopup`). Per `project-context.md`, SCSS modules are supposed to be reserved for genuinely custom styling *after* Epic 3.5 — the sheer count suggests either (a) a lot of "custom" styling that could be Tailwind utilities, or (b) migration work still pending across Epic 4/5 surfaces.
  - `BudgetUpdateForm.tsx` and `Sheet.tsx` are both showing as modified in the current working tree (per git status) — likely this exact migration in flight, which lines up with your "Parallel CSS Module Work" pattern noted in memory.
- **Trade-off:** Each remaining `.module.scss` is a second styling system the browser has to load and Sass has to compile — more build cost and cognitive overhead (two ways to style anything) versus the legitimate cases where Tailwind utilities alone are unwieldy for truly custom shapes (e.g. `PercentageSplitTrack`'s gradient math, gesture-tracked positioning).

### 1.4 Bundle-surface risk: no barrel, direct imports
Confirmed convention (no `ui/components/index.ts`) is good for tree-shaking — no action needed, but worth stating as a **positive** finding: this avoids a common Next.js bundle-bloat footgun (barrel files forcing the whole component tree into a page's client bundle).

---

## 2. API / Processing

### 2.1 Per-item loop issuing individual `UPDATE`s instead of one batched `IN` query
`api/adapters/persistence/repositories.py:907-917` — when moving `override_keys` between lists, the code loops over each `(kind, subject_id)` pair and calls `self._session.execute(...)` per iteration:

```python
if override_keys and from_list_ids:
    for kind, subject_id in override_keys:
        self._session.execute(
            update(SplitOverrideModel)
            .where(
                SplitOverrideModel.subject_kind == kind,
                SplitOverrideModel.subject_id == subject_id,
                SplitOverrideModel.list_id.in_(from_list_ids),
            )
            .values(list_id=destination_list_id)
        )
```
Every other branch in the same function (`entry_ids`, `batch_ids`, `candidate_ids`, `receipt_ids`) does a single `.in_()`-batched update. This one is the odd one out — a genuine N+1-shaped write pattern.

- **Trade-off:** `subject_kind` + `subject_id` pairs can't collapse into a single `.in_()` on a composite tuple as cleanly in SQLAlchemy Core without either raw tuple-IN SQL (dialect-dependent) or grouping by `kind` first and doing one `.in_(subject_ids)` update per distinct kind (almost certainly 1-2 kinds in practice, e.g. "list_creator" overrides vs "member" overrides) — that would drop N queries to ~2. Given this runs on move-list-item operations, likely low N in practice; worth confirming call-site volume before prioritizing.

### 2.2 Synchronous, CPU/IO-bound PDF parsing on the request path
`run_import_pipeline` (`api/application/import_session.py:92`) and every bank adapter's `.parse()` (`bac_credit/adapter.py:279`, `promerica_stub.py:101`) are plain `def`, not `async def`. `pdfplumber` has no async API, so this is expected — but it means whichever FastAPI route calls this pipeline either:
  - is itself a sync `def` route (FastAPI runs those in a threadpool, fine), or
  - is an `async def` route calling this directly, which would block the event loop for the duration of parsing a multi-page/multi-statement PDF.

- **Not yet confirmed which case applies** — the route-level caller wasn't located during this pass (the persistence-layer indirection makes it non-trivial to grep). **Recommended next step:** confirm the route decorator for `run_import_pipeline`'s caller; if it's `async def`, the fix is `await asyncio.to_thread(run_import_pipeline, ...)`, not a rewrite.
- **Trade-off:** if already threadpool-dispatched, this is a non-issue and any change would just add overhead.

### 2.3 Decimal/serialization boundary looks compliant, no red flags found
Spot checks didn't surface `float` money handling or JSON-number amount serialization — consistent with AD-5. No finding here; noted as validated, not assumed.

### 2.4 Import pipeline shape (detect → split → parse → normalize → Session → review → Batch)
Sequential per-chunk processing (`for chunk_idx, chunk in enumerate(chunks)`) with `logger.debug` calls at every step, including inside the per-chunk IBAN extraction path. For large multi-statement uploads this is fine functionally, but each chunk fully completes (parse, exceptions, evidence-building) before the next starts — no batching or parallelism across chunks.

- **Trade-off:** Parallelizing chunk parsing (e.g. `asyncio.gather` over `to_thread`-wrapped `.parse()` calls) would cut wall-clock time for multi-statement PDFs, at the cost of more complex error aggregation (currently a clean per-chunk try/except that appends either a failed or staged `DetectedStatement`). Given "one fail/skip doesn't discard siblings" is already a hard requirement (AD/testing rule), parallelizing needs care to preserve per-chunk isolation — not free, but tractable.

---

## 3. Design System (Warm Balance / Soft-Ledger)

### 3.1 Token layer itself is healthy
`ui/app/globals.css` defines 143 custom-property declarations, single source of truth, `html.dark` override pattern confirmed (no duplicate dark-mode rule blocks per the documented convention). No finding — this part of the system is doing what it's supposed to.

### 3.2 Raw hex colors leaking into 4 `.module.scss` files
`ManualExpenseForm.module.scss`, `lists.module.scss`, `signup.module.scss`, `UploadButton.module.scss` all contain literal hex values instead of `var(--token)` references. This is exactly the anti-pattern `project-context.md` calls out ("do not re-pick DESIGN.md hexes") — these are candidates for a quick pass replacing hardcoded hex with the matching CSS var, independent of any broader Tailwind migration.

- **Trade-off:** low risk, low effort, but needs someone to map each hex back to its intended token (accent? owe/owed? surface?) rather than guessing — a visual diff/regression check is cheap insurance here.

### 3.3 Button component sprawl: two parallel families
There are **two independent button component families** in the tree:
1. `ui/components/soft-ledger/{BaseButton,PrimaryButton,AccentButton,GhostButton}.tsx` — the canonical Soft-Ledger primitive set per the documented component-location convention.
2. A long tail of *bespoke* single-purpose button components living outside `soft-ledger/`: `ShareTitleButton`, `DocsHelpButton`, `DeleteBudgetButton`, `UnassignButton`, `ArchiveBudgetButton`, `CopyButton`, `UploadButton`, `IconButton`, `IconButtonPopup`, `ButtonGroup` — several with their own `.module.scss`.

- **Trade-off:** Some of these are legitimately domain-specific compositions (a "Delete Budget" button wrapping a confirm flow is more than a styled `<button>`) — collapsing them into the `soft-ledger` primitives isn't automatically right. But at minimum, each of `DeleteBudgetButton` / `UnassignButton` / `ArchiveBudgetButton` (same directory, same shape: destructive action on a budget) is worth checking for whether it wraps `BaseButton`/`AccentButton` internally or reimplements styling from scratch via its own `.module.scss` — if the latter, that's exactly the "component reuse gap" this audit was asked to find, and each new domain-specific destructive-action button is a fresh place for the "pill primary CTA" / theme footguns to creep back in.

### 3.4 Overlay pattern (Sheet / Popup) has two independent implementations
`ui/app/lists/Sheet.tsx` (+ `.module.scss`, currently modified in your working tree) and `ui/components/IconButtonPopup/` appear to be separately-built overlay/positioning patterns rather than variants of one shared primitive. Given `ImportReviewSheet.tsx` also exists as its own thing, there may be three sheet/overlay implementations total.

- **Trade-off:** worth a spike to check whether `Sheet` and `IconButtonPopup` share enough positioning/dismiss/focus-trap logic (there's already a shared `useFocusTrap` hook per git status) to justify consolidating on one primitive — versus them being different enough (bottom sheet vs anchored popup) that forcing a shared abstraction would violate the Rule of Three prematurely.

---

## Summary Table

| # | Area | Finding | Confidence | Effort to address |
|---|------|---------|------------|--------------------|
| 1.1 | Rendering | High client-component ratio (38%) | Flag only, not confirmed defect | — |
| 1.2 | Rendering | Most data fetches are client-side, not server-rendered | Confirmed pattern, deliberate trade-off (BFF/AD-8) | Medium if pursued |
| 1.3 | Rendering/Build | 20 `.module.scss` files remain post-Epic-3.5 | Confirmed | Varies per file |
| 2.1 | Processing | Per-pair loop of individual `UPDATE`s (`repositories.py:907`) | Confirmed N+1-shaped write | Low |
| 2.2 | Processing | Sync PDF parse — event-loop-blocking risk if called from `async def` route | Unconfirmed (needs route lookup) | Low once confirmed |
| 2.4 | Processing | No parallelism across statement chunks in one upload | Confirmed, by design (sequential) | Medium |
| 3.2 | Design | Raw hex in 4 `.module.scss` files | Confirmed | Low |
| 3.3 | Design | Bespoke button components outside `soft-ledger/` family | Confirmed sprawl, reuse unclear | Medium (needs per-component check) |
| 3.4 | Design | Possibly 2-3 independent overlay implementations | Confirmed multiple, consolidation unconfirmed | Medium |

## Recommended Next Step

Highest confidence + lowest effort first: **2.1** (batch the override-key updates) and **3.2** (hex → token swap) are both small, mechanical, low-risk fixes. **2.2** just needs one grep/read to confirm the route decorator before deciding if it's even a problem. **1.3/3.3/3.4** are architecture-adjacent — better suited to a `bmad-check-implementation-readiness` pass or a dedicated story than an ad-hoc fix, since they touch multiple files and existing story boundaries (Epic 3.5, Epic 4/5 button surfaces).
