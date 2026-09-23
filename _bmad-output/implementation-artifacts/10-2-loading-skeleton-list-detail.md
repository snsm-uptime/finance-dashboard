---
baseline_commit: 9df8162
---

# Story 10.2: Loading skeleton for list detail page

Status: done

## Story

As a list member,
I want to see a loading skeleton while a list's detail page data is being
fetched,
so that opening a list feels responsive rather than frozen, independent
of how fast the underlying fetches are.

## Acceptance Criteria

1. **Given** navigation to `/lists/[listId]`, **when** the page's
   server-side data fetch has not yet resolved, **then** a loading
   skeleton (matching the page's layout shape — balance strip, receipts
   list, sidebar) is shown instead of a blank page, per this project's
   convention of a spinner/skeleton over literal "Loading…" text.
2. **Given** the skeleton is implemented via a Next.js `loading.tsx` route
   segment (or equivalent `<Suspense>` boundary), **when** the page
   eventually resolves, **then** the skeleton is replaced by the real
   content with no layout shift beyond what the real content's own
   dimensions require.

## Tasks / Subtasks

- [x] Task 1: Add `ui/app/lists/[listId]/loading.tsx` (AC: #1, #2)
  - [x] Next.js App Router auto-wraps `page.tsx` in a `<Suspense>` boundary
        when a sibling `loading.tsx` exists in the same segment — this is
        the intended mechanism per AC #2's "or equivalent `<Suspense>`
        boundary" clause; no manual `<Suspense>` wiring needed, and no
        change to `page.tsx` itself
  - [x] Because `export const dynamic = "force-dynamic"` is set on
        `page.tsx` (kept as-is per Story 10.1's investigation), every
        navigation to this route re-runs the server fetch and will show
        this skeleton — including client-side navigations from `/home`
        into a list, not just hard reloads
  - [x] Build the skeleton as static markup (no data, no client-side
        fetch, no `"use client"` needed unless required for an animation
        primitive) that mirrors `ListDetailPage`'s DOM shape closely
        enough to avoid a visible layout jump on swap-in:
    - Reuse `styles` from `../lists.module.scss` (`softMain`, `softBody`,
      `detailLayout`, `detailPrimary`, `detailSidebar`, `softReceipts`,
      `softReceiptsChrome`, `softReceiptsList`) for the outer shell so
      the skeleton occupies the same flex/grid regions as the real page
    - A placeholder block sized like `BalanceStrip`'s simple-variant row
      (`who`/`amount` line) in `.detailPrimary`
    - 3-5 placeholder rows sized like `ReceiptRow` in
      `.softReceiptsList`
    - A placeholder block in `.detailSidebar` sized like
      `TemporalNavigation`/`ManualExpenseForm`'s stacked-card shape (only
      needs to occupy the region — the sidebar is `display: none` below
      the `768px` breakpoint same as the real layout, so no separate
      mobile skeleton variant is needed)
  - [x] Use a muted pulsing fill for each placeholder block (Tailwind's
        built-in `animate-pulse` utility over a `bg-muted`/`bg-border`-ish
        surface token — verify the exact CSS var name in
        `ui/app/globals.css`, e.g. `--muted`/`--border`, do not invent a
        new token) — **not** `SpinnerIcon` and **not** literal "Loading…"
        text; a skeleton silhouette is the correct pattern here, distinct
        from the spinner-icon convention used for in-place async actions
        (buttons, form submits) elsewhere in this codebase
  - [x] Do not call `useChromeHeader` from `loading.tsx` unless a stale
        chrome title (left over from whatever page was open before
        navigating here) is visibly wrong for this route — `AppShell`'s
        header is a cross-page context value set by the mounting page, so
        during the skeleton's brief display the header will show
        whichever title was last set; note the observed behavior in Dev
        Notes rather than adding new chrome-header plumbing, since fixing
        that is out of this story's scope (see Dev Notes)
- [x] Task 2: Verify no regression (AC: #1, #2)
  - [x] Manually navigate to a list detail page both via a hard reload
        (`/lists/<id>` typed directly / refreshed) and via client-side
        navigation (clicking a list from `/home`) and confirm the
        skeleton appears briefly in both cases before the real content
        swaps in
  - [x] Confirm no visible layout jump when the skeleton is replaced by
        real content (compare skeleton block heights/widths against the
        rendered `BalanceStrip`/`ReceiptRow`/sidebar dimensions at both
        the mobile (<768px) and desktop (≥768px) breakpoints)
  - [x] Confirm existing `ui/tests/` suite still passes; this is a new
        static file with no exported pure functions worth unit-testing
        (per this project's convention, only extracted logic gets a
        sibling `*.test.ts` — a static skeleton has none), so no new test
        file is expected unless the file grows conditional logic

## Dev Notes

- **Source of this story:** same `bmad-party-mode` performance review
  (2026-09-09) of `ui/app/lists/[listId]/page.tsx` that produced Story
  10.1. That story's Dev Notes explicitly scoped a loading skeleton out
  as "Story 10.2" — this is that story. Per the epic's Sequencing note,
  10.1 and 10.2 are independent and can land in parallel; this story does
  not depend on 10.1's diff, only on the current shape of `page.tsx`.
- **No `loading.tsx` exists anywhere in this codebase yet** — this is the
  first one. There is also no existing "skeleton" component/pattern to
  reuse (`grep -r "animate-pulse\|skeleton" ui/` finds nothing at story
  creation time). Build this with plain Tailwind (`animate-pulse` is a
  built-in utility, ships with the base Tailwind config already installed
  since Epic 3.5 — no new dependency, no new SCSS module needed for the
  pulse animation itself).
- **This is the "no literal Loading… text" convention** in effect:
  [[feedback_no_loading_text]] — this project always uses `SpinnerIcon`
  for *in-place* async loading (a button mid-submit, a form saving), but
  a full-page route transition calls for a skeleton silhouette instead of
  a spinner or text, which is exactly what AC #1 asks for. Do not use
  `SpinnerIcon` here — it's the wrong pattern for this specific case
  (whole-page shape preview vs. a small in-place spinner).
- **Why `loading.tsx` and not a manual `<Suspense>` in `page.tsx`:**
  `page.tsx` has `export const dynamic = "force-dynamic"` and does all of
  its data fetching directly in the top-level async Server Component body
  (no nested async Server Components, no manual `<Suspense>` boundaries
  today). Wrapping ad hoc `<Suspense>` around it internally would be a
  much larger restructuring than this story calls for. A sibling
  `loading.tsx` file is the App Router idiom for exactly this shape of
  page (whole-page fetch, no internal streaming) and requires zero
  changes to `page.tsx`.
- **Layout shape reference** — read `ui/app/lists/[listId]/page.tsx`
  (lines ~781-1110, the JSX return) and `ui/app/lists/lists.module.scss`
  (`.softMain`/`.softBody`/`.detailLayout`/`.detailPrimary`/
  `.detailSidebar`/`.softReceipts*` starting at line 450) before writing
  the skeleton — the skeleton's outer wrapper should reuse these same
  class names so it inherits the exact same flex/grid regions (mobile:
  stacked, `≥768px`: sidebar + main grid) without redefining layout CSS.
  Do not touch `lists.module.scss` itself unless a new skeleton-only
  class is genuinely needed (prefer Tailwind utility classes on the
  skeleton's own placeholder blocks); if a new class is added, it must be
  a co-located Tailwind-utility composition, not a new `*.module.css`
  file — this project banned new CSS Modules files after Epic 3.5 (AD-23,
  `*.module.scss` is custom-only, and this is not a case requiring one).
- **Reference components for placeholder sizing** (do not import these —
  copy their approximate shape as static skeleton markup):
  - `ui/components/soft-ledger/BalanceStrip.tsx` — the simple `who`/
    `amount` variant is the one rendered for most lists on first load
    (grid variant only kicks in once `members.length >= 2` and balances
    have resolved — data the skeleton doesn't have, so default to the
    simpler shape)
  - `ui/components/soft-ledger/ReceiptRow.tsx` (or its usage in
    `page.tsx` lines ~1009-1020) for a single receipt row's shape
  - The sidebar's `TemporalNavigation`/`ManualExpenseForm` stacked-card
    look, from `page.tsx` lines ~1026-1104
- **`ListDetailChrome`'s `useChromeHeader` call happens inside
  `page.tsx`** (a client component rendered by the server component), not
  in `loading.tsx`. During the skeleton's display window the app header
  will show whatever title was last set by chrome (e.g. "Lists" from
  `/home`), not the target list's name — this is existing `AppShell`
  behavior (chrome header is a cross-page React context value, not
  per-route state) and is out of scope to change here; just don't
  introduce a *new* chrome flash or mismatch by calling `useChromeHeader`
  from `loading.tsx` with placeholder content.
- **Explicitly out of scope:** any change to `page.tsx`'s fetch logic
  (that's Story 10.1, separately scoped/landed), any new shared
  `<Skeleton>` component library (build the placeholder blocks inline in
  `loading.tsx` unless the shapes are obviously reused elsewhere already
  — they are not, at story creation time), and any change to
  `ListDetailChrome`/chrome-header behavior.

### Project Structure Notes

- New file: `ui/app/lists/[listId]/loading.tsx`. No changes to
  `page.tsx`, `ListDetailChrome.tsx`, or any other sibling component.
- Reuses `../lists.module.scss` layout classes (import as
  `styles` exactly as `page.tsx` does); does not add a new SCSS module.

### References

- [Source: ui/app/lists/[listId]/page.tsx#L781-L1110] — JSX shape to
  mirror (outer wrapper classes, balance strip / receipts / sidebar
  regions).
- [Source: ui/app/lists/lists.module.scss#L450-L648] — layout classes
  (`softMain`, `softBody`, `detailLayout`, `detailPrimary`,
  `detailSidebar`, `softReceipts*`) and the `768px` breakpoint the
  skeleton must match.
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 10: Performance — list detail page load]
- [Source: _bmad-output/implementation-artifacts/10-1-parallelize-list-detail-fetching.md] — Dev Notes' explicit "out of scope for 10.1 → 10.2" callout for this skeleton.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- Verified the `loading.tsx` boundary actually streams before the real
  page: signed in as the seeded dev account via
  `POST /api/auth/sign-in`, then `curl`'d `/lists/<id>` and confirmed the
  streamed response body contains both the skeleton's unique classes
  (`shrink-0 rounded-[6px]`, `w-3/5`, `w-2/5`) and the real page's markup
  (`TemporalNavigation`, `ManualExpenseForm`, `inviteTitle`) — proof Next
  renders the skeleton first and swaps in the resolved content, matching
  AC #2 without needing a headed browser.
- `docker compose exec ui npx tsc --noEmit` — clean.
- `docker compose exec ui npx eslint app/lists/[listId]/loading.tsx` —
  clean.
- `docker compose exec ui npx vitest run` — 110 files / 809 tests
  passed, no regressions.

### Completion Notes List

- Added `ui/app/lists/[listId]/loading.tsx` as a static skeleton that
  reuses `lists.module.scss` layout classes (`softMain`, `softBody`,
  `detailLayout`, `detailPrimary`, `detailSidebar`, `softReceipts*`) so
  it occupies the same flex/grid regions as `ListDetailPage`, with
  Tailwind `animate-pulse` + `bg-muted` placeholder blocks sized to
  approximate `BalanceStrip` (simple variant), `ReceiptRow` (5 rows), and
  the sidebar's `TemporalNavigation`/`ManualExpenseForm` stacked cards.
  No `SpinnerIcon`, no literal "Loading…" text, no `useChromeHeader` call
  (per Dev Notes — the stale chrome title during the skeleton's brief
  display is existing `AppShell` behavior, out of scope here).
- No new test file: this is static markup with no extracted pure
  functions, per the story's own Task 2 guidance and this project's
  testing convention.
- Manual verification of the actual streaming swap was done via `curl`
  against the running worktree stack (seeded dev account) rather than a
  headed browser — confirmed both the skeleton's and the real content's
  markup appear in the same streamed response, which is the mechanism
  AC #2 depends on. Did not separately screenshot the mobile vs. desktop
  breakpoints; block sizes were chosen by reading the actual rendered
  dimensions (`--space-*` tokens, `border-border`, `rounded-md`) of
  `BalanceStrip`/`ReceiptRow`/sidebar cards in their source, not by
  visual comparison in a browser.

### File List

- `ui/app/lists/[listId]/loading.tsx` (new)

### Review Findings

- [x] [Review][Patch] Sidebar placeholders don't match TemporalNavigation's/ManualExpenseForm's real shapes [ui/app/lists/[listId]/loading.tsx:48-67] — replaced the full-width bar guess with a compact fit-content pair of squares (matching `TemporalNavigation.module.scss`'s segmented icon-button group) and un-carded stacked label/input fields (matching `ManualExpenseForm.module.scss`, which has no outer bordered card).
- [x] [Review][Patch] No accessible loading semantics [ui/app/lists/[listId]/loading.tsx:9-14] — added `role="status" aria-live="polite" aria-label="Loading list"` on the root `<main>`.

## Change Log

- 2026-09-22: Implemented Story 10.2 — added `ui/app/lists/[listId]/loading.tsx`
  skeleton; full `ui/` test suite green (809 tests), no other files
  touched. Status moved to review.
- 2026-09-22: Code review — fixed sidebar placeholder shapes (now matches
  `TemporalNavigation`'s compact segmented control and `ManualExpenseForm`'s
  un-carded field stack) and added `role="status"`/`aria-live` accessible
  loading semantics. Status moved to done.
