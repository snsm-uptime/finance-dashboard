# Story 8.3: Docs page UX refactor

Status: ready-for-dev

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

- [ ] Task 1: Add `id` anchors to existing groups and entries (AC: #1, #2)
  - [ ] In `ui/app/docs/page.tsx`, give each `DocSection` an `id` matching its kebab-case title (`lists`, `cards-imports`, `budgets`) and each `DocEntry` an `id` composed as `${sectionId}-${kebab-case(entryTitle)}` (e.g. `lists-splitting-an-expense`), matching the anchor scheme in `EXPERIENCE.md` → Information Architecture table.
- [ ] Task 2: Make each `DocSection` a collapsible accordion (AC: #1)
  - [ ] Reuse `ui/components/Disclosure/Disclosure.tsx` (already built on `SlideDown`, already gives `aria-expanded`/`aria-controls`, keyboard toggle, and a chevron that respects `motion-reduce:transition-none`) as the section wrapper instead of the current plain `<section>` — pass the section's existing `<h2>` title as `Disclosure`'s `title` prop.
  - [ ] `page.tsx` must become a client component (`"use client"`) since `Disclosure` and hash-reading are client-only — confirm this doesn't break AC #1/#3 of Story 8.2 (still public, still reachable signed-in or signed-out; `ui/proxy.ts`'s `PUBLIC_PREFIXES` allowlist already includes `/docs` and doesn't care whether the route is a server or client component).
- [ ] Task 3: Hash-driven auto-expand, scroll, highlight, and focus (AC: #2, #5)
  - [ ] On mount, read `window.location.hash`. If it matches a section id, pass `defaultOpen={true}` to that section's `Disclosure` (all other sections default closed).
  - [ ] If the hash matches an entry id (not just a section id), additionally: scroll that entry into view (`scrollIntoView({ block: "center" })`), set `tabIndex={-1}` on the entry's heading and call `.focus()` on it, and apply a persistent highlight class (left border in `border-accent`, background `bg-accent/10`) that is removed on the entry's next `scroll`/`focus` event elsewhere on the page (not on a fixed timer).
  - [ ] Respect `prefers-reduced-motion`: no fade-in transition on the highlight (it must still appear, just without animation) and the `Disclosure` chevron/`SlideDown` already handle `motion-reduce` via existing Tailwind `motion-reduce:` classes — verify, don't duplicate.
- [ ] Task 4: Add a `HelpIcon` and a reusable `DocsHelpButton` (AC: #3)
  - [ ] Add `ui/app/icons/HelpIcon.tsx` — question-mark glyph in a circle, following the existing icon file pattern (`SVGProps<SVGSVGElement>`, `ICON_STROKE` from `./stroke`, `aria-hidden="true"`) — see `ui/app/icons/AlertIcon.tsx` for the exact shape of a sibling icon file.
  - [ ] Add a small local component (co-located, no new shared `components/` addition needed — mirrors the story's "no reusable design-system addition" precedent from 8.1/8.2) that renders `<IconButton icon={<HelpIcon className="size-5" />} label={\`Learn more about ${pageName}\`} onClick={() => router.push(docsAnchor)} />` — `IconButton` (`ui/components/IconButton/IconButton.tsx`) already wraps its `label` in both `aria-label` and a hover `Tooltip`, so "tooltip says Learn more, no visible text label" is satisfied for free by that existing component — do not build a new tooltip mechanism.
- [ ] Task 5: Wire the help button into each matching page's chrome header (AC: #3, #4)
  - [ ] **Important — real architecture note:** `/lists`, `/budgets`, `/cards`, and `/upload` (the top-level tab pages) currently do **not** call `useChromeHeader` at all — `AppShell`'s header only appears when a screen opts in (see `ui/components/ChromeBack.tsx`'s `chromeHeaderIsActive`). Their `ListDetailChrome`/`BudgetDetailChrome` counterparts (for `/lists/[listId]`, `/budgets/[budgetId]`) already do opt in with a `title`. This story adds a **new** `useChromeHeader({ trailing: <DocsHelpButton .../> })` call to each of the four top-level pages (title omitted — trailing only, matches the existing minimal-header pattern already used elsewhere) and adds `trailing` to the two detail-page chromes' existing `useChromeHeader` calls, alongside their existing `title`/`backHref`.
  - [ ] Map (matches `EXPERIENCE.md` → Information Architecture table): `/lists` + `/lists/[listId]` → `/docs#lists` · `/budgets` + `/budgets/[budgetId]` → `/docs#budgets` · `/cards` → `/docs#cards-imports` · `/upload`, `/upload/bulk`, `/upload/conflicts`, `/upload/review/[sessionId]`, `/upload/session/[sessionId]` → `/docs#cards-imports`.
  - [ ] Do **not** touch `/home`, `/account`, or the public landing page (`ui/app/page.tsx`) — no icon added there (AC #4); landing page's existing `/docs` link (added in Story 8.2) stays as-is.
- [ ] Task 6: Tests
  - [ ] Extend `ui/app/docs/page.docs.test.tsx`: sections render collapsed by default and toggle via click/keyboard; a `?hash`-simulated mount (e.g. set `window.location.hash` before render, or test the extracted pure logic function directly) auto-expands the right section, focuses the right entry heading, and applies the highlight class; every `DocSection`/`DocEntry` id is unique and matches the kebab-case scheme (closes the "6 of 9 anchor pairs untested" gap noted in Story 8.2's deferred review finding).
  - [ ] Add/extend tests for each touched page (`ui/app/lists`, `ui/app/budgets`, `ui/app/cards`, `ui/app/upload` — use each page's existing test file naming convention) asserting the help `IconButton` renders with the correct `aria-label`/`Tooltip` text and calls `router.push` with the correct `/docs#...` anchor on click.
  - [ ] Add a case (or extend an existing one) confirming `/home`, `/account`, and the public landing page do **not** render the new help button.
- [ ] Task 7: Manual verification
  - [ ] Visit `/docs` with no hash: all three sections collapsed.
  - [ ] Visit `/docs#lists-splitting-an-expense`: Lists section auto-expands, that entry scrolls into view with a visible left-border highlight, and keyboard focus lands on its heading (verify via browser dev tools / screen reader, not just visually).
  - [ ] From `/lists`, `/budgets`, `/cards`, and `/upload`, click the header "?" button and confirm it lands on the correct `/docs#...` section, expanded.
  - [ ] Confirm no "?" button appears on `/`, `/home`, or `/account`.
  - [ ] With OS-level "reduce motion" enabled, repeat the hash-deep-link check — highlight must still appear, just without animation.

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

_To be filled by dev agent._

### Debug Log References

_To be filled by dev agent._

### Completion Notes List

_To be filled by dev agent._

### File List

_To be filled by dev agent._

## Change Log

- 2026-09-03: Story created (ready-for-dev) from the finalized `ux-finance-dashboard-2026-09-02` UX spine pair, as Story 8.3 under Epic 8.
