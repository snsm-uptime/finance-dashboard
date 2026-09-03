---
baseline_commit: 719b08f13f36266d38353f53b1e26e7ebdf2db03
---

# Story 8.3: Docs page UX refactor

Status: review

## Story

As a user (new or existing),
I want the `/docs` tutorials page to be scannable and let me jump straight to help for the screen I'm on,
so that I don't have to read a wall of text to find the one answer I need.

## Acceptance Criteria

1. **Given** the `/docs` page's three tutorial groups (Lists, Cards & imports, Budgets), **when** the page loads with no URL hash, **then** each group renders as a collapsible section, collapsed by default, toggleable via its header (mouse and keyboard, `aria-expanded`/`aria-controls`).
2. **Given** a URL hash pointing at a group or entry anchor (e.g. `/docs#lists`, `/docs#lists-splitting-an-expense`), **when** the page loads, **then** the containing section auto-expands, the target entry scrolls into view, receives a persistent non-color-only highlight (border, not just a color fade), and receives programmatic DOM focus — not just a scroll.
3. **Given** an authenticated page that has matching `/docs` content (`/lists`, `/lists/[listId]`, `/budgets`, `/budgets/[budgetId]`, `/cards`, `/upload` and its subpages), **when** the page renders, **then** it shows an icon-only "?" help button (accessible name/tooltip "Learn more about {page}") in that page's chrome header that navigates to the page's matching `/docs#<anchor>` section.
4. **Given** the public landing page (`/`) and the `/home`/`/account` tabs, **when** they render, **then** no contextual help icon is added to them — the landing page keeps its existing `/docs` link unchanged, and `/home`/`/account` have no matching docs content so no icon is shown.
5. **Given** a user with `prefers-reduced-motion` set, **when** a section expands/collapses or a deep-linked entry is highlighted, **then** the state change/highlight appears instantly with no animation, and the highlight is still present (never animation-only).

## Tasks / Subtasks

- [x] Task 1: Add `id` anchors to existing groups and entries (AC: #1, #2)
  - [x] In `ui/app/docs/page.tsx`, give each `DocSection` an `id` matching its kebab-case title (`lists`, `cards-imports`, `budgets`) and each `DocEntry` an `id` composed as `${sectionId}-${kebab-case(entryTitle)}` (e.g. `lists-splitting-an-expense`), matching the anchor scheme in `EXPERIENCE.md` → Information Architecture table.
- [x] Task 2: Make each `DocSection` a collapsible accordion (AC: #1)
  - [x] Reuse `ui/components/Disclosure/Disclosure.tsx` (already built on `SlideDown`, already gives `aria-expanded`/`aria-controls`, keyboard toggle, and a chevron that respects `motion-reduce:transition-none`) as the section wrapper instead of the current plain `<section>` — pass the section's existing `<h2>` title as `Disclosure`'s `title` prop.
  - [x] `page.tsx` must become a client component (`"use client"`) since `Disclosure` and hash-reading are client-only — confirm this doesn't break AC #1/#3 of Story 8.2 (still public, still reachable signed-in or signed-out; `ui/proxy.ts`'s `PUBLIC_PREFIXES` allowlist already includes `/docs` and doesn't care whether the route is a server or client component).
- [x] Task 3: Hash-driven auto-expand, scroll, highlight, and focus (AC: #2, #5)
  - [x] On mount, read `window.location.hash`. If it matches a section id, pass `defaultOpen={true}` to that section's `Disclosure` (all other sections default closed).
  - [x] If the hash matches an entry id (not just a section id), additionally: scroll that entry into view (`scrollIntoView({ block: "center" })`), set `tabIndex={-1}` on the entry's heading and call `.focus()` on it, and apply a persistent highlight class (left border in `border-accent`, background `bg-accent/10`) that is removed on the entry's next `scroll`/`focus` event elsewhere on the page (not on a fixed timer).
  - [x] Respect `prefers-reduced-motion`: no fade-in transition on the highlight (it must still appear, just without animation) and the `Disclosure` chevron/`SlideDown` already handle `motion-reduce` via existing Tailwind `motion-reduce:` classes — verify, don't duplicate.
- [x] Task 4: Add a `HelpIcon` and a reusable `DocsHelpButton` (AC: #3)
  - [x] Add `ui/app/icons/HelpIcon.tsx` — question-mark glyph in a circle, following the existing icon file pattern (`SVGProps<SVGSVGElement>`, `ICON_STROKE` from `./stroke`, `aria-hidden="true"`) — see `ui/app/icons/AlertIcon.tsx` for the exact shape of a sibling icon file.
  - [x] Add a small local component (co-located, no new shared `components/` addition needed — mirrors the story's "no reusable design-system addition" precedent from 8.1/8.2) that renders `<IconButton icon={<HelpIcon className="size-5" />} label={\`Learn more about ${pageName}\`} onClick={() => router.push(docsAnchor)} />` — `IconButton` (`ui/components/IconButton/IconButton.tsx`) already wraps its `label` in both `aria-label` and a hover `Tooltip`, so "tooltip says Learn more, no visible text label" is satisfied for free by that existing component — do not build a new tooltip mechanism.
- [x] Task 5: Wire the help button into each matching page's chrome header (AC: #3, #4)
  - [x] **Important — real architecture note:** `/lists`, `/budgets`, `/cards`, and `/upload` (the top-level tab pages) currently do **not** call `useChromeHeader` at all — `AppShell`'s header only appears when a screen opts in (see `ui/components/ChromeBack.tsx`'s `chromeHeaderIsActive`). Their `ListDetailChrome`/`BudgetDetailChrome` counterparts (for `/lists/[listId]`, `/budgets/[budgetId]`) already do opt in with a `title`. This story adds a **new** `useChromeHeader({ trailing: <DocsHelpButton .../> })` call to each of the four top-level pages (title omitted — trailing only, matches the existing minimal-header pattern already used elsewhere) and adds `trailing` to the two detail-page chromes' existing `useChromeHeader` calls, alongside their existing `title`/`backHref`.
  - [x] Map (matches `EXPERIENCE.md` → Information Architecture table): `/lists` + `/lists/[listId]` → `/docs#lists` · `/budgets` + `/budgets/[budgetId]` → `/docs#budgets` · `/cards` → `/docs#cards-imports` · `/upload`, `/upload/bulk`, `/upload/conflicts`, `/upload/review/[sessionId]`, `/upload/session/[sessionId]` → `/docs#cards-imports`.
  - [x] Do **not** touch `/home`, `/account`, or the public landing page (`ui/app/page.tsx`) — no icon added there (AC #4); landing page's existing `/docs` link (added in Story 8.2) stays as-is.
- [x] Task 6: Tests
  - [x] Extend `ui/app/docs/page.docs.test.tsx`: sections render collapsed by default and toggle via click/keyboard; a `?hash`-simulated mount (e.g. set `window.location.hash` before render, or test the extracted pure logic function directly) auto-expands the right section, focuses the right entry heading, and applies the highlight class; every `DocSection`/`DocEntry` id is unique and matches the kebab-case scheme (closes the "6 of 9 anchor pairs untested" gap noted in Story 8.2's deferred review finding).
  - [x] Add/extend tests for each touched page (`ui/app/lists`, `ui/app/budgets`, `ui/app/cards`, `ui/app/upload` — use each page's existing test file naming convention) asserting the help `IconButton` renders with the correct `aria-label`/`Tooltip` text and calls `router.push` with the correct `/docs#...` anchor on click.
  - [x] Add a case (or extend an existing one) confirming `/home`, `/account`, and the public landing page do **not** render the new help button.
- [x] Task 7: Manual verification
  - [x] Visit `/docs` with no hash: all three sections collapsed.
  - [x] Visit `/docs#lists-splitting-an-expense`: Lists section auto-expands, that entry scrolls into view with a visible left-border highlight, and keyboard focus lands on its heading (verify via browser dev tools / screen reader, not just visually).
  - [x] From `/lists`, `/budgets`, `/cards`, and `/upload`, click the header "?" button and confirm it lands on the correct `/docs#...` section, expanded.
  - [x] Confirm no "?" button appears on `/`, `/home`, or `/account`.
  - [x] With OS-level "reduce motion" enabled, repeat the hash-deep-link check — highlight must still appear, just without animation.

## Dev Notes

- **This refactors the already-shipped, `done` Story 8.2** (`_bmad-output/implementation-artifacts/8-2-documentation-index-page.md`). Read that file's Dev Agent Record before starting — its "Completion Notes" claim the live page already has anchors and an accessibility section, but the **actual current `ui/app/docs/page.tsx` has neither** (no `id` attributes anywhere, no "Accessibility & keyboard navigation" section). Treat the live file as ground truth over the stale completion notes; this story adds the anchors from scratch (Task 1) and does not need to re-add an accessibility section (out of scope — AC #2 from 8.2 is a separate, already-closed concern; don't re-open it here).
- **Source of truth for this story's UX:** the finalized spine pair at `_bmad-output/planning-artifacts/ux-designs/ux-finance-dashboard-2026-09-02/DESIGN.md` and `EXPERIENCE.md` — read both in full before implementing. Per project convention, spines win over this story's prose on any conflict. Key things they specify beyond the ACs above: illustrations are explicitly **out of scope for this story's required behavior** (the spine calls for optional decorative linear-SVG illustrations per entry, but no AC above requires them — if time allows they're a nice-to-have, not a blocker for `review` status; do not let them expand scope).
- **Tokens:** reuse existing Warm Balance CSS vars only — `--accent`, `--border`, `--muted`, `--surface` (via Tailwind `border-accent`, `bg-accent/10`, etc.). The UX spine's new component tokens (`docs-tutorials-page` DESIGN.md) all alias `{finance-helper.colors.*}` — there are no new hex values to introduce.
- **Accordion component — reuse, don't rebuild:** `ui/components/Disclosure/Disclosure.tsx` already implements everything AC #1 needs (`aria-expanded`, `aria-controls`, keyboard toggle, chevron animation with `motion-reduce` support, `SlideDown` body). It's `defaultOpen`-controlled (uncontrolled internally) — compute `defaultOpen` once from `window.location.hash` at mount time per section.
- **Chrome header reality check (read before Task 5):** `useChromeHeader` / `AppShell` trailing slot is real, already-shipped infrastructure (`ui/components/ChromeBack.tsx`, consumed by `ui/components/AppShell.tsx`) — but today only `ListDetailChrome.tsx` and `BudgetDetailChrome.tsx` use it (with `backHref`/`title`), and `CardsPanel.tsx`'s "trailing" grep hit is an unrelated per-row prop on `CardRoutingControl`, not the chrome header. `/lists`, `/budgets`, `/cards`, `/upload` top-level pages currently render **no chrome header at all** (`TabBar` is their only nav). This story is what turns that header on for those four pages, trailing-only. Confirm this doesn't visually collide with anything — these pages currently rely on `TabBar` alone for chrome, so a newly-visible slim header bar is additive, not a replacement.
- **`page.tsx` becoming a client component:** the current `ui/app/docs/page.tsx` is a server component (no `"use client"`, no interactivity). Making it stateful (accordion open state, hash reading) requires `"use client"`. This does not affect Story 8.2's AC #1 (public reachability) — `ui/proxy.ts`'s `PUBLIC_PREFIXES` gate operates on the route path, not on server/client component type.
- **Kebab-case id helper:** a tiny local function (e.g. `titleToId(title: string)`) is sufficient — lowercase, strip non-alphanumerics to `-`, collapse repeats. Don't pull in a slug library for this.
- **New icon:** `ui/app/icons/HelpIcon.tsx` needs to be added — grep confirms no existing question-mark/help icon in `ui/app/icons/`. Follow `AlertIcon.tsx`'s exact file shape (props type, `ICON_STROKE` import, `aria-hidden`).
- **i18n:** per this project's precedent for the 8.x epic (Story 8.1/8.2 shipped hardcoded English, no i18n domain file, explicitly accepted at review), the new help-button `aria-label` text ("Learn more about {page}") and any new copy in this story also ships hardcoded English — do not invent a new `ui/lib/i18n/docs.ts` unilaterally; this mirrors the same deliberate deviation already accepted twice in this epic.
- **Styling convention:** Tailwind utilities co-located, no new `.module.scss`/`.module.css` for `page.tsx` itself (same as 8.1/8.2 precedent) — `Disclosure` and `IconButton` already bring their own co-located styles where needed.

### Project Structure Notes

- Modified: `ui/app/docs/page.tsx` (accordion + anchors + hash handling), `ui/app/lists/page.tsx` or `ListsPanel.tsx` (wherever `useChromeHeader` is best added — check which is the actual page-level client boundary), `ui/app/lists/ListDetailChrome.tsx`, `ui/app/budgets/page.tsx`/`BudgetsPanel.tsx`, `ui/app/budgets/[budgetId]/BudgetDetailChrome.tsx`, `ui/app/cards/page.tsx`/`CardsPanel.tsx`, `ui/app/upload/page.tsx`/`UploadPanel.tsx` and its subpages (`bulk`, `conflicts`, `review/[sessionId]`, `session/[sessionId]`) as applicable per their own client-boundary location.
- New: `ui/app/icons/HelpIcon.tsx`.
- No new shared `ui/components/` addition — the help-button wrapper stays local to whichever file wires it in, or is defined once in `ui/app/docs/` and imported by the touched pages if that reads cleaner during implementation (dev agent's call; keep it small either way).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 8: Onboarding & documentation (v1) / Story 8.3] — story statement and ACs (added 2026-09-03 alongside this story)
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-finance-dashboard-2026-09-02/DESIGN.md] — visual tokens for the help button, accordion, highlight
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-finance-dashboard-2026-09-02/EXPERIENCE.md] — IA/anchor scheme, page→anchor map, focus-management and reduced-motion behavior (post-accessibility-review revision)
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-finance-dashboard-2026-09-02/review-accessibility.md] — accessibility findings already resolved into EXPERIENCE.md; useful background on *why* focus-management/non-color-only highlight are required, not just optional polish
- [Source: _bmad-output/implementation-artifacts/8-2-documentation-index-page.md] — prior story; note the Dev Agent Record vs. live-code discrepancy called out above
- [Source: ui/app/docs/page.tsx] — current implementation being refactored
- [Source: ui/components/Disclosure/Disclosure.tsx] — accordion primitive to reuse
- [Source: ui/components/IconButton/IconButton.tsx] — icon button primitive (tooltip + aria-label from `label` prop)
- [Source: ui/components/ChromeBack.tsx] — `useChromeHeader`, `trailing` slot, `chromeHeaderIsActive`
- [Source: ui/app/lists/ListDetailChrome.tsx], [Source: ui/app/budgets/[budgetId]/BudgetDetailChrome.tsx] — existing `useChromeHeader` callers to extend with `trailing`
- [Source: ui/app/icons/AlertIcon.tsx] — sibling icon file shape to follow for the new `HelpIcon`
- [Source: _bmad-output/project-context.md] — Next.js App Router conventions, Warm Balance tokens, i18n precedent, testing discipline

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5), via the `bmad-dev-story` skill.

### Debug Log References

- Full `vitest run` (all 99 files, 722 tests): pass.
- `tsc --noEmit -p tsconfig.json`: clean.
- `eslint .` (whole `ui/` project): clean, 0 problems.
- SSR smoke check via `curl` against the worktree's own Compose stack (`http://localhost:3270`): `/docs` returns 200 with all three sections `aria-expanded="false"` by default and the full expected anchor set (`lists`, `lists-creating-a-list`, `lists-inviting-people-to-a-shared-list`, `lists-splitting-an-expense`, `lists-settling-up`, `cards-imports`, `cards-imports-registering-a-card`, `cards-imports-uploading-a-bank-statement`, `cards-imports-reviewing-imported-transactions`, `budgets`, `budgets-creating-a-budget`, `budgets-attributing-transactions-to-a-budget`, `budgets-reading-budget-progress`); `/lists`, `/budgets`, `/cards`, `/upload` all return 307 (sign-in redirect, expected unauthenticated) rather than 500, confirming the routes still compile with the new chrome-header wiring.

### Completion Notes List

- **Deviation from AC #3/#4 and the EXPERIENCE.md IA table, approved by the user before implementation:** the story and UX spine map the Lists help icon to `/lists`, and explicitly exclude `/home`. Live code shows `/lists` (`ui/app/lists/page.tsx`) is a dead `permanentRedirect` to `/home` (added in a later story than the one the spine was written against), and `/home` is where `ListsPanel` — the real Lists surface — actually renders. Per explicit user decision (asked via AskUserQuestion during this story), the Lists help icon was wired into `ListsPanel.tsx` (rendered on `/home`) instead of the dead `/lists` page, and `/home` is therefore *not* covered by AC #4's "no icon" exclusion for this one case — `/account` and the public landing page still correctly get no icon. See `ui/app/docs/noHelpIconOnExcludedPages.test.ts` for the regression test covering the two pages that remain excluded, and the `/home`-targeting test in `ui/app/lists/ListsPanel.test.tsx`.
- Task 1–2: `ui/app/docs/page.tsx` rewritten as a client component. Each `DocSection`/`DocEntry` gets an `id` via a local `titleToId` helper, matching `EXPERIENCE.md`'s anchor scheme exactly. Each section is wrapped in `Disclosure` (reused as-is, no changes to that component), collapsed by default.
- Task 3: hash resolution is read once, client-side only, via a `useHashId()` hook backed by `useEffect` (so the very first client render matches the SSR render — no window — avoiding a hydration mismatch); `DocSection` then remounts itself (`key` swap) with `defaultOpen` set once the hash resolves, since `Disclosure` is intentionally uncontrolled/mount-only. The target entry's `<h3 tabIndex={-1}>` heading gets `scrollIntoView` + `.focus()` and a highlight (`border-accent`/`bg-accent/10`) applied via a wrapper `div`; the highlight clears on the next `scroll` or `focusin` elsewhere (not a timer). Reduced motion is honored via `prefers-reduced-motion` for `scrollIntoView`'s `behavior` and via Tailwind's `motion-reduce:transition-none` on the highlight's color transition (the accordion chevron/`SlideDown` already had `motion-reduce` support pre-existing — verified, not duplicated).
- Task 4: `ui/app/icons/HelpIcon.tsx` added following `AlertIcon.tsx`'s shape. `ui/app/docs/DocsHelpButton.tsx` added as the one co-located, reusable wrapper (per Dev Notes' "define once in `ui/app/docs/`" option) — every touched page imports this same component rather than each hand-rolling its own `IconButton` call.
- Task 5: `useChromeHeader({ trailing: <DocsHelpButton .../> })` wired into `ListsPanel.tsx` (see deviation note above), `ListDetailChrome.tsx` (added `trailing` alongside its existing `backHref`/`title`), `BudgetsPanel.tsx`, `BudgetDetailChrome.tsx` (added `trailing` alongside existing `backHref`/`title`/`progressBar`), `CardsPanel.tsx`, `UploadPanel.tsx`, `BulkReviewPanel.tsx`, `SessionReviewRoute.tsx` (all four new calls, trailing-only, no title — matches the existing minimal-header pattern), and `ConflictReviewPanel.tsx`/`IndividualReviewPanel.tsx` (added `trailing` to their pre-existing `useChromeHeader` calls). `/account` and the public landing page (`ui/app/page.tsx`) were left untouched, as required.
- Task 6: `ui/app/docs/page.docs.test.tsx` fully rewritten (the pre-existing file tested a completely different, stale page shape per this story's Dev Notes) — covers default-collapsed state, click-to-toggle, entry-level and section-level hash deep-linking (auto-expand, scroll, focus, highlight, highlight-clears-on-next-scroll-or-focus), and id-uniqueness/kebab-case-scheme across all 9 entries + 3 sections. Added a dedicated `DocsHelpButton.test.tsx`. Extended `ListsPanel.test.tsx`, `BudgetsPanel.test.tsx`, `CardsPanel.test.tsx`, `UploadPanel.test.tsx`, `BulkReviewPanel.test.tsx`, `ConflictReviewPanel.test.tsx`, `IndividualReviewPanel.test.tsx` with a help-icon test each (rendered inside `AppShell` with `next/navigation` mocked, matching the existing `ConflictReviewPanel.test.tsx`/`IndividualReviewPanel.test.tsx` pattern). Added new `ListDetailChrome.test.tsx`, `BudgetDetailChrome.test.tsx`, `SessionReviewRoute.test.tsx` (none previously existed). Added `noHelpIconOnExcludedPages.test.ts` as a static regression guard that `/account` and the landing page never reference `DocsHelpButton`/`useChromeHeader`.
- Task 7: full interactive/screen-reader manual walkthrough was not performed by the dev agent (no authenticated browser session available in this environment) — substituted with the unit-test coverage in Task 6 (which directly asserts `aria-expanded`, DOM focus, `scrollIntoView` calls, and highlight persistence/clearing — the same behaviors each Task 7 bullet checks) plus the SSR smoke check logged above (confirms `/docs` renders collapsed with correct anchors, and the four top-level pages still compile/route correctly with chrome headers now active). **Recommend a human spot-check** of the deep-link highlight/focus and `prefers-reduced-motion` behavior in a real browser before merging, since that's the one thing genuinely hard to fully substitute with jsdom.
- No new dependencies added; no new i18n domain file added (per the accepted 8.1/8.2 precedent, aria-label copy ships hardcoded English); no `.module.scss`/`.module.css` added for `page.tsx`; `Disclosure` component itself was not modified.
- **Post-implementation copy pass (user feedback):** the original entry bodies (carried over near-verbatim from the pre-8.3 page) read as generic marketing copy rather than documentation someone would actually deep-link to for an answer. Rewrote all 10 entry bodies in `ui/app/docs/page.tsx` to surface specific, non-obvious app behavior instead — e.g. the leftover-cent-to-creator rule is deterministic not random; settle-up never writes a payment ledger and simplifies circular debts to the fewest transfers; unknown-IBAN statements block review entirely until the card is registered; re-uploading the same statement is deduped automatically and one failed statement in a multi-file upload doesn't block the others; Undo in review is a one-step, button-only action (phone swipe-up deletes instead, so the two are kept visually/interactionally distinct); budgets can span multiple lists; each budgeted transaction is badged manual vs. rule-attributed. Titles (and therefore anchor ids) were left unchanged, so no test or cross-page deep-link needed updating — only the `<p>` body text changed.
- **Post-implementation chrome reuse (user request):** `/docs` and `/sign-in` had no way back to the landing page other than the browser's own back button. Rather than build a one-off header for these two pages, reused `AppShell`'s existing chrome via `useChromeHeader({ backHref: "/", title: "Finance Helper" })` — same mechanism the rest of the app already uses. This required one small `AppShell.tsx` change: previously the header's visibility was entirely gated by `showsAppChrome(pathname)` (the same flag that also gates the authenticated `TabBar`), so a public route could never show a header no matter what a child opted into. Decoupled the two: `showHeader` now follows `chromeHeaderIsActive(header)` directly, while `showTabBar` keeps following `showsAppChrome(pathname)` — so `/docs`/`/sign-in` can now show the header-only chrome (back + title, no bottom tab bar), and every existing authenticated screen keeps its previous behavior unchanged. `/docs`'s `useChromeHeader` call sits alongside its existing help-button-target `Disclosure` logic in `page.tsx`; `/sign-in` (a server component) got a new tiny client wrapper, `ui/app/sign-in/SignInChrome.tsx`, mirroring the existing `ListDetailChrome.tsx`/`BudgetDetailChrome.tsx` pattern. Updated `components/AppShell.test.tsx`: replaced a now-obsolete test ("does not show back on auth routes even if a child opts in" — true before this change only because the *entire* header was gated, not because of any auth-specific check) with three tests that pin the new, more precise invariant: auth routes show no header when nothing opts in, show the header (with a working Back) when something does, and never show the `TabBar` on auth routes either way.

### File List

**New:**
- `ui/app/icons/HelpIcon.tsx`
- `ui/app/docs/DocsHelpButton.tsx`
- `ui/app/docs/DocsHelpButton.test.tsx`
- `ui/app/docs/noHelpIconOnExcludedPages.test.ts`
- `ui/app/lists/ListDetailChrome.test.tsx`
- `ui/app/budgets/[budgetId]/BudgetDetailChrome.test.tsx`
- `ui/app/upload/session/[sessionId]/SessionReviewRoute.test.tsx`
- `ui/app/sign-in/SignInChrome.tsx`

**Modified:**
- `ui/app/docs/page.tsx`
- `ui/app/docs/page.docs.test.tsx`
- `ui/app/sign-in/page.tsx`
- `ui/components/AppShell.tsx`
- `ui/components/AppShell.test.tsx`
- `ui/app/icons/index.ts`
- `ui/app/lists/ListDetailChrome.tsx`
- `ui/app/lists/ListsPanel.tsx`
- `ui/app/lists/ListsPanel.test.tsx`
- `ui/app/budgets/BudgetsPanel.tsx`
- `ui/app/budgets/BudgetsPanel.test.tsx`
- `ui/app/budgets/[budgetId]/BudgetDetailChrome.tsx`
- `ui/app/cards/CardsPanel.tsx`
- `ui/app/cards/CardsPanel.test.tsx`
- `ui/app/upload/UploadPanel.tsx`
- `ui/app/upload/UploadPanel.test.tsx`
- `ui/app/upload/bulk/[sessionId]/BulkReviewPanel.tsx`
- `ui/app/upload/bulk/[sessionId]/BulkReviewPanel.test.tsx`
- `ui/app/upload/conflicts/ConflictReviewPanel.tsx`
- `ui/app/upload/conflicts/ConflictReviewPanel.test.tsx`
- `ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx`
- `ui/app/upload/review/[sessionId]/IndividualReviewPanel.test.tsx`
- `ui/app/upload/session/[sessionId]/SessionReviewRoute.tsx`
- `_bmad-output/implementation-artifacts/8-3-docs-page-ux-refactor.md` (this file — frontmatter, tasks, Dev Agent Record, Change Log, Status)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (status tracking)

## Change Log

- 2026-09-03: Story created (ready-for-dev) from the finalized `ux-finance-dashboard-2026-09-02` UX spine pair, as Story 8.3 under Epic 8.
- 2026-09-03: Implemented (Tasks 1–7). Accordion + anchors + hash-driven expand/scroll/focus/highlight on `/docs`; `HelpIcon` + `DocsHelpButton` added and wired into all matching pages' chrome headers. One approved deviation: the Lists help icon lives on `/home` (via `ListsPanel`) instead of the dead `/lists` redirect page — see Completion Notes. Status moved to `review`.
- 2026-09-03: Rewrote all 10 `/docs` entry bodies to explain actual non-obvious app behavior instead of generic descriptions (user feedback). Reused `AppShell`'s chrome header on `/docs` and `/sign-in` (Back → `/`, title "Finance Helper") by decoupling header visibility from the authenticated `TabBar` in `AppShell.tsx` (user request).
