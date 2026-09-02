---
baseline_commit: 743300b8d528cf697532a574e003845386fb6485
---

# Story 8.1: Landing page introduction

Status: review

## Story

As a new visitor,
I want the landing page to explain what the app does instead of just confirming the stack is up,
so that I understand the product before signing up.

## Acceptance Criteria

1. **Given** a signed-out visitor opens `/`, **when** the page renders, **then** it shows an introduction to the app (what it does: shared expenses, budgets, statement import) instead of the "Stack is up" infra text.
2. **Given** the existing authenticated-redirect behavior, **when** a signed-in user opens `/`, **then** the redirect to their landing destination (`resolveServerAuthenticatedLanding`) is unchanged.
3. **Given** the intro content, **when** it renders, **then** sign-up/sign-in CTAs remain present and reachable, same as today.

## Tasks / Subtasks

- [x] Task 1: Replace placeholder copy in `ui/app/page.tsx` with product intro content (AC: #1, #3)
  - [x] Replace the "Stack is up" `<h1>` and infra-services `<p>` with copy introducing the app (shared expenses, budgets, statement import)
  - [x] Keep the `<Link href="/signup">` and `<Link href="/sign-in">` CTAs present and reachable in the new copy
  - [x] Keep existing layout wrapper classes (`max-w-[36rem] mx-auto py-16 px-6`) and Tailwind utility approach — no CSS module needed for this page
- [x] Task 2: Verify unauthenticated/authenticated flows are untouched (AC: #2)
  - [x] Do not modify the `fetchSession` / `resolveServerAuthenticatedLanding` / `requireAlias` / `redirect` block at the top of `Home()`
  - [x] Do not modify `<RedirectIfAuthenticated />` (client-side back/forward-cache guard)
  - [x] Keep `export const dynamic = "force-dynamic"`
- [x] Task 3: Manual verification
  - [x] Signed-out visit to `/` shows new intro copy, no "Stack is up" or Compose/db/api/ui infra text
  - [x] Signed-in visit to `/` still redirects to the resolved landing destination
  - [x] Sign-up and sign-in links work from the new copy

## Dev Notes

- **Single file to touch:** `ui/app/page.tsx`. Nothing else in the story's scope — no new routes, no new components, no API/data model changes (per architecture impact analysis: "none — static/server-rendered content pages").
- **Do not touch the auth/redirect block.** Lines 11–18 of the current file (session fetch → `resolveServerAuthenticatedLanding` → `requireAlias` → `redirect`) are pre-existing, unrelated behavior this story must leave byte-for-byte equivalent. Only the returned JSX (currently lines 20–32) changes.
- **Keep `<RedirectIfAuthenticated />`** — client-side guard that bounces back/forward-cache hits for still-valid sessions. Story does not change its `to` prop (default `/`).
- **Content requirement, not exact copy:** ACs specify the intro must cover shared expenses, budgets, and statement import — the actual wording is a content decision for the dev agent, not prescribed by the epic. Keep it concise (this is a single intro block, not marketing copy).
- **Styling convention:** this page currently uses inline Tailwind utility classes directly in JSX (not a CSS Module / SCSS module like `sign-in`/`sign-up` use `styles.shell`/`styles.card` from `signup.module.scss`). Follow the existing page's own pattern — plain Tailwind utilities — rather than introducing a module file for a single static page.
- **Design tokens available** (Warm Balance / Soft-Ledger, `ui/app/globals.css`): `text-foreground`, `text-muted` (currently used for the paragraph), `text-accent`/`bg-accent`/`text-on-accent` if a CTA needs emphasis beyond a plain link. No new tokens should be introduced.
- **No brand header:** commit f108715 ("Remove the on-page brand header from every screen") removed on-page brand headers project-wide — do not reintroduce a logo/brand header on this page.
- Story 8.2 (`/docs`, separate story) will link back here or be linked from here later — out of scope for 8.1; do not add a `/docs` link now (Story 8.2's AC is "the landing page links to `/docs`", which is 8.2's responsibility to add, not this story's).

### Project Structure Notes

- No conflicts. Existing file, existing route, existing conventions (Next.js App Router `app/page.tsx`, Tailwind utilities, `@/lib` and `@/components` aliases already imported by the file).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 8: Onboarding & documentation (v1) / Story 8.1] — story statement and ACs
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-09-02-onboarding-docs.md] — FR-52/FR-53 origin, architecture impact ("none — static/server-rendered content pages, no new data model or API surface"), UX constraint ("must stay within Warm Balance/Soft-Ledger tokens")
- [Source: ui/app/page.tsx] — current placeholder implementation being replaced
- [Source: ui/app/globals.css] — Warm Balance color tokens (`--color-*`)

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Debug Log References

- `ui/app/page.home.test.tsx` — server-component test rendering `Home()` with mocked `fetchSession`/`resolveServerAuthenticatedLanding`/`requireAlias`/`next/navigation.redirect`, asserting intro copy + CTAs (signed-out) and redirect call with resolved destination (signed-in).
- Full suite: `npx vitest run` → 92 files / 683 tests passed (no regressions) inside the worktree's lite `ui` container.
- Manual verification via `curl http://localhost:3380/` (this story's worktree port) confirmed no "Stack is up" text, presence of `expenses`/`budgets`/`import` copy, and `/signup`/`/sign-in` links in the rendered HTML.
- `eslint` on changed files passed clean. `tsc --noEmit` surfaced one pre-existing, unrelated error in a stale generated `.next/dev/types/app/lists/[listId]/page.ts` (gitignored build artifact, regenerated by the dev server, referencing `balanceStripPropsFrom` in an unrelated route) — not caused by this story's change to `ui/app/page.tsx`.

### Completion Notes List

- Replaced the "Stack is up" infra placeholder in `ui/app/page.tsx` with intro copy covering shared expenses, budgets, and statement import, per AC #1.
- Reworked the page into a hero section (inline SVG wavy background using `fill-accent/10`/`fill-accent/[0.06]`, no new tokens) with headline, subcopy, and two CTAs, plus three feature cards below it (Lists — shared or solo, Cards, Budgets), each with a small inline SVG icon — following up on user feedback that the initial copy-only change felt too bare.
- Left the auth/redirect block (`fetchSession` → `resolveServerAuthenticatedLanding` → `requireAlias` → `redirect`), `<RedirectIfAuthenticated />`, and `export const dynamic = "force-dynamic"` untouched, per AC #2.
- Kept `/signup` and `/sign-in` links reachable as styled CTA buttons in the hero, per AC #3.
- Added `ui/app/page.home.test.tsx` covering both the signed-out intro render and the signed-in redirect path; re-ran after the hero/feature-section rework to confirm the same assertions (no "Stack is up", intro keywords present, both CTA hrefs present) still hold.

### File List

- `ui/app/page.tsx` (modified)
- `ui/app/page.home.test.tsx` (added)

## Change Log

- 2026-09-02: Replaced landing page "Stack is up" infra copy with a product intro (shared expenses, budgets, statement import); added `page.home.test.tsx` covering signed-out render and signed-in redirect. All tasks complete, full suite green, status → review.
- 2026-09-02: Reworked the intro into a hero section (wavy SVG background, headline, CTAs) plus three feature cards (Lists shared/solo, Cards, Budgets) per user feedback that the plain-copy version was too minimal. Full suite (92 files / 683 tests) re-verified green; no scope/AC changes.
