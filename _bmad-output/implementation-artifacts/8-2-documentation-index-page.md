---
baseline_commit: 425f6c2696fa563dfba8ed8a80240fc56d0916bb
---

# Story 8.2: Documentation index page

Status: done

## Story

As a user (new or existing),
I want a documentation page indexing tutorials and UX features,
so that I can discover things like keyboard navigation and accessibility support.

## Acceptance Criteria

1. **Given** a new `/docs` route, **when** any user (signed in or not) opens it, **then** it shows an index of tutorial entries (topic + link/anchor), grouped by area (e.g. lists, budgets, import).
2. **Given** the docs index, **when** it renders, **then** it includes a UX-features section calling out accessibility and keyboard-navigation support already built into the app (e.g. AD-9 non-gesture paths, ARIA patterns already shipped).
3. **Given** the landing page (Story 8.1), **when** it renders, **then** it links to `/docs`.

## Tasks / Subtasks

- [x] Task 1: Create the `/docs` page (AC: #1)
  - [x] Add `ui/app/docs/page.tsx` — Next.js App Router server component, no auth guard (route must be reachable signed-in or signed-out; there is no `middleware.ts` in `ui/` gating routes, so a plain new `app/docs/page.tsx` is public by default — do not add a session check)
  - [x] Content is a single static page (no CMS/data source) grouping tutorial entries by area — e.g. Lists (creating/inviting/splitting), Budgets (create/attribute/progress), Import (upload/review/settle) — each entry is a topic label with either an anchor to an in-page section or, where no dedicated tutorial content exists yet, a short static description in place of a real link (do not invent routes that don't exist)
  - [x] Use in-page anchors (`id="..."` + `<a href="#...">`) grouped under `<section>`s per area, matching "index of tutorial entries (topic + link/anchor), grouped by area" literally — this AC does not require separate `/docs/<topic>` pages
- [x] Task 2: Add the UX-features section (AC: #2)
  - [x] New `<section>` on the same `/docs` page (below or alongside the tutorial groups) titled something like "Accessibility & keyboard navigation"
  - [x] Content must call out real, already-shipped behavior — cite it accurately (see Dev Notes "Verified accessibility/keyboard facts to cite" below), not generic/aspirational claims
- [x] Task 3: Link the landing page to `/docs` (AC: #3)
  - [x] In `ui/app/page.tsx`, add a `<Link href="/docs">` — placement is a content decision (footer of the page, or a third nav item near the existing `/signup`/`/sign-in` CTAs); do not remove or restyle the existing CTAs
  - [x] Do not touch the auth/redirect block at the top of `Home()` (`fetchSession` → `resolveServerAuthenticatedLanding` → `requireAlias` → `redirect`) or `<RedirectIfAuthenticated />` — same constraint Story 8.1 operated under
- [x] Task 4: Tests
  - [x] Add `ui/app/docs/page.test.tsx` (or `page.docs.test.tsx` to mirror the `page.home.test.tsx` naming from 8.1) rendering the server component directly and asserting: tutorial group headings present, at least one entry per group, the UX-features section present with its accessibility/keyboard copy
  - [x] Extend/add a case in `ui/app/page.home.test.tsx` (or a new test) asserting the landing page now renders a link to `/docs`
- [x] Task 5: Manual verification
  - [x] Signed-out visit to `/docs` renders the page (no redirect, no auth wall)
  - [x] Signed-in visit to `/docs` also renders directly (not redirected away)
  - [x] `/` shows a working link to `/docs`

### Review Findings

- [x] [Review][Patch] Broken `aria-labelledby` on `TutorialGroup`'s `<ul>` — id references a nonexistent `<h2>` id, screen readers get no accessible name for the group list [ui/app/docs/page.tsx]
- [x] [Review][Patch] Unjustified `export const dynamic = "force-dynamic"` on a fully static page with no data fetching [ui/app/docs/page.tsx:3]
- [x] [Review][Patch] Awkward/unedited prose in "Splitting an expense" tutorial detail — remainder-goes-to-creator sentence reads ungrammatical [ui/app/docs/page.tsx:45]
- [x] [Review][Defer] No test cross-references all `TutorialEntry href` values against `TutorialDetail id` values (6 of 9 anchor pairs untested); manually verified all 9 currently match, no live bug — deferred, pre-existing test-coverage pattern

## Dev Notes

- **New route, two files to touch, one new file to add:**
  - New: `ui/app/docs/page.tsx` (the index page)
  - New: a test file under `ui/app/docs/`
  - Modified: `ui/app/page.tsx` (add the `/docs` link only — per Story 8.1's dev notes, this link was explicitly deferred to this story: *"Story 8.2 (`/docs`, separate story) will link back here or be linked from here later — out of scope for 8.1; do not add a `/docs` link now"*)
- **No backend/data model work.** Per the sprint change proposal's architecture impact analysis: "none — static/server-rendered content pages, no new data model or API surface." This is a hand-authored static page like `ui/app/page.tsx` — not driven by a CMS, markdown loader, or API call.
- **No auth guard on `/docs`.** There is no `ui/middleware.ts` — routes are public unless a page itself checks session (like `Home()` does to redirect signed-in users to their landing destination). `/docs` must NOT replicate that redirect check; it renders directly for both signed-in and signed-out visitors per AC #1 ("any user (signed in or not)").
- **Styling convention — follow 8.1, not the CSS-module pages:** `ui/app/page.tsx` (Story 8.1) uses plain Tailwind utility classes directly in JSX, no CSS module, for this exact reason (single static content page, not shared with other routes). Use the same approach for `ui/app/docs/page.tsx`. Do not create a `.module.scss` file for this page (project-wide convention since Epic 3.5: Tailwind utilities co-located; SCSS modules only for genuinely custom styles the Warm Balance tokens/utilities can't express — a docs list/text page doesn't need that).
- **Warm Balance / Soft-Ledger tokens only** (`ui/app/globals.css`): reuse the tokens already used by `ui/app/page.tsx` — `text-foreground`, `text-muted`, `bg-surface`, `border-border`, `text-accent`/`bg-accent`/`text-on-accent`, `rounded-sm`/`rounded-md`. Do not introduce new tokens or hexes.
- **No brand header.** Same constraint as 8.1 — commit f108715 removed on-page brand headers project-wide; don't reintroduce one here.
- **i18n note (deliberate deviation, matches precedent):** `project-context.md` requires EN+ES keys for "product chrome" via `ui/lib/i18n/<domain>.ts` message objects. Story 8.1's landing page shipped as hardcoded English with no i18n file and reached `review` status on that basis — there is no `ui/lib/i18n/landing.ts`. Follow that same precedent for `/docs`: hardcoded English content, no new i18n domain file. (If this is later flagged in review, it's a pre-existing pattern from 8.1, not a new gap introduced by this story — do not solve it unilaterally by inventing a `docs.ts` i18n file that no other part of this two-story epic uses.)
- **Verified accessibility/keyboard facts to cite in the UX-features section** (don't write generic "we support accessibility" copy — cite what's actually shipped):
  - Individual import review supports both true swipe gestures (phone) and full keyboard/button equivalents (desktop) for all four outcomes (assign to picked list, assign to default, delete, undo) — see `ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx`, which wires `onKeyDown` handlers, `role="group"`/`aria-label` on the action group, `aria-describedby` tooltips, and `role="alert"` / `aria-live="polite"` regions for state changes. This is AD-9 in the project's architecture decisions: "Individual review unit = transaction; phone swipe R/L/U (up → delete) + list picker first; undo is button-only; desktop buttons; a11y non-gesture path."
  - Undo is a button on every platform, never a gesture (AD-9) — so "undo" is always keyboard/screen-reader reachable.
  - ARIA live regions and alerts are used for async/error states in review flows (`aria-live="polite"`, `role="alert"`, `aria-busy="true"` on loading cards).
  - Keep the copy scoped to these verified behaviors; do not claim WCAG conformance level or other unverified accessibility claims not backed by shipped code.
- **Content requirement, not exact copy:** as with 8.1, the specific tutorial topic list and wording are a content decision for the dev agent — the epic only requires the structure (grouped index + UX-features section) and the areas named as examples (lists, budgets, import). Keep entries factual and traceable to real app features; don't invent functionality that doesn't exist.
- **Don't build out real per-topic tutorial pages/content in this story.** AC #1 only requires an *index* of tutorial entries (topic + link/anchor) grouped by area — the entries can anchor to short in-page explanations. Building a full tutorials content system is scope creep beyond FR-53 and this story's AC wording.

### Project Structure Notes

- `ui/app/docs/page.tsx` follows the same App Router convention as every other top-level route (`ui/app/account`, `ui/app/upload`, etc.) — no conflicts, no new aliases needed.
- No new components required; if a small presentational helper is useful (e.g. a `TutorialGroup` block), keep it local to `ui/app/docs/page.tsx` as a private function, mirroring how `page.tsx` (8.1) keeps its own local `FeatureCard` function rather than creating a new shared component — this is a two-file epic, not a reusable design-system addition.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 8: Onboarding & documentation (v1) / Story 8.2] — story statement and ACs
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-09-02-onboarding-docs.md] — FR-52/FR-53 origin, architecture impact ("none — static/server-rendered content pages, no new data model or API surface")
- [Source: _bmad-output/implementation-artifacts/8-1-landing-page-introduction.md] — sibling story; established styling convention (plain Tailwind, no CSS module), explicitly deferred the `/docs` link to this story, no i18n file precedent
- [Source: ui/app/page.tsx] — current landing page; where the `/docs` link is added; token usage reference
- [Source: ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx] — source of the AD-9 accessibility/keyboard facts to cite (swipe + keyboard equivalents, aria-live, role="alert", button-only undo)
- [Source: ui/app/globals.css] — Warm Balance color tokens
- [Source: _bmad-output/project-context.md#Framework-Specific Rules / Next.js] — "Individual: phone swipe R/L/D; desktop buttons; a11y equivalents (AD-9)"; i18n rule (per-domain TS message objects) — noted here as a deliberate, precedented deviation for this static page

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Debug Log References

- Full worktree stack (`db`/`api`/`ui`) at http://localhost:3310 (UI) / http://localhost:8310 (API); `--lite` mode was tried first but its read-only `ui_node_modules` mount broke Vitest's config bundling (`ENOENT .../node_modules/.vite-temp`), so bootstrapped the full stack instead.
- `docker compose exec ui npx vitest run` → 94 files / 704 tests passed (post-fix run).
- `docker compose exec ui npx tsc --noEmit` → clean.
- `docker compose exec ui npx eslint app/docs/page.tsx app/docs/page.docs.test.tsx app/page.tsx app/page.home.test.tsx` → clean (after fixing 4 `react/no-unescaped-entities` errors).
- Manual `curl` checks confirmed: signed-out `/docs` → 200 (after the `proxy.ts` fix below), signed-in (`fh_session` cookie present) `/docs` → 200, `/` contains a working `href="/docs"` link.

### Completion Notes List

- Implemented `ui/app/docs/page.tsx` as a static server component: three tutorial groups (Lists, Budgets, Import) each with an in-page anchor index plus a detail `<section>`, and an "Accessibility & keyboard navigation" section citing the real AD-9 individual-review keyboard/swipe parity, button-only undo, and `aria-live`/`role="alert"` patterns from `IndividualReviewPanel.tsx` — no unverified/aspirational accessibility claims.
- Added a `/docs` link to `ui/app/page.tsx` below the existing feature cards; left the auth/redirect block and `<RedirectIfAuthenticated />` untouched.
- **Scope correction beyond the story's stated Dev Notes:** the story's Dev Notes claimed "there is no `middleware.ts` in `ui/` gating routes." That's stale — Next.js 16 replaced `middleware.ts` with `proxy.ts` (`ui/proxy.ts`), which coarse-gates all routes not in a `PUBLIC_PREFIXES` allowlist behind a session-cookie check and redirects to `/sign-in` otherwise. Manual verification caught `/docs` returning a 307 to `/sign-in?returnTo=%2Fdocs` for signed-out visitors, which would have failed AC #1 ("any user, signed in or not"). Fixed by adding `"/docs"` to `PUBLIC_PREFIXES` in `ui/proxy.ts`, and added two cases to the existing `ui/proxy.test.ts` (`allows public /docs without cookie`, `allows /docs when fh_session cookie is present`).
- Fixed 4 `react/no-unescaped-entities` ESLint errors in the new page by using `&apos;` for contraction apostrophes.
- Full regression: 94 test files / 704 tests passed; `tsc --noEmit` clean; `eslint` clean on all changed files.

### File List

- `ui/app/docs/page.tsx` (new)
- `ui/app/docs/page.docs.test.tsx` (new)
- `ui/app/page.tsx` (modified — added `/docs` link)
- `ui/app/page.home.test.tsx` (modified — asserts `/docs` link present)
- `ui/proxy.ts` (modified — added `/docs` to `PUBLIC_PREFIXES`; required for AC #1, not anticipated by the story's Dev Notes)
- `ui/proxy.test.ts` (modified — added coverage for `/docs` being public with and without a session cookie)

## Change Log

- 2026-09-02: Story created (ready-for-dev).
- 2026-09-02: Implemented `/docs` index page, UX-features section, landing page link, and required `proxy.ts` public-route fix (not anticipated by story Dev Notes); all tests/lint/typecheck green. Status → review.
